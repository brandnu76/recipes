"""Browser acceptance checks. Serve the repo first, then run this script.

Requires Python Playwright and Chromium. BASE_URL defaults to port 8001;
CHROMIUM_PATH can select a system browser (otherwise Playwright's bundled one).
External fonts are excluded; application requests and errors remain checked.
"""
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:8001').rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH'),
        args=['--no-sandbox', '--disable-dev-shm-usage'],
    )
    for width in (390, 1280):
        context = browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        page.route('https://fonts.gstatic.com/**', lambda r: r.abort())
        page.goto(BASE + '/index.html', wait_until='domcontentloaded')
        expect(page.locator('.home-featured a')).to_have_count(3)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Homepage overflows'
        page.locator('#home-search').fill('oxtail')
        page.get_by_role('button', name='Find recipes', exact=True).click()
        expect(page.locator('#recipe-search')).to_have_value('oxtail')
        expect(page.locator('#search-meta')).to_contain_text('2 recipes')
        page.goto(BASE + '/recipes.html?q=steak&time=30', wait_until='domcontentloaded')
        expect(page.locator('.time-row')).to_be_visible()
        expect(page.locator('[data-filter-time="30"]')).to_have_attribute('aria-pressed', 'true')
        assert page.locator('.book-list li:visible').count() > 0
        times = page.locator('.book-list li:visible a').evaluate_all('(cards) => cards.map(a => Number(a.dataset.time))')
        assert all(0 < t <= 30 for t in times), times
        page.goto(BASE + '/recipes.html?q=zzznomatch&time=bogus', wait_until='domcontentloaded')
        expect(page.locator('.saved-empty')).to_contain_text('No recipes match')
        expect(page.locator('[data-filter-time="any"]')).to_have_attribute('aria-pressed', 'true')
        page.goto(BASE + '/garlic-butter-steak-bites.html', wait_until='domcontentloaded')
        page.locator('[data-action="save"]').click()
        expect(page.locator('[data-action="save"]')).to_have_attribute('aria-pressed', 'true')
        servings = page.locator('[data-servings-value]')
        before = int(servings.inner_text())
        page.locator('[data-servings="1"]').click()
        expect(servings).to_have_text(str(before + 1))
        page.goto(BASE + '/recipes.html#saved', wait_until='domcontentloaded')
        expect(page.locator('[data-filter-cat="saved"]')).to_have_attribute('aria-pressed', 'true')
        expect(page.locator('.book-list li:visible a')).to_have_count(1)
        page.goto(BASE + '/meal-planner.html', wait_until='domcontentloaded')
        page.locator('[data-meal-search]').fill('oxtail')
        page.locator('.meal-pick').first.click()
        expect(page.locator('[data-meal-count]')).to_contain_text('1 of 4', ignore_case=True)
        expect(page.locator('[data-meal-plan]')).not_to_be_empty()
        expect(page.locator('[data-meal-shop]')).to_be_visible()
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('[data-meal-count]')).to_contain_text('1 of 4', ignore_case=True)
        assert not errors, errors
        print(f'PASS {width}px: discovery, URL filters, empty state, saved recipes, servings, planner and persistence')
        context.close()
    browser.close()
