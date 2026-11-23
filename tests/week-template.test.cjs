// Tests for the Meal calendar Week template (week-template.js) and double batches.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
const wk = require(path.join(ROOT, "week-template.js"));
const cal = require(path.join(ROOT, "meal-calendar.js"));
const sl = require(path.join(ROOT, "shopping-list.js"));
function mem() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, raw: m }; }

const cards = [
  { slug: "cajun-chicken-pasta", title: "Cajun Chicken Pasta", cat: "weekday dinners" },
  { slug: "skillet-beef-stroganoff", title: "Skillet Beef Stroganoff", cat: "weekday dinners" },
  { slug: "zuppa-toscana", title: "Zuppa Toscana", cat: "weekday dinners" },
  { slug: "street-style-beef-tacos", title: "Street-Style Beef Tacos", cat: "weekday dinners" },
  { slug: "chicken-dumpling-casserole", title: "Chicken Dumpling Casserole", cat: "weekday dinners" },
  { slug: "texas-smoked-brisket", title: "Texas Smoked Brisket", cat: "weekend dinners" },
  { slug: "easy-chicken-and-dumplings", title: "Easy Chicken and Dumplings", cat: "weekday dinners" },
];
const meta = { "cajun-chicken-pasta": { t: 45 }, "skillet-beef-stroganoff": { t: 40 }, "zuppa-toscana": { t: 40 }, "street-style-beef-tacos": { t: 30 },
  "chicken-dumpling-casserole": { t: 85 }, "texas-smoked-brisket": { t: 60 }, "easy-chicken-and-dumplings": { t: 50 } };

test("weekOf returns the Sunday-start week with Tue–Fri", () => {
  const w = wk.weekOf("2026-11-25");
  assert.deepEqual(w, { sun: "2026-11-22", tue: "2026-11-24", wed: "2026-11-25", thu: "2026-11-26", fri: "2026-11-27", sat: "2026-11-28" });
  assert.equal(wk.weekOf("2026-11-22").sun, "2026-11-22");
  assert.equal(wk.weekOf("2026-11-28").sun, "2026-11-22");
  assert.equal(wk.weekOf("2026-12-31").fri, "2027-01-01");
  assert.equal(wk.weekOf("nope"), null);
});

test("candidates are weekday dinners of 75 minutes or less that reheat well", () => {
  const c = wk.candidates(cards, meta).map((x) => x.slug).sort();
  assert.deepEqual(c, ["cajun-chicken-pasta", "easy-chicken-and-dumplings", "skillet-beef-stroganoff", "zuppa-toscana"]);
  assert.equal(wk.candidates(cards, {}).length, 0);
});

test("suggestions are stable per week, differ in protein, and skip recently planned dishes", () => {
  const c = wk.candidates(cards, meta);
  const r1 = wk.rank(c, [], "2026-11-22"), r2 = wk.rank(c, [], "2026-11-22");
  assert.deepEqual(r1.map((x) => x.slug), r2.map((x) => x.slug));
  const p = wk.suggestPair(r1);
  assert.ok(p.tue && p.thu); assert.notEqual(p.tue.slug, p.thu.slug);
  if (c.some((x) => x.protein !== p.tue.protein)) assert.notEqual(p.tue.protein, p.thu.protein);
  // Something cooked last week drops to the back.
  const recent = [{ date: "2026-11-17", slug: r1[0].slug, slot: "Dinner" }];
  const r3 = wk.rank(c, recent, "2026-11-22");
  assert.equal(r3[r3.length - 1].slug, r1[0].slug);
  // Another idea never repeats the current or the other night's dish.
  const n = wk.nextIdea(r1, p.tue.slug, [p.thu.slug], p.thu.protein);
  assert.ok(n && n.slug !== p.tue.slug && n.slug !== p.thu.slug);
});

test("planWeek adds double batches and leftover nights without replacing anything", () => {
  const w = wk.weekOf("2026-11-23");
  const picks = { tue: { slug: "zuppa-toscana", title: "Zuppa Toscana" }, thu: { slug: "cajun-chicken-pasta", title: "Cajun Chicken Pasta" } };
  let p = wk.planWeek([], w, picks);
  assert.deepEqual(p.add.map((e) => [e.date, e.slug || "", e.x || 1, e.title]), [
    ["2026-11-24", "zuppa-toscana", 2, "Zuppa Toscana"],
    ["2026-11-25", "", 1, "Leftovers: Zuppa Toscana (from Tuesday)"],
    ["2026-11-26", "cajun-chicken-pasta", 2, "Cajun Chicken Pasta"],
    ["2026-11-27", "", 1, "Leftovers: Cajun Chicken Pasta (from Thursday)"],
  ]);
  assert.ok(p.add.every((e) => e.slot === "Dinner"));
  // Existing Thursday dinner is kept and doubled; existing Friday note kept; lunches ignored.
  const existing = [
    { id: "t1", date: "2026-11-26", slot: "Dinner", slug: "skillet-beef-stroganoff", title: "Skillet Beef Stroganoff" },
    { id: "f1", date: "2026-11-27", slot: "Dinner", slug: "", title: "Eating out" },
    { id: "w0", date: "2026-11-25", slot: "Lunch", slug: "", title: "Sandwiches" },
  ];
  p = wk.planWeek(existing, w, picks);
  assert.deepEqual(p.double, ["t1"]);
  assert.deepEqual(p.add.map((e) => e.date), ["2026-11-24", "2026-11-25"]);
  assert.equal(p.keep.length, 2);
});

