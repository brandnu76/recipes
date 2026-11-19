#!/usr/bin/env python3
"""Build sitemap.xml for the public Carroll Lowcountry Table pages.

Lists every HTML page in the site root except shop-order.html and any page
with a noindex robots meta. Each URL is the page's canonical link when it
has one. lastmod is the date of the file's latest git commit when that
history is available; otherwise the tag is omitted.

Idempotent. Run from the repo root after publishing or editing a page:
    python3 tools/build_sitemap.py          # rewrite sitemap.xml
    python3 tools/build_sitemap.py --check  # fail if it is out of date

--check requires every current public page to be listed, with no extras.
lastmod may match a fresh generation, or the sitemap committed last, when
the page list is unchanged. A page edit cannot record its own commit date
until that commit exists, so a later commit used to fail until someone
rewrote sitemap.xml only to bump those dates.
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


def git_output(args):
    try:
        return subprocess.check_output(
            args, cwd=ROOT, stderr=subprocess.DEVNULL, text=True
        )
    except (OSError, subprocess.CalledProcessError):
        return None


def lastmods(names, rev=None):
    """Newest commit date for each file, or None if that file has no history.

    Returns None when git itself cannot be read. rev limits history to that
    commit (inclusive), so dates match what a generation at that commit saw.
    """
    found = {name: None for name in names}
    if not names:
        return found
    cmd = ["git", "log", "--format=%cs", "--name-only"]
    if rev:
        cmd.append(rev)
    cmd.extend(["--", *names])
    out = git_output(cmd)
    if out is None:
        return None
    date = None
    for line in out.splitlines():
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", line):
            date = line
            continue
        if line in found and found[line] is None and date:
            found[line] = date
    return found


def chosen_pages():
    chosen = []
    for path in sorted(ROOT.glob("*.html")):
        if path.name in SKIP:
            continue
        text = path.read_text(encoding="utf-8")
        head = head_of(text)
        if noindex(head):
            continue
        chosen.append((path.name, canonical(head, path.name)))
    return chosen


def fold(chosen, dates):
    # One <url> per location. A later duplicate keeps the newer lastmod.
    by_loc = {}
    order = []
    for name, loc in chosen:
        nxt = dates.get(name)
        if loc not in by_loc:
            order.append(loc)
            by_loc[loc] = nxt
            continue
        prev = by_loc[loc]
        if nxt and (not prev or nxt > prev):
            by_loc[loc] = nxt
    return sorted((loc, by_loc[loc]) for loc in order)


def page_rows(rev=None):
    chosen = chosen_pages()
    dates = lastmods([name for name, _url in chosen], rev=rev)
    if dates is None:
        return None
    return fold(chosen, dates)


def head_sha():
    out = git_output(["git", "rev-parse", "HEAD"])
    return out.strip() if out else None


def sitemap_sha():
    """Commit that last changed sitemap.xml, if history has one."""
    out = git_output(["git", "log", "-1", "--format=%H", "--", "sitemap.xml"])
    if not out:
        return None
    sha = out.strip()
    return sha or None


def parent_sha(rev):
    out = git_output(["git", "rev-parse", f"{rev}^"])
    if not out:
        return None
    sha = out.strip()
    return sha or None


URL_RE = re.compile(
    r"<url>\s*<loc>(.*?)</loc>(?:\s*<lastmod>(.*?)</lastmod>)?\s*</url>",
    re.S,
)


def parse_urls(xml):
    return [(m.group(1), m.group(2)) for m in URL_RE.finditer(xml)]


def explain(current, fresh):
    """Short list of URL and lastmod differences, for the failing check."""
    got = dict(parse_urls(current))
    exp = dict(parse_urls(fresh))
    lines = []
    for loc in exp:
        if loc not in got:
            lines.append(f"  missing {loc}")
    for loc in got:
        if loc not in exp:
            lines.append(f"  extra {loc}")
    for loc in exp:
        if loc in got and got[loc] != exp[loc]:
            lines.append(
                f"  lastmod {loc}: sitemap has {got[loc] or 'no date'},"
                f" newest commit is {exp[loc] or 'no date'}"
            )
    if not lines:
        lines.append("  sitemap.xml does not match the generator output")
    extra = len(lines) - 20
    if extra > 0:
        lines = lines[:20]
        lines.append(f"  and {extra} more")
    return "\n".join(lines)


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
    fresh = page_rows()
    if fresh is None:
        print("ERROR: could not read git history to build sitemap.xml")
        return 1
    data = render(fresh)
    if not check:
        SITEMAP.write_text(data, encoding="utf-8")
        print(f"wrote sitemap.xml: {data.count('<loc>')} urls")
        return 0
    cur = SITEMAP.read_text(encoding="utf-8") if SITEMAP.exists() else ""
    if cur == data:
        print(f"sitemap.xml is up to date ({data.count('<loc>')} urls)")
        return 0
    # The generator is run before the commit that publishes it, so lastmod
    # cannot include that commit. Accept the last sitemap commit's own dates
    # and its parent's dates when every current page is still listed.
    previous = sitemap_sha()
    candidates = []
    if previous and previous != head_sha():
        candidates.append(previous)
    parent = parent_sha(previous) if previous else None
    if parent:
        candidates.append(parent)
    for rev in candidates:
        prior = page_rows(rev)
        if prior is not None and render(prior) == cur:
            print(
                f"sitemap.xml lists {cur.count('<loc>')} urls"
                " and matches the last sitemap update"
            )
            return 0
    print("ERROR: sitemap.xml is out of date; run python3 tools/build_sitemap.py")
    print(explain(cur, data))
    return 1


if __name__ == "__main__":
    sys.exit(main())
