#!/usr/bin/env python3
"""Meatless classifier for the All Recipes "Meatless" filter.

A recipe is meatless when none of its JSON-LD recipeIngredient lines name
meat, poultry, seafood, or a meat-derived ingredient (stocks and broths made
from meat, rendered fats, gelatin, fish/oyster sauce, traditional
Worcestershire, which contains anchovy). Eggs, dairy and butter are fine.
Used by tools/build_recipe_meta.py ("m": 1). Self-test:
    python3 tools/meatless.py --test
Classify lines from stdin (one JSON list) -> prints 1 or 0:
    echo '["2 eggs"]' | python3 tools/meatless.py --stdin
"""
import json, re, sys

MEAT_WORDS = [
    # red meat and pork
    "beef", "steak", "brisket", "chuck", "ribeye", "sirloin", "tenderloin", "short rib", "oxtail",
    "veal", "lamb", "mutton", "goat", "venison", "bison", "pork", "ham", "hams", "bacon", "pancetta",
    "prosciutto", "sausage", "sausages", "andouille", "kielbasa", "chorizo", "pepperoni", "salami",
    "hot dog", "hot dogs", "frank", "franks", "bratwurst", "meatball", "meatballs", "meat",
    "ground chuck", "rib", "ribs", "spare ribs", "baby back", "loin", "shoulder", "butt", "hock",
    "jowl", "fatback", "salt pork", "tasso", "chitterlings", "liver", "burger", "burgers", "patty", "patties",
    "pulled pork", "roast", "corned", "pastrami", "jerky", "bologna", "spam",
    # poultry
    "chicken", "turkey", "duck", "goose", "quail", "hen", "hens", "poultry", "wing", "wings",
    "drumstick", "drumsticks", "thigh", "thighs", "breast", "breasts",
    # seafood
    "fish", "shrimp", "prawn", "prawns", "crab", "crawfish", "crayfish", "lobster", "oyster", "oysters",
    "clam", "clams", "mussel", "mussels", "scallop", "scallops", "catfish", "salmon", "tuna", "cod",
    "tilapia", "flounder", "grouper", "snapper", "trout", "mahi", "halibut", "sardine", "sardines",
    "anchovy", "anchovies", "squid", "calamari", "octopus", "roe", "caviar", "seafood",
    # meat-derived
    "broth", "stock", "bouillon", "consomme", "demi-glace", "drippings", "tallow", "lard", "schmaltz",
    "suet", "gelatin", "gelatine", "jello", "jell-o", "worcestershire", "fish sauce", "oyster sauce",
    "bone", "pan juices", "au jus", "better than bouillon",
]
# Phrases that contain a meat word but are meatless. Removed before matching.
SAFE_PHRASES = [
    "vegetable broth", "vegetable stock", "veggie broth", "veggie stock", "mushroom broth", "mushroom stock",
    "vegetarian worcestershire", "vegan worcestershire", "plant-based", "meatless", "beyond meat",
    "impossible", "eggplant", "chicken-free", "imitation", "coconut meat", "nut meat",
    "cream of mushroom", "peanut butter", "apple butter", "butternut", "buttermilk", "hamburger bun",
    "hamburger buns", "burger bun", "burger buns", "hot dog bun", "hot dog buns", "slider buns",
    "stock pot", "stockpot", "rib of celery", "ribs of celery", "celery rib", "celery ribs", "kale, ribs",
    "ribs removed", "rib removed", "chuck-eye", "bone-dry", "roasted", "roast beef seasoning",
    "chicken of the woods", "chickpea", "chickpeas", "chicken seasoning-free", "wing sauce",
    "buffalo wing sauce", "hen-of-the-woods", "pork rind-free", "shortening", "graham",
    "frank's", "franks redhot", "frank's redhot", "redhot",
]
_meat_re = re.compile(r"\b(" + "|".join(re.escape(w) for w in sorted(MEAT_WORDS, key=len, reverse=True)) + r")\b")


def _clean(line):
    s = line.lower().replace("\u2019", "'").replace("\u2018", "'")
    for p in sorted(SAFE_PHRASES, key=len, reverse=True):
        s = s.replace(p, " ")
    return s


def meat_hits(lines):
    hits = []
    for line in lines or []:
        m = _meat_re.search(_clean(str(line)))
        if m:
            hits.append((m.group(1), line))
    return hits


def is_meatless(lines):
    return bool(lines) and not meat_hits(lines)


CASES = [
    (["12 large eggs", "1 cup sharp cheddar cheese, shredded", "1 Tbsp butter"], True),
    (["1 eggplant, diced", "4 cups vegetable broth"], True),
    (["1 cup buttermilk", "1/2 cup apple butter", "1 cup butternut squash"], True),
    (["3 cups kale, ribs removed and chopped"], True),
    (["2 lb chuck roast"], False),
    (["5 cups chicken bone broth"], False),
    (["1 Tbsp Worcestershire sauce"], False),
    (["2 Tbsp beef tallow or bacon fat"], False),
    (["1 Tbsp fish sauce"], False),
    (["1 packet unflavored gelatin"], False),
    (["1 lb large shrimp"], False),
    (["4 cups stock"], False),
    ([], False),
]


def selftest():
    bad = [(c, want) for c, want in CASES if is_meatless(c) != want]
    for c, want in bad:
        print("FAIL", c, "want", want, "hits", meat_hits(c))
    print("ok" if not bad else "%d failures" % len(bad))
    return 1 if bad else 0


if __name__ == "__main__":
    if "--test" in sys.argv:
        sys.exit(selftest())
    if "--stdin" in sys.argv:
        print(1 if is_meatless(json.load(sys.stdin)) else 0)
