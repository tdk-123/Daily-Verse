// Pre-generates a small pool of ready-to-display verses (all 4 language +
// version combos), each with commentary already attached, and writes them
// to data/pool.json. Run by the GitHub Actions workflow on a schedule.
//
// This runs in Node (via GitHub Actions), not the browser. Statenvertaling
// text is looked up via Gemini's Google Search grounding tool (pointed at
// statenvertaling.net) rather than any dedicated Bible API — there wasn't a
// reliable free one for this translation. Running it here instead of live
// in the browser means it can retry patiently without a user waiting.
//
// Requires GEMINI_API_KEY as an environment variable (set via the
// workflow's secrets — see .github/workflows/refresh-pool.yml).

import fs from "fs";

const POOL_SIZE_PER_COMBO = 3;
const GEMINI_MODEL = "gemini-2.5-flash";
const OUTPUT_PATH = "data/pool.json";

const COMBOS = [
  { language: "EN", version: "MODERN" },
  { language: "EN", version: "OLD" },
  { language: "NL", version: "OLD" },
  { language: "NL", version: "MODERN" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, retries = 2, delayMs = 800) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await sleep(delayMs);
    return withRetry(fn, retries - 1, delayMs);
  }
}

async function fetchRandomReference() {
  const res = await fetch("https://bible-api.com/data/web/random");
  if (!res.ok) throw new Error(`bible-api random fetch failed (${res.status})`);
  const data = await res.json();
  const v = data.random_verse;
  return {
    reference: `${v.book} ${v.chapter}:${v.verse}`,
    englishModernText: v.text.trim(),
  };
}

async function fetchFromBibleApi(reference, translationId) {
  const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${translationId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bible-api fetch failed (${res.status})`);
  const data = await res.json();
  return data.text.trim();
}

async function callGemini(prompt, useSearch = false) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
  if (useSearch) {
    requestBody.tools = [{ google_search: {} }];
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) throw new Error(`Gemini call failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

function buildStatenvertalingPrompt(reference) {
  return (
    `Search the web — preferably statenvertaling.net — for the exact ` +
    `wording of this bible verse in the historic Dutch "Statenvertaling" ` +
    `(States Translation, 1637). Return ONLY the verse text itself, in ` +
    `Dutch: no explanation, no repeated reference, no quotation marks, no ` +
    `verse number prefix. If you can't find a clean source for it, give ` +
    `your best-known rendering of this verse in the Statenvertaling, ` +
    `staying as close as you can to the authentic 1637 wording.\n\n` +
    `Reference: ${reference}`
  );
}

function buildTranslatePrompt(englishText) {
  return (
    `Translate the following bible verse into natural, contemporary Dutch ` +
    `("hedendaags Nederlands"), suitable for a modern reader. Stay faithful ` +
    `to the original meaning. Return ONLY the translated verse text — no ` +
    `quotation marks, no explanation, no extra commentary.\n\n` +
    `Verse: "${englishText}"`
  );
}

function buildCommentaryPrompt(language, reference, text) {
  if (language === "NL") {
    return (
      `Je geeft een korte, neutrale, historische/literaire duiding bij een ` +
      `bijbeltekst — geen devotionele of theologische interpretatie. Leg in ` +
      `2-3 zinnen de context uit (wie de schrijver was, aan wie het gericht ` +
      `was, en/of de situatie die aan de orde is). Wees feitelijk en ` +
      `evenwichtig; bevoordeel geen specifieke denominatie.\n\n` +
      `Referentie: ${reference}\n` +
      `Tekst: "${text}"\n\n` +
      `Antwoord in het Nederlands.`
    );
  }
  return (
    `You are providing brief, neutral, historical/literary context for a ` +
    `bible verse — not a devotional or theological interpretation. In 2-3 ` +
    `sentences, explain the context (who wrote it, to whom, and/or the ` +
    `situation it addresses). Be factual and even-handed; don't favor any ` +
    `particular denomination's reading.\n\n` +
    `Reference: ${reference}\n` +
    `Text: "${text}"\n\n` +
    `Respond in English.`
  );
}

async function buildEntry(language, version) {
  const { reference, englishModernText } = await fetchRandomReference();

  let text, translationLabel;
  if (language === "EN" && version === "MODERN") {
    text = englishModernText;
    translationLabel = "World English Bible";
  } else if (language === "EN" && version === "OLD") {
    text = await withRetry(() => fetchFromBibleApi(reference, "kjv"));
    translationLabel = "King James Version";
  } else if (language === "NL" && version === "OLD") {
    text = await withRetry(() => callGemini(buildStatenvertalingPrompt(reference), true));
    translationLabel = "Statenvertaling";
  } else {
    text = await withRetry(() => callGemini(buildTranslatePrompt(englishModernText)));
    translationLabel = "Hedendaagse vertaling (AI-vertaald)";
  }

  const commentary = await withRetry(() => callGemini(buildCommentaryPrompt(language, reference, text)));

  return { reference, text, translationLabel, commentary };
}

async function buildPoolForCombo(language, version) {
  const key = `${language}_${version}`;
  const entries = [];
  for (let i = 0; i < POOL_SIZE_PER_COMBO; i++) {
    try {
      const entry = await buildEntry(language, version);
      entries.push(entry);
      console.log(`[${key}] built entry ${i + 1}/${POOL_SIZE_PER_COMBO}: ${entry.reference}`);
    } catch (err) {
      console.error(`[${key}] failed to build entry ${i + 1}: ${err.message}`);
    }
  }
  return { key, entries };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }

  // Start from whatever's already there, so a combo that fails this run
  // doesn't wipe out perfectly good entries from a previous run.
  let existing = { entries: {} };
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
    } catch {
      // ignore unreadable/old file, start fresh
    }
  }

  const pool = { ...existing.entries };

  for (const combo of COMBOS) {
    const { key, entries } = await buildPoolForCombo(combo.language, combo.version);
    if (entries.length > 0) {
      pool[key] = entries;
    } else {
      console.warn(`[${key}] no entries built this run, keeping previous data if any.`);
    }
  }

  const output = { generatedAt: new Date().toISOString(), entries: pool };
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
