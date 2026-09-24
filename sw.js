/* Carroll Lowcountry Table — offline cache for kitchen use on GitHub Pages */
const CACHE = "carroll-lowcountry-v3";
const SHELL = [
  "./",
  "./index.html",
  "./recipes.html",
  "./styles.css",
  "./recipe.js",
  "./site.js",
  "./logo.webp",
  "./logo.jpg",
  "./logo-mark.webp",
  "./logo-mark.png",
  "./favicon.png",
  "./apple-touch-icon.png",
  "./brand-override.css",
  "./icon.svg",
  "./manifest.webmanifest",
  "./copyright.html",
  "./sw.js",
  "./category-weekend-dinners.html",
  "./category-weekday-dinners.html",
  "./category-game-day.html",
  "./category-sides-salads.html",
  "./category-dessert.html",
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

async function htmlHrefs(path) {
  try {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) return [];
    const html = await res.text();
    const found = new Set();
    const re = /href="([^"]+\.html)"/g;
    let m;
    while ((m = re.exec(html))) {
      const href = m[1];
      if (/^https?:/i.test(href)) continue;
      const clean = href.replace(/^\.\//, "");
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
      const fromSplash = await htmlHrefs("./index.html");
      const fromBook = await htmlHrefs("./recipes.html");
      const all = Array.from(new Set([...fromSplash, ...fromBook]));
      await addAllSafe(cache, all);
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
