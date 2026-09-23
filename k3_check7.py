# -*- coding: utf-8 -*-
"""K3 Check - email banner z-index and interactions when visible"""
import re
from playwright.sync_api import sync_playwright

VIEWPORTS = {
    'mobile': dict(width=390, height=844, device_scale_factor=2, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'),
    'desktop': dict(width=1440, height=900),
}

BASE_URL = 'https://sargasses-martinique.com/'

def log(msg):
    try:
        print(f'[check] {msg}', flush=True)
    except UnicodeEncodeError:
        print(f'[check] {msg.encode("ascii", "replace").decode()}', flush=True)

with sync_playwright() as pw:
    for label, vp_conf in VIEWPORTS.items():
        log(f'=== {label} ===')
        browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
        context = browser.new_context(viewport={'width': vp_conf['width'], 'height': vp_conf['height']},
                                      **{k: v for k, v in vp_conf.items() if k not in ('width', 'height')})
        page = context.new_page()
        
        page.goto(BASE_URL, wait_until='domcontentloaded', timeout=45000)
        page.wait_for_timeout(12000)  # wait for email banner
        
        # Check email banner
        eb = page.get_by_role('region', name=re.compile('Capture email', re.IGNORECASE))
        if eb.count() and eb.first.is_visible():
            log('  Email banner: VISIBLE')
            zb = eb.first.evaluate('el => window.getComputedStyle(el).zIndex')
            log(f'  Email banner z-index: {zb}')
            
            # Check close button
            close_btn = eb.first.get_by_role('button', name='Fermer')
            log(f'  Email banner close btn: count={close_btn.count()}, visible={close_btn.first.is_visible() if close_btn.count() else 0}')
            
            # Check cookie Refuser button
            cookie_refuser = page.get_by_role('button', name='Refuser', exact=True)
            if cookie_refuser.count():
                log(f'  Cookie Refuser: visible={cookie_refuser.first.is_visible()}')
                box = cookie_refuser.first.bounding_box()
                if box:
                    el = page.evaluate(f'document.elementFromPoint({box["x"]+box["width"]/2}, {box["y"]+box["height"]/2})')
                    log(f'  elementFromPoint on Cookie Refuser: {str(el)[:100]}')
            
            # Check BottomNav tabs (specifically "Carte" tab)
            nav = page.locator('nav').first
            carte_tab = nav.locator('button, a, [role=tab]').filter(has_text='Carte')
            if carte_tab.count():
                log(f'  Carte tab: count={carte_tab.count()}, visible={carte_tab.first.is_visible()}')
                box = carte_tab.first.bounding_box()
                if box:
                    el = page.evaluate(f'document.elementFromPoint({box["x"]+box["width"]/2}, {box["y"]+box["height"]/2})')
                    log(f'  elementFromPoint on Carte tab: {str(el)[:100]}')
            
            # Check Premium tab
            premium_tab = nav.locator('button, a, [role=tab]').filter(has_text='Premium')
            if premium_tab.count():
                log(f'  Premium tab: count={premium_tab.count()}, visible={premium_tab.first.is_visible()}')
                box = premium_tab.first.bounding_box()
                if box:
                    el = page.evaluate(f'document.elementFromPoint({box["x"]+box["width"]/2}, {box["y"]+box["height"]/2})')
                    log(f'  elementFromPoint on Premium tab: {str(el)[:100]}')
            
            # Now test: open beach -> paywall -> see if email banner covers it
            beach_btns = page.locator('button[data-beach], button:has-text("Voir")')
            for i in range(min(beach_btns.count(), 1)):
                btn = beach_btns.nth(i)
                if btn.is_visible():
                    btn.click(timeout=3000)
                    page.wait_for_timeout(2000)
                    break
            
            dlg = page.get_by_role('dialog').last
            if dlg.count() and dlg.is_visible():
                log('  Beach dialog open with email banner visible')
                
                # Click paywall CTA
                cta = page.get_by_role('button', name=re.compile('bloquer les pr', re.IGNORECASE))
                if cta.count():
                    cta.first.click(timeout=3000)
                    page.wait_for_timeout(1500)
                    
                    prem = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
                    if prem.count() and prem.is_visible():
                        log('  Premium modal open with email banner visible')
                        # Check z-index of premium modal
                        zb = prem.evaluate('el => window.getComputedStyle(el).zIndex')
                        log(f'  Premium modal z-index: {zb}')
                        
                        # Check elementFromPoint on modal center
                        box = prem.bounding_box()
                        if box:
                            cx, cy = box['x'] + box['width']/2, box['y'] + box['height']/2
                            el = page.evaluate(f'document.elementFromPoint({cx}, {cy})')
                            log(f'  elementFromPoint on modal center: {str(el)[:100]}')
        
        browser.close()