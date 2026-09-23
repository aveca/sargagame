from playwright.sync_api import sync_playwright

vp = {'width': 390, 'height': 844, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True,
    'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}

def log(msg):
    try:
        print(f"[audit] {msg}")
    except UnicodeEncodeError:
        print(f"[audit] {msg.encode('ascii', 'replace').decode()}")

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
    
    # ===== 1. DEFAULT / =====
    log("===== TEST 1: DEFAULT / =====")
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(5000)
    
    log(f"URL: {page.url}")
    
    # Check mapDeclutterOff via DOM
    map_declutter_off = page.evaluate("() => { try { return /[?&]mapdeclutter=0/.test(window.location.search) } catch { return false } }")
    log(f"mapDeclutterOff (from URL): {map_declutter_off}")
    
    # Hero
    hero = page.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix aujourd.hui/i')
    log(f"Hero present: {hero.count() > 0 and hero.first.is_visible()}")
    
    # B2B chip
    b2b = page.locator('button:has-text("Pro")')
    if b2b.count() == 0:
        b2b = page.locator('text=/Vous gérez un h[ôo]tel/i')
    b2b_vis = b2b.count() > 0 and b2b.first.is_visible()
    log(f"B2B present: {b2b_vis}")
    if b2b_vis:
        for i in range(b2b.count()):
            btn = b2b.nth(i)
            try:
                txt = btn.inner_text().strip()
                box = btn.bounding_box()
                log(f"  B2B[{i}]: text='{txt}', box={box}, visible={btn.is_visible()}")
            except:
                pass
    
    # Email sticker
    email = page.locator('[role=region][aria-label*="Capture email"]')
    log(f"Email sticker present: {email.count() > 0 and email.first.is_visible()}")
    
    # Digest
    digest = page.locator('text=/Cette semaine/i')
    log(f"Digest present: {digest.count() > 0 and digest.first.is_visible()}")
    
    # Pins
    pins = page.locator('button[data-beach]')
    log(f"Pins (data-beach): {pins.count()}")
    
    # Labels
    labels = page.locator('.sg-maplabel')
    log(f"Labels (.sg-maplabel): {labels.count()}")
    for i in range(min(labels.count(), 12)):
        l = labels.nth(i)
        try:
            if l.is_visible():
                txt = l.inner_text().strip()[:40]
                log(f"  Label {i} VISIBLE: '{txt}'")
        except:
            pass
    
    # Scrub
    scrub = page.locator('[data-testid*="scrub"]')
    if scrub.count() == 0:
        scrub = page.locator('.scrub')
    if scrub.count() == 0:
        scrub = page.locator('button[aria-label*="jour"]')
    if scrub.count() == 0:
        scrub = page.locator('button[aria-label*="day"]')
    log(f"Scrub present: {scrub.count() > 0 and scrub.first.is_visible()}")
    
    # Search
    search = page.locator('input[type=search]')
    if search.count() == 0:
        search = page.locator('input[placeholder*="Recherche"]')
    if search.count() == 0:
        search = page.locator('input[placeholder*="Search"]')
    log(f"Search present: {search.count() > 0 and search.first.is_visible()}")
    
    # Near me
    near = page.locator('button:has-text("près de moi")')
    if near.count() == 0:
        near = page.locator('text=/pr[eè]s de moi/i')
    log(f"Near me present: {near.count() > 0 and near.first.is_visible()}")
    
    # BottomNav
    nav = page.locator('nav, .sg-bottomnav, [role=navigation]').first
    if nav.count():
        tabs = nav.locator('button, a, [role=tab]')
        log(f"BottomNav tabs: {tabs.count()}")
        for i in range(min(tabs.count(), 5)):
            t = tabs.nth(i)
            try:
                txt = t.inner_text().strip()[:30]
                log(f"  Tab {i}: '{txt}' vis={t.is_visible()}")
            except:
                pass
    
    # Click a label to test pin interaction
    if labels.count() > 0:
        log("Testing pin click...")
        for i in range(min(labels.count(), 3)):
            l = labels.nth(i)
            try:
                if l.is_visible():
                    log(f"  Clicking label {i}...")
                    l.click(timeout=3000)
                    page.wait_for_timeout(2000)
                    dlg = page.get_by_role('dialog').last
                    if dlg.count() and dlg.is_visible():
                        log(f"  Beach sheet opened!")
                        dlg.get_by_role('button', name='Fermer').first.click(timeout=2000)
                        page.wait_for_timeout(1000)
                        break
            except Exception as e:
                log(f"  Click failed: {e}")
    
    context.close()
    
    # ===== 2. ROLLBACK ?mapdeclutter=0 =====
    log("===== TEST 2: ROLLBACK ?mapdeclutter=0 =====")
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/?mapdeclutter=0', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(5000)
    
    log(f"URL: {page.url}")
    
    hero = page.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix aujourd.hui/i')
    log(f"Hero present: {hero.count() > 0 and hero.first.is_visible()}")
    
    b2b = page.locator('button:has-text("Pro")')
    if b2b.count() == 0:
        b2b = page.locator('text=/Vous gérez un h[ôo]tel/i')
    log(f"B2B present: {b2b.count() > 0 and b2b.first.is_visible()}")
    
    scrub = page.locator('[data-testid*="scrub"]')
    if scrub.count() == 0:
        scrub = page.locator('.scrub')
    if scrub.count() == 0:
        scrub = page.locator('button[aria-label*="jour"]')
    if scrub.count() == 0:
        scrub = page.locator('button[aria-label*="day"]')
    log(f"Scrub present: {scrub.count() > 0 and scrub.first.is_visible()}")
    
    pins = page.locator('button[data-beach]')
    log(f"Pins: {pins.count()}")
    
    labels = page.locator('.sg-maplabel')
    log(f"Labels: {labels.count()}")
    
    search = page.locator('input[type=search]')
    if search.count() == 0:
        search = page.locator('input[placeholder*="Recherche"]')
    if search.count() == 0:
        search = page.locator('input[placeholder*="Search"]')
    log(f"Search present: {search.count() > 0 and search.first.is_visible()}")
    
    near = page.locator('button:has-text("près de moi")')
    if near.count() == 0:
        near = page.locator('text=/pr[eè]s de moi/i')
    log(f"Near me present: {near.count() > 0 and near.first.is_visible()}")
    
    context.close()
    
    # ===== 3. HOME XP (Accueil tab) =====
    log("===== TEST 3: HOME XP (Accueil tab) =====")
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(5000)
    
    # Click Accueil tab
    accueil = page.locator('button:has-text("Accueil")')
    if accueil.count() == 0:
        accueil = page.locator('a:has-text("Accueil")')
    if accueil.count() == 0:
        accueil = page.locator('[role=tab]:has-text("Accueil")')
    
    if accueil.count() and accueil.first.is_visible():
        log("Clicking Accueil tab...")
        accueil.first.click()
        page.wait_for_timeout(2000)
    
    home_hero = page.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix/i')
    if home_hero.count() == 0:
        home_hero = page.locator('[data-testid*="home-hero"]')
    log(f"Home hero present: {home_hero.count() > 0 and home_hero.first.is_visible()}")
    
    # Check for beach CTA
    beach_cta = page.locator('button:has-text("Voir")')
    if beach_cta.count() == 0:
        beach_cta = page.locator('[data-testid*="beach"]')
    log(f"Beach CTA present: {beach_cta.count() > 0 and beach_cta.first.is_visible()}")
    
    context.close()
    
    browser.close()
    
print("DONE")