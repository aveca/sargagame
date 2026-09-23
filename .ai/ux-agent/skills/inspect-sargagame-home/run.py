# -*- coding: utf-8 -*-
"""
replay de la skill inspect-sargagame-home (moteur deterministe = Playwright).

    python run.py --out <dossier du run> [--url https://sargasses-martinique.com/]

Produit dans <out>:
  screenshots/<viewport>/01..07.png
  journey.json      (checkpoints booleans par viewport)
  console_log.json  (erreurs console/page collectees)

Observe-only : aucun clic achat, aucune saisie email/carte, aucun submit.
Exit code 0 si tous les checkpoints passent (mobile + desktop), sinon 1.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE_URL_DEFAULT = "https://sargasses-martinique.com/"

VIEWPORTS = {
    "mobile": dict(
        width=390, height=844, device_scale_factor=2, is_mobile=True, has_touch=True,
        user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
                    "Mobile/15E148 Safari/604.1"),
    ),
    "desktop": dict(width=1440, height=900),
}

VERDICT_RE = re.compile(r"(MAINTENANT|FAVORABLE|BAIGNADE|SURVEILLER|\b\d{1,3}/100\b)", re.IGNORECASE)
PRICE_RE = re.compile(r"\d+[,.]\d+\s*€")


def log(msg):
    print(f"[skill] {msg}", flush=True)


def safe_click(page, locator, label, timeout=2500, force=False):
    try:
        locator.first.click(timeout=timeout, force=force)
        return True
    except PWTimeout:
        log(f"    click skip/timeout: {label}")
        return False
    except Exception as exc:  # noqa: BLE001
        log(f"    click err {label}: {str(exc)[:120]}")
        return False


def dismiss_overlays(page):
    """Ferme les couches connues (demo, consent, email capture, assistant)."""
    # Dialog de demo / consent initial
    safe_click(page, page.get_by_role("button", name="Fermer").first, "demo-dialog Fermer")
    safe_click(page, page.get_by_text("Peut-être plus tard", exact=True).first, "consent 'Peut-être plus tard'")
    # Bandeau cookies (apres fermeture de la capture email qui peut le recouvrir)
    email = page.get_by_role("region", name=re.compile("Capture email", re.IGNORECASE))
    if email.count():
        safe_click(page, email.get_by_role("button", name="Fermer").first, "email-capture Fermer")
    safe_click(page, page.get_by_role("button", name="Refuser", exact=True), "cookie Refuser")
    # Assistant flottant
    assistant = page.get_by_role("dialog", name="Assistant")
    if assistant.count():
        safe_click(page, assistant.get_by_role("button", name="Fermer").first, "assistant Fermer")


def select_beach(page):
    strategies = [
        ("data-beach", lambda: page.locator("button[data-beach]")),
        ("list-score-voir", lambda: page.get_by_role("button", name=re.compile(r"^\d+\s+.+\sVoir", re.DOTALL))),
        ("has-text-voir", lambda: page.locator("button:has-text('Voir')")),
    ]
    for name, make in strategies:
        loc = make()
        try:
            count = loc.count()
        except Exception:
            count = 0
        for i in range(min(count, 5)):
            cand = loc.nth(i)
            try:
                if cand.is_visible():
                    label = (cand.inner_text() or "").strip().replace("\n", " ")[:80]
                    safe_click(page, cand, f"beach [{name}] {label}")
                    page.wait_for_timeout(1500)
                    if page.locator("[role=dialog]").count() or page.get_by_role("dialog").count():
                        return label or name
                    break
            except Exception:
                continue
    return None


def read_verdict(page):
    try:
        dlg = page.get_by_role("dialog").last
        text = dlg.inner_text(timeout=4000)
    except Exception:
        text = page.locator("body").inner_text()[:4000]
    for line in text.splitlines():
        if VERDICT_RE.search(line) and len(line.strip()) < 120:
            return line.strip()
    return None


def _topmost_covers(page, dlg):
    """True si l'element le plus haut au centre du dialog appartient bien a ce dialog."""
    try:
        box = dlg.bounding_box()
        if not box:
            return False
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        handled = page.evaluate(
            """([x, y]) => {
              const el = document.elementFromPoint(x, y);
              if (!el) return null;
              const dlg = el.closest('[role="dialog"]');
              return dlg ? (dlg.getAttribute("aria-label") || dlg.textContent.slice(0, 60)) : "__no_dialog_on_top__";
            }""",
            [cx, cy],
        )
        return bool(handled) and re.search("premium", str(handled), re.IGNORECASE) is not None
    except Exception:
        return False


def open_paywall(page):
    cta = page.get_by_role("button", name=re.compile("bloquer les pr", re.IGNORECASE))
    if safe_click(page, cta.first, "CTA 'Débloquer les prévisions'"):
        page.wait_for_timeout(1800)
    try:
        dlg = page.get_by_role("dialog", name=re.compile("premium", re.IGNORECASE)).last
        visible = dlg.is_visible()
    except Exception:
        dlg, visible = None, False
    prices = []
    topmost = False
    if visible:
        try:
            prices = PRICE_RE.findall(dlg.inner_text())
        except Exception:
            prices = []
        topmost = _topmost_covers(page, dlg)
    return visible, prices, topmost


