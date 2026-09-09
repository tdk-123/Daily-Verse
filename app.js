// -----------------------------------------------------------------------
// A small curated list of references to pick randomly from.
// bible-api.com doesn't have a built-in "random verse" endpoint, so we
// keep a list here and fetch whichever one gets picked.
// Feel free to add more references to this list later.
// -----------------------------------------------------------------------
const VERSE_REFERENCES = [
  "John 3:16",
  "Psalm 23:1",
  "Philippians 4:6-7",
  "Proverbs 3:5-6",
  "Romans 8:28",
  "Isaiah 41:10",
  "Joshua 1:9",
  "Matthew 6:33",
  "Psalm 46:1",
  "Jeremiah 29:11",
  "2 Corinthians 5:17",
  "Galatians 5:22-23",
  "1 Corinthians 13:4-7",
  "Psalm 119:105",
  "Colossians 3:23",
  "Ecclesiastes 3:1",
  "James 1:2-3",
  "Micah 6:8",
  "Psalm 34:18",
  "Matthew 11:28"
];

const verseState = document.getElementById("verseState");
const verseText = document.getElementById("verseText");
const verseRef = document.getElementById("verseRef");
const commentarySection = document.getElementById("commentarySection");
const commentaryText = document.getElementById("commentaryText");
const newVerseBtn = document.getElementById("newVerseBtn");

async function fetchRandomVerse() {
  const reference = VERSE_REFERENCES[Math.floor(Math.random() * VERSE_REFERENCES.length)];
  const url = `https://bible-api.com/${encodeURIComponent(reference)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch verse (status ${response.status})`);
  }
  const data = await response.json();

  return {
    text: data.text.trim(),
    reference: data.reference
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