test("apply and undo through the calendar keep existing data intact", () => {
  const s = mem();
  const old = cal.add(s, { date: "2026-11-26", slug: "skillet-beef-stroganoff", title: "Skillet Beef Stroganoff" });
  cal.add(s, { date: "2026-11-01", title: "Old note" });
  const before = cal.load(s);
  const w = wk.weekOf("2026-11-23");
  const plan = wk.planWeek(cal.load(s), w, { tue: { slug: "zuppa-toscana", title: "Zuppa Toscana" }, thu: null });
  const done = wk.applyPlan(cal, s, plan);
  assert.equal(done.added.length, 3); assert.deepEqual(done.doubled, [old.id]);
  const after = cal.load(s);
  assert.equal(after.find((e) => e.id === old.id).x, 2);
  assert.equal(after.find((e) => e.slug === "zuppa-toscana").x, 2);
  assert.equal(after.find((e) => e.date === "2026-11-27").title, "Leftovers: Skillet Beef Stroganoff (from Thursday)");
  wk.undoPlan(cal, s, done);
  assert.deepEqual(cal.load(s), before);
});

test("calendar keeps x only as a recipe double batch; old entries load unchanged", () => {
  assert.equal(cal.clean({ date: "2026-11-24", slug: "zuppa-toscana", title: "Z", x: 2 }).x, 2);
  assert.equal("x" in cal.clean({ date: "2026-11-24", slug: "zuppa-toscana", title: "Z", x: 5 }), false);
  assert.equal("x" in cal.clean({ date: "2026-11-24", title: "Leftovers", x: 2 }), false);
  const s = mem();
  s.setItem(cal.KEY, JSON.stringify({ v: 1, entries: [{ id: "a", date: "2026-11-02", slot: "Dinner", slug: "zuppa-toscana", title: "Zuppa Toscana" }] }));
  assert.deepEqual(cal.load(s), [{ id: "a", date: "2026-11-02", slot: "Dinner", slug: "zuppa-toscana", title: "Zuppa Toscana" }]);
  assert.ok(cal.setBatch(s, "a", 2)); assert.equal(cal.load(s)[0].x, 2);
  assert.ok(cal.setBatch(s, "a", 1)); assert.equal("x" in cal.load(s)[0], false);
  assert.match(cal.toIcs([{ id: "a", date: "2026-11-02", slot: "Dinner", slug: "z", title: "Z", x: 2 }], ""), /SUMMARY:Dinner: Z \(double batch\)/);
});

test("shopping list doubles amounts for double-batch entries", () => {
  const data = { a: { n: "A", i: ["2 lb ground beef", "1 cup shredded cheddar cheese", "Salt, to taste"] } };
  const one = sl.buildList([{ date: "2026-11-24", slug: "a" }], data, { pantry: [], hideStaples: false });
  const two = sl.buildList([{ date: "2026-11-24", slug: "a", x: 2 }], data, { pantry: [], hideStaples: false });
  const amt = (l, k) => l.sections.flatMap((s) => s.items).find((i) => i.key === k).amounts.join(" + ");
  assert.equal(amt(one, "ground beef"), "2 lb"); assert.equal(amt(two, "ground beef"), "4 lb");
  assert.equal(amt(one, "cheddar cheese"), "1 cup"); assert.equal(amt(two, "cheddar cheese"), "2 cups");
  assert.equal(two.recipes[0].x, 2);
});

test("calendar page loads the week template and the service worker caches it", () => {
  const html = fs.readFileSync(path.join(ROOT, "calendar.html"), "utf8");
  assert.match(html, /data-wk-card/); assert.match(html, /<script src="week-template\.js" defer><\/script>/);
  assert.ok(html.indexOf("meal-calendar.js") < html.indexOf("week-template.js"));
  assert.match(html, /for="?wk-|aria-labelledby="wk-h"/);
  assert.match(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), /"\.\/week-template\.js"/);
});
