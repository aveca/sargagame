=== TOP 20 ISSUES (from UI audit) ===
File: UI-AUDIT-2026-08-13

P0 — Blocks funnel/understanding/pay:
1. [MAP → BEACH DETAIL] BEACH_DETAIL content is EMPTY (0 chars) — screenshot 09_BEACH_DETAIL_390x844, 11_BEACH_DETAIL_1440x900. The detail sheet shows header (name/status/score) but no forecast cards or recommendations.
2. [NAVIGATION] Cookie banner blocks bottom nav clicks — script failed at NAV phase with "button 'Accepter' from cookie banner intercepts pointer events". Impact: users cannot switch tabs (map → list → premium).

P1 — Degrades funnel/conversion:
3. [BEACH DETAIL] Forecast cards appear as empty black bars — 7-day forecast containers visible but no content inside.
4. [BEACH DETAIL] Nearby beach recommendations missing — "Plutôt y aller maintenant" section has empty cards.
5. [BEACH DETAIL] No clear stale-data warning — user sees "À VÉRIFIER" header but no explanation that forecasts are unavailable.
6. [COOKIE BANNER] Banner covers 15% of mobile screen, obscuring beach detail content.
7. [PAYWALL — VERIFIED OK] Paywall visible with price + CTA (screenshots 12, 13). No issue found here.

P2 — Polish/inconsistency:
8. [NAVIGATION] Bottom nav z-index conflict — cookie banner (z lower) still intercepts clicks (pointer-events issue).
9. [THEMES] Theme variants not fully audited (script halted before theme screenshots).
10. [DEEP LINKS] Brief/Veilleur/Demo links not tested.
11. [RESPONSIVE] 320x640 layout very dense.
12. [LOADING] Skeleton-to-content transition not fully verified.

P3 — Cosmetic/minor:
13-20. Font consistency, spacing adjustments, reduced-motion verification pending.
