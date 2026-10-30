#!/usr/bin/env python3
"""Add link-preview (Open Graph / Twitter) and canonical tags to every page.

Idempotent: only inserts tags a page is missing, right after its
<meta name="description"> (or <title>). Pages that already carry a
rel=canonical (e.g. redirect stubs) are left alone. Run after publishing.
"""
import html, json, pathlib, re, sys

BASE = "https://brandnu76.github.io/recipes/"
SITE = "Carroll Lowcountry Table"
ROOT = pathlib.Path(__file__).resolve().parent.parent

def attr(s):
    return html.escape(html.unescape(s), quote=True)

def ld_description(text):
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', text, re.S):
        try:
            data = json.loads(m.group(1))
        except Exception:
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data])
        for it in items:
            if isinstance(it, dict) and it.get("@type") == "Recipe" and it.get("description"):
                return it["description"]
    return None

def process(path, check=False):
    text = path.read_text(encoding="utf-8")
    head_end = text.find("</head>")
    if head_end < 0:
        return False
    head = text[:head_end]
    if 'rel="canonical"' in head and 'og:url' not in head:
        return False  # redirect stub or hand-managed page
    title_m = re.search(r"<title>(.*?)</title>", head, re.S)
    if not title_m:
        return False
    title = title_m.group(1).strip()
    desc_m = re.search(r'<meta name="description" content="([^"]*)"', head)
    desc = desc_m.group(1) if desc_m else (ld_description(text) or "")
    is_recipe = '"@type": "Recipe"' in text or '"@type":"Recipe"' in text
    url = BASE + ("" if path.name == "index.html" else path.name)
    has_img = "og:image" in head
    want = [
        ('rel="canonical"', f'<link rel="canonical" href="{url}">'),
        ('og:url', f'<meta property="og:url" content="{url}">'),
        ('og:site_name', f'<meta property="og:site_name" content="{SITE}">'),
        ('og:title', f'<meta property="og:title" content="{attr(title)}">'),
        ('og:description', f'<meta property="og:description" content="{attr(desc)}">' if desc else None),
        ('og:type', f'<meta property="og:type" content="{"article" if is_recipe else "website"}">'),
        ('twitter:card', f'<meta name="twitter:card" content="{"summary_large_image" if has_img else "summary"}">'),
    ]
    missing = [tag for key, tag in want if tag and key not in head]
    if not missing:
        return False
    if check:
        return True
    anchor = desc_m or title_m
    pos = anchor.end()
    if desc_m:
        pos = head.find(">", desc_m.start()) + 1
    else:
        pos = title_m.end()
    insert = "".join("\n  " + t for t in missing)
    path.write_text(text[:pos] + insert + text[pos:], encoding="utf-8")
    return True

def main():
    check = "--check" in sys.argv
    changed = [p.name for p in sorted(ROOT.glob("*.html")) if process(p, check)]
    if check:
        if changed:
            print("Missing share/canonical tags (run tools/build_share_meta.py):", *changed, sep="\n  ")
            sys.exit(1)
        print("Share tags OK")
    else:
        print(f"Updated {len(changed)} pages")

if __name__ == "__main__":
    main()
