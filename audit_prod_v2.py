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
    
    # ===== 1. DEFAULT / - CORRECT SELECTORS =====
    log("===== TEST 1: DEFAULT / (correct selectors) =====")
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(5000)
    
    log(f"URL: {page.url}")
    
    # Check flag from URL
    map_declutter_off = page.evaluate("() => { try { return /[?&]mapdeclutter=0/.test(window.location.search) } catch { return false } }")
    log(f"mapDeclutterOff (from URL): {map_declutter_off}")
    
    # Check actual DOM for flag variable
    flag_val = page.evaluate("() => { try { return window.mapDeclutterOff } catch { return 'undefined' } }")
    log(f"window.mapDeclutterOff: {flag_val}")
    
    # Hero (should be absent)
    hero = page.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix aujourd.hui/i')
    log(f"Hero present: {hero.count() > 0 and hero.first.is_visible()}")
    
    # B2B - check exact text
    b2b = page.locator('text=/Vous gérez un h[ôo]tel/i')
    log(f"B2B 'Vous gérez un hôtel' present: {b2b.count() > 0 and b2b.first.is_visible()}")
    b2b_pro = page.locator('button:has-text("Pro")')
    log(f"B2B 'Pro' button: {b2b_pro.count() > 0 and b2b_pro.first.is_visible()}")
    
    # Near me chip
    near = page.locator('button:has-text("près de moi")')
    log(f"Near me chip present: {near.count() > 0 and near.first.is_visible()}")
    
    # Email sticker
    email = page.locator('[role=region][aria-label*="Capture email"]')
    log(f"Email sticker present: {email.count() > 0 and email.first.is_visible()}")
    
    # Digest
    digest = page.locator('text=/Cette semaine/i')
    log(f"Digest present: {digest.count() > 0 and digest.first.is_visible()}")
    
    # PINS - CORRECT SELECTOR: svg g[data-beach] or similar
    pins_button = page.locator('button[data-beach]')
    log(f"Pins (button[data-beach]): {pins_button.count()}")
    
    # Check for SVG pins - common pattern: g[data-beach] or [data-beach] on any element
    pins_svg = page.locator('g[data-beach]')
    log(f"Pins (g[data-beach] SVG): {pins_svg.count()}")
    
    pins_any = page.locator('[data-beach]')
    log(f"Pins (any [data-beach]): {pins_any.count()}")
    for i in range(min(pins_any.count(), 5)):
        p = pins_any.nth(i)
        try:
            tag = p.evaluate("el => el.tagName")
            txt = p.inner_text().strip()[:50]
            log(f"  Pin[{i}]: tag={tag}, text='{txt}'")
        except:
            pass
    
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
    
    # Scrub - check actual DOM
    scrub_any = page.locator('[data-testid*="scrub"]')
    log(f"Scrub [data-testid*='scrub']: {scrub_any.count()}")
    scrub_class = page.locator('.scrub')
    log(f"Scrub .scrub: {scrub_class.count()}")
    scrub_btns = page.locator('button[aria-label*="jour"], button[aria-label*="day"]')
    log(f"Scrub buttons (jour/day): {scrub_btns.count()}")
    
    # Check for any element with scrub-related classes
    all_scrub = page.locator('[class*="scrub"]')
    log(f"Any [class*='scrub']: {all_scrub.count()}")
    
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
    
    context.close()
    
    # ===== 2. ROLLBACK ?mapdeclutter=0 =====
    log("===== TEST 2: ROLLBACK ?mapdeclutter=0 =====")
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/?mapdeclutter=0', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(5000)
    
    log(f"URL: {page.url}")
    
    # Check flag
    map_declutter_off = page.evaluate("() => { try { return /[?&]mapdeclutter=0/.test(window.location.search) } catch { return false } }")
    log(f"mapDeclutterOff (from URL): {map_declutter_off}")
    flag_val = page.evaluate("() => { try { return window.mapDeclutterOff } catch { return 'undefined' } }")
    log(f"window.mapDeclutterOff: {flag_val}")
    
    hero = page.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix aujourd.hui/i')
    log(f"Hero present: {hero.count() > 0 and hero.first.is_visible()}")
    
    b2b = page.locator('text=/Vous gérez un h[ôo]tel/i')
    log(f"B2B present: {b2b.count() > 0 and b2b.first.is_visible()}")
    b2b_pro = page.locator('button:has-text("Pro")')
    log(f"B2B 'Pro' present: {b2b_pro.count() > 0 and b2b_pro.first.is_visible()}")
    
    # Check pins
    pins_any = page.locator('[data-beach]')
    log(f"Pins (any [data-beach]): {pins_any.count()}")
    
    # Check labels
    labels = page.locator('.sg-maplabel')
    log(f"Labels: {labels.count()}")
    
    # Check scrub
    all_scrub = page.locator('[class*="scrub"]')
    log(f"Scrub [class*='scrub']: {all_scrub.count()}")
    
    # Check HomeDashboard elements
    home_hero = page.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix aujourd.hui/i')
    log(f"Hero present: {hero.count() > 0 and hero.first.is_visible()}")
    
    context.close()
    
    # ===== 3. HOME XP (Accueil tab) - ExperienceReset =====
    log("===== TEST 3: HOME XP (Accueil tab) - ExperienceReset =====")
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(5000)
    
    # Check if we're on Carte tab by default - need to click Accueil
    # First check current tab
    current = page.locator('[role=tab][aria-selected="true"], nav button[aria-current="page"]')
    if current.count():
        try:
            txt = current.first.inner_text().strip()[:30]
            log(f"Current tab: '{txt}'")
        except:
            pass
    
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
    
    # Now check for HomeDashboard "Meilleur choix"
    home_hero = page.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix/i')
    log(f"Home hero 'Meilleur choix' present: {home_hero.count() > 0 and home_hero.first.is_visible()}")
    
    # Check for HomeDashboard best choice card
    best_card = page.locator('[data-testid*="home-best"], [data-testid*="best-choice"], .home-dashboard .best, text=/Meilleur choix/i')
    log(f"Best choice card: {best_card.count() > 0 and best_card.first.is_visible()}")
    
    # Check for beach CTA in HomeDashboard
    beach_cta = page.locator('button:has-text("Voir")')
    if beach_cta.count() == 0:
        beach_cta = page.locator('[data-testid*="beach"]')
    log(f"Beach CTA present: {beach_cta.count() > 0 and beach_cta.first.is_visible()}")
    
    # Check for ExperienceReset component
    xp_reset = page.locator('[data-testid*="experience-reset"], .ExperienceReset, .home-dashboard, .HomeDashboard')
    log(f"ExperienceReset component: {xp_reset.count() > 0 and xp_reset.first.is_visible()}")
    
    # Check body text for "Meilleur choix"
    body_text = page.locator('body').inner_text()
    has_best = 'meilleur choix' in body_text.lower() or 'meilleur choix' in body_text.lower()
    log(f"Body contains 'meilleur choix': {has_best}")
    
    context.close()
    
    browser.close()
    
print("DONE")