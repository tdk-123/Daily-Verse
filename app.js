// -----------------------------------------------------------------------
// Fill this in after deploying the Cloudflare Worker (see SETUP.md).
// Example: "https://bible-app-proxy.yourname.workers.dev"
// -----------------------------------------------------------------------
const CONFIG = {
  AI_PROXY_URL: "https://bible-app-proxy.tdekoning88.workers.dev",
};

// -----------------------------------------------------------------------
// Selection state. Three independent choices combine into one of four
// text sources:
//   EN + MODERN -> World English Bible, straight from bible-api.com
//   EN + OLD    -> King James Version, from bible-api.com
//   NL + OLD    -> Statenvertaling, looked up by Gemini using Google Search
//                  grounding (see fetchStatenvertaling below)
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, retries = 1, delayMs = 600) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await sleep(delayMs);
    return withRetry(fn, retries - 1, delayMs);
  }
}

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

// Step 2b: ask Gemini to recall the Statenvertaling (1637) text for this
// reference from its own training knowledge. Not using the Google Search
// grounding tool here — that has a separate, much stricter quota than plain
// generation, and hitting it repeatedly caused quota errors. Plain recall
// is good enough for this use case (won't be 100% guaranteed word-for-word,
// but should be close for well-known verses).
function buildStatenvertalingPrompt(reference) {
  return (
    `Geef de tekst van dit bijbelvers in de historische Nederlandse ` +
    `"Statenvertaling" (Statenbijbel, 1637), zo accuraat mogelijk naar ` +
    `jouw eigen kennis. Geef ALLEEN de verstekst zelf in het Nederlands — ` +
    `geen uitleg, geen herhaling van de referentie, geen aanhalingstekens, ` +
    `geen versnummer.\n\n` +
    `Referentie: ${reference}`
  );
}

async function fetchStatenvertaling(reference) {
  return withRetry(() => callAIProxy(buildStatenvertalingPrompt(reference)));
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
    const text = await fetchStatenvertaling(reference);
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
async function callAIProxy(prompt, options = {}) {
  const response = await fetch(CONFIG.AI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, useSearch: !!options.useSearch }),
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
      `Je geeft een korte weergave van de context van deze ` +
      `bijbeltekst — geen theologische of wetenschappelijke interpretatie. Leg in ` +
      `1-2 zinnen uit waar het hoofdstuk over gaat, ` +
      `en dan 1-2 zinnen over wat de dit vers daarin betekent. Wees feitelijk en ` +
      `evenwichtig.\n\n` +
      `Referentie: ${verse.reference}\n` +
      `Tekst: "${verse.text}"\n\n` +
      `Antwoord in het Nederlands.`
    );
  }
  return (
    `You are providing brief explanation of the context for a ` +
    `bible verse — not a theological or scientific interpretation. In 1-2 ` +
    `sentences, explain what this chapter is about ` +
    `and then in 1-2 sentences what this verse particularly says in that context. ` +
    `Be factual and even-handed.\n\n` +
    `Reference: ${verse.reference}\n` +
    `Text: "${verse.text}"\n\n` +
    `Respond in English.`
  );
}

async function generateCommentary(verse) {
  return callAIProxy(buildCommentaryPrompt(verse));
}

// -----------------------------------------------------------------------
// Pre-generated pool: a small set of ready-to-show verse+commentary
// entries, built ahead of time by a GitHub Actions workflow (see
// scripts/generate-pool.js) and committed to data/pool.json. Serving from
// this pool is instant — no network calls at click time.
//
// The pool only covers language+version (not testament), so it's used
// when the testament filter is "Whole Bible". Picking a specific
// testament, or running out of pool entries for the current combo, falls
// back to the live fetch path below.
// -----------------------------------------------------------------------
let pool = { EN_MODERN: [], EN_OLD: [], NL_OLD: [], NL_MODERN: [] };

async function loadPool() {
  try {
    const response = await fetch("./data/pool.json", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (data && data.entries) {
      pool = data.entries;
    }
  } catch (err) {
    console.warn("Couldn't load pregenerated pool, will fetch live instead.", err);
  }
}

function takeFromPool() {
  if (state.testament !== "ALL") return null;
  const key = `${state.language}_${state.version}`;
  const entries = pool[key];
  if (!entries || entries.length === 0) return null;
  return entries.shift();
}

function showVerse(verse, label) {
  verseText.textContent = `"${verse.text}"`;
  verseRef.textContent = verse.reference;
  translationLabel.textContent = label;
  verseState.hidden = true;
  verseText.hidden = false;
  verseRef.hidden = false;
  translationLabel.hidden = false;
}

function showError() {
  verseState.hidden = false;
  verseState.textContent = "Couldn't load a verse. Check your connection and try again.";
  verseText.hidden = true;
  verseRef.hidden = true;
  translationLabel.hidden = true;
  commentarySection.hidden = true;
}

async function loadNewVerse() {
  newVerseBtn.disabled = true;

  verseText.hidden = true;
  verseRef.hidden = true;
  translationLabel.hidden = true;
  commentarySection.hidden = true;
  verseState.hidden = false;
  verseState.textContent = "Finding a verse for you…";

  // Fast path: an already-generated entry sitting in the pool.
  const pooled = takeFromPool();
  if (pooled) {
    showVerse({ reference: pooled.reference, text: pooled.text }, pooled.translationLabel);
    commentaryText.textContent = pooled.commentary;
    commentarySection.hidden = false;
    newVerseBtn.disabled = false;
    return;
  }

  // Fallback: fetch and generate live, same as before.
  try {
    const { reference, englishModernText } = await fetchRandomReference();
    const { text, label } = await resolveVerseText(reference, englishModernText);
    const verse = { reference, text };

    showVerse(verse, label);

    commentaryText.textContent = "Loading context…";
    commentarySection.hidden = false;

    const commentary = await generateCommentary(verse);
    commentaryText.textContent = commentary;
  } catch (err) {
    console.error(err);
    showError();
  } finally {
    newVerseBtn.disabled = false;
  }
}

newVerseBtn.addEventListener("click", loadNewVerse);

// Load the pregenerated pool first, then show a verse — either straight
// from the pool (instant) or via the live fallback.
loadPool().then(loadNewVerse);

// Register the service worker so the app can be added to the home screen
// and load a little faster on repeat visits.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