def go_back(page):
    # 1) 'Plus tard' (mobile OK en run1)
    plus_tard = page.get_by_role("button", name="Plus tard")
    if plus_tard.count():
        safe_click(page, plus_tard.first, "premium 'Plus tard'")
        page.wait_for_timeout(800)
    # 2) x Fermer du dialog premium (desktop OK en run1)
    prem = page.get_by_role("dialog", name=re.compile("premium", re.IGNORECASE))
    if prem.count():
        try:
            if prem.last.is_visible():
                safe_click(page, prem.get_by_role("button", name="Fermer").first, "premium x Fermer")
                page.wait_for_timeout(600)
        except Exception:
            pass
    # 3) Escape
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    # 4) fermer la fiche plage restante
    for dlg in page.get_by_role("dialog").all():
        try:
            if dlg.is_visible():
                safe_click(page, dlg.get_by_role("button", name="Fermer").first, "dialog restant Fermer")
        except Exception:
            continue
    page.wait_for_timeout(800)
    try:
        return sum(1 for d in page.get_by_role("dialog").all() if d.is_visible()) == 0
    except Exception:
        return page.get_by_role("dialog").count() == 0


def run_viewport(pw, label, vp_conf, base_url, shots_dir, console_log):
    log(f"== viewport {label} ==")
    browser = pw.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
    context = browser.new_context(viewport={"width": vp_conf["width"], "height": vp_conf["height"]},
                                  **{k: v for k, v in vp_conf.items() if k not in ("width", "height")})
    page = context.new_page()

    errors = []

    def on_console(m):
        if m.type in ("error",):
            errors.append({"type": "console.error", "text": m.text[:300]})

    def on_pageerror(e):
        errors.append({"type": "pageerror", "text": str(e)[:300]})

    def on_response(r):
        if r.status >= 400:
            errors.append({"type": f"http-{r.status}", "text": r.url[:200]})

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)
    page.on("response", on_response)

    shots = shots_dir / label
    shots.mkdir(parents=True, exist_ok=True)

    cp = {}

    # 1. home
    page.goto(base_url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2500)
    title = page.title()
    cp["home"] = "Martinique" in title
    page.screenshot(path=str(shots / "01-home.png"))

    # 2. overlays
    dismiss_overlays(page)
    page.wait_for_timeout(600)
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(600)
    page.mouse.wheel(0, -600)
    cp["explored"] = True
    page.screenshot(path=str(shots / "02-explored.png"))

    # 3. select beach
    beach = select_beach(page)
    cp["beach_selected"] = beach
    page.screenshot(path=str(shots / "03-beach-selected.png"))

    # 4. verdict
    verdict = read_verdict(page) if beach else None
    cp["verdict_text"] = verdict
    page.screenshot(path=str(shots / "04-verdict.png"))

    # 5/6. paywall + premium modal
    modal_ok, prices, topmost = False, [], False
    if beach:
        modal_ok, prices, topmost = open_paywall(page)
    cp["paywall_reached"] = modal_ok
    cp["prices_seen"] = prices
    cp["premium_modal_dom"] = modal_ok and bool(prices)
    # Diagnostic UX separe : modal DANS le DOM ne veut pas dire modal VISIBLE par l'utilisateur.
    # (RUN 2 2026-09-16 : modal premium z-index 1100 SOUS la fiche plage z-index 1200 -> incognito pour l'utilisateur)
    cp["premium_modal_topmost"] = topmost
    cp["premium_modal"] = modal_ok and bool(prices)
    page.screenshot(path=str(shots / "06-premium-modal.png"))

    # 7. back
    cp["returned"] = go_back(page)
    page.screenshot(path=str(shots / "07-back.png"))

    console_log[label] = errors
    log(f"    checkpoints: {json.dumps({k: (v if isinstance(v, bool) else bool(v)) for k, v in cp.items()})}")
    browser.close()
    return cp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--url", default=BASE_URL_DEFAULT)
    args = ap.parse_args()

    out = Path(args.out)
    shots_dir = out / "screenshots"
    shots_dir.mkdir(parents=True, exist_ok=True)

    journey = {"base_url": args.url, "skill": "inspect-sargagame-home@1.0.0", "viewports": {}}
    console_log = {}

    with sync_playwright() as pw:
        for label, conf in VIEWPORTS.items():
            try:
                journey["viewports"][label] = run_viewport(pw, label, conf, args.url, shots_dir, console_log)
            except Exception as exc:  # noqa: BLE001
                journey["viewports"][label] = {"crash": str(exc)[:300]}

    (out / "journey.json").write_text(json.dumps(journey, indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "console_log.json").write_text(json.dumps(console_log, indent=2, ensure_ascii=False), encoding="utf-8")

    ok = True
    ux_blockers = []
    for label, cp in journey["viewports"].items():
        # Parcours (ce que le logiciel fait) — gate du replay
        needed = ["home", "beach_selected", "verdict_text", "paywall_reached", "premium_modal", "returned"]
        for k in needed:
            if not cp.get(k):
                log(f"FAIL {label}.{k} -> {cp.get(k)!r}")
                ok = False
        # Diagnostic UX (ce que l'utilisateur voit) — rapporte, ne casse pas le replay
        if cp.get("paywall_reached") and cp.get("premium_modal") and not cp.get("premium_modal_topmost"):
            ux_blockers.append({"viewport": label, "issue": "premium_modal_occluded_below_beach_sheet"})
            log(f"    UX-BLOCKER {label}: modal premium ouvert mais NON au premier plan (occlus par la fiche plage)")
    journey["ux_blockers"] = ux_blockers
    (out / "journey.json").write_text(json.dumps(journey, indent=2, ensure_ascii=False), encoding="utf-8")
    log("REPLAY " + ("OK" if ok else "FAIL") + (f" | ux_blockers={len(ux_blockers)}" if ux_blockers else ""))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
