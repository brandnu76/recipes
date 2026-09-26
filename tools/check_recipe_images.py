#!/usr/bin/env python3
"""Fail when a recipe page points at a missing or truncated image.

New recipes have been published with an <img> path and no complete file.
Base64 pack workflows have also committed WebP files whose RIFF header is
longer than the bytes on disk, which browsers will not decode. This check
is the gate for both cases: every local image referenced by the site must
exist and be a complete WebP, PNG, or JPEG.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_PAGES = {"index.html", "recipes.html", "copyright.html"}
REF_RE = re.compile(
    r'(?:src|content)="([^"]+\.(?:webp|png|jpe?g))"',
    re.IGNORECASE,
)
CARD_RE = re.compile(
    r'<li><a href="([^"]+\.html)"([^>]*)>(.*?)</a></li>',
    re.DOTALL,
)
HERO_RE = re.compile(
    r'<figure class="recipe-hero">\s*<img src="([^"]+)"',
    re.DOTALL,
)


def local_path(raw: str) -> str | None:
    src = raw.split("?", 1)[0].split("#", 1)[0]
    if src.startswith(("http://", "https://")):
        marker = "/recipes/"
        if marker not in src:
            return None
        src = src.split(marker, 1)[1]
    return src.lstrip("./")


def image_error(data: bytes, suffix: str) -> str | None:
    suffix = suffix.lower()
    if suffix == ".webp":
        if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
            return "not a WebP"
        expected = int.from_bytes(data[4:8], "little") + 8
        if expected != len(data):
            return f"truncated WebP ({len(data)} bytes, header expects {expected})"
        index = 12
        while index + 8 <= len(data):
            size = int.from_bytes(data[index + 4 : index + 8], "little")
            index += 8 + size + (size & 1)
        if index != len(data):
            return "WebP chunks do not fill the file"
        return None
    if suffix == ".png":
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            return "not a PNG"
        if b"IEND" not in data[-24:]:
            return "truncated PNG"
        return None
    if suffix in {".jpg", ".jpeg"}:
        if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
            return "truncated JPEG"
        return None
    return f"unsupported image type {suffix}"


def collect_errors(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    html_files = sorted(root.glob("*.html"))
    seen: set[str] = set()

    for path in html_files:
        text = path.read_text(encoding="utf-8")
        for match in REF_RE.finditer(text):
            rel = local_path(match.group(1))
            if rel is None or rel in seen:
                continue
            seen.add(rel)
            file_path = root / rel
            if not file_path.is_file():
                errors.append(f"{path.name} references missing {rel}")
                continue
            problem = image_error(file_path.read_bytes(), file_path.suffix)
            if problem:
                errors.append(f"{rel} is {problem}")

        if path.name in SKIP_PAGES or path.name.startswith("category-"):
            continue
        hero = HERO_RE.search(text)
        if hero is None:
            errors.append(f"{path.name} has no recipe hero image")

    for path in html_files:
        if path.name != "recipes.html" and not path.name.startswith("category-"):
            continue
        text = path.read_text(encoding="utf-8")
        for match in CARD_RE.finditer(text):
            href, _attrs, inner = match.group(1), match.group(2), match.group(3)
            if "card-title" not in inner:
                continue
            if "card-photo" not in inner:
                errors.append(f"{path.name} lists {href} without a photo")

    return errors


def self_test() -> None:
    header = b"RIFF" + (100).to_bytes(4, "little") + b"WEBP"
    truncated = header + b"x" * 20
    problem = image_error(truncated, ".webp")
    if problem is None or "truncated" not in problem:
        raise SystemExit(f"self-test failed to catch a truncated WebP: {problem}")
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    if image_error(png, ".png") is None:
        raise SystemExit("self-test failed to catch a truncated PNG")
    if image_error(b"\xff\xd8\xff\xd9", ".jpg") is not None:
        raise SystemExit("self-test rejected a minimal JPEG")


def main() -> None:
    self_test()
    errors = collect_errors()
    if errors:
        print(f"{len(errors)} recipe image error(s):", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        raise SystemExit(1)
    print("recipe images ok")


if __name__ == "__main__":
    main()
