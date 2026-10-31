// Tests for the Meal calendar shopping list core (shopping-list.js).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const sl = require(path.join(__dirname, "..", "shopping-list.js"));
function mem() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, raw: m }; }

test("parses quantity, unit and name", () => {
  let p = sl.parseLine("1 1/2 cups long-grain white rice, rinsed");
  assert.equal(p.qty, 1.5); assert.equal(p.unit, "cups"); assert.equal(p.key, "long-grain white rice");
  p = sl.parseLine("½ tsp dried oregano"); assert.equal(p.qty, 0.5); assert.equal(p.key, "dried oregano");
  p = sl.parseLine("2 to 3 tablespoons lemon juice"); assert.equal(p.qty, 3);
  p = sl.parseLine("1 (8-oz) package cream cheese, softened"); assert.equal(p.qty, 8); assert.equal(p.unit, "oz");
  p = sl.parseLine("4 cloves garlic, minced"); assert.equal(p.unit, "clove"); assert.equal(p.key, "garlic");
  p = sl.parseLine("2 green bell peppers, diced"); assert.equal(p.qty, 2); assert.equal(p.key, "green bell pepper");
  p = sl.parseLine("Salt and pepper, to taste"); assert.equal(p.qty, null);
});

test("unit conversion sums tsp/tbsp/cup and oz/lb", () => {
  const P = (l) => sl.parseLine(l);
  assert.deepEqual(sl.combine([P("1 tbsp soy sauce"), P("3 tsp soy sauce")]), ["2 tbsp"]);
  assert.deepEqual(sl.combine([P("1/2 cup broth"), P("4 tablespoons broth")]), ["3/4 cup"]);
  assert.deepEqual(sl.combine([P("8 oz cheddar"), P("1 lb cheddar")]), ["1 1/2 lb"]);
  assert.deepEqual(sl.combine([P("1/2 cup butter"), P("7 tbsp butter")]), ["3/4 cup + 3 tbsp"]);
  assert.equal(sl.parseLine("1/2 cup pickled jalapeños").key, "pickled jalapeño");
  assert.deepEqual(sl.combine([P("1 yellow onion"), P("1/2 cup diced yellow onion")]), ["1", "1/2 cup"]);
});

test("merges duplicates across recipes with sources and sections", () => {
  const data = { a: { n: "A", i: ["1 large yellow onion, diced", "2 lb ground beef", "1 tsp kosher salt"] }, b: { n: "B", i: ["1/2 cup diced yellow onion", "1 cup shredded cheddar cheese"] } };
  const entries = [{ date: "2026-11-02", slug: "a" }, { date: "2026-11-03", slug: "b" }];
  const list = sl.buildList(entries, data, { pantry: [] });
  const items = list.sections.flatMap((s) => s.items.map((i) => Object.assign({ sec: s.name }, i)));
  const onion = items.find((i) => i.key === "yellow onion");
  assert.equal(onion.sec, "Produce"); assert.equal(onion.sources.length, 2); assert.equal(onion.amounts.join(" + "), "1 + 1/2 cup");
  assert.equal(items.find((i) => i.key === "ground beef").sec, "Meat & Seafood");
  assert.equal(items.find((i) => i.key === "cheddar cheese").sec, "Dairy & Eggs");
  assert.ok(!items.some((i) => i.key === "kosher salt")); assert.equal(list.hidden, 1);
  assert.match(sl.toText(list, "2026-11-02", "2026-11-03"), /Yellow onion: 1 \+ 1\/2 cup/);
});

test("range filter skips notes and out-of-range days", () => {
  const e = [{ date: "2026-11-01", slug: "a" }, { date: "2026-11-02", title: "Leftovers", slug: "" }, { date: "2026-11-09", slug: "a" }, { date: "2026-11-05", slug: "gone" }];
  const r = sl.inRange(e, "2026-11-01", "2026-11-07", { a: { n: "A", i: ["x"] } });
  assert.deepEqual(r.map((x) => x.date), ["2026-11-01"]);
  assert.deepEqual(sl.presetRange("next7", "2026-10-31"), { from: "2026-10-31", to: "2026-11-06" });
  assert.deepEqual(sl.presetRange("two", "2026-10-31"), { from: "2026-10-31", to: "2026-11-13" });
  assert.deepEqual(sl.presetRange("week", "2026-11-02"), { from: "2026-11-02", to: "2026-11-07" });
});

test("pantry hiding: defaults, butter kept, device list toggles", () => {
  ["salt", "kosher salt", "black pepper", "olive oil", "all-purpose flour", "granulated sugar", "water", "cooking spray", "dried oregano", "smoked paprika", "kosher salt and ground black pepper"]
    .forEach((k) => assert.ok(sl.isDefaultStaple(k), k));
  ["butter", "unsalted butter", "yellow onion", "chicken thigh"].forEach((k) => assert.ok(!sl.isDefaultStaple(k), k));
  const s = mem(); sl.addPantry(s, "soy sauce"); assert.deepEqual(sl.loadPantry(s), ["soy sauce"]);
  const data = { a: { n: "A", i: ["2 tbsp soy sauce", "1 tbsp olive oil"] } };
  assert.equal(sl.buildList([{ date: "2026-11-01", slug: "a" }], data, { pantry: sl.loadPantry(s) }).sections.length, 0);
  assert.equal(sl.buildList([{ date: "2026-11-01", slug: "a" }], data, { pantry: [], hideStaples: false }).sections[0].items.length, 2);
  sl.removePantry(s, "soy sauce"); assert.deepEqual(sl.loadPantry(s), []);
  s.setItem(sl.PANTRY_KEY, "{bad"); assert.deepEqual(sl.loadPantry(s), []);
});

test("check-offs persist per range on this device", () => {
  const s = mem(); sl.setCheck(s, "r1", "garlic", true);
  assert.deepEqual(sl.loadChecks(s, "r1"), { garlic: 1 }); assert.deepEqual(sl.loadChecks(s, "r2"), {});
  sl.setCheck(s, "r1", "garlic", false); assert.deepEqual(sl.loadChecks(s, "r1"), {});
});

test("ingredients.json covers every recipe and parses", () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "ingredients.json"), "utf8"));
  assert.ok(Object.keys(d).length > 100);
  Object.values(d).forEach((r) => r.i.forEach((l) => assert.ok(sl.parseLine(l).key)));
});
