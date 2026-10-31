#!/usr/bin/env python3
"""Build sitemap.xml for the public Carroll Lowcountry Table pages.

Lists every HTML page in the site root except shop-order.html and any page
with a noindex robots meta. Each URL is the page's canonical link when it
has one. lastmod is the date of the file's latest git commit when that
history is available; otherwise the tag is omitted.

Idempotent. Run from the repo root after publishing or editing a page:
    python3 tools/build_sitemap.py          # rewrite sitemap.xml
    python3 tools/build_sitemap.py --check  # fail if it is out of date
"""
import re
import subprocess
import sys
import xml.sax.saxutils
from pathlib import Path

BASE = "https://brandnu76.github.io/recipes/"
ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
SKIP = {"shop-order.html"}
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


def head_of(text):
    m = re.search(r"</head>", text, re.I)
    return text[: m.start()] if m else text


def noindex(head):
    for m in re.finditer(r"<meta\b[^>]*>", head, re.I):
        tag = m.group(0)
        if not re.search(r"""\bname=["']robots["']""", tag, re.I):
            continue
        content = re.search(r"""\bcontent=["']([^"']*)["']""", tag, re.I)
        if content and re.search(r"\bnoindex\b", content.group(1), re.I):
            return True
    return False


def canonical(head, name):
    href = None
    for m in re.finditer(r"<link\b[^>]*>", head, re.I):
        tag = m.group(0)
        if not re.search(r"""\brel=["']canonical["']""", tag, re.I):
            continue
        hm = re.search(r"""\bhref=["']([^"']+)["']""", tag, re.I)
        if hm:
            href = hm.group(1).strip()
            break
    if not href:
        return BASE if name == "index.html" else BASE + name
    if href.startswith(("https://", "http://")):
        return href
    if href.startswith("/"):
        return "https://brandnu76.github.io" + href
    return BASE + href.lstrip("./")


def lastmods(names):
    """Date of the newest commit touching each file, or None if git has none."""
    found = {name: None for name in names}
    if not names:
        return found
    try:
        out = subprocess.check_output(
            ["git", "log", "--format=%cs", "--name-only", "--", *names],
            cwd=ROOT,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return found
    date = None
    for line in out.splitlines():
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", line):
            date = line
            continue
        if line in found and found[line] is None and date:
            found[line] = date
    return found


def pages():
    chosen = []
    for path in sorted(ROOT.glob("*.html")):
        if path.name in SKIP:
            continue
        text = path.read_text(encoding="utf-8")
        head = head_of(text)
        if noindex(head):
            continue
        chosen.append((path.name, canonical(head, path.name)))
    dates = lastmods([name for name, _url in chosen])
    # One <url> per location. A later duplicate keeps the newer lastmod.
    by_loc = {}
    order = []
    for name, loc in chosen:
        if loc not in by_loc:
            order.append(loc)
            by_loc[loc] = dates.get(name)
            continue
        prev = by_loc[loc]
        nxt = dates.get(name)
        if nxt and (not prev or nxt > prev):
            by_loc[loc] = nxt
    rows = sorted((loc, by_loc[loc]) for loc in order)
    return rows


def render(rows):
    esc = xml.sax.saxutils.escape
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<urlset xmlns="{NS}">',
    ]
    for loc, date in rows:
        lines.append("  <url>")
        lines.append(f"    <loc>{esc(loc)}</loc>")
        if date:
            lines.append(f"    <lastmod>{date}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main():
    check = "--check" in sys.argv
    data = render(pages())
    if check:
        cur = SITEMAP.read_text(encoding="utf-8") if SITEMAP.exists() else ""
        if cur != data:
            print("ERROR: sitemap.xml is out of date; run python3 tools/build_sitemap.py")
            return 1
        print(f"sitemap.xml is up to date ({data.count('<loc>')} urls)")
        return 0
    SITEMAP.write_text(data, encoding="utf-8")
    print(f"wrote sitemap.xml: {data.count('<loc>')} urls")
    return 0


if __name__ == "__main__":
    sys.exit(main())
