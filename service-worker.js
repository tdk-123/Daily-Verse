// "App shell" caching, network-first this time: always try to fetch the
// latest version of a file first, and only fall back to the cached copy
// if the network request fails (e.g. offline). This means pushing an
// update to GitHub shows up the next time the app opens with a
// connection, instead of being stuck on whatever was cached originally.
//
// IMPORTANT: bump CACHE_NAME (e.g. v2 -> v3) whenever you want to force
// every installed copy to fully discard its old cache. You don't need to
// do this for every update -- network-first already keeps things current --
// but it's a good "just in case" reset if something ever seems stuck.

const CACHE_NAME = "daily-verse-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./data/pool.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Don't wait for old tabs to close -- activate this version right away.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of any already-open page immediately, rather than
  // waiting for the next full reload.
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache external API calls -- always go straight to the network.
  const isExternalApi =
    url.hostname.includes("bible-api.com") ||
    url.hostname.includes("workers.dev");
  if (isExternalApi) {
    return;
  }

  // App shell files: network-first, cache as a fallback for offline use.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
