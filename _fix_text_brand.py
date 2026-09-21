from pathlib import Path
p = Path("styles.css")
css = p.read_text()
start = css.find("/* Brand logo */")
end = css.find(".visually-hidden")
if start < 0 or end < 0:
    raise SystemExit(f"markers missing start={start} end={end}")
new = """/* Text brand until new logo.webp is installed */
.site-brand .site-logo,
.hero-logo,
.splash-logo {
  display: none !important;
}
.site-brand .brand-mark {
  display: block;
}
.site-brand {
  gap: 0.7rem;
  font-size: inherit;
  color: var(--cream);
}

"""
css = css[:start] + new + css[end:]
orphan = """
@media (max-width: 640px) {
  .site-brand .site-logo {
    height: 44px;
    width: 74px;
  }
}
"""
css = css.replace(orphan, "\n", 1)
p.write_text(css)
assert "logo-only header" not in css
assert "Text brand until new logo.webp" in css
print("ok", len(css))
