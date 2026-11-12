#!/usr/bin/env python3
"""Catalog QA for Carroll Lowcountry Table.

Checks recipes.html cards against the recipe pages and the JSON indexes:
  - every card links to an existing page and an existing image
  - every catalog slug is in search-index.json and recipe-meta.json (with t > 0)
  - every catalog page has a schema.org Recipe with name, recipeIngredient,
    recipeInstructions, recipeYield, image and totalTime
  - every recipe page has exactly one <main> and an og:image (share preview)
  - recipe pages on disk that carry a Recipe but are missing from the catalog
    (warning; hidden drafts like the shop are skipped)
  - splash category counts on index.html match the catalog
Missing canonical links are reported as info only and never fail the run.
Exit code 1 on any error.
"""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NON_RECIPE = {"index.html", "recipes.html", "copyright.html", "meal-planner.html", "calendar.html", "shop.html", "shop-order.html"}
REQUIRED = ["name", "recipeIngredient", "recipeInstructions", "recipeYield", "image", "totalTime"]


class Catalog(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cards = []  # (href, cat, img)
        self._cur = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "ul" and "book-list" in (a.get("class") or "").split():
            self._in = True
        if tag == "a" and getattr(self, "_in", False) and "splash-cat" not in (a.get("class") or ""):
            self._cur = [a.get("href") or "", a.get("data-cat") or "", None]
        if tag == "img" and self._cur is not None and self._cur[2] is None:
            self._cur[2] = a.get("src")

    def handle_endtag(self, tag):
        if tag == "a" and self._cur is not None:
            self.cards.append(tuple(self._cur))
            self._cur = None
        if tag == "ul":
            self._in = False


LD_RE = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.S | re.I)
MAIN_OPEN = re.compile(r"<main\b", re.I)
OG_IMAGE = re.compile(r'<meta\b[^>]*\bproperty=["\']og:image["\'][^>]*>', re.I)
HERO_SRC = re.compile(
    r'<figure class="recipe-hero"[^>]*>\s*<img\b[^>]*\bsrc="(images/[^"]+)"',
    re.I | re.S,
)
TWITTER_CARD = re.compile(
    r'<meta\b[^>]*\bname=["\']twitter:card["\'][^>]*\bcontent=["\']([^"\']+)["\']',
    re.I,
)
TWITTER_CARD_REV = re.compile(
    r'<meta\b[^>]*\bcontent=["\']([^"\']+)["\'][^>]*\bname=["\']twitter:card["\']',
    re.I,
)
REFRESH = re.compile(r'<meta[^>]+http-equiv=["\']refresh["\']', re.I)



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


def is_redirect(html: str) -> bool:
    return bool(REFRESH.search(html))


def landmark_problems(slug: str, html: str) -> list[str]:
    """Share-preview and landmark errors for one recipe page.

    Fails when og:image is missing (or does not point at the hero file) or
    when the page opens <main> more than once. A hero also requires
    twitter:card=summary_large_image. Redirect stubs are skipped.
    """
    if is_redirect(html):
        return []
    problems = []
    mains = len(MAIN_OPEN.findall(html))
    if mains > 1:
        problems.append(f"{slug}: {mains} <main> elements (expected one)")
    og = OG_IMAGE.search(html)
    if not og:
        problems.append(f"{slug}: missing og:image")
    else:
        hero = HERO_SRC.search(html)
        content = re.search(r'\bcontent=["\']([^"\']+)["\']', og.group(0))
        if hero and (not content or hero.group(1) not in content.group(1)):
            problems.append(f"{slug}: og:image does not point at {hero.group(1)}")
    has_hero = bool(re.search(r'class=["\'][^"\']*recipe-hero', html)) or bool(og)
    if has_hero:
        card = TWITTER_CARD.search(html) or TWITTER_CARD_REV.search(html)
        if not card or card.group(1) != "summary_large_image":
            got = card.group(1) if card else "missing"
            problems.append(f"{slug}: twitter:card is {got} (expected summary_large_image)")
    return problems


def find_recipe(node):
    stack = [node]
    while stack:
        n = stack.pop(0)
        if isinstance(n, list):
            stack.extend(n)
            continue
        if not isinstance(n, dict):
            continue
        t = n.get("@type")
        if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
            return n
        if "@graph" in n:
            stack.append(n["@graph"])
    return None


def recipe_of(html: str):
    for m in LD_RE.finditer(html):
        try:
            r = find_recipe(json.loads(m.group(1)))
        except ValueError:
            continue
        if r:
            return r
    return None


