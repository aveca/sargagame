# -*- coding: utf-8 -*-
"""K3 Deep UX Check - additional surfaces beyond the skill"""
import re
from playwright.sync_api import sync_playwright

VIEWPORTS = {
    'mobile': dict(width=390, height=844, device_scale_factor=2, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'),
    'desktop': dict(width=1440, height=900),
}

BASE_URL = 'https://sargasses-martinique.com/'

def log(msg):
    print(f'[check] {msg}', flush=True)

def safe_click(page, locator, label, timeout=2000):
    try:
        locator.first.click(timeout=timeout)
        return True
    except Exception as e:
        log(f'    click skip/err {label}: {str(e)[:100]}')
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
        
        # 1. Bottom navigation
        bottomnav = page.locator('[role=navigation], nav.bottom, .sg-bottomnav, [data-testid=bottom-nav]').first
        if bottomnav.count():
            log(f'  BottomNav: present, visible={bottomnav.is_visible()}')
            tabs = page.locator('[role=navigation] button, .sg-bottomnav button, nav button')
            for i in range(min(tabs.count(), 5)):
                tab = tabs.nth(i)
                txt = tab.inner_text().strip()[:30]
                log(f'    Tab {i}: "{txt}" visible={tab.is_visible()}')
        else:
            log('  BottomNav: NOT FOUND')
        
        # 2. Email capture banner
        email_banner = page.get_by_role('region', name=re.compile('Capture email', re.IGNORECASE))
        if email_banner.count():
            log(f'  Email capture banner: present, visible={email_banner.first.is_visible()}')
            zb = email_banner.first.evaluate('el => window.getComputedStyle(el).zIndex')
            log(f'    z-index: {zb}')
        else:
            log('  Email capture banner: NOT FOUND')
        
        # 3. Cookie banner + Refuser button
        cookie_btn = page.get_by_role('button', name='Refuser', exact=True)
        if cookie_btn.count():
            log(f'  Cookie Refuser button: present, visible={cookie_btn.first.is_visible()}')
        
        # 4. Interaction: cookie Refuser while email banner visible
        if email_banner.count() and email_banner.first.is_visible() and cookie_btn.count():
            log('  Testing: cookie Refuser click while email banner visible...')
            box = cookie_btn.first.bounding_box()
            if box:
                el = page.evaluate(f'document.elementFromPoint({box["x"]+box["width"]/2}, {box["y"]+box["height"]/2})')
                log(f'    elementFromPoint on cookie Refuser: {el}')
        
        # 5. Map labels
        page.mouse.wheel(0, 600)
        page.wait_for_timeout(500)
        labels = page.locator('.sg-maplabel')
        log(f'  Map labels (.sg-maplabel): count={labels.count()}')
        vis_count = 0
        for i in range(min(labels.count(), 12)):
            l = labels.nth(i)
            try:
                vis = l.is_visible()
                if vis:
                    vis_count += 1
                txt = l.inner_text().strip()[:40]
                log(f'    Label {i}: "{txt}" visible={vis}')
            except:
                pass
        log(f'  Visible labels: {vis_count}/{labels.count()}')
        
        # 6. Beach buttons
        beach_btns = page.locator('button[data-beach], button:has-text("Voir")')
        log(f'  Beach buttons: count={beach_btns.count()}')
        
        # 7. Open a beach
        beach_selected = False
        for i in range(min(beach_btns.count(), 5)):
            btn = beach_btns.nth(i)
            if btn.is_visible():
                try:
                    btn.click(timeout=2000)
                    page.wait_for_timeout(1500)
                    if page.get_by_role('dialog').count():
                        beach_selected = True
                        log(f'    Beach opened: {btn.inner_text().strip()[:50]}')
                        break
                except:
                    pass
        
        if beach_selected:
            dlg = page.get_by_role('dialog').last
            try:
                txt = dlg.inner_text(timeout=3000)
                for line in txt.splitlines():
                    if re.search(r'(MAINTENANT|FAVORABLE|BAIGNADE|SURVEILLER|\d{1,3}/100)', line, re.IGNORECASE):
                        log(f'    Verdict: {line.strip()[:80]}')
                        break
            except:
                pass
            
            # CTA to paywall
            cta = page.get_by_role('button', name=re.compile('bloquer les pr', re.IGNORECASE))
            if cta.count():
                log(f'    Paywall CTA: present, visible={cta.first.is_visible()}')
                cta.first.click(timeout=2000)
                page.wait_for_timeout(1500)
                
                # Premium modal
                prem = page.get_by_role('dialog', name=re.compile('premium', re.IGNORECASE)).last
                if prem.count() and prem.is_visible():
                    log(f'    Premium modal: VISIBLE')
                    box = prem.bounding_box()
                    if box:
                        cx, cy = box['x'] + box['width']/2, box['y'] + box['height']/2
                        handled = page.evaluate(f'''
                            (() => {{
                              const el = document.elementFromPoint({cx}, {cy});
                              if (!el) return null;
                              const dlg = el.closest('[role="dialog"]');
                              return dlg ? (dlg.getAttribute("aria-label") || dlg.textContent.slice(0, 60)) : "__no_dialog_on_top__";
                            }})()
                        ''')
                        log(f'      elementFromPoint center: {handled}')
                    
                    prices = re.findall(r'\d+[,.]\d+\s*€', prem.inner_text())
                    log(f'      Prices: {prices}')
                    
                    plus_tard = page.get_by_role('button', name='Plus tard')
                    fermer = prem.get_by_role('button', name='Fermer')
                    log(f'      Plus tard: count={plus_tard.count()}, visible={plus_tard.first.is_visible() if plus_tard.count() else 0}')
                    log(f'      Fermer (x): count={fermer.count()}, visible={fermer.first.is_visible() if fermer.count() else 0}')
                    
                    # Test Plus tard on desktop
                    if label == 'desktop' and plus_tard.count():
                        log('      Testing Plus tard click on desktop...')
                        plus_tard.first.click(timeout=2000)
                        page.wait_for_timeout(800)
                        still_visible = prem.is_visible()
                        log(f'      After Plus tard click, modal still visible: {still_visible}')
                    
                    # Test Fermer (x)
                    if fermer.count():
                        log('      Testing Fermer (x) click...')
                        fermer.first.click(timeout=2000)
                        page.wait_for_timeout(600)
                        still_visible = prem.is_visible()
                        log(f'      After Fermer click, modal still visible: {still_visible}')
                
                # Close any remaining dialogs
                for d in page.get_by_role('dialog').all():
                    try:
                        if d.is_visible():
                            d.get_by_role('button', name='Fermer').first.click(timeout=1000)
                    except:
                        pass
        
        page.wait_for_timeout(500)
        browser.close()