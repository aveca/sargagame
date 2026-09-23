# -*- coding: utf-8 -*-
"""K3 Check - A13/J+1 forecast and email banner trigger"""
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
        
        # Open a beach to see the forecast cards
        beach_btns = page.locator('button[data-beach], button:has-text("Voir")')
        for i in range(min(beach_btns.count(), 2)):
            btn = beach_btns.nth(i)
            if btn.is_visible():
                btn.click(timeout=3000)
                page.wait_for_timeout(2000)
                break
        
        # Check the beach detail dialog for forecast cards (fc-day)
        dlg = page.get_by_role('dialog').last
        if dlg.count() and dlg.is_visible():
            log('  Beach dialog open')
            
            # Look for forecast day cards
            fc_days = dlg.locator('[data-testid*="fc-day"], .fc-day, [class*="fc-day"]')
            log(f'  fc-day elements: {fc_days.count()}')
            
            for i in range(min(fc_days.count(), 8)):
                day = fc_days.nth(i)
                try:
                    txt = day.inner_text().strip()[:80]
                    vis = day.is_visible()
                    log(f'    Day {i}: "{txt}" visible={vis}')
                    
                    # Check for lock/cadenas icon
                    lock = day.locator('[data-testid*="lock"], .lock, [class*="lock"], svg[class*="lock"]')
                    if lock.count():
                        log(f'      LOCK found: count={lock.count()}')
                    
                    # Check for "INCLUS" badge
                    inclus = day.locator('text=/INCLUS/i')
                    if inclus.count():
                        log(f'      INCLUS badge: YES')
                        
                except:
                    pass
            
            # Check for J+1 specifically (second day, index 1)
            if fc_days.count() > 1:
                j1 = fc_days.nth(1)
                txt = j1.inner_text().strip()[:100]
                log(f'  J+1 (index 1): "{txt}"')
                # Check if it has a lock
                lock = j1.locator('[data-testid*="lock"], .lock, [class*="lock"]')
                if lock.count():
                    log(f'    J+1 LOCKED (cadenas present)')
                else:
                    log(f'    J+1 UNLOCKED (no cadenas)')
                # Check for INCLUS
                inclus = j1.locator('text=/INCLUS/i')
                if inclus.count():
                    log(f'    J+1 INCLUS badge: YES')
                else:
                    log(f'    J+1 INCLUS badge: NO')
        
        # Close dialog
        for d in page.get_by_role('dialog').all():
            try:
                if d.is_visible():
                    d.get_by_role('button', name='Fermer').first.click(timeout=1000)
            except:
                pass
        
        # Check email banner trigger - try waiting longer and various actions
        log('  Checking email banner trigger...')
        page.wait_for_timeout(10000)  # wait 10s
        
        eb = page.get_by_role('region', name=re.compile('Capture email', re.IGNORECASE))
        if eb.count() and eb.first.is_visible():
            log('  Email banner appeared after 10s wait!')
        else:
            log('  Email banner still not visible after 10s')
        
        # Try clicking around
        page.mouse.click(100, 100)
        page.wait_for_timeout(2000)
        if eb.count() and eb.first.is_visible():
            log('  Email banner appeared after click!')
        
        browser.close()