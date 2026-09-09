// -----------------------------------------------------------------------
// Which testament to sample from. bible-api.com's random endpoint takes
// an optional "OT" or "NT" path segment; omitting it samples the whole
// Bible. This means we can ask for the right testament directly instead
// of fetching randomly and rejecting wrong results.
// -----------------------------------------------------------------------
let selectedTestament = "ALL"; // "ALL" | "OT" | "NT"

const verseState = document.getElementById("verseState");
const verseText = document.getElementById("verseText");
const verseRef = document.getElementById("verseRef");
const commentarySection = document.getElementById("commentarySection");
const commentaryText = document.getElementById("commentaryText");
const newVerseBtn = document.getElementById("newVerseBtn");
const testamentButtons = document.querySelectorAll(".testament-btn");

testamentButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.testament === selectedTestament) return;

    selectedTestament = btn.dataset.testament;
    testamentButtons.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });

    loadNewVerse();
  });
});

async function fetchRandomVerse() {
  const base = "https://bible-api.com/data/web/random";
  const url = selectedTestament === "ALL" ? base : `${base}/${selectedTestament}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch verse (status ${response.status})`);
  }
  const data = await response.json();
  const v = data.random_verse;

  return {
    text: v.text.trim(),
    reference: `${v.book} ${v.chapter}:${v.verse}`
  };
}

// -----------------------------------------------------------------------
// TODO (next step, not built yet): replace this with a real call to a
// free-tier LLM API (e.g. Gemini/Groq/OpenRouter) that generates a short,
// neutral piece of context about the verse. For now this just returns a
// placeholder so the layout and flow can be tested end to end.
// -----------------------------------------------------------------------
async function generateCommentary(verse) {
  await new Promise((resolve) => setTimeout(resolve, 400)); // simulate loading
  return `Commentary generation isn't wired up yet — this is placeholder text standing in for a short, neutral note about the context of "${verse.reference}".`;
}

async function loadNewVerse() {
  newVerseBtn.disabled = true;

  verseText.hidden = true;
  verseRef.hidden = true;
  commentarySection.hidden = true;
  verseState.hidden = false;
  verseState.textContent = "Finding a verse for you…";

  try {
    const verse = await fetchRandomVerse();

    verseText.textContent = `"${verse.text}"`;
    verseRef.textContent = verse.reference;
    verseState.hidden = true;
    verseText.hidden = false;
    verseRef.hidden = false;

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
