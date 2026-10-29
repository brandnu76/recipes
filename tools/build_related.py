#!/usr/bin/env python3
"""Build related.json for the "More from our table" cards on recipe pages.

Reads the All Recipes cards (recipes.html: title, category, photo) and the
ingredient-aware search-index.json, then picks the 4 closest recipes for each
page: shared keywords/ingredients first, same category as a tiebreak bonus.
Writes slug -> {"n": title, "c": category, "i": photo or "", "r": [slugs]}.
Run from the repo root after publishing or editing a recipe:
    python3 tools/build_related.py
"""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOP = set("""a an and or the of with in on for to from at by our my your recipe recipes easy best
homemade classic style weekend weeknight dinners dinner cook lowcountry bakery side sides dessert desserts
breakfast breads bread appetizers snacks drinks quick pan sheet sweet savory one pot lb big batch""".split())

def tokens(text):
    out = set()
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if len(w) < 3 or w in STOP or w.isdigit():
            continue
        if len(w) > 4 and w.endswith("es") and not w.endswith("ses"):
            w = w[:-2]
        elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        out.add(w)
    return out

def main():
    page = open(os.path.join(ROOT, "recipes.html"), encoding="utf-8").read()
    cards = {}
    for m in re.finditer(r'<a href="([a-z0-9-]+)\.html" data-cat="([^"]*)" data-search="([^"]*)">(.*?)</a>', page, re.S):
        slug, cat, search, inner = m.groups()
        if slug in cards or not os.path.exists(os.path.join(ROOT, slug + ".html")):
            continue
        t = re.search(r'<span class="card-title">(.*?)</span>', inner, re.S)
        c = re.search(r'<span class="card-cat">(.*?)</span>', inner, re.S)
        img = re.search(r'<img class="card-photo" src="([^"]+)"', inner)
        cards[slug] = {
            "n": html.unescape(re.sub(r"<[^>]+>", "", t.group(1)).strip()) if t else slug,
            "c": html.unescape(c.group(1).strip()) if c else "",
            "i": img.group(1) if img else "",
            "_cat": cat,
            "_tok": tokens(html.unescape(search)),
            "_title": tokens(html.unescape(re.sub(r"<[^>]+>", "", t.group(1)))) if t else set(),
        }
    try:
        idx = json.load(open(os.path.join(ROOT, "search-index.json"), encoding="utf-8"))
    except (OSError, ValueError):
        idx = {}
    for slug, d in cards.items():
        d["_tok"] |= tokens(idx.get(slug, ""))
    # Common pantry words say little about whether two dishes are alike.
    df = {}
    for d in cards.values():
        for w in d["_tok"]:
            df[w] = df.get(w, 0) + 1
    common = {w for w, n in df.items() if n > len(cards) * 0.25}
    out = {}
    for slug, d in cards.items():
        a = d["_tok"] - common
        scored = []
        for other, e in cards.items():
            if other == slug:
                continue
            b = e["_tok"] - common
            shared = len(a & b)
            same_title = len((d["_title"] & e["_title"]) - common)
            score = (shared / (len(a | b) or 1) + 0.12 * same_title
                     + (0.1 if e["_cat"] == d["_cat"] else 0))
            if shared or same_title or e["_cat"] == d["_cat"]:
                scored.append((score, other))
        scored.sort(key=lambda x: (-x[0], x[1]))
        out[slug] = {"n": d["n"], "c": d["c"], "i": d["i"], "r": [s for _, s in scored[:4]]}
    with open(os.path.join(ROOT, "related.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=True, ensure_ascii=False)
        f.write("\n")
    print(len(out), "recipes")

if __name__ == "__main__":
    main()
