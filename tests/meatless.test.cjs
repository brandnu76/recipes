// Meatless classifier (tools/meatless.py) and the "m" flags in recipe-meta.json.
const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const classify = (lines) =>
  execFileSync("python3", [path.join(ROOT, "tools/meatless.py"), "--stdin"], { input: JSON.stringify(lines) }).toString().trim() === "1";

test("eggs, dairy and vegetable broth are meatless", () => {
  assert.equal(classify(["12 large eggs", "1 cup sharp cheddar cheese, shredded", "1 eggplant, diced", "2 cups vegetable broth", "1 cup buttermilk"]), true);
});
test("meat, seafood and meat-derived ingredients are not", () => {
  for (const l of ["1 lb ground beef", "5 cups chicken bone broth", "1 Tbsp Worcestershire sauce", "2 Tbsp beef tallow", "1 Tbsp fish sauce", "1 Tbsp oyster sauce", "1 box orange gelatin", "1 lb shrimp", "1/4 cup lard", "2 anchovy fillets"]) {
    assert.equal(classify(["2 eggs", l]), false, l);
  }
});
test("recipe-meta.json flags known recipes", () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "recipe-meta.json"), "utf8"));
  assert.equal(meta["egg-veggie-muffins"].m, 1);
  assert.equal(meta["creamy-cheddar-cheese-grits"].m, 1);
  assert.ok(!meta["braised-chuck-roast"].m);
  assert.ok(!meta["kung-pao-shrimp"].m);
  assert.ok(!meta["sausage-kale-tortellini-soup"].m);
});
test("site.js wires the Meatless chip", () => {
  const js = fs.readFileSync(path.join(ROOT, "site.js"), "utf8");
  assert.match(js, /data-filter-meatless/);
  assert.match(js, /aria-pressed/);
  assert.match(js, /meatlessOk\(a\)/);
});
