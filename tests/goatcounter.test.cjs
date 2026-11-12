"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const SNIPPET = 'data-goatcounter="https://carrolllowcountry.goatcounter.com/count"';
const SRC = 'src="https://gc.zgo.at/count.js"';

function htmlPages() {
  return fs.readdirSync(ROOT).filter((n) => n.endsWith(".html")).sort();
}

test("every HTML page includes the GoatCounter snippet and no Abacus", () => {
  const pages = htmlPages();
  assert.ok(pages.length > 50, "expected a full set of site pages");
  for (const name of pages) {
    const html = fs.readFileSync(path.join(ROOT, name), "utf8");
    assert.ok(html.includes(SNIPPET), `${name} missing GoatCounter data-goatcounter`);
    assert.ok(html.includes(SRC), `${name} missing GoatCounter script src`);
    assert.doesNotMatch(html, /abacus\.jasoncameron\.dev|visitor-counter\.js/, `${name} still references Abacus`);
    assert.match(html, /Content-Security-Policy/, `${name} missing CSP`);
    assert.match(html, /https:\/\/gc\.zgo\.at/, `${name} CSP missing gc.zgo.at`);
    assert.match(html, /https:\/\/carrolllowcountry\.goatcounter\.com/, `${name} CSP missing GoatCounter origin`);
  }
});

test("visitor-counter.js no longer calls Abacus and still loads welcome-tip.js", () => {
  const vc = fs.readFileSync(path.join(ROOT, "visitor-counter.js"), "utf8");
  assert.doesNotMatch(vc, /abacus/i);
  assert.match(vc, /welcome-tip\.js/);
});

test("the service worker does not intercept GoatCounter hosts", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  assert.match(sw, /gc\.zgo\.at/);
  assert.match(sw, /goatcounter/);
});
