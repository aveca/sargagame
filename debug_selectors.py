from playwright.sync_api import sync_playwright

vp = {'width': 390, 'height': 844, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True,
    'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(5000)
    
    # Find all elements with data-beach
    data_beach = page.locator('[data-beach]')
    print(f'[data-beach] elements: {data_beach.count()}')
    
    # Find buttons with data-beach
    btn_data_beach = page.locator('button[data-beach]')
    print(f'button[data-beach]: {btn_data_beach.count()}')
    
    # Find Voir buttons
    voir = page.locator('button:has-text("Voir")')
    print(f'button:has-text("Voir"): {voir.count()}')
    
    # All buttons
    all_btns = page.locator('button')
    print(f'All buttons: {all_btns.count()}')
    for i in range(min(all_btns.count(), 30)):
        btn = all_btns.nth(i)
        try:
            txt = btn.inner_text().strip()[:50]
            vis = btn.is_visible()
            print(f'  Button {i}: "{txt}" visible={vis}')
        except:
            pass
    
    browser.close()