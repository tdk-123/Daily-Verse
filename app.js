// -----------------------------------------------------------------------
// Fill this in after deploying the Cloudflare Worker (see SETUP.md).
// Example: "https://bible-app-proxy.yourname.workers.dev"
// -----------------------------------------------------------------------
const CONFIG = {
  AI_PROXY_URL: "https://bible-app-proxy.tdekoning88.workers.dev",
};

// -----------------------------------------------------------------------
// Selection state.
//
// Testament: two independent toggles. Both on = whole Bible, exactly one
// on = that testament only, both off is invalid (checked before fetching).
//
// Version: exactly one of OLD/MODERN is active at a time (enforced by the
// button click handler itself, see below).
//
// Language: EN/NL, switched via the flag buttons, also exactly one active.
//
// These three combine into one of four text sources:
//   EN + MODERN -> World English Bible, straight from bible-api.com
//   EN + OLD    -> King James Version, from bible-api.com
//   NL + OLD    -> Statenvertaling, recalled by Gemini
//   NL + MODERN -> WEB text translated into modern Dutch by Gemini
// -----------------------------------------------------------------------
const state = {
  testamentOT: true,
  testamentNT: true,
  language: "EN", // "EN" | "NL"
  version: "MODERN", // "OLD" | "MODERN"
};

// -----------------------------------------------------------------------
// UI text in both languages. Only the static interface labels live here —
// the verse text and commentary come from the actual data sources.
// -----------------------------------------------------------------------
const STRINGS = {
  EN: {
    appLabel: "Daily Verse",
    testamentLabel: "Testament",
    oldTestament: "Old Testament",
    newTestament: "New Testament",
    versionLabel: "Version",
    old: "Old",
    modern: "Modern",
    randomVerseBtn: "Give me a random verse",
    findingVerse: "Finding a verse for you…",
    loadingContext: "Loading context…",
    couldntLoad: "Couldn't load a verse. Check your connection and try again.",
    selectTestamentError: "Please select at least one testament (Old or New).",
    selectVersionError: "Please select a translation version (Old or Modern).",
    contextLabel: "Context",
    initialPrompt: "Choose your options, then tap the button above.",
  },
  NL: {
    appLabel: "Dagelijks Vers",
    testamentLabel: "Testament",
    oldTestament: "Oude Testament",
    newTestament: "Nieuwe Testament",
    versionLabel: "Vertaling",
    old: "Oud",
    modern: "Modern",
    randomVerseBtn: "Geef me een willekeurig vers",
    findingVerse: "Een vers zoeken voor je…",
    loadingContext: "Context laden…",
    couldntLoad: "Kon geen vers laden. Controleer je verbinding en probeer opnieuw.",
    selectTestamentError: "Selecteer minstens één testament (Oud of Nieuw).",
    selectVersionError: "Selecteer een vertaalversie (Oud of Modern).",
    contextLabel: "Context",
    initialPrompt: "Kies je opties en tik daarna op de knop hierboven.",
  },
};

