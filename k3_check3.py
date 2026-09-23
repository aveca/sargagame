# -*- coding: utf-8 -*-
"""K3 Check - email banner trigger, cookie banner, and specific historical findings"""
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
        page.wait_for_timeout(3000)
        
        # 1. Cookie banner - find and check z-index
        cookie_refuser = page.get_by_role('button', name='Refuser', exact=True)
        if cookie_refuser.count():
            log(f'  Cookie Refuser: present, visible={cookie_refuser.first.is_visible()}')
            # Find parent dialog/banner
            parent = cookie_refuser.first.locator('xpath=ancestor::*[contains(@class,"cookie") or contains(@role,"dialog") or contains(@class,"banner")][1]')
            if parent.count():
                zb = parent.first.evaluate('el => window.getComputedStyle(el).zIndex')
                log(f'  Cookie banner z-index: {zb}')
        
        # 2. Check for email banner after various triggers
        def check_email_banner():
            eb = page.get_by_role('region', name=re.compile('Capture email', re.IGNORECASE))
            if eb.count() and eb.first.is_visible():
                zb = eb.first.evaluate('el => window.getComputedStyle(el).zIndex')
                log(f'  Email banner: VISIBLE, z-index={zb}')
                return True
            return False
        
        # Wait and check
        page.wait_for_timeout(5000)
        check_email_banner()
        
        # Scroll down
        page.mouse.wheel(0, 3000)
        page.wait_for_timeout(3000)
        check_email_banner()
        
        # Click on a beach to see if it triggers
        beach_btns = page.locator('button[data-beach], button:has-text("Voir")')
        for i in range(min(beach_btns.count(), 3)):
            btn = beach_btns.nth(i)
            if btn.is_visible():
                btn.click(timeout=2000)
                page.wait_for_timeout(2000)
                if check_email_banner():
                    break
                # Close beach dialog
                for d in page.get_by_role('dialog').all():
                    try:
                        if d.is_visible():
                            d.get_by_role('button', name='Fermer').first.click(timeout=1000)
                    except:
                        pass
                page.wait_for_timeout(500)
        
        # 3. Historical UX-M-002: Fermer (x) premium intercepted by SVG wave
        log('  Testing UX-M-002: Fermer (x) on mobile...')
        # Open paywall
        cta = page.get_by_role('button', name=re.compile('bloquer les pr', re.IGNORECASE))
        if cta.count():
            cta.first.click(timeout=2000)
            page.wait_for_timeout(1500)
            prem = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
            if prem.count() and prem.is_visible():
                fermer = prem.get_by_role('button', name='Fermer')
                if fermer.count():
                    log(f'    Fermer button: visible={fermer.first.is_visible()}')
                    box = fermer.first.bounding_box()
                    if box:
                        el = page.evaluate(f'document.elementFromPoint({box["x"]+box["width"]/2}, {box["y"]+box["height"]/2})')
                        log(f'    elementFromPoint on Fermer: {el}')
                    fermer.first.click(timeout=2000)
                    page.wait_for_timeout(600)
                    log(f'    After click, modal visible: {prem.is_visible()}')
        
        # Close any dialogs
        for d in page.get_by_role('dialog').all():
            try:
                if d.is_visible():
                    d.get_by_role('button', name='Fermer').first.click(timeout=1000)
            except:
                pass
        
        # 4. Historical UX-D-002: Plus tard inoperant on desktop
        if label == 'desktop':
            log('  Testing UX-D-002: Plus tard on desktop...')
            cta = page.get_by_role('button', name=re.compile('bloquer les pr', re.IGNORECASE))
            if cta.count():
                cta.first.click(timeout=2000)
                page.wait_for_timeout(1500)
                prem = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
                if prem.count() and prem.is_visible():
                    plus_tard = page.get_by_role('button', name='Plus tard')
                    if plus_tard.count():
                        log(f'    Plus tard: visible={plus_tard.first.is_visible()}')
                        plus_tard.first.click(timeout=2000)
                        page.wait_for_timeout(800)
                        log(f'    After click, modal visible: {prem.is_visible()}')
        
        browser.close()