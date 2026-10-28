#!/usr/bin/env python3
"""Validate catalog coverage, recipe schema, local assets, times and categories.

Run from any directory: python3 tools/check_recipe_catalog.py
Uses only Python's standard library and never modifies repository files.
"""
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from build_recipe_meta import minutes, recipe_ld

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.links = []
        self.assets = []
        self.cards = []
        self.book_links = []
        self.list_depth = 0
        self.category_counts = {}
        self.category_href = None
        self.canonical = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'ul':
            if self.list_depth or 'book-list' in a.get('class', '').split():
                self.list_depth += 1
        if tag == 'a' and a.get('href'):
            if 'splash-cat' in a.get('class', '').split():
                self.category_href = a['href']
            self.links.append(a['href'])
            if self.list_depth:
                self.book_links.append(a['href'])
            if 'data-cat' in a:
                self.cards.append((a['href'], a['data-cat'].lower()))
        if tag in ('script', 'img') and a.get('src'):
            self.assets.append(a['src'])
        if tag == 'link' and a.get('href'):
            if a.get('rel') == 'canonical':
                self.canonical = True
            elif a.get('rel') in ('stylesheet', 'icon', 'manifest', 'apple-touch-icon', 'preload'):
                self.assets.append(a['href'])

    def handle_data(self, data):
        if self.category_href and re.fullmatch(r'\d+ recipes?', data.strip()):
            self.category_counts[self.category_href] = int(data.split()[0])

    def handle_endtag(self, tag):
        if tag == 'a':
            self.category_href = None
        if tag == 'ul' and self.list_depth:
            self.list_depth -= 1


def check(root=ROOT):
    errors = []
    pages = {p.name: Page(p.read_text(encoding='utf-8')) for p in root.glob('*.html')}
    catalog = pages['recipes.html']
    slugs = {Path(href).stem for href, _ in catalog.cards}
    categories = Counter(cat for _, cat in catalog.cards)
    if not slugs or len(categories) != 8:
        errors.append(f'Expected a nonempty catalog with eight categories; got {len(categories)}')
    for name, page in pages.items():
        for url in page.links + page.assets:
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc or not parsed.path or parsed.path.startswith('/'):
                continue
            target = root / unquote(parsed.path)
            if not target.is_file():
                errors.append(f'{name}: missing local target {url}')
    for filename in ('search-index.json', 'recipe-meta.json'):
        data = json.loads((root / filename).read_text())
        if set(data) != slugs:
            errors.append(f'{filename}: missing {sorted(slugs - set(data))}, extra {sorted(set(data) - slugs)}')
    meta = json.loads((root / 'recipe-meta.json').read_text())
    missing_canonical = 0
    for slug in sorted(slugs):
        path = root / (slug + '.html')
        if not path.is_file():
            continue  # already reported as a missing catalog target
        recipe = recipe_ld(path.read_text(encoding='utf-8'))
        if not recipe:
            errors.append(f'{path.name}: missing Recipe JSON-LD')
            continue
        for field in ('name', 'recipeIngredient', 'recipeInstructions', 'recipeYield', 'image', 'totalTime'):
            if not recipe.get(field):
                errors.append(f'{path.name}: missing {field}')
        total = minutes(recipe.get('totalTime'))
        if not total or meta.get(slug, {}).get('t') != total:
            errors.append(f'{path.name}: totalTime does not match recipe-meta.json')
        missing_canonical += not pages[path.name].canonical
    category_names = {
        'weekend-dinners': 'weekend dinners', 'weekday-dinners': 'weekday dinners',
        'breakfast': 'breakfast & brunch', 'game-day': 'game day',
        'sides-salads': 'sides & salads', 'breads': 'breads',
        'healthy-snacks': 'healthy snacks', 'dessert': 'dessert',
    }
    for suffix, cat in category_names.items():
        name = f'category-{suffix}.html'
        if name not in pages:
            errors.append(f'Missing category page {name}')
            continue
        expected = Counter(href for href, category in catalog.cards if category == cat)
        if pages['index.html'].category_counts.get(name) != sum(expected.values()):
            errors.append(f'index.html: incorrect recipe count for {name}')
        if Counter(pages[name].book_links) != expected:
            errors.append(f'{name}: category membership or counts differ from catalog')
    print(f'Catalog: {len(slugs)} unique recipes, {len(catalog.cards)} placements, {len(categories)} categories')
    print(f'INFO: {missing_canonical} recipe pages lack canonical URLs (non-blocking SEO follow-up)')
    for error in errors:
        print('ERROR:', error)
    if not errors:
        print('OK — recipe schema, index coverage, times, local links and assets validated.')
    return errors


if __name__ == '__main__':
    raise SystemExit(bool(check()))
