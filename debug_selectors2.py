from playwright.sync_api import sync_playwright

vp = {'width': 390, 'height': 844, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True,
    'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(5000)
    
    # Check data-beach elements structure
    data_beach = page.locator('[data-beach]')
    print(f'[data-beach] elements: {data_beach.count()}')
    for i in range(min(data_beach.count(), 5)):
        el = data_beach.nth(i)
        try:
            tag = el.evaluate('el => el.tagName')
            classes = el.get_attribute('class') or ''
            print(f'  Element {i}: tag={tag}, class="{classes}"')
        except:
            pass
    
    # Check parent of data-beach
    if data_beach.count() > 0:
        parent = data_beach.first.locator('xpath=..')
        print(f'Parent tag: {parent.evaluate("el => el.tagName")}')
        print(f'Parent class: {parent.get_attribute("class") or ""}')
    
    # Check for clickable beach elements
    clickable = page.locator('[data-beach]:visible, [data-beach] button:visible, [data-beach] a:visible')
    print(f'Clickable beach elements: {clickable.count()}')
    
    # Try to click a beach
    if data_beach.count() > 0:
        el = data_beach.first
        try:
            el.click(timeout=3000)
            page.wait_for_timeout(2000)
            print('Clicked first data-beach element')
        except Exception as e:
            print(f'Click failed: {e}')
    
    browser.close()