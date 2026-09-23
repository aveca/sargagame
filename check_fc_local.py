from playwright.sync_api import sync_playwright

vp = {'width': 390, 'height': 844, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True,
    'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    # Test local build
    page.goto('http://localhost:8799/', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(5000)
    
    beach_btns = page.locator('button[data-beach], button:has-text("Voir")')
    print('Beach buttons:', beach_btns.count())
    for i in range(min(beach_btns.count(), 1)):
        btn = beach_btns.nth(i)
        if btn.is_visible():
            btn.click(timeout=3000)
            page.wait_for_timeout(2000)
            break
    
    dlg = page.get_by_role('dialog').last
    if dlg.count() and dlg.is_visible():
        print('Dialog open')
        fc_days = dlg.locator('[data-testid*="fc-day"], .fc-day, [class*="fc-day"], .forecast-card')
        print('fc-day/forecast-card count:', fc_days.count())
        
        for i in range(min(fc_days.count(), 7)):
            day = fc_days.nth(i)
            try:
                txt = day.inner_text().strip()[:80]
                print('  Day', i, ':', txt)
                lock = day.locator('svg rect[x="5"][y="11"]')
                if lock.count():
                    print('    LOCK icon found')
                inclus = day.locator('text=/INCLUS/i')
                if inclus.count():
                    print('    INCLUS:', inclus.first.inner_text().strip())
                else:
                    print('    INCLUS: NO')
            except Exception as e:
                print('  Day', i, 'error:', e)
    
    browser.close()
print('DONE')