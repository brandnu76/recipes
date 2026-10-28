// Regression tests for Plan a Meal's pure planning core (meal-planner.js).
// Run: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const core = require(path.join(ROOT, "meal-planner.js"));

function recipeFrom(slug) {
  const html = fs.readFileSync(path.join(ROOT, slug + ".html"), "utf8");
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const r = core.extractRecipe(JSON.parse(m[1]));
      if (r) return r;
    } catch (_) { /* next block */ }
  }
  throw new Error("no Recipe JSON-LD in " + slug);
}
const dishOf = (slug, i) => core.buildDish(recipeFrom(slug), slug, i || 0);
const totalOf = (slug) => -core.planMeal([dishOf(slug)], {}).start;

test("parseStepMinutes: plain, range low end, per side, none", () => {
  assert.equal(core.parseStepMinutes("Simmer 20 minutes."), 20);
  assert.equal(core.parseStepMinutes("Bake 25 to 30 minutes until golden."), 25);
  assert.equal(core.parseStepMinutes("Sear 3 minutes per side."), 6);
  assert.equal(core.parseStepMinutes("Season to taste."), null);
});

test("long steps count only when they read like cooking", () => {
  assert.equal(core.parseStepMinutes("Cover and cook on low 8 hours until tender."), 480);
  assert.equal(core.parseStepMinutes("Smoke at 250°F for 10 hours."), 600);
  assert.equal(core.parseStepMinutes("Refrigerate at least 8 hours."), null);
  assert.equal(core.parseStepMinutes("Marinate 12 hours in the fridge."), null);
  assert.equal(core.parseStepMinutes("Let the dough rise 4 hours."), null);
});

test("isoMinutes reads ISO 8601 durations", () => {
  assert.equal(core.isoMinutes("PT1H30M"), 90);
  assert.equal(core.isoMinutes("PT45M"), 45);
});

test("known plan totals are unchanged", () => {
  assert.equal(totalOf("keto-slow-cooker-braised-oxtails"), 445);
  assert.equal(totalOf("crockpot-pinto-beans"), 486);
  assert.equal(totalOf("texas-smoked-brisket"), 930);
  assert.equal(totalOf("peach-bourbon-cast-iron-pork-chops"), 17);
  assert.equal(totalOf("peach-bourbon-pork-chops-pellet-grill"), 56);
  assert.equal(totalOf("sheet-pan-sausage-potatoes-green-beans"), 54);
});

test("sheet pan sausage for 6:30 PM: 5:51 step shows its full text", () => {
  const plan = core.planMeal([dishOf("sheet-pan-sausage-potatoes-green-beans")], {});
  const at551 = plan.events.find((e) => e.start === -39 && !e.background);
  assert.ok(at551, "an active step starts 39 min before dinner (5:51 PM)");
  assert.match(at551.text, /^Pile the potatoes on the sheet pan/);
  assert.match(at551.text, /head start\.?$/);
  assert.ok(!/…$/.test(at551.text), "no ellipsis truncation");
});

test("no step text over 170 chars is truncated", () => {
  const long = "Pile the potatoes on the sheet pan, drizzle with half the olive oil, and season with half the kosher salt. " +
    "Toss and spread out in a single layer so they brown, not steam. Roast 10 minutes to give the potatoes a head start.";
  assert.ok(long.length > 170);
  const d = core.buildDish({ name: "Test", recipeYield: "4", recipeInstructions: [{ "@type": "HowToStep", text: long }] }, "t", 0);
  const ev = core.planMeal([d], {}).events.filter((e) => !e.background);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].text, long);
  assert.equal(ev[0].label, long);
});

test("events are sorted with a valid comparator (stable on exact ties)", () => {
  const slugs = ["sheet-pan-sausage-potatoes-green-beans", "crockpot-pinto-beans", "peach-bourbon-cast-iron-pork-chops"];
  const plan = core.planMeal(slugs.map(dishOf), {});
  for (let i = 1; i < plan.events.length; i++) {
    const a = plan.events[i - 1], b = plan.events[i];
    assert.ok(a.start <= b.start, "sorted by start");
    if (a.start === b.start) {
      assert.ok(!(b.background && !a.background), "background before active on ties");
      if (!!a.background === !!b.background) assert.ok(a.dish.localeCompare(b.dish) <= 0, "dish order on ties");
    }
  }
  // Same input in a different dish order gives the same schedule.
  const again = core.planMeal(slugs.slice().reverse().map(dishOf), {});
  const key = (p) => p.events.map((e) => [e.dish, e.idx, e.start, e.end, e.background ? 1 : 0].join("|"));
  assert.deepEqual(key(again), key(plan));
});

test("one-burner kitchen flags a burner clash", () => {
  const steps = (t) => ({ name: t, recipeYield: "4", recipeInstructions: [{ "@type": "HowToStep", text: "Simmer in a saucepan on the stovetop over medium heat 20 minutes." }] });
  const plan = core.planMeal([core.buildDish(steps("A"), "a", 0), core.buildDish(steps("B"), "b", 1)], { kitchen: { burners: 1 } });
  assert.ok(plan.conflicts.some((c) => c.type === "burners"));
});
