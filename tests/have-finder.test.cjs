// Tests for Cook from what I have (have-finder.js).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const hf = require(path.join(__dirname, "..", "have-finder.js"));

function mem() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
}
function recipe(over) {
  return Object.assign({
    slug: "x",
    title: "X",
    category: "weekday dinners",
    categories: ["weekday dinners"],
    minutes: 30,
    lines: [],
  }, over);
}

test("singular and word-boundary matching", () => {
  assert.equal(hf.singular("tomatoes"), "tomato");
  assert.equal(hf.singular("potatoes"), "potato");
  assert.equal(hf.singular("tomato"), "tomato");
  assert.equal(hf.singular("potato"), "potato");
  assert.equal(hf.singular("rice"), "rice");
  assert.equal(hf.singular("licorice"), "licorice");
  assert.equal(hf.lineHits("3 ripe tomatoes, diced", "tomato"), true);
  assert.equal(hf.lineHits("1 tomato", "tomatoes"), true);
  assert.equal(hf.lineHits("4 Yukon Gold potatoes", "potato"), true);
  assert.equal(hf.lineHits("1 potato", "potatoes"), true);
  assert.equal(hf.lineHits("1 cup jasmine rice", "rice"), true);
  assert.equal(hf.lineHits("1 1/2 cups long-grain white rice", "rice"), true);
  assert.equal(hf.lineHits("2 lb chicken thighs", "chicken"), true);
  assert.equal(hf.lineHits("3 Tbsp rice vinegar", "rice"), false);
  assert.equal(hf.lineHits("1 cup chicken broth", "chicken"), false);
  assert.equal(hf.lineHits("1 cup chicken bone broth", "chicken"), false);
  assert.equal(hf.lineHits("2 ounces licorice", "rice"), false);
  assert.equal(hf.lineHits("the price of tea", "rice"), false);
  assert.equal(hf.lineHits("1 cup ricotta cheese", "rice"), false);
  assert.equal(hf.lineHits("1 lb ground beef", "ground beef"), true);
  assert.equal(hf.lineHits("1 tsp ground cumin", "ground beef"), false);
  assert.equal(hf.lineHits("2 cups beef broth", "ground beef"), false);
  assert.equal(hf.lineHits("6 large eggs", "egg"), true);
  assert.equal(hf.lineHits("1 egg", "eggs"), true);
});

test("pantry staples are assumed and a saved pantry key counts too", () => {
  const lines = [
    "2 lb chicken thighs",
    "1 tbsp olive oil",
    "1 tsp kosher salt",
    "1 tsp black pepper",
    "1 cup all-purpose flour",
    "1 tsp dried oregano",
    "1 cup water",
    "cooking spray",
    "2 tbsp unsalted butter",
    "1 onion",
  ];
  const plain = hf.rank([recipe({ slug: "pantry", title: "Pantry", lines: lines })], ["chicken"], [], [], {});
  assert.equal(plain.length, 1);
  assert.deepEqual(plain[0].uses, ["chicken"]);
  assert.deepEqual(plain[0].still, ["2 tbsp unsalted butter", "1 onion"]);
  const saved = hf.rank([recipe({ slug: "pantry", title: "Pantry", lines: lines })], ["chicken"], [], ["unsalted butter"], {});
  assert.deepEqual(saved[0].still, ["1 onion"]);
  assert.match(hf.staplesLine([]), /Staples assumed/);
  assert.match(hf.staplesLine(["unsalted butter"]), /unsalted butter/);
});

test("leave-out drops a recipe and shop pages never rank", () => {
  const recipes = [
    recipe({ slug: "keep", title: "Keep", lines: ["1 lb chicken thighs", "1 cup rice"] }),
    recipe({ slug: "drop", title: "Drop", lines: ["1 lb chicken thighs", "2 cups baby spinach", "1 cup rice"] }),
    recipe({ slug: "shop", title: "Shop", lines: ["1 lb chicken thighs", "1 cup rice"] }),
    recipe({ slug: "shop-order", title: "Order", lines: ["1 lb chicken", "1 cup rice"] }),
  ];
  const ranked = hf.rank(recipes, ["chicken", "rice"], ["spinach"], [], {});
  assert.deepEqual(ranked.map((r) => r.slug), ["keep"]);
  assert.equal(ranked[0].stillCount, 0);
});

test("orders by ingredients used, then fewest still needed, then shortest time", () => {
  const recipes = [
    recipe({ slug: "long", title: "Long", minutes: 50, lines: ["1 lb chicken", "2 cups rice", "1 onion", "1 carrot", "1 cup broth"] }),
    recipe({ slug: "short", title: "Short", minutes: 20, lines: ["1 lb chicken", "2 cups rice", "1 onion"] }),
    recipe({ slug: "needy", title: "Needy", minutes: 15, lines: ["1 lb chicken", "2 cups rice", "1 onion", "1 carrot", "1 zucchini", "1 cup broth"] }),
    recipe({ slug: "one", title: "Only chicken", minutes: 10, lines: ["1 lb chicken", "1 tsp salt"] }),
    recipe({ slug: "fast", title: "Fast", minutes: 12, lines: ["2 chicken thighs", "1 onion"] }),
    recipe({ slug: "slowish", title: "Slowish", minutes: 40, lines: ["1 lb chicken", "1 onion"] }),
  ];
  const ranked = hf.rank(recipes, ["chicken", "rice"], [], [], { time: "any" });
  assert.deepEqual(ranked.map((r) => r.slug), ["short", "long", "needy", "one", "fast", "slowish"]);
  assert.equal(ranked[0].uses.length, 2);
  assert.equal(ranked[0].stillCount, 1);
  assert.deepEqual(ranked[3].still, []);
});

