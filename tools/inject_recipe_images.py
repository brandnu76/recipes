#!/usr/bin/env python3
"""Insert hero and card photos into Carroll Lowcountry Table recipe pages."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "images"
BASE = "https://brandnu76.github.io/recipes/images"

ALTS = {
    "smoked-chicken-thighs-alabama-white-sauce": "Smoked chicken thighs with Alabama white sauce",
    "lowcountry-shrimp-and-grits": "Lowcountry shrimp and grits",
    "sunday-chuck-roast": "Sunday chuck roast with vegetables",
    "sunday-chuck-roast-possiblecooker": "Sunday chuck roast in a multi-cooker",
    "peach-bourbon-cast-iron-pork-chops": "Peach-bourbon cast-iron pork chops",
    "cast-iron-flank-steak-chimichurri": "Cast-iron flank steak with herb chimichurri and roasted fingerlings",
    "sheet-pan-lemon-garlic-chicken": "Sheet-pan lemon-garlic chicken and vegetables",
    "skillet-creamy-tuscan-chicken": "Skillet creamy Tuscan chicken",
    "one-pot-sausage-peppers-rice": "One-pot sausage, peppers, and rice",
    "sheet-pan-salmon-sweet-potato": "Sheet-pan salmon with sweet potatoes and green beans",
    "ground-beef-taco-skillet": "Ground beef taco skillet",
    "honey-garlic-pork-tenderloin-skillet": "Honey-garlic pork tenderloin skillet",
    "mongolian-beef-noodles": "Mongolian beef and noodles",
    "supreme-pacific-jasmine-musubi": "Spam musubi on jasmine rice",
    "baked-cinnamon-apple-butter-french-toast": "Baked cinnamon apple butter French toast",
    "aint-no-thing-butta-chicken-wings": "Crispy hot-sauce butter chicken wings",
    "antipasto-pasta-salad": "Antipasto pasta salad",
    "seared-steak-salad": "Seared steak salad",
    "southern-baked-beans": "Southern baked beans",
    "apple-fritter-popcorn": "Apple fritter caramel popcorn",
    "strawberry-strudel-skillet-cookie": "Strawberry strudel skillet cookie",
    "lemon-skillet-cookie": "Lemon skillet cookie",
    "cinnamon-toast-crunch-cheesecake": "Cinnamon cereal cheesecake",
    "white-chocolate-strawberry-cloud-cake": "White chocolate strawberry cloud cake",
    "no-bake-white-chocolate-pumpkin-cheesecake": "No-bake white chocolate pumpkin cheesecake",
    "white-chocolate-gingersnap-cheesecake": "White chocolate gingersnap cheesecake",
    "reeses-peanut-butter-cup-skillet-cookie": "Peanut butter cup skillet cookie",
}

SKIP = {
    "index.html",
    "recipes.html",
    "copyright.html",
}


def patch_recipe(text: str, slug: str, alt: str) -> str:
    img_url = f"{BASE}/{slug}.webp"
    rel = f"images/{slug}.webp"
    if "class=\"recipe-hero\"" not in text:
        figure = (
            f'<figure class="recipe-hero">\n'
            f'      <img src="{rel}" width="1200" height="800" alt="{alt}" itemprop="image">\n'
            f'    </figure>\n    '
        )
        text, n = re.subn(
            r'(<p class="summary p-summary" itemprop="description">.*?</p>\n)',
            r"\1    " + figure,
            text,
            count=1,
            flags=re.S,
        )
        if n != 1:
            raise SystemExit(f"could not insert hero on {slug}")
    if 'property="og:image"' not in text:
        og = (
            f'  <meta property="og:image" content="{img_url}">\n'
            f'  <meta property="og:image:width" content="1200">\n'
            f'  <meta property="og:image:height" content="800">\n'
            f'  <meta name="twitter:card" content="summary_large_image">\n'
        )
        text = text.replace(
            '  <link rel="stylesheet" href="styles.css">',
            og + '  <link rel="stylesheet" href="styles.css">',
            1,
        )
    if '"@type":"Recipe"' in text and f'"image":"{img_url}"' not in text:
        text = text.replace(
            '"@type":"Recipe"',
            f'"@type":"Recipe","image":"{img_url}"',
            1,
        )
    return text


def add_card_photos(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        href = m.group(1)
        rest = m.group(2)
        slug = href[:-5] if href.endswith(".html") else href
        if slug not in ALTS:
            return m.group(0)
        img = (
            f'<img class="card-photo" src="images/{slug}.webp" '
            f'width="480" height="320" alt="" loading="lazy">'
        )
        return f'<a href="{href}"{rest}>{img}'

    def repl_safe(m: re.Match[str]) -> str:
        full = m.group(0)
        after = m.string[m.end() : m.end() + 40]
        if after.startswith('<img class="card-photo"'):
            return full
        return repl(m)

    return re.sub(r'<a href="([^"]+\.html)"([^>]*)>', repl_safe, text)


def main() -> None:
    missing = [s for s in ALTS if not (IMAGES / f"{s}.webp").exists()]
    if missing:
        raise SystemExit("missing images: " + ", ".join(missing))

    for path in sorted(ROOT.glob("*.html")):
        name = path.name
        if name in SKIP or name.startswith("category-"):
            continue
        slug = path.stem
        if slug not in ALTS:
            print("skip", name)
            continue
        path.write_text(patch_recipe(path.read_text(), slug, ALTS[slug]))
        print("hero", name)

    for name in ["recipes.html"] + [p.name for p in ROOT.glob("category-*.html")]:
        path = ROOT / name
        path.write_text(add_card_photos(path.read_text()))
        print("cards", name)


if __name__ == "__main__":
    main()