// Standard English -> Dutch bible book names, for displaying the reference
// when the Dutch flag is active. Fetching from bible-api.com etc. always
// uses the English name internally (that's what those APIs expect) — this
// table is purely for what gets shown on screen.
const BOOK_NAMES_NL = {
  "Genesis": "Genesis", "Exodus": "Exodus", "Leviticus": "Leviticus",
  "Numbers": "Numeri", "Deuteronomy": "Deuteronomium", "Joshua": "Jozua",
  "Judges": "Rechters", "Ruth": "Ruth", "1 Samuel": "1 Samuel",
  "2 Samuel": "2 Samuel", "1 Kings": "1 Koningen", "2 Kings": "2 Koningen",
  "1 Chronicles": "1 Kronieken", "2 Chronicles": "2 Kronieken", "Ezra": "Ezra",
  "Nehemiah": "Nehemia", "Esther": "Esther", "Job": "Job", "Psalms": "Psalmen",
  "Proverbs": "Spreuken", "Ecclesiastes": "Prediker", "Song of Solomon": "Hooglied",
  "Isaiah": "Jesaja", "Jeremiah": "Jeremia", "Lamentations": "Klaagliederen",
  "Ezekiel": "Ezechiël", "Daniel": "Daniël", "Hosea": "Hosea", "Joel": "Joël",
  "Amos": "Amos", "Obadiah": "Obadja", "Jonah": "Jona", "Micah": "Micha",
  "Nahum": "Nahum", "Habakkuk": "Habakuk", "Zephaniah": "Sefanja",
  "Haggai": "Haggaï", "Zechariah": "Zacharia", "Malachi": "Maleachi",
  "Matthew": "Mattheüs", "Mark": "Marcus", "Luke": "Lucas", "John": "Johannes",
  "Acts": "Handelingen", "Romans": "Romeinen", "1 Corinthians": "1 Korinthiërs",
  "2 Corinthians": "2 Korinthiërs", "Galatians": "Galaten", "Ephesians": "Efeziërs",
  "Philippians": "Filippenzen", "Colossians": "Kolossenzen",
  "1 Thessalonians": "1 Thessalonicenzen", "2 Thessalonians": "2 Thessalonicenzen",
  "1 Timothy": "1 Timotheüs", "2 Timothy": "2 Timotheüs", "Titus": "Titus",
  "Philemon": "Filemon", "Hebrews": "Hebreeën", "James": "Jakobus",
  "1 Peter": "1 Petrus", "2 Peter": "2 Petrus", "1 John": "1 Johannes",
  "2 John": "2 Johannes", "3 John": "3 Johannes", "Jude": "Judas",
  "Revelation": "Openbaring",
};

function translateReferenceForDisplay(reference) {
  if (state.language !== "NL") return reference;
  const lastSpace = reference.lastIndexOf(" ");
  const book = reference.slice(0, lastSpace);
  const chapterVerse = reference.slice(lastSpace + 1);
  const translatedBook = BOOK_NAMES_NL[book] || book;
  return `${translatedBook} ${chapterVerse}`;
}

// -----------------------------------------------------------------------
// DOM references
// -----------------------------------------------------------------------
const appLabelEl = document.getElementById("appLabel");
const testamentLabelEl = document.getElementById("testamentLabel");
const versionLabelEl = document.getElementById("versionLabel");
const commentaryLabelEl = document.getElementById("commentaryLabel");
const selectionError = document.getElementById("selectionError");
const verseState = document.getElementById("verseState");
const verseText = document.getElementById("verseText");
const verseRef = document.getElementById("verseRef");
const translationLabel = document.getElementById("translationLabel");
const commentarySection = document.getElementById("commentarySection");
const commentaryText = document.getElementById("commentaryText");
const newVerseBtn = document.getElementById("newVerseBtn");

const testamentButtons = document.querySelectorAll("[data-testament]");
const versionButtons = document.querySelectorAll("[data-version]");
const flagButtons = document.querySelectorAll("[data-language]");

// -----------------------------------------------------------------------
// Selection controls. Note none of these fetch a verse themselves — they
// only update `state`. Fetching only happens when the button is pressed.
// -----------------------------------------------------------------------
testamentButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.testament; // "OT" | "NT"
    if (key === "OT") state.testamentOT = !state.testamentOT;
    else state.testamentNT = !state.testamentNT;
    btn.classList.toggle("active");
    btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
  });
});

versionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.version = btn.dataset.version;
    versionButtons.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });
  });
});

flagButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (state.language === btn.dataset.language) return;
    state.language = btn.dataset.language;
    flagButtons.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });
    renderStaticText();
  });
});

