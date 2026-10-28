const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../meal-planner.js');

function dish(slug, steps) {
  return { slug, name: slug, color: 0, steps: steps.map((s, idx) => ({
    idx, minutes: 10, kind: 'cook', label: 'Cook', text: 'Cook', equip: [],
    temp: null, active: true, makeAhead: false, background: [], ...s,
  })) };
}

test('parses ISO durations and explicit cooking ranges, excluding overnight holds', () => {
  assert.equal(core.isoMinutes('PT1H30M'), 90);
  assert.equal(core.isoMinutes('P1DT2H'), 1560);
  assert.equal(core.parseStepMinutes('Simmer for 10–15 minutes.'), 10);
  assert.equal(core.parseStepMinutes('Slow cook on low for 8 hours.'), 480);
  assert.equal(core.parseStepMinutes('Refrigerate for 8 hours.'), null);
});

test('schedules each dish backward to dinner, honoring edited duration and early finish', () => {
  const a = dish('a', [{ minutes: 5 }, { minutes: 20 }]);
  const plan = core.planMeal([a], { overrides: { 'a:0': 8 }, offsets: { a: 10 } });
  assert.deepEqual(plan.events.map(e => [e.start, e.end]), [[-38, -30], [-30, -10]]);
  assert.equal(plan.start, -38);
});

test('tied events have deterministic background, dish, and step ordering', () => {
  const a = dish('a', [{ minutes: 0 }, { minutes: 0 }]);
  const z = dish('z', [{ minutes: 0, background: [{kind: 'boil', equip: 'stove', minutes: 0, label: 'Boil'}] }]);
  const opts = { kitchen: { boil: 0 } };
  const first = core.planMeal([z, a], opts).events.map(e => e.id);
  const second = core.planMeal([a, z], opts).events.map(e => e.id);
  assert.deepEqual(first, ['z:0:boil', 'a:0', 'a:1', 'z:0']);
  assert.deepEqual(second, first);
});

test('make-ahead preparation stays outside the timed chain', () => {
  const plan = core.planMeal([dish('a', [{ makeAhead: true, minutes: 15 }, { minutes: 20 }])]);
  assert.equal(plan.events.length, 1);
  assert.equal(plan.ahead.length, 1);
  assert.equal(plan.ahead[0].by, -20);
  assert.equal(plan.aheadStart, -35);
});

test('detects overlapping burner demand and clears it by shifting a dish', () => {
  const dishes = ['a', 'b'].map(slug => dish(slug, [{ equip: ['stove'], minutes: 10 }]));
  assert.ok(core.planMeal(dishes, { kitchen: { burners: 1 } }).conflicts.length);
  assert.equal(core.planMeal(dishes, { kitchen: { burners: 1 }, offsets: { a: 10 } }).conflicts.length, 0);
});

test('scales fractional ingredient quantities and merges compatible shopping lines', () => {
  assert.equal(core.scaleShopText('1/2 cup milk', 2), '1 cup milk');
  const dishes = ['a', 'b'].map(slug => ({ slug, name: slug, baseYield: 2, servings: 4, ingredients: ['1 cup milk'] }));
  const lines = core.buildShoppingList(dishes, 'merged').groups.flatMap(g => g.lines);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, '4 cups milk');
  assert.deepEqual(lines[0].sources, ['a', 'b']);
  assert.equal(core.buildShoppingList(dishes, 'dish').groups.length, 2);
});

test('retiming absorbs available hold time and pushes dinner only for the remainder', () => {
  const dishes = [dish('a', [{ minutes: 20 }])];
  const opts = { offsets: { a: 10 } };
  const result = core.retime(dishes, opts, 15, 'keep', -20);
  assert.equal(result.shift, 5);
  assert.equal(result.offsets.a, 0);
  assert.equal(opts.offsets.a, 10, 'must not mutate saved inputs');
  assert.equal(core.retime(dishes, opts, 15, 'push', -20).shift, 15);
});

test('every catalog recipe produces a finite usable schedule', () => {
  const meta = require('../recipe-meta.json');
  let count = 0;
  for (const slug of Object.keys(meta)) {
    const html = fs.readFileSync(path.join(__dirname, '..', slug + '.html'), 'utf8');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const recipe = blocks.map(m => core.extractRecipe(JSON.parse(m[1]))).find(Boolean);
    assert.ok(recipe, slug);
    const plan = core.planMeal([core.buildDish(recipe, slug, 0)]);
    assert.ok(plan.events.length > 0, slug);
    assert.ok(plan.events.every(e => Number.isFinite(e.start) && e.end >= e.start), slug);
    count++;
  }
  assert.ok(count > 0, "must exercise real recipes");
});