def main() -> int:
    errors, warnings, info = [], [], []
    cat = Catalog()
    cat.feed((ROOT / "recipes.html").read_text(encoding="utf-8"))
    if not cat.cards:
        print("ERROR: no recipe cards found in recipes.html")
        return 1
    try:
        index = json.loads((ROOT / "search-index.json").read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        errors.append(f"search-index.json unreadable: {e}")
        index = {}
    try:
        meta = json.loads((ROOT / "recipe-meta.json").read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        errors.append(f"recipe-meta.json unreadable: {e}")
        meta = {}

    slugs, counts = set(), {}
    for href, c, img in cat.cards:
        href = href.split("#")[0].split("?")[0].lstrip("./")
        if not href.endswith(".html"):
            continue
        slug = href[:-5]
        slugs.add(slug)
        counts[c] = counts.get(c, 0) + 1
        if not (ROOT / href).is_file():
            errors.append(f"{slug}: catalog links to missing page {href}")
        if not img:
            errors.append(f"{slug}: catalog card has no image")
        elif not img.startswith(("http:", "https:")) and not (ROOT / img.split("?")[0]).is_file():
            errors.append(f"{slug}: catalog image missing {img}")
        if slug not in index:
            errors.append(f"{slug}: missing from search-index.json")
        m = meta.get(slug)
        if not m or not isinstance(m.get("t"), (int, float)) or m["t"] <= 0:
            errors.append(f"{slug}: missing or zero total time in recipe-meta.json")

    for slug in sorted(slugs):
        page = ROOT / f"{slug}.html"
        if not page.is_file():
            continue
        html = page.read_text(encoding="utf-8")
        errors.extend(landmark_problems(slug, html))
        r = recipe_of(html)
        if not r:
            errors.append(f"{slug}: no schema.org Recipe JSON-LD")
            continue
        for k in REQUIRED:
            if not r.get(k):
                errors.append(f"{slug}: JSON-LD Recipe missing {k}")
        img = r.get("image")
        img = img[0] if isinstance(img, list) and img else img
        if isinstance(img, dict):
            img = img.get("url")
        if isinstance(img, str) and "/images/" in img:
            local = "images/" + img.split("/images/", 1)[1]
            if not (ROOT / local).is_file():
                errors.append(f"{slug}: JSON-LD image not in repo ({local})")
        for href in re.findall(r'href="([^"#?:]+\.html)"', html):
            if not (ROOT / href.lstrip("./")).is_file():
                errors.append(f"{slug}: broken link to {href}")
        if 'rel="canonical"' not in html:
            info.append(slug)

    for page in sorted(ROOT.glob("*.html")):
        if page.name in NON_RECIPE or page.stem in slugs:
            continue
        html = page.read_text(encoding="utf-8")
        if recipe_of(html):
            warnings.append(f"{page.stem}: has a Recipe but is not in the catalog")
            errors.extend(landmark_problems(page.stem, html))

    for k in sorted(index):
        if k not in slugs:
            warnings.append(f"{k}: in search-index.json but not in the catalog")


    # GoatCounter snippet and CSP on every HTML page (no Abacus).
    for page in sorted(ROOT.glob("*.html")):
        errors.extend(goatcounter_problems(page.name, page.read_text(encoding="utf-8")))

    # Splash category counts on index.html must match the catalog tallies.
    splash = (ROOT / "index.html").read_text(encoding="utf-8")
    splash_map = {
        "Weekend dinners": "weekend dinners",
        "Weekday dinners": "weekday dinners",
        "Breakfast & brunch": "breakfast & brunch",
        "Game day": "game day",
        "Sides & salads": "sides & salads",
        "Breads": "breads",
        "Healthy snacks": "healthy snacks",
        "Dessert": "dessert",
    }
    for label, key in splash_map.items():
        m = re.search(
            rf'<span class="card-cat">{re.escape(label)}</span><span class="card-title">(\d+) recipes</span>',
            splash,
        )
        if not m:
            errors.append(f"index.html: missing splash count for {label}")
            continue
        shown = int(m.group(1))
        expected = counts.get(key, 0)
        if shown != expected:
            errors.append(
                f"index.html: {label} shows {shown} recipes but catalog has {expected}"
            )

    print(f"Catalog: {len(slugs)} unique recipes in {sum(counts.values())} card placements")
    for c in sorted(counts):
        print(f"  {c or '(no category)'}: {counts[c]}")
    for w in warnings:
        print("WARNING:", w)
    if info:
        print(f"INFO: {len(info)} recipe pages have no canonical link (non-blocking)")
    for e in errors:
        print("ERROR:", e)
    if errors:
        print(f"FAILED: {len(errors)} error(s)")
        return 1
    print("OK: catalog, indexes, JSON-LD, images, links, og:image and main landmarks all check out")
    return 0


if __name__ == "__main__":
    sys.exit(main())
