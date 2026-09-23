from playwright.sync_api import sync_playwright

vp = {'width': 390, 'height': 844, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True,
    'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']}, **{k: v for k, v in vp.items() if k not in ('width', 'height')})
    page = context.new_page()
    page.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(3000)
    
    # 1. Héros "Où te baigner" / "Meilleur choix"
    hero = page.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix aujourd.hui/i')
    print('1. Héros present:', hero.count() > 0 and hero.first.is_visible())
    
    # 2. Ma Plage inline
    ma_plage = page.locator('[data-testid*="my-beach"]')
    if ma_plage.count() == 0:
        ma_plage = page.locator('text=/Ma Plage.*inline/i')
    print('2. Ma Plage inline present:', ma_plage.count() > 0 and ma_plage.first.is_visible())
    
    # 3. Sticker email
    email_sticker = page.locator('[role=region][aria-label*="Capture email"]')
    print('3. Sticker email present:', email_sticker.count() > 0 and email_sticker.first.is_visible())
    
    # 4. Chip B2B - check if it's in declutter area
    b2b_chip = page.locator('button:has-text("Pro")')
    if b2b_chip.count() == 0:
        b2b_chip = page.locator('text=/Vous gérez un h[ôo]tel/i')
    print('4. Chip B2B present:', b2b_chip.count() > 0 and b2b_chip.first.is_visible())
    
    # 5. Digest Cette semaine
    digest = page.locator('text=/Cette semaine/i')
    if digest.count() == 0:
        digest = page.locator('text=/This week/i')
    if digest.count() == 0:
        digest = page.locator('text=/Esta semana/i')
    print('5. Digest present:', digest.count() > 0 and digest.first.is_visible())
    
    # 6. Pins + Labels
    pins = page.locator('button[data-beach]')
    print('6. Pins:', pins.count())
    labels = page.locator('.sg-maplabel')
    print('   Labels:', labels.count())
    
    # 7. Recherche
    search = page.locator('input[type=search]')
    if search.count() == 0:
        search = page.locator('input[placeholder*="Recherche"]')
    if search.count() == 0:
        search = page.locator('input[placeholder*="Search"]')
    print('7. Recherche present:', search.count() > 0 and search.first.is_visible())
    
    # 8. Scrub
    scrub = page.locator('[data-testid*="scrub"]')
    if scrub.count() == 0:
        scrub = page.locator('.scrub')
    if scrub.count() == 0:
        scrub = page.locator('button[aria-label*="jour"]')
    if scrub.count() == 0:
        scrub = page.locator('button[aria-label*="day"]')
    print('8. Scrub present:', scrub.count() > 0 and scrub.first.is_visible())
    
    # 9. Près de moi
    pres_de_moi = page.locator('button:has-text("près de moi")')
    if pres_de_moi.count() == 0:
        pres_de_moi = page.locator('text=/pr[eè]s de moi/i')
    print('9. Près de moi present:', pres_de_moi.count() > 0 and pres_de_moi.first.is_visible())
    
    # 10. BottomNav
    bottomnav = page.locator('nav, .sg-bottomnav, [role=navigation]').first
    if bottomnav.count():
        tabs = bottomnav.locator('button, a, [role=tab]')
        print('10. BottomNav tabs:', tabs.count())
        for i in range(min(tabs.count(), 5)):
            t = tabs.nth(i)
            try:
                txt = t.inner_text().strip()[:20].encode('ascii', 'replace').decode()
            except:
                txt = 'tab'
            print(f'    Tab {i}: "{txt}" vis={t.is_visible()}')
    
    # 11. ?mapdeclutter=0 rollback
    page2 = context.new_page()
    page2.goto('https://sargasses-martinique.com/?mapdeclutter=0', wait_until='domcontentloaded', timeout=30000)
    page2.wait_for_timeout(3000)
    hero2 = page2.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix aujourd.hui/i')
    print('11. ?mapdeclutter=0 Héros present:', hero2.count() > 0 and hero2.first.is_visible())
    
    # 12. Accueil XP porte décision
    page3 = context.new_page()
    page3.goto('https://sargasses-martinique.com/', wait_until='domcontentloaded', timeout=30000)
    page3.wait_for_timeout(3000)
    accueil = page3.locator('button:has-text("Accueil")')
    if accueil.count() == 0:
        accueil = page3.locator('a:has-text("Accueil")')
    if accueil.count() == 0:
        accueil = page3.locator('[role=tab]:has-text("Accueil")')
    if accueil.count() and accueil.first.is_visible():
        accueil.first.click()
        page3.wait_for_timeout(1500)
    home_hero = page3.locator('text=/O.{0,3}u te baigner/i, text=/Meilleur choix/i')
    if home_hero.count() == 0:
        home_hero = page3.locator('[data-testid*="home-hero"]')
    print('12. Accueil XP porte décision:', home_hero.count() > 0 and home_hero.first.is_visible())
    
    browser.close()
print('DONE')