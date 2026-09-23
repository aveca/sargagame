from playwright.sync_api import sync_playwright

vp = {'width': 390, 'height': 844, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True,
    'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(5000)
    
    # Check for all buttons
    all_btns = page.locator('button')
    with open('audit_results.txt', 'w', encoding='utf-8') as f:
        f.write(f'Total buttons: {all_btns.count()}\n')
        for i in range(min(all_btns.count(), 20)):
            btn = all_btns.nth(i)
            try:
                txt = btn.inner_text().strip()[:50]
                vis = btn.is_visible()
                f.write(f'  Button {i}: "{txt}" visible={vis}\n')
            except:
                pass
    
    # Check for data-beach elements
    beach_any = page.locator('[data-beach]')
    with open('audit_results.txt', 'a', encoding='utf-8') as f:
        f.write(f'data-beach elements: {beach_any.count()}\n')
    
    # Check for Voir
    voir = page.locator('text=/Voir/i')
    with open('audit_results.txt', 'a', encoding='utf-8') as f:
        f.write(f'Voir elements: {voir.count()}\n')
    
    # Check page title
    with open('audit_results.txt', 'a', encoding='utf-8') as f:
        f.write(f'Page title: {page.title()}\n')
    
    browser.close()