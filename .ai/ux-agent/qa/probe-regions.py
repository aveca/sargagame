# -*- coding: utf-8 -*-
# Sweep prod régions : home → fiche → paywall (z/occlusion) + verdict + WhatsApp presence.
# AUCUNE écriture : les POST Supabase REST sont interceptés (201 mémoire).
import json, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

DOMAINS = [
    ("martinique", "https://sargasses-martinique.com/"),
    ("guadeloupe", "https://sargasses-guadeloupe.com/"),
    ("rivieramaya", "https://sargassumcancun.com/"),
    ("tulum", "https://sargazotulum.com/"),
    ("puntacana", "https://sargassumpuntacana.com/"),
    ("miami", "https://sargassummiami.com/"),
]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".ai/ux-agent/runs/20260917-qa/prod-regions")
OUT.mkdir(parents=True, exist_ok=True)


def dismiss(page):
    for _ in range(2):
        try: page.get_by_role("button", name=re.compile("Fermer|Close|Cerrar")).first.click(timeout=1000)
        except Exception: break
    em = page.get_by_role("region", name=re.compile("Capture email", re.IGNORECASE))
    if em.count():
        try: em.get_by_role("button", name=re.compile("Fermer|Close", re.IGNORECASE)).first.click(timeout=1000)
        except Exception: pass
    for nm in ["Refuser", "Refuser", "Decline", "Rechazar", "Peut-être plus tard", "Maybe later"]:
        try: page.get_by_role("button", name=re.compile(re.escape(nm), re.IGNORECASE)).first.click(timeout=800)
        except Exception: pass
    page.wait_for_timeout(300)


def one_domain(pw, name, base):
    ctx = pw.chromium.launch(headless=True).new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    out = {"domain": name, "base": base}
    page.route(re.compile(r"rest/v1/(b2c_alerts|b2b_leads)"), lambda r: r.fulfill(status=201, content_type="application/json", body="[]"))
    errors, net4 = [], []

    def onr(r):
        if r.status >= 400 and "wa.me" not in r.url:
            net4.append(f"{r.status} {r.url[:110]}")
    page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
    page.on("response", onr)
    try:
        r = page.goto(base, wait_until="domcontentloaded", timeout=60000)
        out["http"] = r.status if r else None
        page.wait_for_timeout(2600)
        out["title"] = page.title()
        dismiss(page)
        # fiche
        btn = None
        for mk in [lambda: page.get_by_role("button", name=re.compile(r"^\d+\s+.+\sVoir", re.DOTALL)),
                   lambda: page.locator("button[data-beach]"),
                   lambda: page.locator("button:has-text('Voir')"), lambda: page.locator("button:has-text('See')"), lambda: page.locator("button:has-text('Ver')")]:
            if mk().count():
                btn = mk().first
                break
        out["beach_button_found"] = bool(btn)
        if btn:
            btn.click(timeout=4000)
            page.wait_for_timeout(2200)
            sheet = page.locator(".lc-detail")
            out["sheet_open"] = bool(sheet.count() and sheet.first.is_visible())
            out["sheet_title"] = (page.locator(".lc-detail-name, .lc-detail h2").first.inner_text() if out["sheet_open"] else None)
            # robustesse : la CTA paywall peut tarder (fetchs data)
            cta = None
            for tent in range(4):
                # structure stable, langue-agnostique : la rangée forecast = bouton paywall
                for locor in [page.locator(".lc-detail-fc-row[role=button]"), page.get_by_role("button", name=re.compile("bloqua|unlock", re.IGNORECASE))]:
                    if locor.count():
                        cta = locor.first
                        break
                if cta is not None:
                    break
                page.wait_for_timeout(900)
            out["paywall_cta"] = bool(cta)
            if cta is None:
                out["sheet_text_tail"] = page.locator(".lc-detail").inner_text()[-350:] if out["sheet_open"] else None
            if cta is not None:
                cta.click(timeout=4000)
                page.wait_for_timeout(1600)
                modal = page.locator(".sg-modal-panel").first
                out["modal_visible"] = bool(modal.count() and modal.is_visible())
                if out["modal_visible"]:
                    z = modal.evaluate("el => getComputedStyle(el).zIndex")
                    out["modal_z"] = z
                    out["modal_above_sheet"] = (z == "1260")
                p = re.findall(r"\d+[,.]\d+\s*[€$]", page.locator("body").inner_text())
                out["prices"] = sorted(set(p))[:6]
                page.screenshot(path=str(OUT / f"{name}-paywall.png"))
    except Exception as e:
        out["error"] = str(e)[:200]
    out["console_errors"] = errors[:6]
    out["net_4xx"] = net4[:6]
    page.context.close()
    return out


results = []
with sync_playwright() as pw:
    for nm, base in DOMAINS:
        print(f"== {nm} ==", flush=True)
        results.append(one_domain(pw, nm, base))
        print(json.dumps(results[-1], ensure_ascii=False)[:500], flush=True)

(OUT / "regions.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
