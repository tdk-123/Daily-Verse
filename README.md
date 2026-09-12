# Daily Verse

A tiny personal PWA: shows a random bible verse (via bible-api.com) with a short
context note underneath. Free to host, free to run.

## Files

- `index.html` — page structure
- `style.css` — all styling
- `app.js` — fetches the verse, will later call an LLM for commentary
- `manifest.json` — makes "Add to Home Screen" work like an app
- `service-worker.js` — caches the app shell for faster/offline loading
- `icons/` — home screen icons

## Status

- ✅ Random verse fetching and display
- ✅ Installable as a home screen app (PWA)
- ✅ Testament filter (Old / New / Whole Bible)
- ✅ Language + version selector (English/Nederlands × Old/Modern)
- ✅ Neutral commentary generation via Gemini (through a Cloudflare Worker proxy)
- ✅ Pre-generated verse pool for instant loading (see below)

## The verse pool (instant loading)

`data/pool.json` holds a handful of pre-generated verse+commentary entries
for each of the 4 language/version combos. The app loads this file on open
and serves from it instantly — no network round-trip, no waiting on Gemini.

It's kept fresh by a GitHub Actions workflow (`.github/workflows/refresh-pool.yml`)
that runs `scripts/generate-pool.js` every 6 hours (and can be run manually
from the Actions tab). That script does the same fetching/translating/
commentary work as the live app, but runs on GitHub's servers — not in the
browser — so it can retry patiently on failure without a user waiting.

Statenvertaling (old Dutch) text is looked up by asking Gemini to search
the web — pointed at statenvertaling.net — via its Google Search grounding
tool, rather than relying on any dedicated Bible API (there wasn't a
reliable free one for this specific translation). It falls back to Gemini's
best recollection if a clean source isn't found, so it's very likely
accurate but not guaranteed word-for-word. Free tier includes 5,000 grounded
searches/month — this app's usage is nowhere close to that limit.

**One-time setup**: add your Gemini API key as a repository secret so the
workflow can use it:
1. Repo → Settings → Secrets and variables → Actions → New repository secret
2. Name: `GEMINI_API_KEY`, value: your Gemini API key
3. Go to the Actions tab → "Refresh verse pool" → Run workflow, to populate
   the pool for the first time (otherwise it'll just wait for the next
   scheduled run).

If the pool runs dry for a given combo (or you pick a specific testament,
which the pool doesn't cover), the app quietly falls back to fetching live,
same as before — just a bit slower.

## Deploying (GitHub Pages)

1. Push this folder to a GitHub repo (repo must be public for free Pages hosting).
2. Repo Settings → Pages → set source to your main branch, root folder.
3. Visit the generated `https://<username>.github.io/<repo>/` URL.
4. On your phone, open that URL and choose "Add to Home Screen".
