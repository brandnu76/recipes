// Tests for the device-only meal calendar storage core (meal-calendar.js).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const cal = require(path.join(__dirname, "..", "meal-calendar.js"));

function mem() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, raw: m }; }

test("add, move, remove persist under the device key", () => {
  const s = mem();
  const a = cal.add(s, { date: "2026-11-01", slug: "cheddar-cottage-pie", title: "Cheddar Cottage Pie" });
  assert.equal(a.slot, "Dinner");
  cal.add(s, { date: "2026-11-01", slot: "Lunch", title: "Leftovers" });
  assert.deepEqual(cal.forDate(cal.load(s), "2026-11-01").map((e) => e.slot), ["Lunch", "Dinner"]);
  assert.ok(cal.move(s, a.id, "2026-11-03", "Other"));
  assert.equal(cal.load(s).find((e) => e.id === a.id).date, "2026-11-03");
  assert.ok(cal.remove(s, a.id));
  assert.equal(cal.load(s).length, 1);
  assert.ok(JSON.parse(s.raw[cal.KEY]).entries);
});

test("bad data is dropped, never throws", () => {
  const s = mem(); s.setItem(cal.KEY, "{not json");
  assert.deepEqual(cal.load(s), []);
  assert.equal(cal.add(s, { date: "nope", title: "x" }), null);
  assert.equal(cal.clean({ date: "2026-11-01", slug: "../evil", title: "" }), null);
});

test("month grid starts Sunday and covers the month", () => {
  const g = cal.monthGrid(2026, 10);
  assert.equal(g[0].date, "2026-11-01");
  assert.equal(g.filter((d) => d.inMonth).length, 30);
  assert.equal(g.length % 7, 0);
});

test("ics export", () => {
  const ics = cal.toIcs([{ id: "a", date: "2026-11-30", slot: "Dinner", slug: "x", title: "A, B" }], "https://e/");
  assert.match(ics, /DTSTART;VALUE=DATE:20261130/);
  assert.match(ics, /DTEND;VALUE=DATE:20261201/);
  assert.match(ics, /SUMMARY:Dinner: A\\, B/);
});
