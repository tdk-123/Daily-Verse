// -----------------------------------------------------------------------
// Fill this in after deploying the Cloudflare Worker (see SETUP.md).
// Example: "https://bible-app-proxy.yourname.workers.dev"
// -----------------------------------------------------------------------
const CONFIG = {
  AI_PROXY_URL: "PASTE_YOUR_WORKER_URL_HERE",
};

// -----------------------------------------------------------------------
// Selection state. Three independent choices combine into one of four
// text sources:
//   EN + MODERN -> World English Bible, straight from bible-api.com
//   EN + OLD    -> King James Version, from bible-api.com
//   NL + OLD    -> Statenvertaling, from dailybible.ca
//   NL + MODERN -> WEB text translated into modern Dutch by Gemini
//
// The approach for all four: first get a random reference (book/chapter/
// verse) from bible-api.com honoring the testament filter, then resolve
// the actual displayed text for that same reference from whichever
// source the language+version combo points to.
// -----------------------------------------------------------------------
const state = {
  testament: "ALL", // "ALL" | "OT" | "NT"
  language: "EN", // "EN" | "NL"
  version: "MODERN", // "OLD" | "MODERN"
};

const verseState = document.getElementById("verseState");
const verseText = document.getElementById("verseText");
const verseRef = document.getElementById("verseRef");
const translationLabel = document.getElementById("translationLabel");
const commentarySection = document.getElementById("commentarySection");
const commentaryText = document.getElementById("commentaryText");
const newVerseBtn = document.getElementById("newVerseBtn");
const pillButtons = document.querySelectorAll(".pill-btn");

pillButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const group = btn.dataset.group;
    const value = btn.dataset.value;
    if (state[group] === value) return;

    state[group] = value;
    document.querySelectorAll(`.pill-btn[data-group="${group}"]`).forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });

    loadNewVerse();
  });
});

// -----------------------------------------------------------------------
// Step 1: always get a random reference (+ its modern English text) from
// bible-api.com, honoring the testament filter.
// -----------------------------------------------------------------------
async function fetchRandomReference() {
  const base = "https://bible-api.com/data/web/random";
  const url = state.testament === "ALL" ? base : `${base}/${state.testament}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch random reference (status ${response.status})`);
  }
  const data = await response.json();
  const v = data.random_verse;

  return {
    reference: `${v.book} ${v.chapter}:${v.verse}`,
    englishModernText: v.text.trim(),
  };
}

// Step 2a: fetch the same reference in a specific bible-api.com translation (e.g. "kjv").
async function fetchFromBibleApi(reference, translationId) {
  const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${translationId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`bible-api.com fetch failed (status ${response.status})`);
  }
  const data = await response.json();
  return data.text.trim();
}

// Step 2b: fetch the same reference in Statenvertaling. Routed through our
// own Cloudflare Worker (not called directly from the browser) because
// dailybible.ca doesn't appear to allow cross-origin browser requests —
// the Worker fetches it server-to-server instead, sidestepping that.
async function fetchFromDailyBible(reference) {
  const response = await fetch(CONFIG.AI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "statenvertaling", reference }),
  });
  if (!response.ok) {
    throw new Error(`Statenvertaling proxy fetch failed (status ${response.status})`);
  }
  const data = await response.json();
  return data.text.trim();
}

// Step 2c: ask Gemini (via our own proxy) to render the English text in
// natural, contemporary Dutch.
async function translateToModernDutch(englishText) {
  const prompt =
    `Translate the following bible verse into natural, contemporary Dutch ` +
    `("hedendaags Nederlands"), suitable for a modern reader. Stay faithful ` +
    `to the original meaning. Return ONLY the translated verse text — no ` +
    `quotation marks, no explanation, no extra commentary.\n\n` +
    `Verse: "${englishText}"`;

  return callAIProxy(prompt);
}

// Resolves { text, translationLabel } for the current language+version state,
// given a reference and the already-fetched modern English text.
async function resolveVerseText(reference, englishModernText) {
  if (state.language === "EN" && state.version === "MODERN") {
    return { text: englishModernText, label: "World English Bible" };
  }
  if (state.language === "EN" && state.version === "OLD") {
    const text = await fetchFromBibleApi(reference, "kjv");
    return { text, label: "King James Version" };
  }
  if (state.language === "NL" && state.version === "OLD") {
    const text = await fetchFromDailyBible(reference);
    return { text, label: "Statenvertaling" };
  }
  // NL + MODERN
  const text = await translateToModernDutch(englishModernText);
  return { text, label: "Hedendaagse vertaling (AI-vertaald)" };
}

// -----------------------------------------------------------------------
// Generic call to our Cloudflare Worker proxy, which holds the real
// Gemini API key server-side. Used for both the Dutch translation above
// and the commentary below.
// -----------------------------------------------------------------------
async function callAIProxy(prompt) {
  const response = await fetch(CONFIG.AI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    throw new Error(`AI proxy error (status ${response.status})`);
  }
  const data = await response.json();
  return data.text.trim();
}

function buildCommentaryPrompt(verse) {
  if (state.language === "NL") {
    return (
      `Je geeft een korte, neutrale, historische/literaire duiding bij een ` +
      `bijbeltekst — geen devotionele of theologische interpretatie. Leg in ` +
      `2-3 zinnen de context uit (wie de schrijver was, aan wie het gericht ` +
      `was, en/of de situatie die aan de orde is). Wees feitelijk en ` +
      `evenwichtig; bevoordeel geen specifieke denominatie.\n\n` +
      `Referentie: ${verse.reference}\n` +
      `Tekst: "${verse.text}"\n\n` +
      `Antwoord in het Nederlands.`
    );
  }
  return (
    `You are providing brief, neutral, historical/literary context for a ` +
    `bible verse — not a devotional or theological interpretation. In 2-3 ` +
    `sentences, explain the context (who wrote it, to whom, and/or the ` +
    `situation it addresses). Be factual and even-handed; don't favor any ` +
    `particular denomination's reading.\n\n` +
    `Reference: ${verse.reference}\n` +
    `Text: "${verse.text}"\n\n` +
    `Respond in English.`
  );
}

async function generateCommentary(verse) {
  return callAIProxy(buildCommentaryPrompt(verse));
}

async function loadNewVerse() {
  newVerseBtn.disabled = true;

  verseText.hidden = true;
  verseRef.hidden = true;
  translationLabel.hidden = true;
  commentarySection.hidden = true;
  verseState.hidden = false;
  verseState.textContent = "Finding a verse for you…";

  try {
    const { reference, englishModernText } = await fetchRandomReference();
    const { text, label } = await resolveVerseText(reference, englishModernText);
    const verse = { reference, text };

    verseText.textContent = `"${verse.text}"`;
    verseRef.textContent = verse.reference;
    translationLabel.textContent = label;
    verseState.hidden = true;
    verseText.hidden = false;
    verseRef.hidden = false;
    translationLabel.hidden = false;

    commentaryText.textContent = "Loading context…";
    commentarySection.hidden = false;

    const commentary = await generateCommentary(verse);
    commentaryText.textContent = commentary;
  } catch (err) {
    console.error(err);
    verseState.hidden = false;
    verseState.textContent = "Couldn't load a verse. Check your connection and try again.";
    verseText.hidden = true;
    verseRef.hidden = true;
    translationLabel.hidden = true;
    commentarySection.hidden = true;
  } finally {
    newVerseBtn.disabled = false;
  }
}

newVerseBtn.addEventListener("click", loadNewVerse);

// Load a verse as soon as the app opens
loadNewVerse();

// Register the service worker so the app can be added to the home screen
// and load a little faster on repeat visits.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