// Updates all fixed interface labels to the current language. Doesn't
// touch verse/commentary content (that's real fetched data, not UI chrome)
// except for re-showing the initial prompt or an error message, if that's
// what's currently on screen.
function renderStaticText() {
  const s = STRINGS[state.language];
  appLabelEl.textContent = s.appLabel;
  testamentLabelEl.textContent = s.testamentLabel;
  versionLabelEl.textContent = s.versionLabel;
  commentaryLabelEl.textContent = s.contextLabel;
  newVerseBtn.textContent = s.randomVerseBtn;

  document.querySelector('[data-testament="OT"]').textContent = s.oldTestament;
  document.querySelector('[data-testament="NT"]').textContent = s.newTestament;
  document.querySelector('[data-version="OLD"]').textContent = s.old;
  document.querySelector('[data-version="MODERN"]').textContent = s.modern;

  // Only refresh verseState's text if it's the placeholder/error being
  // shown right now — never overwrite it mid-fetch or after a real verse.
  if (!verseState.hidden) {
    verseState.textContent = verseState.dataset.kind === "error" ? s.couldntLoad : s.initialPrompt;
  }
}

function getEffectiveTestament() {
  if (state.testamentOT && state.testamentNT) return "ALL";
  if (state.testamentOT) return "OT";
  if (state.testamentNT) return "NT";
  return null; // invalid: neither selected
}

function validateSelection() {
  const s = STRINGS[state.language];
  const errors = [];
  if (getEffectiveTestament() === null) errors.push(s.selectTestamentError);
  if (state.version !== "OLD" && state.version !== "MODERN") errors.push(s.selectVersionError);
  return errors;
}

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
async function fetchRandomReference(testament) {
  const base = "https://bible-api.com/data/web/random";
  const url = testament === "ALL" ? base : `${base}/${testament}`;

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

function takeFromPool(testament) {
  if (testament !== "ALL") return null;
  const key = `${state.language}_${state.version}`;
  const entries = pool[key];
  if (!entries || entries.length === 0) return null;
  return entries.shift();
}

function showVerse(verse, label) {
  verseText.textContent = `"${verse.text}"`;
  verseRef.textContent = translateReferenceForDisplay(verse.reference);
  translationLabel.textContent = label;
  verseState.hidden = true;
  verseText.hidden = false;
  verseRef.hidden = false;
  translationLabel.hidden = false;
}

function showError() {
  verseState.hidden = false;
  verseState.dataset.kind = "error";
  verseState.textContent = STRINGS[state.language].couldntLoad;
  verseText.hidden = true;
  verseRef.hidden = true;
  translationLabel.hidden = true;
  commentarySection.hidden = true;
}

async function loadNewVerse() {
  const testament = getEffectiveTestament();
  // Should never be null here since the button handler validates first,
  // but guard anyway in case this is ever called from elsewhere.
  if (testament === null) return;

  newVerseBtn.disabled = true;

  verseText.hidden = true;
  verseRef.hidden = true;
  translationLabel.hidden = true;
  commentarySection.hidden = true;
  verseState.hidden = false;
  verseState.dataset.kind = "loading";
  verseState.textContent = STRINGS[state.language].findingVerse;

  // Fast path: an already-generated entry sitting in the pool.
  const pooled = takeFromPool(testament);
  if (pooled) {
    showVerse({ reference: pooled.reference, text: pooled.text }, pooled.translationLabel);
    commentaryText.textContent = pooled.commentary;
    commentarySection.hidden = false;
    newVerseBtn.disabled = false;
    return;
  }

  // Fallback: fetch and generate live, same as before.
  try {
    const { reference, englishModernText } = await fetchRandomReference(testament);
    const { text, label } = await resolveVerseText(reference, englishModernText);
    const verse = { reference, text };

    showVerse(verse, label);

    commentaryText.textContent = STRINGS[state.language].loadingContext;
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

newVerseBtn.addEventListener("click", () => {
  const errors = validateSelection();
  if (errors.length > 0) {
    selectionError.textContent = errors.join(" ");
    selectionError.hidden = false;
    return;
  }
  selectionError.hidden = true;
  loadNewVerse();
});

// Load the pregenerated pool in the background so it's ready the moment
// the button is pressed. Doesn't show anything on its own — the app waits
// for a deliberate tap on "Give me a random verse".
verseState.dataset.kind = "initial";
loadPool();

// Register the service worker so the app can be added to the home screen
// and load a little faster on repeat visits.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
