"""Regression checks that prove catalog QA rejects inconsistent content."""
import contextlib
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from check_recipe_catalog import check


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for source in ROOT.iterdir():
            if source.is_file():
                shutil.copy2(source, self.root / source.name)
        # Assets are read-only for these fixtures; avoid copying image binaries.
        (self.root / 'images').symlink_to(ROOT / 'images', target_is_directory=True)

    def check(self):
        with contextlib.redirect_stdout(io.StringIO()):
            return check(self.root)

    def test_current_catalog_passes(self):
        self.assertEqual(self.check(), [])

    def test_inconsistent_duration_is_rejected(self):
        path = self.root / 'recipe-meta.json'
        data = json.loads(path.read_text())
        data['garlic-butter-steak-bites']['t'] = 999
        path.write_text(json.dumps(data))
        self.assertTrue(any('totalTime' in error for error in self.check()))

    def test_wrong_category_membership_is_rejected(self):
        path = self.root / 'category-weekend-dinners.html'
        path.write_text(path.read_text().replace('href="jamaican-oxtail-stew.html"', 'href="apple-crumble.html"'))
        self.assertTrue(any('category membership' in error for error in self.check()))

    def test_missing_index_entry_is_rejected(self):
        path = self.root / 'search-index.json'
        data = json.loads(path.read_text())
        del data['garlic-butter-steak-bites']
        path.write_text(json.dumps(data))
        self.assertTrue(any('search-index.json: missing' in error for error in self.check()))


if __name__ == '__main__':
    unittest.main()
