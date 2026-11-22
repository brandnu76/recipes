"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");

function htmlPages() {
  return fs.readdirSync(ROOT).filter((n) => n.endsWith(".html")).sort();
}

test("every HTML page has a skip-to-content link and a main#main landmark", () => {
  for (const name of htmlPages()) {
    const html = fs.readFileSync(path.join(ROOT, name), "utf8");
    assert.match(html, /class="skip-link"/, `${name} missing skip-link`);
    assert.match(html, /href="#main"/, `${name} skip-link does not target #main`);
    assert.match(html, /<main\b[^>]*\bid="main"/, `${name} missing <main id="main">`);
    assert.equal((html.match(/<main\b/gi) || []).length, 1, `${name} should have exactly one main`);
    const skipAt = html.indexOf('class="skip-link"');
    const mainAt = html.search(/<main\b/i);
    assert.ok(skipAt > -1 && skipAt < mainAt, `${name} skip-link should appear before main`);
  }
});

test("branded 404 page exists and is not indexed", () => {
  const html = fs.readFileSync(path.join(ROOT, "404.html"), "utf8");
  assert.match(html, /Page not found/);
  assert.match(html, /href="index.html"/);
  assert.match(html, /href="recipes.html"/);
  assert.match(html, /noindex/);
  assert.match(html, /Carroll Lowcountry Table/);
  assert.ok(fs.existsSync(path.join(ROOT, ".nojekyll")), "missing .nojekyll");
});

test("styles.css self-hosts fonts and does not @import Google Fonts", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.doesNotMatch(css, /@import[^;]*fonts\.googleapis/);
  assert.match(css, /@font-face/);
  assert.match(css, /font-display:\s*swap/);
  assert.match(css, /url\("fonts\/source-sans-3-400-latin\.woff2"\)/);
  const fonts = fs.readdirSync(path.join(ROOT, "fonts")).filter((n) => n.endsWith(".woff2"));
  assert.ok(fonts.length >= 8, `expected self-hosted woff2 files, got ${fonts.length}`);
});

test("pages no longer preconnect to Google Fonts", () => {
  for (const name of htmlPages()) {
    const html = fs.readFileSync(path.join(ROOT, name), "utf8");
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/, `${name} still references Google Fonts`);
  }
});

test("sausage kale soup is titled without Slow Cooker", () => {
  const html = fs.readFileSync(path.join(ROOT, "sausage-kale-tortellini-soup.html"), "utf8");
  assert.match(html, /<title>Sausage, Kale &amp; Tortellini Soup<\/title>/);
  assert.match(html, /itemprop="name">Sausage, Kale &amp; Tortellini Soup<\/h1>/);
  assert.match(html, /"name": "Sausage, Kale & Tortellini Soup"/);
  assert.doesNotMatch(html, /Slow Cooker Sausage, Kale/);
  assert.match(html, /stovetop/i);
  assert.match(html, /slow cooker/i);
  const ingredients = JSON.parse(fs.readFileSync(path.join(ROOT, "ingredients.json"), "utf8"));
  assert.equal(ingredients["sausage-kale-tortellini-soup"].n, "Sausage, Kale & Tortellini Soup");
});

test("legacy one-shot write workflows are gone", () => {
  const dir = path.join(ROOT, ".github", "workflows");
  const names = fs.readdirSync(dir);
  for (const stale of ["fix-site-errors.yml", "decode-recipe-images.yml", "assemble-blpc.yml", "assemble-tsb.yml"]) {
    assert.ok(!names.includes(stale), `${stale} should have been retired`);
  }
  assert.ok(names.includes("recipe-quality.yml"));
  assert.ok(names.includes("check-recipe-images.yml"));
});

test("service worker cache is v85 and precaches self-hosted fonts", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  assert.match(sw, /CACHE = "carroll-lowcountry-v85"/);
  assert.match(sw, /\.\/fonts\/source-sans-3-400-latin\.woff2/);
});

test("README lists every catalog recipe", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const recipes = fs.readFileSync(path.join(ROOT, "recipes.html"), "utf8");
  const slugs = new Set();
  for (const m of recipes.matchAll(/href="([a-z0-9-]+)\.html"/g)) {
    const slug = m[1];
    if (slug.startsWith("category-") || ["index", "help", "copyright"].includes(slug)) continue;
    slugs.add(slug);
  }
  // recipes.html also links splash category pages inside some cards; keep only slugs that exist as recipe pages with a card-title nearby
  const cardSlugs = new Set();
  for (const m of recipes.matchAll(/<a href="([a-z0-9-]+)\.html"[^>]*>[\s\S]*?<span class="card-title">/g)) {
    cardSlugs.add(m[1]);
  }
  assert.ok(cardSlugs.size >= 152, `expected a full catalog, got ${cardSlugs.size}`);
  for (const slug of cardSlugs) {
    assert.match(readme, new RegExp(`\\(${slug}\\.html\\)`), `README missing ${slug}.html`);
  }
  assert.doesNotMatch(readme, /Slow Cooker Sausage, Kale/);
});
