#!/usr/bin/env python3
"""Build ingredients.json for the Meal calendar shopping list (shopping-list.js).

Reads each recipe page's Schema.org JSON-LD recipeIngredient (the same list
AnyList imports) and writes slug -> {"n": recipe name, "i": [ingredient lines]}.
Run from the repo root after publishing or editing a recipe:
    python3 tools/build_ingredients.py          # rewrite ingredients.json
    python3 tools/build_ingredients.py --check  # fail if it is out of date
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {"index.html", "recipes.html", "copyright.html", "meal-planner.html", "calendar.html", "shop.html", "shop-order.html"}
LD_RE = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.S | re.I)

def find_recipe(node):
    stack = [node]
    while stack:
        n = stack.pop(0)
        if isinstance(n, list):
            stack.extend(n); continue
        if not isinstance(n, dict):
            continue
        t = n.get("@type")
        if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
            return n
        if "@graph" in n:
            stack.append(n["@graph"])
    return None

def build():
    out = {}
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith(".html") or name in SKIP or name.startswith("category-"):
            continue
        text = open(os.path.join(ROOT, name), encoding="utf-8").read()
        for m in LD_RE.finditer(text):
            try:
                r = find_recipe(json.loads(m.group(1)))
            except ValueError:
                continue
            if not r:
                continue
            items = [re.sub(r"\s+", " ", html.unescape(str(x))).strip() for x in (r.get("recipeIngredient") or [])]
            items = [x for x in items if x]
            if items:
                out[name[:-5]] = {"n": html.unescape(str(r.get("name") or name[:-5])).strip(), "i": items}
            break
    return json.dumps(out, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"

def main():
    path = os.path.join(ROOT, "ingredients.json")
    data = build()
    if "--check" in sys.argv:
        cur = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
        if cur != data:
            print("ERROR: ingredients.json is out of date; run python3 tools/build_ingredients.py")
            return 1
        print("ingredients.json is up to date")
        return 0
    open(path, "w", encoding="utf-8").write(data)
    print("wrote ingredients.json:", len(json.loads(data)), "recipes")
    return 0

if __name__ == "__main__":
    sys.exit(main())
