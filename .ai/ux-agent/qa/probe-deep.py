# -*- coding: utf-8 -*-
# Probes ciblées post-suite :
#  1) WhatsApp : href + message prérempli (fiche plage ouverte, scroll profond)
#  2) Pay CTA "Payer X €" : joignable par scroll MANUEL du panel ? (user-réel)
#  3) Bannière LeadCapture AU-DESSUS du paywall ? (z + intercept compte en DOM overlay)
import json, re, subprocess, sys, time, urllib.request, urllib.parse
from playwright.sync_api import sync_playwright

proc = subprocess.Popen(["npx.cmd", "vite", "preview", "--port", "8802", "--strictPort"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
out = {}
try:
    for _ in range(60):
        try:
            urllib.request.urlopen("http://localhost:8802/", timeout=1); break
        except Exception: time.sleep(0.5)
    with sync_playwright() as pw:
        page = pw.chromium.launch(headless=True).new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
        page.goto("http://localhost:8802/", wait_until="domcontentloaded")
        page.wait_for_timeout(2500)
        for _ in range(2):
            try: page.get_by_role("button", name="Fermer").first.click(timeout=1000)
            except Exception: break
        em = page.get_by_role("region", name=re.compile("Capture email", re.IGNORECASE))
        if em.count():
            try: em.get_by_role("button", name="Fermer").first.click(timeout=1000)
            except Exception: pass
        try: page.get_by_role("button", name="Refuser", exact=True).first.click(timeout=900)
        except Exception: pass

        # 1) fiche → WhatsApp
        page.get_by_role("button", name=re.compile(r"^\d+\s+.+\sVoir", re.DOTALL)).first.click(timeout=4000)
        page.wait_for_timeout(1400)
        beach = page.locator(".lc-detail h2, .lc-detail-name").first.inner_text()
        page.locator(".lc-detail").first.evaluate("el => el.scrollTo(0, el.scrollHeight)")
        page.wait_for_timeout(900)
        wa = page.locator("a[href*='wa.me']").first
        href = wa.get_attribute("href") if wa.count() else None
        txt = ""
        if href and "text=" in href:
            txt = urllib.parse.unquote(href.split("text=", 1)[1])
        out["whatsapp"] = {"beach": beach, "href": (href or "")[:160], "message": txt}

        # 2) paywall depuis la fiche : scroll MANUEL dans le panel, puis mesure du CTA payer
        page.get_by_role("button", name=re.compile("bloquer les pr", re.IGNORECASE)).first.click(timeout=4500)
        page.wait_for_timeout(1800)
        panel = page.locator(".sg-modal-panel").first
        payer = page.locator("button.sg-paybtn, button:has-text('Payer')").first
        before = panel.evaluate("el => el.scrollTop")
        # scroll manuel (ce qu'un utilisateur ferait)
        panel.evaluate("el => { el.scrollTop = el.scrollHeight }")
        page.wait_for_timeout(600)
        after = panel.evaluate("el => el.scrollTop")
        bb = payer.bounding_box() if payer.count() else None
        click_ok = None
        try:
            payer.click(timeout=4000, trial=True)
            click_ok = True
        except Exception as e:
            click_ok = str(e).splitlines()[0][:120]
        out["pay_cta"] = {"scrollTop_before": after if False else before, "scrollTop_after": after,
                          "scrollable_panel": after > before, "cta_found": bool(bb), "rect": bb,
                          "trial_click": click_ok}

        # 3) bannière vs paywall — forced arrival : scrolls (déclencheur) + présence
        for _ in range(3):
            page.mouse.wheel(0, 1500); page.wait_for_timeout(250)
        page.wait_for_timeout(800)
        banner = page.get_by_role("region", name=re.compile("Capture email", re.IGNORECASE))
        bz = banner.first.evaluate("el => getComputedStyle(el).zIndex") if banner.count() else None
        pz = panel.evaluate("el => getComputedStyle(el).zIndex") if panel.count() else None
        bvis = bool(banner.count() and banner.first.is_visible())
        # si visibles ensemble : la zone du footer modal (bas) est interceptée ?
        intercepts = None
        if bvis and panel.count():
            bb2 = banner.first.bounding_box()
            if bb2:
                intercepts = page.evaluate("""([x,y]) => {
                    const e = document.elementFromPoint(x,y); return e ? e.closest('[role=region]') ? 'banner' : e.tagName : null; }""",
                    [bb2["x"] + bb2["width"]/2, bb2["y"] + 6])
        out["banner_vs_paywall"] = {"banner_visible_with_paywall": bvis, "banner_z": bz, "paywall_z": pz, "banner_top_layer": intercepts}
        page.screenshot(path=".ai/ux-agent/runs/20260917-qa/probe-banner-over-paywall.png")
        print(json.dumps(out, indent=2, ensure_ascii=False))
finally:
    proc.terminate()
