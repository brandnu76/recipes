#!/usr/bin/env python3
"""Add link-preview (Open Graph / Twitter) and canonical tags to every page.

Idempotent: only inserts tags a page is missing. Share tags land right after
the page's <meta name="description"> (or <title>). A recipe that already has
a hero image under images/ also gets og:image, og:image:width, og:image:height,
and twitter:card=summary_large_image when those are missing. Pages that
already carry a rel=canonical but no og:url (redirect stubs and other
hand-managed pages) are left alone.

Also collapses a duplicated opening <main class="page">. New recipe HTML was
published with the shell's landmark and a second copy stacked together; there
is no separate template in this repo. Run after publishing:

    python3 tools/build_share_meta.py
    python3 tools/build_share_meta.py --check
"""
import html, json, pathlib, re, sys

BASE = "https://brandnu76.github.io/recipes/"
SITE = "Carroll Lowcountry Table"
ROOT = pathlib.Path(__file__).resolve().parent.parent

DUP_MAIN = re.compile(r'(<main class="page">)[ \t]*\r?\n[ \t]*<main class="page">')
HERO_SRC = re.compile(
    r'<figure class="recipe-hero"[^>]*>\s*<img\b[^>]*\bsrc="(images/[^"]+\.webp)"',
    re.I | re.S,
)


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

def collapse_duplicate_mains(text):
    """Drop a second opening <main class="page"> sitting on the next line."""
    while True:
        updated = DUP_MAIN.sub(r"\1", text, count=1)
        if updated == text:
            return text
        text = updated

def webp_dimensions(data):
    """Return (width, height) from a WebP container, or None."""
    if len(data) < 16 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    i = 12
    while i + 8 <= len(data):
        tag = data[i:i + 4]
        size = int.from_bytes(data[i + 4:i + 8], "little")
        payload = data[i + 8:i + 8 + size]
        if tag == b"VP8X" and len(payload) >= 10:
            w = 1 + int.from_bytes(payload[4:7], "little")
            h = 1 + int.from_bytes(payload[7:10], "little")
            return w, h
        if tag == b"VP8 " and len(payload) >= 10:
            w = int.from_bytes(payload[6:8], "little") & 0x3FFF
            h = int.from_bytes(payload[8:10], "little") & 0x3FFF
            return w, h
        if tag == b"VP8L" and len(payload) >= 5:
            b0, b1, b2, b3 = payload[1], payload[2], payload[3], payload[4]
            w = 1 + (((b1 & 0x3F) << 8) | b0)
            h = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
            return w, h
        i += 8 + size + (size & 1)
    return None

def image_dimensions(rel, text):
    path = ROOT / rel
    if path.suffix.lower() == ".webp" and path.is_file():
        dims = webp_dimensions(path.read_bytes())
        if dims:
            return dims
    m = re.search(r'<img\b[^>]*\bsrc="' + re.escape(rel) + r'"[^>]*>', text, re.I)
    if m:
        tag = m.group(0)
        w = re.search(r'\bwidth="(\d+)"', tag)
        h = re.search(r'\bheight="(\d+)"', tag)
        if w and h:
            return int(w.group(1)), int(h.group(1))
    return None

def hero_rel(text):
    m = HERO_SRC.search(text)
    if m and (ROOT / m.group(1)).is_file():
        return m.group(1)
    for pat in (
        r'<img\b[^>]*\bsrc="(images/[^"]+\.webp)"[^>]*\bitemprop="image"',
        r'<img\b[^>]*\bitemprop="image"[^>]*\bsrc="(images/[^"]+\.webp)"',
    ):
        m = re.search(pat, text, re.I)
        if m and (ROOT / m.group(1)).is_file():
            return m.group(1)
    return None

def upgrade_twitter_card(text):
    head_end = text.find("</head>")
    if head_end < 0 or "og:image" not in text[:head_end]:
        return text
    head, rest = text[:head_end], text[head_end:]
    head2, n = re.subn(
        r'(<meta name="twitter:card" content=")summary(")',
        r"\1summary_large_image\2",
        head,
        count=1,
    )
    return head2 + rest if n else text

def ensure_recipe_share_image(text, rel):
    """Insert og:image for rel when the head has none, then fix twitter:card."""
    if not rel:
        return upgrade_twitter_card(text)
    head_end = text.find("</head>")
    if head_end < 0:
        return text
    if "og:image" not in text[:head_end]:
        dims = image_dimensions(rel, text)
        url = BASE + rel
        lines = [f'  <meta property="og:image" content="{url}">']
        if dims:
            w, h = dims
            lines.append(f'  <meta property="og:image:width" content="{w}">')
            lines.append(f'  <meta property="og:image:height" content="{h}">')
        block = "\n".join(lines) + "\n"
        tw = re.search(r'\n[ \t]*<meta name="twitter:card"', text)
        if tw and tw.start() < head_end:
            text = text[:tw.start() + 1] + block + text[tw.start() + 1:]
        else:
            anchor = '<link rel="stylesheet" href="styles.css">'
            idx = text.find(anchor)
            if 0 <= idx < head_end:
                line_start = text.rfind("\n", 0, idx) + 1
                text = text[:line_start] + block + text[line_start:]
            else:
                text = text[:head_end] + "\n" + block + text[head_end:]
    return upgrade_twitter_card(text)

def process(path, check=False):
    original = path.read_text(encoding="utf-8")
    head_end = original.find("</head>")
    if head_end < 0:
        return False
    head = original[:head_end]
    if 'rel="canonical"' in head and 'og:url' not in head:
        return False  # redirect stub or hand-managed page
    text = collapse_duplicate_mains(original)
    is_recipe = '"@type": "Recipe"' in text or '"@type":"Recipe"' in text
    if is_recipe:
        rel = hero_rel(text)
        head_now_end = text.find("</head>")
        head_now = text[:head_now_end] if head_now_end >= 0 else text
        if rel and "og:image" not in head_now:
            text = ensure_recipe_share_image(text, rel)
        else:
            text = upgrade_twitter_card(text)
    head_end = text.find("</head>")
    if head_end < 0:
        return False
    head = text[:head_end]
    title_m = re.search(r"<title>(.*?)</title>", head, re.S)
    if title_m:
        title = title_m.group(1).strip()
        desc_m = re.search(r'<meta name="description" content="([^"]*)"', head)
        desc = desc_m.group(1) if desc_m else (ld_description(text) or "")
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
        if missing:
            if desc_m:
                pos = head.find(">", desc_m.start()) + 1
            else:
                pos = title_m.end()
            insert = "".join("\n  " + t for t in missing)
            text = text[:pos] + insert + text[pos:]
    if text == original:
        return False
    if check:
        return True
    path.write_text(text, encoding="utf-8")
    return True

def main():
    check = "--check" in sys.argv
    changed = [p.name for p in sorted(ROOT.glob("*.html")) if process(p, check)]
    if check:
        if changed:
            print("Share tags or main landmarks out of date (run tools/build_share_meta.py):", *changed, sep="\n  ")
            sys.exit(1)
        print("Share tags OK")
    else:
        print(f"Updated {len(changed)} pages")

if __name__ == "__main__":
    main()
