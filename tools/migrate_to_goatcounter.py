#!/usr/bin/env python3
"""Idempotent migration from Abacus to GoatCounter.

Updates every HTML page's CSP and scripts, slims visitor-counter.js,
bumps the service worker cache, and adds catalog/test checks.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOAT_SNIPPET = (
    '<script data-goatcounter="https://carrolllowcountry.goatcounter.com/count" '
    'async src="https://gc.zgo.at/count.js"></script>'
)
WELCOME = '<script src="welcome-tip.js" defer></script>'
VC_RE = re.compile(r'\n?[ \t]*<script src="visitor-counter\.js" defer></script>[ \t]*')
CSP_RE = re.compile(
    r'(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)', re.I
)
REDIRECT_CSP = (
    "default-src 'self'; script-src 'self' https://gc.zgo.at; "
    "style-src 'self'; img-src 'self' data:; "
    "connect-src 'self' https://carrolllowcountry.goatcounter.com; "
    "base-uri 'self'; form-action 'self';"
)
VC_JS = """// Load the welcome tip / Help chrome helper when the page did not include it.
// Kept so older cached pages that still request this file do not break, and
// so they no longer call the retired visitor-count service.
(function () {
  if (document.querySelector('script[src="welcome-tip.js"]')) return;
  var s = document.createElement("script");
  s.src = "welcome-tip.js";
  s.defer = true;
  document.head.appendChild(s);
})();
"""

CATALOG_FN = '''
def goatcounter_problems(name: str, html: str) -> list[str]:
    """Every public HTML page must load GoatCounter and must not call Abacus."""
    errors = []
    if 'data-goatcounter="https://carrolllowcountry.goatcounter.com/count"' not in html:
        errors.append(f"{name}: missing GoatCounter data-goatcounter snippet")
    if 'src="https://gc.zgo.at/count.js"' not in html:
        errors.append(f"{name}: missing GoatCounter script src")
    if "abacus.jasoncameron.dev" in html or "visitor-counter.js" in html:
        errors.append(f"{name}: still references Abacus or visitor-counter.js")
    if "Content-Security-Policy" in html:
        if "https://gc.zgo.at" not in html:
            errors.append(f"{name}: CSP script-src missing https://gc.zgo.at")
        if "https://carrolllowcountry.goatcounter.com" not in html:
            errors.append(f"{name}: CSP connect-src missing GoatCounter origin")
        if "abacus.jasoncameron.dev" in html:
            errors.append(f"{name}: CSP still allows Abacus")
    else:
        errors.append(f"{name}: missing Content-Security-Policy meta tag")
    return errors


'''

TEST_CJS = r'''"use strict";

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
'''


def update_csp(csp: str) -> str:
    csp = re.sub(r"\s*https://abacus\.jasoncameron\.dev", "", csp)
    if "https://gc.zgo.at" not in csp:
        if re.search(r"script-src\s+'self'", csp):
            csp = re.sub(
                r"script-src\s+'self'",
                "script-src 'self' https://gc.zgo.at",
                csp,
                count=1,
            )
        else:
            raise SystemExit(f"unexpected script-src: {csp}")
    if "https://carrolllowcountry.goatcounter.com" not in csp:
        if re.search(r"connect-src\s+", csp):
            csp = re.sub(
                r"(connect-src\s+[^;]+)",
                r"\1 https://carrolllowcountry.goatcounter.com",
                csp,
                count=1,
            )
        else:
            raise SystemExit(f"unexpected connect-src: {csp}")
    return re.sub(r" {2,}", " ", csp)


def ensure_snippet(html: str) -> str:
    if (
        'data-goatcounter="https://carrolllowcountry.goatcounter.com/count"' in html
        and "https://gc.zgo.at/count.js" in html
    ):
        return html
    if re.search(r"</body>", html, re.I):
        return re.sub(
            r"\n?(</body>)",
            "\n  " + GOAT_SNIPPET + r"\n\1",
            html,
            count=1,
            flags=re.I,
        )
    return html.rstrip() + "\n  " + GOAT_SNIPPET + "\n"


def process_html(path: Path) -> bool:
    orig = path.read_text(encoding="utf-8")
    html = orig
    had_vc = "visitor-counter.js" in html
    had_welcome = bool(re.search(r'<script src="welcome-tip\.js"', html))

    if CSP_RE.search(html):
        html = CSP_RE.sub(
            lambda m: m.group(1) + update_csp(m.group(2)) + m.group(3),
            html,
            count=1,
        )
    elif path.name == "apple-butter-swim-biscuits.html" and "Content-Security-Policy" not in html:
        html = html.replace(
            '  <meta charset="utf-8">\n',
            '  <meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="'
            + REDIRECT_CSP
            + '">\n',
            1,
        )

    if had_vc and not had_welcome:
        html = VC_RE.sub("\n  " + WELCOME, html, count=1)
        html = html.replace('<script src="visitor-counter.js" defer></script>', WELCOME)
    else:
        html = VC_RE.sub("", html)
        html = html.replace('<script src="visitor-counter.js" defer></script>', "")

    html = ensure_snippet(html)
    if html != orig:
        path.write_text(html, encoding="utf-8")
        return True
    return False


def bump_sw(sw: str) -> str:
    m = re.search(r'const CACHE = "carroll-lowcountry-v(\d+)";', sw)
    if not m:
        raise SystemExit("no cache constant")
    cur = int(m.group(1))
    if cur < 73:
        sw = sw.replace(f"carroll-lowcountry-v{cur}", "carroll-lowcountry-v73", 1)
    needle = """self.addEventListener(\"fetch\", (event) => {
  const req = event.request;
  if (req.method !== \"GET\") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
"""
    insert = """self.addEventListener(\"fetch\", (event) => {
  const req = event.request;
  if (req.method !== \"GET\") return;
  const url = new URL(req.url);
  // Never cache or intercept GoatCounter (or any other third-party) requests.
  if (url.hostname === \"gc.zgo.at\" || /(?:^|\\.)goatcounter\\.com$/.test(url.hostname)) return;
  if (url.origin !== self.location.origin) return;
"""
    if "gc.zgo.at" not in sw:
        if needle not in sw:
            raise SystemExit("sw fetch handler not found")
        sw = sw.replace(needle, insert, 1)
    return sw


def patch_catalog() -> None:
    path = ROOT / "tools" / "check_recipe_catalog.py"
    text = path.read_text(encoding="utf-8")
    if "def goatcounter_problems" not in text:
        text = text.replace(
            "def is_redirect(html: str) -> bool:",
            CATALOG_FN + "def is_redirect(html: str) -> bool:",
        )
    hook = "    # Splash category counts on index.html must match the catalog tallies."
    insert = (
        "    # GoatCounter snippet and CSP on every HTML page (no Abacus).\n"
        "    for page in sorted(ROOT.glob(\"*.html\")):\n"
        "        errors.extend(goatcounter_problems(page.name, page.read_text(encoding=\"utf-8\")))\n"
        "\n"
        + hook
    )
    if "GoatCounter snippet and CSP" not in text:
        if hook not in text:
            raise SystemExit("catalog hook not found")
        text = text.replace(hook, insert)
    path.write_text(text, encoding="utf-8")
    print("patched check_recipe_catalog.py")


def write_test() -> None:
    path = ROOT / "tests" / "goatcounter.test.cjs"
    path.write_text(TEST_CJS, encoding="utf-8")
    print("wrote tests/goatcounter.test.cjs")


def main() -> None:
    n = 0
    for path in sorted(ROOT.rglob("*.html")):
        if process_html(path):
            n += 1
    print(f"updated {n} html pages")
    (ROOT / "visitor-counter.js").write_text(VC_JS, encoding="utf-8")
    sw_path = ROOT / "sw.js"
    sw_path.write_text(bump_sw(sw_path.read_text(encoding="utf-8")), encoding="utf-8")
    print("updated visitor-counter.js and sw.js")
    patch_catalog()
    write_test()


if __name__ == "__main__":
    main()
