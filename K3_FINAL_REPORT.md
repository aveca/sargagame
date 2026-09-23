# K3 CONTINUOUS UX AUDIT — FINAL REPORT
**Date**: 2026-09-18  
**Agent**: K3 / Nemotron — Continuous UX Audit (OBSERVE-ONLY)  
**Target**: https://sargasses-martinique.com/ (production)  
**Scope**: Mobile 390×844 (iPhone 12 UA) + Desktop 1440×900  
**Method**: Deterministic Playwright replay of skill `inspect-sargagame-home@1.0.0` + targeted probes

---

## 1. EXECUTIVE SUMMARY

**Overall status**: **GREEN** — Core money-path (carte → fiche → verdict → paywall → checkout) is functional and unblocked on both viewports. The critical blocker **UX-R2-003** (modal premium under beach sheet) is **FIXED** and verified in production. Three historical P1/P2 interaction bugs (UX-M-002, UX-D-002, UX-QA-005/006) are **FIXED**. Visual regressions (UX-VR-001/002/003, F1) are **FIXED** and deployed.

**Remaining items requiring attention**:
- **UX-QA-001 (P1)**: A13 J+1 forecast free — J+1 is unlocked on live variant (BeachSheetComic) but **INCLUS badge missing** (no visual affordance that it's free).
- **UX-QA-002 (P1)**: Email capture banner z-index 1500 vs paywall 1260 / checkout 1300 — banner appears on 10s timer; **interaction with paywall not fully verified**.
- **Cookie banner (z=1025)** vs **Email banner (z=1500)** stacking order — theoretical conflict when both visible.
- **400 /api/mollie.php** and **404 /api/b2b-partners.json** on every page load (known, non-blocking).

**No code changes justified by K3 evidence alone** — all critical path blockers resolved. Next agent scope should target **UX-QA-001 (INCLUS badge)** and **UX-QA-002 (email banner z-index verification under paywall)** as a single focused fix.

---

## 2. ENVIRONMENT / COVERAGE

| Dimension | Detail |
|-----------|--------|
| **Base URL** | https://sargasses-martinique.com/ (production, Martinique region) |
| **Viewports** | Mobile: 390×844, DPR 2, isMobile, hasTouch, UA Safari iOS 17<br>Desktop: 1440×900 |
| **Skill replay** | `.ai/ux-agent/skills/inspect-sargagame-home/run.py` — deterministic Playwright |
| **Runs executed** | 2 (20260918-k3-audit, 20260918-k3-audit2) — both **PASS** |
| **Journey steps** | 1. Home load → 2. Overlay dismiss → 3. Beach select → 4. Verdict read → 5. Paywall CTA → 6. Premium modal (prices only) → 7. Close & return |
| **Checkpoints (per viewport)** | home, explored, beach_selected, verdict_text, paywall_reached, prices_seen, premium_modal_dom, **premium_modal_topmost**, premium_modal, returned |
| **Artifacts** | Screenshots (14), journey.json, console_log.json in `.ai/ux-agent/runs/20260918-k3-audit*` |
| **Console errors** | Mobile/Desktop: 400 `POST /api/mollie.php` (empty body), 404 `GET /api/b2b-partners.json` — expected, non-blocking |

---

## 3. HISTORICAL FINDINGS RECHECKED

| Finding | Original Severity | Description | K3 Status | Evidence |
|---------|------------------|-------------|-----------|----------|
| **UX-M-001** | P1 | Email capture banner covers cookie "Refuser" button | **NOT REPRODUCED** | Email banner triggers on ~10s timer; not present during initial cookie interaction. Cookie Refuser z=1025 works when banner absent. |
| **UX-M-002** | P1 | × Fermer premium modal intercepted by beach sheet SVG wave (mobile) | **FIXED** | `elementFromPoint` on Fermer returns button; click closes modal. Verified mobile. |
| **UX-D-001** | P1 | Email banner covers "◉ Carte" nav (desktop) | **NOT REPRODUCED** | Email banner delayed; nav functional on load. |
| **UX-D-002** | P2 | "Plus tard" inoperant on desktop premium modal | **FIXED** | Click closes modal. Verified desktop. |
| **UX-R2-003** | P0 (blocker) | Premium modal opens UNDER beach sheet (z 1100 < 1200) | **FIXED** | `premium_modal_topmost: true` both viewports. Modal z=1260 > sheet z=1200. `elementFromPoint` center returns "Prévisions premium". |
| **UX-QA-001** | P1 | A13 J+1 locked on live variant (ChasseDetail) | **PARTIAL FIX** | Live variant is **BeachSheetComic** (not ChasseDetail). J+1 (index 1) **unlocked** (no cadenas) but **no INCLUS badge** — user cannot visually distinguish free vs paid. |
| **UX-QA-002** | P1 | Email banner z=1500 above paywall (z=1260) & checkout (z=1300) | **NEEDS VERIFICATION** | Banner appears on 10s timer. Z-index measured at 1500 when visible alone. **Not tested overlapping paywall/checkout**. |
| **UX-QA-003** | P1 | Cookie "Refuser" intercepted by email banner | **NOT REPRODUCED** | Banner delayed; no overlap observed. |
| **UX-QA-004** | P1 | Nav "◉ Carte" intercepted by email banner | **NOT REPRODUCED** | Banner delayed; no overlap observed. |
| **UX-QA-005** | P2 | × premium intercepted by beach sheet | **FIXED** | Same as UX-M-002 — modal topmost. |
| **UX-QA-006** | P2 | "Plus tard" inoperant desktop | **FIXED** | Same as UX-D-002 — works. |
| **UX-VR-001** | P0 visual | XP cards text invisible (CR 1.02 on cream) | **FIXED** (Visual Rescue #688) | `color: INK` applied → CR 19.53. Deployed prod. |
| **UX-VR-002** | P1 visual | `.theme-comic button !important` repaints CTA white + kills active states | **FIXED** (Visual Rescue #688) | XP_ARMOR double-class armor applied. |
| **UX-VR-003** | P2 visual | Sticky CTA cropped ~22px at 390px | **FIXED** (Visual Rescue #688) | Lot 10 app-runtime.css (2 lines ≤480px). |
| **F1** | P1 contrast | Stale badge `#B87A00` CR 3.34 < AA | **FIXED** (F1 scope) | Changed to `#8a5a00` → CR 5.49/5.93 ≥ AA. |

---

## 4. NEW FINDINGS (K3)

| ID | Surface | Device | Severity | Reproduction | Expected | Observed | Evidence | Impact | Reproducibility |
|----|---------|--------|----------|--------------|----------|----------|----------|--------|-----------------|
| **K3-NEW-001** | BeachSheetComic forecast cards | Mobile + Desktop | P2 | Open any beach → view 7-day cards | J+1 shows "INCLUS" badge (visual affordance it's free) | J+1 unlocked (no lock) but **no INCLUS badge** — indistinguishable from paid days | k3_check6.py: `fc-day` index 1 has no lock, no INCLUS text | User doesn't know J+1 is free → misses "aha moment" → lower conversion | 100% (both viewports) |
| **K3-NEW-002** | Email capture banner trigger | Mobile + Desktop | P1 | Wait 10s on home page | Banner appears; z-index documented; doesn't block critical path | Banner appears at ~10s (timer), z=1500. **Interaction with paywall/checkout unverified** | k3_check6.py: banner appears after 10s wait + click | If banner overlaps paywall/checkout during payment → conversion loss | 100% (timer-based) |
| **K3-NEW-003** | Cookie banner z-index | Mobile + Desktop | P3 | Initial page load | Cookie banner accessible | Cookie banner z=1025, Refuser visible. **Lower than email banner (1500)** — theoretical conflict when both visible | k3_check3.py: cookie banner z=1025 | Low — only matters if email banner appears before cookie dismissed | 100% |
| **K3-NEW-004** | 400 /api/mollie.php on load | Mobile + Desktop | P3 | Page load | No error for empty POST | `POST /api/mollie.php` → 400 on every load (empty body) | console_log.json: http-400 on both viewports | Noise in error tracking; not user-facing | 100% |
| **K3-NEW-005** | 404 /api/b2b-partners.json | Mobile + Desktop | P3 | Page load | Endpoint exists or not called | 404 on every load | console_log.json: http-404 on both viewports | B2B partners endpoint not deployed | 100% |

---

## 5. FIXED / OBSOLETE FINDINGS

| Finding | Fixed In | Verification | Rollback Flag |
|---------|----------|--------------|---------------|
| UX-R2-003 | Commit `a1585b563` (panel 1100→1260, backdrops 1005→1250, ComicPaywall 1200→1260) | K3 replay: `premium_modal_topmost=true` mobile+desktop | `revert a1585b563` |
| UX-M-002 | Implicit in UX-R2-003 fix (modal now above sheet) | K3 deep check: Fermer click closes modal, elementFromPoint=button | N/A |
| UX-D-002 | Implicit in UX-R2-003 fix / modal refactor | K3 deep check: Plus tard click closes modal on desktop | N/A |
| UX-QA-005 | Same as UX-M-002 | Verified | N/A |
| UX-QA-006 | Same as UX-D-002 | Verified | N/A |
| UX-VR-001/002/003 | PR #688 (Visual Rescue) | 26/26 xp-visual-rescue tests, prod CR 19.53 | `?newia=0`, `?nosticky=0` |
| F1 Stale Contrast | Branch `agent/ui/f1-stale-contrast` | 6/6 f1-stale-contrast tests, computed CR 5.93 | N/A (single value) |

---

## 6. REMAINING RISKS

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Email banner (z=1500) covers paywall (z=1260) during payment** | Medium (timer-based, appears during long sessions) | High (blocks checkout) | Verify z-stack when banner + paywall co-exist; lower banner z-index or dismiss before paywall |
| **Email banner covers cookie Refuser** | Low (banner delayed, cookie usually dismissed first) | Medium | Ensure cookie banner z > email banner, or dismiss email banner before cookie |
| **J+1 free but no visual affordance (INCLUS badge missing)** | High (100% users see forecast) | Medium (missed "aha moment") | Add INCLUS badge to J+1 in BeachSheetComic (variant live) |
| **400/404 noise in error tracking** | High (every page load) | Low (observability) | Fix mollie.php to not POST on load; deploy b2b-partners.json or remove call |

---

## 7. RECOMMENDED NEXT AGENT SCOPE

**Single priority scope**: **Fix A13 J+1 INCLUS badge (K3-NEW-001 / UX-QA-001 residual) + verify email banner z-index under paywall (K3-NEW-002 / UX-QA-002)**

### Rationale
- Both affect the **money-path** at the critical "aha moment → paywall" transition
- Small, localized changes (CSS/badge + z-index verification)
- High conversion impact per MASTER_AUDIT (A13 = 2-3× conversion lever)
- Can be verified with existing Playwright tests

### Files/Surfaces Likely Concerned
| File | Change |
|------|--------|
| `src/components/BeachSheetComic.jsx` (or `BeachDayReport.jsx` forecast cards) | Add INCLUS badge rendering for `index === 1` (J+1) when `j1_free` flag active |
| `src/app-runtime.css` or component inline style | Verify email banner z-index ≤ 1250 (below paywall 1260, checkout 1300) OR auto-dismiss banner when paywall opens |
| `src/components/LeadCapture.jsx` (email banner) | Add `z-index: 1250` or lower; or listen for paywall open event to hide |

### Non-Regression Tests Required
1. **Playwright**: `tests/e2e/p1-03-week-hub.spec.ts` (covers J+1 free gating) — extend to assert INCLUS badge visible on J+1
2. **Playwright**: `tests/e2e/funnel-payment.spec.ts` — verify email banner doesn't intercept paywall/checkout
3. **Unit**: `scripts/tests/forecast-j1-free.test.cjs` — assert INCLUS badge logic
4. **Smoke**: `ux-smoke.mjs` — 4 tokens must pass
5. **Visual**: Compare J+1 card with/without badge (screenshot diff)

### Rollback
- `?j1_free=0` (existing, disables J+1 free gating)
- `?lead_capture=0` or lower email banner z-index via CSS variable
- Single commit revert for badge addition

---

## 8. EVIDENCE / REPRODUCTION MATRIX

| Check | Mobile | Desktop | Artifact |
|-------|--------|---------|----------|
| Skill replay (7 checkpoints) | ✅ PASS | ✅ PASS | `runs/20260918-k3-audit*/journey.json` |
| Premium modal topmost (UX-R2-003) | ✅ `elementFromPoint` = modal | ✅ `elementFromPoint` = modal | `journey.json: premium_modal_topmost=true` |
| Fermer (x) works | ✅ Closes modal | ✅ Closes modal | `k3_check5.py` |
| Plus tard works | N/A (mobile uses Fermer) | ✅ Closes modal | `k3_check5.py` |
| BottomNav 5 tabs | ✅ Accueil/Plages/Carte/Ma Plage/Premium | ✅ Same | `k3_check2.py` |
| Map labels declutter | 3/10 visible | 5/10 visible | `k3_deep_check.py` |
| J+1 unlocked, no INCLUS | ✅ | ✅ | `k3_check6.py` |
| Email banner appears ~10s | ✅ | ✅ | `k3_check6.py` |
| Cookie banner z=1025 | ✅ | ✅ | `k3_check3.py` |
| Paywall CTA → prices visible | ✅ 14,99€ / 0,50€ / 14,99€ | ✅ Same | `journey.json: prices_seen` |

---

## NEXT AGENT SCOPE

**PRIORITY SCOPE**: **A13 J+1 INCLUS badge + email banner z-index verification**

```markdown
## TASK: A13-INCLUS-BADGE + EMAIL-BANNER-ZINDEX
**Priority**: P1 (conversion-critical)
**Role**: coding-agent
**Branch**: `agent/coding/a13-inclus-badge-email-zindex`

### Acceptance Criteria
1. J+1 (index 1) in BeachSheetComic forecast shows "INCLUS" badge when `j1_free` active
2. Email capture banner z-index ≤ 1250 (below paywall 1260, checkout 1300) OR auto-hides when paywall opens
3. All existing tests pass + new assertions for INCLUS badge
4. Smoke gate (4 tokens) passes
5. Bundle ≤ 210 Ko gzip

### Files to Modify
- `src/components/BeachSheetComic.jsx` — add INCLUS badge for J+1
- `src/components/LeadCapture.jsx` — lower z-index or add paywall-open listener
- `src/app-runtime.css` — z-index adjustment if needed

### Tests to Extend/Add
- `tests/e2e/p1-03-week-hub.spec.ts` — assert INCLUS badge on J+1
- `tests/e2e/funnel-payment.spec.ts` — verify email banner doesn't cover paywall/checkout
- `scripts/tests/forecast-j1-free.test.cjs` — unit test for badge logic

### Rollback
- `?j1_free=0` disables J+1 free
- `?lead_capture=0` disables email banner
- Revert single commit
```

---

**NO OTHER CODE CHANGES JUSTIFIED BY K3 EVIDENCE** — Core funnel unblocked, critical visual regressions fixed, interaction bugs resolved. Remaining items are conversion optimizations, not blockers.