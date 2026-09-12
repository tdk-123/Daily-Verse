# Setting up the AI proxy (Cloudflare Worker)

This lets your app call Gemini without exposing your API key in the public
GitHub Pages code. Takes about 5 minutes, all through the browser.

## 1. Create a free Cloudflare account

Go to https://dash.cloudflare.com/sign-up and sign up (email + password,
no credit card needed for the free Workers plan).

## 2. Create the Worker

1. In the Cloudflare dashboard, go to **Workers & Pages** in the left sidebar.
2. Click **Create** → **Create Worker**.
3. Give it a name, e.g. `bible-app-proxy`. Click **Deploy** to create it with
   the default "Hello World" code (we'll replace that next).
4. Click **Edit code** to open the online code editor.
5. Delete everything in the editor and paste in the full contents of
   `worker.js` (provided alongside this file).
6. Click **Deploy** (top right) to publish it.

## 3. Add your Gemini API key as a secret

Never paste the key directly into the code — use an encrypted secret instead:

1. On your Worker's page, go to **Settings** → **Variables and Secrets**.
2. Click **Add** → choose type **Secret**.
3. Name: `GEMINI_API_KEY`
4. Value: paste your actual Gemini API key.
5. Save — this triggers a redeploy automatically.

## 4. Get your Worker's URL

On the Worker's overview page, you'll see a URL like:

```
https://bible-app-proxy.<your-subdomain>.workers.dev
```

Copy this — you'll paste it into `app.js` as `AI_PROXY_URL` (see the `CONFIG`
object near the top of the file).

## 5. Test it

You can sanity-check the worker directly (outside the app) using your
browser's dev tools console, or a tool like https://reqbin.com, by sending
a POST request to your Worker URL with body:

```json
{ "prompt": "Say hello in one short sentence." }
```

You should get back `{ "text": "..." }`. If you get an error instead,
double check the secret name is exactly `GEMINI_API_KEY` and that the key
itself is valid.

## Notes

- The free Workers plan allows 100,000 requests/day — far more than personal
  use needs.
- If Google retires the `gemini-2.5-flash` model name at some point, update
  the `GEMINI_MODEL` constant at the top of `worker.js`, then redeploy.
- `Access-Control-Allow-Origin: "*"` in the worker means any website could
  technically call your proxy (and spend your free quota) if they discovered
  the URL. For a personal project this is a minor risk, but if you want to
  tighten it later, change that value to your exact GitHub Pages origin,
  e.g. `"https://yourname.github.io"`.
