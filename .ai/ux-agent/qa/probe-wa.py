# -*- coding: utf-8 -*-
# Probe: pourquoi 0 lien wa.me dans la fiche plage ?
import re, sys, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright

proc = subprocess.Popen(["npx.cmd", "vite", "preview", "--port", "8801", "--strictPort"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            urllib.request.urlopen("http://localhost:8801/", timeout=1); break
        except Exception: time.sleep(0.5)
    with sync_playwright() as pw:
        page = pw.chromium.launch(headless=True).new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
        page.on("console", lambda m: print("CONSOLE", m.type, m.text[:160]) if m.type == "error" else None)
        page.goto("http://localhost:8801/", wait_until="domcontentloaded")
        page.wait_for_timeout(2500)
        for _ in range(2):
            try: page.get_by_role("button", name="Fermer").first.click(timeout=1000)
            except Exception: break
        email = page.get_by_role("region", name=re.compile("Capture email", re.IGNORECASE))
        if email.count():
            try: email.get_by_role("button", name="Fermer").first.click(timeout=1000)
            except Exception: pass
        try: page.get_by_role("button", name="Refuser", exact=True).first.click(timeout=900)
        except Exception: pass
        # ouvre la fiche
        btn = page.get_by_role("button", name=re.compile(r"^\d+\s+.+\sVoir", re.DOTALL)).first
        btn.click(timeout=4000)
        page.wait_for_timeout(1500)
        # scrolle en bas de la fiche pour forcer render lazy + vérifier
        page.locator(".lc-detail").evaluate("el => el.scrollTo(0, el.scrollHeight)")
        page.wait_for_timeout(1000)
        wa = page.locator("a[href*='wa.me']")
        print("wa links:", wa.count())
        partner_zone = page.locator(".lc-detail").inner_text()
        print("detail contains 'WhatsApp':", "WhatsApp" in partner_zone, "| 'Partenaire':", "Partenaire" in partner_zone, "| 'trajet':", "trajet" in partner_zone)
        tail = partner_zone[-700:]
        print("TAIL OF SHEET >>>", tail.replace("\\n", " | ")[:700])
        # partner module/resolution en erreur ?
        html_snip = page.locator(".lc-detail").inner_html()
        print("html has wa.me:", "wa.me" in html_snip)
finally:
    proc.terminate()
