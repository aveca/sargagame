# -*- coding: utf-8 -*-
"""K3 Check - email banner trigger and BottomNav"""
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
        page.wait_for_timeout(5000)  # wait longer for email banner
        
        # Check for email banner after delay
        email_banner = page.get_by_role('region', name=re.compile('Capture email', re.IGNORECASE))
        if email_banner.count():
            log(f'  Email capture banner: present, visible={email_banner.first.is_visible()}')
            if email_banner.first.is_visible():
                zb = email_banner.first.evaluate('el => window.getComputedStyle(el).zIndex')
                log(f'    z-index: {zb}')
                # Check close button
                close_btn = email_banner.first.get_by_role('button', name='Fermer')
                log(f'    Close button: count={close_btn.count()}, visible={close_btn.first.is_visible() if close_btn.count() else 0}')
        else:
            log('  Email capture banner: NOT FOUND')
        
        # Check for any LeadCapture component
        lead_capture = page.locator('[data-testid*=lead], .lead-capture, .LeadCapture, [class*="lead"]')
        log(f'  LeadCapture elements: count={lead_capture.count()}')
        
        # Check for BottomNav - try different selectors
        for sel in ['[role=navigation]', 'nav', '.sg-bottomnav', '[data-testid=bottom-nav]', 'footer nav', 'footer']:
            el = page.locator(sel)
            if el.count():
                log(f'  Found nav with "{sel}": count={el.count()}, visible={el.first.is_visible()}')
                # Check children
                children = el.first.locator('button, a, [role=tab]')
                for i in range(min(children.count(), 6)):
                    c = children.nth(i)
                    txt = c.inner_text().strip()[:30]
                    log(f'    Item {i}: "{txt}" visible={c.is_visible()}')
        
        # Check for cookie banner z-index
        cookie_banner = page.locator('[role=dialog][aria-label*="cookie" i], .cookie-banner, #cookie-banner, .sg-cookie').first
        if cookie_banner.count():
            zb = cookie_banner.evaluate('el => window.getComputedStyle(el).zIndex')
            log(f'  Cookie banner z-index: {zb}')
        
        # Check for any overlay z-indexes
        overlays = page.locator('[role=dialog], [role=region], .modal, .overlay, .banner')
        log(f'  All overlays/regions: count={overlays.count()}')
        for i in range(min(overlays.count(), 10)):
            o = overlays.nth(i)
            try:
                if o.is_visible():
                    zb = o.evaluate('el => window.getComputedStyle(el).zIndex')
                    role = o.get_attribute('role')
                    label = o.get_attribute('aria-label') or o.inner_text()[:40]
                    log(f'    Overlay {i}: role={role}, label="{label}", z-index={zb}')
            except:
                pass
        
        # Test: try to trigger email banner by scrolling or waiting
        page.mouse.wheel(0, 2000)
        page.wait_for_timeout(2000)
        email_banner = page.get_by_role('region', name=re.compile('Capture email', re.IGNORECASE))
        if email_banner.count() and email_banner.first.is_visible():
            log(f'  Email banner appeared after scroll!')
            zb = email_banner.first.evaluate('el => window.getComputedStyle(el).zIndex')
            log(f'    z-index: {zb}')
        
        # Check CTA buttons on home
        cta_buttons = page.locator('button:has-text("Voir"), button:has-text("Débloquer"), button:has-text("Pass"), button:has-text("Premium")')
        log(f'  CTA buttons on home: count={cta_buttons.count()}')
        for i in range(min(cta_buttons.count(), 5)):
            b = cta_buttons.nth(i)
            txt = b.inner_text().strip()[:40]
            log(f'    CTA {i}: "{txt}" visible={b.is_visible()}')
        
        browser.close()