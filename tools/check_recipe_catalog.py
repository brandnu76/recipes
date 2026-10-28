#!/usr/bin/env python3
"""Catalog QA for Carroll Lowcountry Table.

Checks recipes.html cards against the recipe pages and the JSON indexes:
  - every card links to an existing page and an existing image
  - every catalog slug is in search-index.json and recipe-meta.json (with t > 0)
  - every catalog page has a schema.org Recipe with name, recipeIngredient,
    recipeInstructions, recipeYield, image and totalTime
  - recipe pages on disk that carry a Recipe but are missing from the catalog
    (warning; hidden drafts like the shop are skipped)
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
NON_RECIPE = {"index.html", "recipes.html", "copyright.html", "meal-planner.html", "shop.html", "shop-order.html"}
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
        if recipe_of(page.read_text(encoding="utf-8")):
            warnings.append(f"{page.stem}: has a Recipe but is not in the catalog")

    for k in sorted(index):
        if k not in slugs:
            warnings.append(f"{k}: in search-index.json but not in the catalog")

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
    print("OK: catalog, indexes, JSON-LD, images and links all check out")
    return 0


if __name__ == "__main__":
    sys.exit(main())
