// Welcome tip: dismiss once per device; help.html marks seen.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "welcome-tip.js"), "utf8");

function run(pathname, storageSeed) {
  const store = Object.assign(Object.create(null), storageSeed || {});
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  let inserted = null;
  const header = {
    parentNode: {},
    insertAdjacentElement: (_where, el) => { inserted = el; },
  };
  const body = { classList: { contains: () => false }, insertBefore: () => {}, firstChild: null };
  const document = {
    body,
    readyState: "complete",
    getElementById: () => null,
    querySelector: (sel) => (sel === ".site-header" ? header : null),
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        classList: { add() {}, toggle() {} },
        setAttribute() {},
        addEventListener(type, fn) { this._click = fn; },
        appendChild(child) { (this.children || (this.children = [])).push(child); return child; },
      };
      Object.defineProperty(el, "innerHTML", {
        set(v) { this._html = v; },
        get() { return this._html || ""; },
      });
      Object.defineProperty(el, "textContent", {
        set(v) { this._text = v; },
        get() { return this._text || ""; },
      });
      return el;
    },
    addEventListener() {},
  };
  const location = { pathname, href: "https://brandnu76.github.io/recipes" + pathname };
  vm.runInNewContext(SRC, { window: { localStorage }, document, location, setTimeout });
  return { store, inserted };
}

test("welcome-tip.js exists and uses a stable localStorage key", () => {
  assert.match(SRC, /clt:welcome-tip-seen/);
  assert.match(SRC, /help\.html/);
  assert.match(SRC, /aria-label/);
});

test("tip renders for a first visit on a normal page", () => {
  const { store, inserted } = run("/recipes.html", {});
  assert.ok(inserted, "tip should be inserted");
  assert.equal(store["clt:welcome-tip-seen"], undefined);
  assert.match(inserted.children[0]._html, /help\.html/);
});

test("visiting help.html marks the tip seen and does not show it", () => {
  const { store, inserted } = run("/help.html", {});
  assert.equal(store["clt:welcome-tip-seen"], "1");
  assert.equal(inserted, null);
});

test("a dismissed tip does not show again", () => {
  const { inserted } = run("/index.html", { "clt:welcome-tip-seen": "1" });
  assert.equal(inserted, null);
});

test("help.html is linked from the splash footer and loads the tip script", () => {
  const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(index, /href="help\.html"/);
  assert.match(index, /welcome-tip\.js/);
  const help = fs.readFileSync(path.join(ROOT, "help.html"), "utf8");
  assert.match(help, /How to use this site/);
  assert.match(help, /Stays on this device/);
  assert.doesNotMatch(help, /shop\.html|bakery/i);
});
