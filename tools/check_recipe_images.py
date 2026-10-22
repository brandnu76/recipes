#!/usr/bin/env python3
"""Fail if any recipe hero or listing card image is missing or truncated.

Scans HTML for references to images/*.webp (and .png/.jpg/.jpeg).
Validates WebP containers: RIFF/WEBP signature and chunk length matches file size.
Exits non-zero with a clear report so CI can block the merge.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXTS = {".webp", ".png", ".jpg", ".jpeg"}

# Pages that are not recipes and may legitimately omit hero images.
NON_RECIPE = {
    "index.html",
    "recipes.html",
    "copyright.html",
    "robots.txt",
}

IMG_RE = re.compile(r'src=["\']([^"\']+)["\']', re.I)


def is_webp_valid(data: bytes) -> tuple[bool, str]:
    if len(data) < 12:
        return False, f"too short ({len(data)} bytes)"
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return False, "missing RIFF/WEBP signature"
    expected = int.from_bytes(data[4:8], "little") + 8
    if expected != len(data):
        return False, f"truncated (file {len(data)} bytes, header expects {expected})"
    return True, "ok"


def collect_refs() -> dict[str, set[str]]:
    """Map relative image path -> set of HTML files that reference it."""
    refs: dict[str, set[str]] = {}
    for html in ROOT.glob("*.html"):
        text = html.read_text(encoding="utf-8", errors="replace")
        for m in IMG_RE.finditer(text):
            src = m.group(1).split("?")[0]
            if src.startswith("images/") and Path(src).suffix.lower() in IMAGE_EXTS:
                refs.setdefault(src, set()).add(html.name)
    return refs


def main() -> int:
    errors: list[str] = []
    refs = collect_refs()

    # Every referenced image must exist and be a valid container.
    for rel, pages in sorted(refs.items()):
        path = ROOT / rel
        if not path.is_file():
            errors.append(f"MISSING  {rel}  (referenced by {', '.join(sorted(pages))})")
            continue
        data = path.read_bytes()
        if path.suffix.lower() == ".webp":
            ok, reason = is_webp_valid(data)
            if not ok:
                errors.append(f"INVALID  {rel}  {reason}  (referenced by {', '.join(sorted(pages))})")
        elif len(data) < 100:
            errors.append(f"SUSPICIOUS  {rel}  only {len(data)} bytes")

    # Recipe pages should have at least one hero image reference.
    for html in sorted(ROOT.glob("*.html")):
        if html.name in NON_RECIPE or html.name.startswith("category-"):
            continue
        text = html.read_text(encoding="utf-8", errors="replace")
        # Redirect stubs (meta refresh to a moved recipe) are not recipe pages.
        if re.search(r'<meta[^>]+http-equiv=["\']refresh["\']', text, re.I):
            continue
        has_hero = bool(re.search(r'class=["\'][^"\']*recipe-hero', text)) or \
                   bool(re.search(r'<img[^>]+itemprop=["\']image["\']', text))
        if not has_hero:
            errors.append(f"NO_HERO  {html.name}")

    if errors:
        print("Recipe image check failed:")
        for e in errors:
            print(f"  {e}")
        print(f"\n{len(errors)} problem(s).")
        return 1

    print(f"OK — {len(refs)} image references validated, all recipe pages have a hero.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