test("time filters and hide desserts", () => {
  const recipes = [
    recipe({ slug: "quick", title: "Quick", minutes: 40, lines: ["1 lb chicken"] }),
    recipe({ slug: "hour", title: "Hour", minutes: 80, lines: ["1 lb chicken"] }),
    recipe({ slug: "pit", title: "Pit", minutes: 240, lines: ["1 lb chicken"] }),
    recipe({ slug: "unknown", title: "Unknown", minutes: 0, lines: ["1 lb chicken"] }),
    recipe({ slug: "cake", title: "Cake", category: "dessert", categories: ["dessert"], minutes: 30, lines: ["1 cup rice", "1 cup sugar"] }),
  ];
  assert.deepEqual(hf.rank(recipes, ["chicken", "rice"], [], [], { time: "45" }).map((r) => r.slug), ["quick"]);
  assert.deepEqual(hf.rank(recipes, ["chicken", "rice"], [], [], { time: "75" }).map((r) => r.slug), ["quick"]);
  assert.deepEqual(hf.rank(recipes, ["chicken", "rice"], [], [], { time: "slow" }).map((r) => r.slug), ["pit"]);
  const any = hf.rank(recipes, ["chicken", "rice"], [], [], { time: "any" }).map((r) => r.slug);
  assert.ok(any.indexOf("cake") === -1);
  assert.ok(any.indexOf("unknown") !== -1);
  const withDessert = hf.rank(recipes, ["rice"], [], [], { hideDesserts: false, time: "any" });
  assert.ok(withDessert.some((r) => r.slug === "cake"));
  assert.equal(hf.timeOk(75, "75"), true);
  assert.equal(hf.timeOk(76, "75"), false);
  assert.equal(hf.timeOk(180, "slow"), true);
  assert.equal(hf.timeOk(179, "slow"), false);
});

test("tomato and potato chips count once across plurals", () => {
  const ranked = hf.rank([
    recipe({ slug: "veg", title: "Veg", minutes: 25, lines: ["2 tomatoes", "3 potatoes", "1 tsp salt"] }),
  ], ["tomato", "tomatoes", "potatoes"], [], [], {});
  assert.equal(ranked.length, 1);
  assert.deepEqual(ranked[0].uses, ["tomato", "potatoes"]);
  assert.equal(ranked[0].stillCount, 0);
});

test("chips round-trip in clt:have-v1 and bad storage is empty", () => {
  const s = mem();
  assert.equal(hf.saveHave(s, { have: [" Chicken ", "tomatoes", "tomato"], omit: ["Spinach"] }), true);
  const loaded = hf.loadHave(s);
  assert.deepEqual(loaded.have, ["Chicken", "tomatoes"]);
  assert.deepEqual(loaded.omit, ["Spinach"]);
  const raw = JSON.parse(s.getItem(hf.HAVE_KEY));
  assert.equal(raw.v, 1);
  assert.equal(hf.HAVE_KEY, "clt:have-v1");
  s.setItem(hf.HAVE_KEY, "{bad");
  assert.deepEqual(hf.loadHave(s), { have: [], omit: [] });
});

test("catalog parser skips shop pages", () => {
  const html = [
    '<ul class="book-list">',
    '<li><a href="shop.html" data-cat="dessert"><span class="card-title">Shop</span></a></li>',
    '<li><a href="shop-order.html" data-cat="dessert"><span class="card-title">Order</span></a></li>',
    '<li><a href="cajun-chicken-pasta.html" data-cat="weekday dinners"><span class="card-title">Cajun &amp; Chicken</span></a></li>',
    "</ul>",
  ].join("");
  const cat = hf.catalogFromHtml(html);
  assert.equal(cat.shop, undefined);
  assert.equal(cat["shop-order"], undefined);
  assert.equal(cat["cajun-chicken-pasta"].title, "Cajun & Chicken");
  assert.equal(cat["cajun-chicken-pasta"].category, "weekday dinners");
});

test("real catalog: chicken and rice stays ordered and skips desserts and shop", () => {
  const root = path.join(__dirname, "..");
  const ingredients = JSON.parse(fs.readFileSync(path.join(root, "ingredients.json"), "utf8"));
  const meta = JSON.parse(fs.readFileSync(path.join(root, "recipe-meta.json"), "utf8"));
  const html = fs.readFileSync(path.join(root, "recipes.html"), "utf8");
  const recipes = hf.assemble(ingredients, meta, hf.catalogFromHtml(html));
  assert.ok(recipes.length > 100, "parsed " + recipes.length);
  const ranked = hf.rank(recipes, ["chicken", "rice"], [], [], { hideDesserts: true, time: "any" });
  assert.ok(ranked.length > 5);
  assert.equal(ranked[0].uses.length, 2);
  assert.ok(ranked.every((r) => r.slug !== "shop" && r.slug !== "shop-order"));
  assert.ok(ranked.every((r) => String(r.category).toLowerCase() !== "dessert"));
  assert.ok(ranked.every((r) => r.uses.length >= 1));
  for (let i = 1; i < ranked.length; i++) {
    const a = ranked[i - 1];
    const b = ranked[i];
    const ok = a.uses.length > b.uses.length ||
      (a.uses.length === b.uses.length && a.stillCount < b.stillCount) ||
      (a.uses.length === b.uses.length && a.stillCount === b.stillCount && (a.minutes || 1e9) <= (b.minutes || 1e9));
    assert.ok(ok, a.slug + " before " + b.slug);
  }
});
