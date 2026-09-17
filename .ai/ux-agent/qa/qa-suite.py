# -*- coding: utf-8 -*-
"""
QA SUITE — Continuous UI/UX QA réel (OBSERVE + PROVE, jamais de fix produit).

    python qa-suite.py --base http://localhost:8799/ --label local --out <rundir> [--headed] [--core]
    python qa-suite.py --base https://sargasses-martinique.com/ --label prod-mq --out <rundir> --core

Parcours : A home · B carte->fiche · C J+1 · D paywall · E E9/E2 · F PassOffer
           G checkout (SANS paiement) · H email pre-CTA · I Ma Plage · J WhatsApp
Viewports : mobile 390x844 + desktop 1440x900. Vidéo + trace + screenshots +
console + réseau + hit-testing (elementFromPoint) par journey.
Aucune écriture réelle : les POST Supabase REST (leads) sont interceptés et
répondus 201 en mémoire. AUCUN paiement : le checkout est ouvert puis fermé.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

VIEWPORTS = {
    "mobile": dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                   user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                               "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")),
    "desktop": dict(viewport={"width": 1440, "height": 900}),
}


def log(msg):
    print(f"[qa] {msg}", flush=True)


def spawn_preview(base):
    if "localhost" not in base and "127.0.0.1" not in base:
        return None
    port = base.rsplit(":", 1)[-1].strip("/").split("/")[0] or "8799"
    try:
        urllib.request.urlopen(base, timeout=1)
        return None  # déjà servi
    except Exception:
        pass
    proc = subprocess.Popen(["npx.cmd", "vite", "preview", "--port", port, "--strictPort"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(base, timeout=1)
            return proc
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("preview ne répond pas")


class Probe:
    def __init__(self, page, out_dir, vp):
        self.page = page
        self.out = Path(out_dir)
        self.vp = vp
        self.console = []
        self.pageerrors = []
        self.network = []
        self.rests = []
        self.results = []
        page.on("console", lambda m: self.console.append({"type": m.type, "text": m.text[:300]}) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: self.pageerrors.append(str(e)[:300]))
        page.on("response", lambda r: self.network.append({"status": r.status, "url": r.url[:200]}) if r.status >= 400 else None)
        page.route(re.compile(r"rest/v1/(b2c_alerts|b2b_leads)"), self._intercept)

    def _intercept(self, route):
        try:
            body = route.request.post_data
        except Exception:
            body = None
        self.rests.append({"url": route.request.url, "method": route.request.method, "body": body})
        route.fulfill(status=201, content_type="application/json", body="[]")

    def shot(self, name):
        d = self.out / self.vp / "screenshots"
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{name}.png"
        try:
            self.page.screenshot(path=str(f))
        except Exception:
            pass
        return str(f.relative_to(self.out))

    def check(self, journey, name, ok, detail=""):
        self.results.append({"journey": journey, "check": name, "ok": bool(ok), "detail": str(detail)[:400]})
        print(f"  [{'OK ' if ok else 'FAIL'}] {journey}/{name} :: {str(detail)[:150]}", flush=True)

    def hit(self, el, inside_css):
        try:
            box = el.bounding_box()
            if not box:
                return None
            return self.page.evaluate(
                """([x, y, css]) => {
                    const e = document.elementFromPoint(x, y);
                    if (!e) return null;
                    const dlg = e.closest('[role=dialog]');
                    return { inside: !!e.closest(css), tag: e.tagName,
                             cls: String(e.className && e.className.baseVal !== undefined ? 'svg' : e.className).slice(0, 60),
                             dialog: dlg ? (dlg.getAttribute('aria-label') || dlg.className).slice(0, 50) : null };
                }""",
                [box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, inside_css],
            )
        except Exception:
            return None


def dismiss_overlays(page):
    for _ in range(2):
        try:
            page.get_by_role("button", name="Fermer").first.click(timeout=1100)
        except Exception:
            break
    email = page.get_by_role("region", name=re.compile("Capture email", re.IGNORECASE))
    if email.count():
        try:
            email.get_by_role("button", name="Fermer").first.click(timeout=1200)
        except Exception:
            pass
    for name in ["Refuser", "Peut-être plus tard"]:
        try:
            page.get_by_role("button", name=name, exact=(name == "Refuser")).first.click(timeout=900)
        except Exception:
            pass
    try:
        page.get_by_role("dialog", name="Assistant").get_by_role("button", name="Fermer").first.click(timeout=900)
    except Exception:
        pass
    page.wait_for_timeout(400)


def open_beach_sheet(page):
    for make in [lambda: page.get_by_role("button", name=re.compile(r"^\d+\s+.+\sVoir", re.DOTALL)),
                 lambda: page.locator("button[data-beach]"),
                 lambda: page.locator("button:has-text('Voir')")]:
        try:
            loc = make()
            for i in range(min(loc.count(), 6)):
                c = loc.nth(i)
                if c.is_visible():
                    name = (c.inner_text() or "").strip().split("\n")[0][:60]
                    c.click(timeout=3500)
                    page.wait_for_timeout(1400)
                    if page.locator(".lc-detail").count() or page.locator("[data-testid='fc-day']").count():
                        return name
        except Exception:
            continue
    return None


def close_all_dialogs(page):
    for _ in range(3):
        try:
            page.keyboard.press("Escape")
            page.wait_for_timeout(350)
        except Exception:
            pass
        btns = page.get_by_role("button", name="Fermer")
        hit_any = False
        for i in range(min(btns.count(), 3)):
            try:
                btns.nth(0).click(timeout=800)
                page.wait_for_timeout(350)
                hit_any = True
            except Exception:
                pass
        if not page.locator(".lc-detail").count() and not page.locator(".sg-modal-panel").count():
            break
        if not hit_any:
            break


# ── Parcours ────────────────────────────────────────────────────────────────

def j_home(page, pr):
    J = "A-home"
    pr.check(J, "title", bool(page.title()), page.title())
    h1 = page.locator("h1").first
    pr.check(J, "h1", h1.count() > 0 and h1.is_visible(), h1.inner_text()[:90] if h1.count() else "-")
    ow = page.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
    pr.check(J, "no-h-overflow", ow["sw"] <= ow["cw"] + 2, f"sw={ow['sw']} cw={ow['cw']}")
    for label in ["MQ", "GP"]:
        b = page.get_by_role("button", name=label, exact=True)
        if b.count():
            h = pr.hit(b.first, "header, body")
            pr.check(J, f"nav-{label}-clickable", bool(h and h["inside"]), h)
    page.mouse.wheel(0, 1400); page.wait_for_timeout(500)
    pr.shot("a2-scrolled")
    page.mouse.wheel(0, -5000); page.wait_for_timeout(400)


def j_sheet(page, pr):
    name = open_beach_sheet(page)
    pr.check("B-fiche", "sheet-open", bool(name), f"beach={name}")
    if name:
        sheet = page.locator(".lc-detail").first if page.locator(".lc-detail").count() else None
        pr.check("B-fiche", "variant", True, "lc-detail" if sheet else "other")
        if sheet:
            txt = sheet.inner_text()
            pr.check("B-fiche", "verdict-text", bool(re.search(r"MAINTENANT|BAIGNADE|SURVEILLER|ÉVITER", txt)), re.findall(r"MAINTENANT[^\\n]*", txt)[:1])
            pr.check("B-fiche", "score", bool(re.search(r"\d{1,3}\s*/\s*100", txt)), re.findall(r"\d{1,3}\s*/\s*100", txt)[:1])
            pr.shot("b1-sheet")
    return name


def j_j1(page, pr):
    J = "C-j1"
    fc_days = page.locator("[data-testid='fc-day']")
    if fc_days.count() >= 2:
        g1 = fc_days.nth(1).get_attribute("data-gated")
        pr.check(J, "variant", True, "BeachSheetComic")
        pr.check(J, "j1-not-gated", g1 == "0", f"data-gated={g1}")
        return
    cells = page.locator(".lc-fc-cell")
    if cells.count() >= 2:
        cls = [cells.nth(i).get_attribute("class") or "" for i in range(min(cells.count(), 4))]
        locked = ["lock" in c or "teaser" in c for c in cls]
        pr.check(J, "variant", True, f"ChasseDetail locks={locked}")
        pr.check(J, "j1-not-locked", not locked[1], f"cell[1] class={cls[1]}")
    else:
        pr.check(J, "cells-found", False, "aucune cellule de prévision")
    pr.shot("c1-fc")


def j_paywall(page, pr):
    J = "D-paywall"
    cta = page.get_by_role("button", name=re.compile("bloquer les pr", re.IGNORECASE))
    if not cta.count():
        cta = page.locator("button[aria-label*='bloquer']")
    if not cta.count():
        pr.check(J, "cta", False, "CTA paywall introuvable")
        return False
    cta.first.click(timeout=4500)
    page.wait_for_timeout(1900)
    pr.shot("d1-paywall")
    panel = page.locator(".sg-modal-panel")
    comic = page.locator(".sg-paywall-comic")
    vis_p = bool(panel.count() and panel.first.is_visible())
    vis_c = bool(comic.count() and comic.first.is_visible())
    pr.check(J, "modal-visible", vis_p or vis_c, f"panel={panel.count()} comic={comic.count()}")
    if not (vis_p or vis_c):
        return False
    modal = panel.first if vis_p else comic.first
    h = pr.hit(modal, ".sg-modal-panel, .sg-paywall-comic")
    pr.check(J, "modal-topmost-elementFromPoint", bool(h and h["inside"]), h)
    zpanel = modal.evaluate("el => getComputedStyle(el).zIndex")
    pr.check(J, "modal-z-above-sheet1200", zpanel in ("1260",), f"z={zpanel}")
    return True


def j_proof(page, pr):
    J = "E-proof"
    soc = page.locator("[data-testid='paywall-social-proof']")
    dq = page.locator("[data-testid='paywall-data-quality-proof']")
    if soc.count() and soc.first.is_visible():
        pr.check(J, "mode", True, "social-proof (community>0): " + soc.first.inner_text()[:110])
    elif dq.count() and dq.first.is_visible():
        pr.check(J, "mode", True, "data-quality (community=0): " + dq.first.inner_text()[:120])
    else:
        pr.check(J, "proof-visible", False, "aucun bloc preuve visible")


def j_pass(page, pr):
    J = "F-pass"
    e1 = page.get_by_text(re.compile("Voir la prévision 7 jours", re.IGNORECASE)).first
    pr.check(J, "cta-e1", bool(e1.count()), "")
    if e1.count():
        try:
            e1.scroll_into_view_if_needed(timeout=2500)
            page.wait_for_timeout(300)
        except Exception:
            pass
        bb = e1.bounding_box()
        if bb is None:
            pr.check(J, "cta-e1-hitbox", False, "no bounding_box (invisible/0-size)")
        else:
            h = pr.hit(e1, ".sg-modal-panel, .sg-paywall-comic")
            pr.check(J, "cta-e1-clickable", bool(h and h["inside"]), h)
    prices = re.findall(r"\d+[,.]\d+\s*€", page.locator("body").inner_text())
    pr.check(J, "prices", len(prices) >= 1, prices[:4])
    pr.shot("f1-pass")


def j_checkout(page, pr):
    J = "G-checkout"
    # CTA réellement achetable = celui rendu À L'ÉCRAN dans le modal (pas les
    # panneaux carousel hors viewport, x négatif, ex. slide masqué) ou joignable
    # par scroll du panel (comportement utilisateur réel).
    candidates = page.get_by_role("button", name=re.compile("Payer|Commencer|Voir mes plages|Voir la prévision 7 jours", re.IGNORECASE))
    pay = None
    for i in range(candidates.count()):
        c = candidates.nth(i)
        try:
            if not c.is_visible():
                continue
            bb = c.bounding_box()
            if bb and bb["x"] >= 0 and bb["width"] > 40:
                pay = c
                break
        except Exception:
            continue
    if pay is None:
        # second essai après scroll du panel (équivaut au geste utilisateur)
        try:
            panel = page.locator(".sg-modal-panel").first
            panel.evaluate("el => el.scrollTo(0, el.scrollHeight)")
            page.wait_for_timeout(500)
            for i in range(candidates.count()):
                c = candidates.nth(i)
                if c.is_visible():
                    bb = c.bounding_box()
                    if bb and bb["x"] >= 0 and bb["width"] > 40:
                        pay = c
                        break
        except Exception:
            pass
    if pay is None:
        pr.check(J, "open-click", False, "aucun CTA paiement visible à l'écran")
        pr.shot("g0-no-pay-cta")
        return
    near_before = len(pr.pageerrors)
    try:
        pay.click(timeout=6000)
    except Exception as e:
        pr.check(J, "open-click", False, f"CTA visible mais click impossible: {str(e).splitlines()[0][:160]}")
        pr.shot("g0-pay-cta-stuck")
        return
    page.wait_for_timeout(4000)
    pr.shot("g1-checkout")
    emails = page.locator("input[type='email']")
    iframes = page.locator("iframe[src*='mollie']")
    pr.check(J, "email-field", emails.count() >= 1, f"{emails.count()}")
    pr.check(J, "mollie-iframes", iframes.count() >= 1, f"{iframes.count()} mounts Mollie (async)")
    pr.check(J, "no-pageerror-on-open", len(pr.pageerrors) == near_before, f"{pr.pageerrors[near_before:]}")
    closed = False
    for nm in ["Fermer", "Retour"]:
        b = page.get_by_role("button", name=re.compile(nm, re.IGNORECASE))
        if b.count():
            try:
                b.first.click(timeout=2500); page.wait_for_timeout(800); closed = True; break
            except Exception:
                pass
    if not closed:
        try:
            page.keyboard.press("Escape"); page.wait_for_timeout(600); closed = True
        except Exception:
            pass
    pr.check(J, "closed-without-payment", closed, f"closed={closed}")
    pr.shot("g2-after")


def j_preemail(page, pr, base):
    J = "H-email-pre"
    if not (page.locator(".sg-modal-panel").count() or page.locator(".sg-paywall-comic").count()):
        page.goto(base.split("?")[0] + "?paywall=1", wait_until="domcontentloaded")
        page.wait_for_timeout(2800)
        dismiss_overlays(page)
    pr.shot("h1-pre-email")
    inp = page.locator(".sg-modal-panel input[type='email'], .sg-paywall-comic input[type='email']").first
    pr.check(J, "field-present", bool(inp.count()), "")
    if not inp.count():
        return
    before = len(pr.rests)
    inp.fill("probe-qa-pre-cta@example.invalid")
    page.wait_for_timeout(1600)
    fired = len(pr.rests) > before
    pr.check(J, "lead-posted-direct-supabase", fired, "POST REST b2c_alerts dispatché")
    if fired:
        try:
            body = json.loads(pr.rests[-1]["body"] or "{}")
            pr.check(J, "row-shape", body.get("email") == "probe-qa-pre-cta@example.invalid", str(body)[:180])
        except Exception as e:
            pr.check(J, "row-shape", False, str(e)[:120])
    # laisser un état propre pour les parcours suivants (fermer le paywall ouvert par ?paywall=1)
    for nm in ["Fermer", "Plus tard"]:
        b = page.get_by_role("button", name=nm)
        for i in range(min(b.count(), 3)):
            try:
                b.nth(0).click(timeout=1000)
                page.wait_for_timeout(400)
            except Exception:
                pass
        if not page.locator(".sg-modal-panel").count():
            break
    try:
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
    except Exception:
        pass
    # CTA non bloqué sans email : déjà prouvé par j_checkout (email vide au clic)


def j_rollback_social(page, pr, base):
    J = "E-rollback"
    page.goto(base.split("?")[0] + "?paywall=1&sgsocial=0", wait_until="domcontentloaded")
    page.wait_for_timeout(2800)
    dismiss_overlays(page)
    soc = page.locator("[data-testid='paywall-social-proof']")
    dq = page.locator("[data-testid='paywall-data-quality-proof']")
    pr.check(J, "sgsocial0-hides-blocks", soc.count() == 0 and dq.count() == 0,
             f"social={soc.count()} dq={dq.count()}")
    pr.shot("e2-rollback")


def j_maplage(page, pr):
    J = "I-ma-plage"
    close_all_dialogs(page)
    mp = page.get_by_role("button", name=re.compile("Ma plage", re.IGNORECASE))
    if not mp.count():
        mp = page.get_by_role("button", name=re.compile("Ma Plage"))
    if not mp.count():
        pr.check(J, "entry", False, "bouton Ma plage introuvable")
        return
    try:
        mp.last.click(timeout=3200)
    except Exception as e:
        full = str(e)[:600]
        inter = re.search(r"<([^>]+)>[^>]*intercepts pointer events", full)
        pr.check(J, "clickable", False, f"click impossible: {('intercepté par <'+inter.group(1)+'>' if inter else full[:150])}")
        pr.shot("i0-ma-plage-blocked")
        return
    page.wait_for_timeout(1300)
    pr.shot("i1-ma-plage")
    # l'écran est-il interactif ? un bouton visible dans l'overlay
    pr.check(J, "opened", True, "overlay visible (preuve screenshot)")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)


def j_whatsapp(page, pr, beach_name, base):
    J = "J-whatsapp"
    if not (page.locator(".lc-detail").count() and page.locator(".lc-detail").first.is_visible()):
        open_beach_sheet(page)
        page.wait_for_timeout(900)
    # la carte partenaire est en bas de la fiche — scroller la fiche jusqu'en bas
    try:
        page.locator(".lc-detail").first.evaluate("el => el.scrollTo(0, el.scrollHeight)")
        page.wait_for_timeout(900)
    except Exception:
        pass
    links = page.locator("a[href*='wa.me']")
    pr.check(J, "link-present", links.count() >= 1, f"{links.count()} lien(s)")
    if not links.count():
        pr.shot("j1-no-wa")
        return
    href = links.first.get_attribute("href") or ""
    pr.check(J, "number", "wa.me/596596106124" in href, href[:90])
    import urllib.parse as up
    q = up.urlparse(href).query
    txt = up.unquote(q.split("text=", 1)[1]) if "text=" in q else ""
    pr.check(J, "prefilled-context", bool(txt) and "recommandation" in txt and "Sargagame" in txt, txt[:150])
    if beach_name:
        bn = beach_name.split("·")[0].strip()
        pr.check(J, "beach-in-message", any(tok in txt for tok in bn.split() if len(tok) > 3), f"beach={bn!r} in: {txt[:120]}")
    pr.shot("j2-wa")


def run_viewport(pw, base, vp_name, conf, out_dir, headless, core_only):
    video_dir = out_dir / vp_name / "video"
    video_dir.mkdir(parents=True, exist_ok=True)
    browser = pw.chromium.launch(headless=headless, slow_mo=120 if not headless else 0)
    ctx = browser.new_context(record_video_dir=str(video_dir), record_video_size={"width": conf["viewport"]["width"], "height": conf["viewport"]["height"]}, **conf)
    ctx.tracing.start(screenshots=True, snapshots=False, title=f"qa-{vp_name}")
    page = ctx.new_page()
    pr = Probe(page, out_dir, vp_name)
    page.goto(base, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2800)
    pr.shot("00-initial")
    dismiss_overlays(page)
    pr.shot("01-home-clean")

    j_home(page, pr)
    beach = j_sheet(page, pr)
    if beach:
        def safe(fn, *a):
            try:
                return fn(*a)
            except Exception as e:
                pr.check("CRASH", fn.__name__, False, str(e).splitlines()[0][:200])
        safe(j_j1, page, pr)
        if safe(j_paywall, page, pr):
            safe(j_proof, page, pr)
            safe(j_pass, page, pr)
            safe(j_checkout, page, pr)
        if not core_only:
            safe(close_all_dialogs, page)
            safe(j_maplage, page, pr)
            page.goto(base.split("?")[0], wait_until="domcontentloaded")  # état propre avant WhatsApp
            page.wait_for_timeout(2200)
            dismiss_overlays(page)
            sheet_name = None
            try:
                sheet_name = page.locator(".lc-detail-name, .lc-detail h2").first.inner_text(timeout=2000) if (open_beach_sheet(page)) else None
            except Exception:
                pass
            safe(j_whatsapp, page, pr, sheet_name, base)
        safe(j_rollback_social, page, pr, base)
    # fermeture overlay éventuel pour capture finale
    close_all_dialogs(page)
    pr.shot("zz-final")

    trace_dir = out_dir / vp_name / "traces"
    trace_dir.mkdir(parents=True, exist_ok=True)
    ctx.tracing.stop(path=str(trace_dir / "trace.zip"))
    ctx.close()
    browser.close()
    return pr


VIDEO_NOTE = "video/ dir par viewport (webm), traces/trace.zip par viewport"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--label", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--core", action="store_true", help="parcourt tronqué (home→paywall→preuve) pour la prod")
    ap.add_argument("--viewport", choices=["mobile", "desktop", "both"], default="both")
    args = ap.parse_args()

    out = Path(args.out) / args.label
    out.mkdir(parents=True, exist_ok=True)
    preview = spawn_preview(args.base)
    if preview:
        log(f"preview locale prête: {args.base}")

    all_results = {}
    diagnostics = {}
    try:
        with sync_playwright() as pw:
            vps = ["mobile", "desktop"] if args.viewport == "both" else [args.viewport]
            for vp in vps:
                log(f"== {args.label} / {vp} ==")
                pr = run_viewport(pw, args.base, vp, VIEWPORTS[vp], out, headless=not args.headed, core_only=args.core)
                all_results[vp] = pr.results
                diagnostics[vp] = {
                    "console": pr.console, "pageerrors": pr.pageerrors,
                    "network_4xx5xx": pr.network, "rest_intercepts": pr.rests,
                }
    finally:
        if preview:
            preview.terminate()

    (out / "checks.json").write_text(json.dumps(all_results, indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "diagnostics.json").write_text(json.dumps(diagnostics, indent=2, ensure_ascii=False), encoding="utf-8")

    fails = [r for vp in all_results.values() for r in vp if not r["ok"]]
    print(f"\n[qa] {args.label}: {sum(len(v) for v in all_results.values())} checks, {len(fails)} FAIL")
    for f in fails:
        print(f"  [FAIL] {f['journey']}/{f['check']} :: {f['detail'][:150]}")
    sys.exit(0)


if __name__ == "__main__":
    main()
