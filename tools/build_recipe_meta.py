#!/usr/bin/env python3
"""Build recipe-meta.json for the All Recipes quick filters.

Reads each recipe page's Schema.org JSON-LD (the same block AnyList imports)
and writes slug -> {"t": total minutes}.
Run from the repo root after publishing or editing a recipe:
    python3 tools/build_recipe_meta.py
"""
import glob, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {"index", "recipes", "meal-planner", "copyright", "shop", "shop-order"}

def minutes(iso):
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?", (iso or "").strip())
    if not m or not any(m.groups()):
        return None
    d, h, mi = (int(x or 0) for x in m.groups())
    return d * 1440 + h * 60 + mi

def recipe_ld(html):
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        for item in (d if isinstance(d, list) else d.get("@graph", [d])):
            t = item.get("@type")
            if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
                return item
    return None

def main():
    meta = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
        slug = os.path.basename(path)[:-5]
        if slug in SKIP or slug.startswith("category-"):
            continue
        r = recipe_ld(open(path, encoding="utf-8").read())
        if not r:
            continue
        t = minutes(r.get("totalTime")) or (
            (minutes(r.get("prepTime")) or 0) + (minutes(r.get("cookTime")) or 0)) or None
        entry = {"t": t} if t else {}
        meta[slug] = entry
    with open(os.path.join(ROOT, "recipe-meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"), sort_keys=True)
        f.write("\n")
    print(len(meta), "recipes")

if __name__ == "__main__":
    main()
