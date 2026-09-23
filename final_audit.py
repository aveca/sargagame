from playwright.sync_api import sync_playwright

vp = {'width': 390, 'height': 844, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True,
    'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}

def log(msg):
    try:
        print(f'[audit] {msg}')
    except UnicodeEncodeError:
        print(f'[audit] {msg.encode("ascii", "replace").decode()}')

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(3000)
    
    # Check 1: Scrub present
    scrub = page.locator('[class*="scrub"]')
    log(f'Scrub elements: {scrub.count()}')
    
    # Check 2: Beach buttons
    beach_btns = page.locator('button[data-beach], button:has-text("Voir")')
    log(f'Beach buttons: {beach_btns.count()}')
    
    # Click a beach
    for i in range(min(beach_btns.count(), 3)):
        btn = beach_btns.nth(i)
        if btn.is_visible():
            btn.click(timeout=3000)
            page.wait_for_timeout(2000)
            break
    
    # Check paywall CTA
    import re
    cta = page.locator('button:has-text("bloquer les pr")')
    log(f'Paywall CTA: {cta.count()}')
    
    # Check premium modal
    if cta.count():
        cta.first.click(timeout=3000)
        page.wait_for_timeout(2000)
        prem = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
        log(f'Premium modal: {prem.count()} visible={prem.first.is_visible() if prem.count() else False}')
        
        # Check scrub in modal
        modal_scrub = prem.locator('[class*="scrub"]')
        log(f'Modal scrub: {modal_scrub.count()}')
        
        # Test rollback ?mapdeclutter=0
        page2 = page.context.new_page()
        page2.goto('https://sargasses-martinique.com/?mapdeclutter=0', wait_until='domcontentloaded', timeout=30000)
        page2.wait_for_timeout(3000)
        hero = page2.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix aujourd.hui/i')
        log(f'Rollback hero: {hero.count() > 0 and hero.first.is_visible()}')
        
        # Check Home XP
        page3 = page.context.new_page()
        page3.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=30000)
        page3.wait_for_timeout(3000)
        accueil = page3.locator('button:has-text("Accueil")')
        if accueil.count() and accueil.first.is_visible():
            accueil.first.click()
            page3.wait_for_timeout(2000)
        home_hero = page3.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix/i')
        log(f'Home hero: {home_hero.count() > 0 and home_hero.first.is_visible()}')
        
        browser.close()
        log('DONE')