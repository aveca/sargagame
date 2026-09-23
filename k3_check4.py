# -*- coding: utf-8 -*-
"""K3 Check - simplified specific findings"""
import re
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

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

def safe_click(page, locator, label, timeout=2000):
    try:
        locator.first.click(timeout=timeout)
        return True
    except Exception as e:
        log(f'    click err {label}: {str(e)[:80]}')
        return False

with sync_playwright() as pw:
    for label, vp_conf in VIEWPORTS.items():
        log(f'=== {label} ===')
        browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
        context = browser.new_context(viewport={'width': vp_conf['width'], 'height': vp_conf['height']},
                                      **{k: v for k, v in vp_conf.items() if k not in ('width', 'height')})
        page = context.new_page()
        
        page.goto(BASE_URL, wait_until='domcontentloaded', timeout=45000)
        page.wait_for_timeout(3000)
        
        # 1. Cookie banner z-index
        cookie_refuser = page.get_by_role('button', name='Refuser', exact=True)
        if cookie_refuser.count():
            parent = cookie_refuser.first.locator('xpath=ancestor::*[contains(@class,"cookie") or contains(@role,"dialog") or contains(@class,"banner")][1]')
            if parent.count():
                zb = parent.first.evaluate('el => window.getComputedStyle(el).zIndex')
                log(f'  Cookie banner z-index: {zb}')
        
        # 2. Test UX-M-002: Fermer (x) on mobile
        if label == 'mobile':
            log('  Testing UX-M-002: Fermer (x) premium on mobile...')
            cta = page.get_by_role('button', name=re.compile('bloquer les pr', re.IGNORECASE))
            if cta.count():
                safe_click(page, cta, 'paywall CTA')
                page.wait_for_timeout(1500)
                prem = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
                if prem.count() and prem.is_visible():
                    fermer = prem.get_by_role('button', name='Fermer')
                    if fermer.count():
                        log(f'    Fermer visible: {fermer.first.is_visible()}')
                        box = fermer.first.bounding_box()
                        if box:
                            el = page.evaluate(f'document.elementFromPoint({box["x"]+box["width"]/2}, {box["y"]+box["height"]/2})')
                            log(f'    elementFromPoint: {str(el)[:80]}')
                        safe_click(page, fermer, 'Fermer x')
                        page.wait_for_timeout(600)
                        log(f'    Modal closed: {not prem.is_visible()}')
        
        # 3. Test UX-D-002: Plus tard on desktop
        if label == 'desktop':
            log('  Testing UX-D-002: Plus tard on desktop...')
            cta = page.get_by_role('button', name=re.compile('bloquer les pr', re.IGNORECASE))
            if cta.count():
                safe_click(page, cta, 'paywall CTA')
                page.wait_for_timeout(1500)
                prem = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
                if prem.count() and prem.is_visible():
                    plus_tard = page.get_by_role('button', name='Plus tard')
                    if plus_tard.count():
                        log(f'    Plus tard visible: {plus_tard.first.is_visible()}')
                        safe_click(page, plus_tard, 'Plus tard')
                        page.wait_for_timeout(800)
                        log(f'    Modal closed: {not prem.is_visible()}')
        
        browser.close()
        log(f'=== {label} DONE ===')