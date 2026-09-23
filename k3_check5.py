# -*- coding: utf-8 -*-
"""K3 Check - detailed debug"""
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

with sync_playwright() as pw:
    for label, vp_conf in VIEWPORTS.items():
        log(f'=== {label} ===')
        browser = pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
        context = browser.new_context(viewport={'width': vp_conf['width'], 'height': vp_conf['height']},
                                      **{k: v for k, v in vp_conf.items() if k not in ('width', 'height')})
        page = context.new_page()
        
        page.goto(BASE_URL, wait_until='domcontentloaded', timeout=45000)
        page.wait_for_timeout(3000)
        
        # Find and click a beach first
        beach_btns = page.locator('button[data-beach], button:has-text("Voir")')
        log(f'  Beach buttons: {beach_btns.count()}')
        
        beach_opened = False
        for i in range(min(beach_btns.count(), 3)):
            btn = beach_btns.nth(i)
            if btn.is_visible():
                txt = btn.inner_text().strip()[:50]
                log(f'    Clicking beach {i}: {txt}')
                btn.click(timeout=3000)
                page.wait_for_timeout(2000)
                if page.get_by_role('dialog').count():
                    beach_opened = True
                    log(f'    Beach dialog opened')
                    break
        
        if beach_opened:
            # Find paywall CTA
            cta = page.get_by_role('button', name=re.compile('bloquer les pr', re.IGNORECASE))
            log(f'  Paywall CTA count: {cta.count()}')
            if cta.count():
                log(f'  Paywall CTA visible: {cta.first.is_visible()}')
                cta.first.click(timeout=3000)
                page.wait_for_timeout(2000)
                
                # Check premium modal
                prem = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
                log(f'  Premium modal count: {prem.count()}')
                if prem.count():
                    log(f'  Premium modal visible: {prem.is_visible()}')
                    if prem.is_visible():
                        # Test Fermer (x)
                        fermer = prem.get_by_role('button', name='Fermer')
                        log(f'  Fermer (x) count: {fermer.count()}, visible: {fermer.first.is_visible() if fermer.count() else "N/A"}')
                        if fermer.count():
                            box = fermer.first.bounding_box()
                            if box:
                                el = page.evaluate(f'document.elementFromPoint({box["x"]+box["width"]/2}, {box["y"]+box["height"]/2})')
                                log(f'  elementFromPoint on Fermer: {str(el)[:100]}')
                            fermer.first.click(timeout=3000)
                            page.wait_for_timeout(800)
                            log(f'  After Fermer click, modal visible: {prem.is_visible()}')
                        
                        # Re-open for Plus tard test on desktop
                        if label == 'desktop':
                            cta.first.click(timeout=3000)
                            page.wait_for_timeout(1500)
                            prem2 = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
                            if prem2.count() and prem2.is_visible():
                                plus_tard = prem2.get_by_role('button', name='Plus tard')
                                log(f'  Plus tard count: {plus_tard.count()}, visible: {plus_tard.first.is_visible() if plus_tard.count() else "N/A"}')
                                if plus_tard.count():
                                    plus_tard.first.click(timeout=3000)
                                    page.wait_for_timeout(800)
                                    log(f'  After Plus tard click, modal visible: {prem2.is_visible()}')
        
        browser.close()
        log(f'=== {label} DONE ===')