from playwright.sync_api import sync_playwright
import re
import urllib.request
import json

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
    page.wait_for_timeout(5000)
    
    log('=== K3 AUDIT ===')
    
    # 1. Check scrub elements on home page
    scrub = page.locator('[class*="scrub"]')
    log(f'1. Scrub elements on home: {scrub.count()}')
    
    # 2. Click a beach button
    beach_btns = page.locator('button[data-beach], button:has-text("Voir")')
    log(f'Beach buttons: {beach_btns.count()}')
    
    beach_clicked = False
    for i in range(min(beach_btns.count(), 3)):
        btn = beach_btns.nth(i)
        if btn.is_visible():
            txt = btn.inner_text().strip()[:50]
            log(f'Clicking beach {i}: {txt}')
            btn.click(timeout=3000)
            page.wait_for_timeout(2000)
            beach_clicked = True
            break
    
    if beach_clicked:
        # Check scrub in beach modal
        modal_scrub = page.locator('[class*="scrub"]')
        log(f'2. Scrub in beach modal: {modal_scrub.count()}')
        
        # Check paywall CTA
        cta = page.locator('button:has-text("bloquer les pr")')
        log(f'Paywall CTA: {cta.count()} visible={cta.first.is_visible() if cta.count() else False}')
        
        if cta.count():
            cta.first.click(timeout=3000)
            page.wait_for_timeout(2000)
            
            prem = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
            log(f'Premium modal: {prem.count()} visible={prem.first.is_visible() if prem.count() else False}')
            
            if prem.count():
                modal_scrub2 = prem.locator('[class*="scrub"]')
                log(f'3. Scrub in premium modal: {modal_scrub2.count()}')
        
        # Close beach modal
        for d in page.get_by_role('dialog').all():
            try:
                if d.is_visible():
                    d.get_by_role('button', name='Fermer').first.click(timeout=1000)
            except:
                pass
        page.wait_for_timeout(1000)
    
    # Test rollback ?mapdeclutter=0
    log('=== ROLLBACK TEST ?mapdeclutter=0 ===')
    page2 = page.context.new_page()
    page2.goto('https://sargasses-martinique.com/?mapdeclutter=0', wait_until='domcontentloaded', timeout=30000)
    page2.wait_for_timeout(3000)
    
    hero = page2.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix aujourd.hui/i')
    log(f'Rollback hero visible: {hero.count() > 0 and hero.first.is_visible()}')
    
    # Check Home XP on Accueil tab
    log('=== HOME XP TEST ===')
    page3 = page.context.new_page()
    page3.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=30000)
    page3.wait_for_timeout(3000)
    
    accueil = page3.locator('button:has-text("Accueil")')
    if accueil.count() == 0:
        accueil = page3.locator('a:has-text("Accueil")')
    if accueil.count() == 0:
        accueil = page3.locator('[role=tab]:has-text("Accueil")')
    
    if accueil.count() and accueil.first.is_visible():
        log('Clicking Accueil tab...')
        accueil.first.click()
        page3.wait_for_timeout(2000)
    
    home_hero = page3.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix/i')
    log(f'Home hero "Meilleur choix" visible: {home_hero.count() > 0 and home_hero.first.is_visible()}')
    
    # Check version.json fingerprint
    log('=== FINGERPRINT CHECK ===')
    import urllib.request
    import json
    try:
        req = urllib.request.Request('https://sargasses-martinique.com/version.json', headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            b_field = data.get('b', 'MISSING')
            log(f'version.json b field: {b_field}')
            expected = '513f483c'
            log(f'Expected SHA prefix: {expected}')
            log(f'Match: {b_field == expected}')
    except Exception as e:
        log(f'Fingerprint check failed: {e}')
    
    browser.close()
    log('=== AUDIT COMPLETE ===')