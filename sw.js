/* Carroll Smokehouse — offline cache for kitchen use on GitHub Pages */
const CACHE = "carroll-smokehouse-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./recipe.js",
  "./site.js",
  "./logo.webp",
  "./icon.svg",
  "./manifest.webmanifest",
  "./copyright.html",
  "./sw.js",
];

async function addAllSafe(cache, urls) {
  await Promise.all(
    urls.map((url) =>
      cache.add(url).catch(() => {
        /* skip missing or failed assets */
      })
    )
  );
}

async function recipeUrlsFromIndex() {
  try {
    const res = await fetch("./index.html", { cache: "no-cache" });
    if (!res.ok) return [];
    const html = await res.text();
    const found = new Set();
    const re = /href="([^"]+\.html)"/g;
    let m;
    while ((m = re.exec(html))) {
      const href = m[1];
      if (/^https?:/i.test(href)) continue;
      const clean = href.replace(/^\.\//, "");
      if (clean === "index.html") continue;
      found.add("./" + clean);
    }
    return Array.from(found);
  } catch (_) {
    return [];
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await addAllSafe(cache, SHELL);
      const recipes = await recipeUrlsFromIndex();
      await addAllSafe(cache, recipes);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && url.protocol.startsWith("http")) {
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (_) {
        if (cached) return cached;
        if (req.mode === "navigate") {
          const fallback = await cache.match("./index.html");
          if (fallback) return fallback;
        }
        throw _;
      }
    })()
  );
});
