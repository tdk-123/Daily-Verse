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
- ⬜ Real commentary generation (currently a placeholder — see the TODO in `app.js`)

## Deploying (GitHub Pages)

1. Push this folder to a GitHub repo (repo must be public for free Pages hosting).
2. Repo Settings → Pages → set source to your main branch, root folder.
3. Visit the generated `https://<username>.github.io/<repo>/` URL.
4. On your phone, open that URL and choose "Add to Home Screen".
