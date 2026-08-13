=== SCREEN INVENTORY ===
MAP_DEFAULT: 7 viewports (320x640 → 1440x900) — 53 pins, header badges OK
BEACH_CLICKED: beach selected, header shows name/status/score OK
BEACH_DETAIL: 390x844 + 1440x900 — CONTENT EMPTY (0 chars text), cookie banner visible
PAYWALL: 390x844 + 1440x900 — modal visible, price + CTA present, OK
NAVIGATION: FAILED — cookie banner intercepts bottom nav clicks
THEMES: not reached (script halted at nav phase)
DEEP_LINKS: not reached
LOADING: not captured
DESKTOP_MAP: captured (previous audit run)

=== TOP 20 UI ISSUES ===

P0 (blocks funnel/understanding):
1. BEACH_DETAIL EMPTY — detail sheet opens but forecast/content is 0 chars (BEACH_DETAIL_390x844, BEACH_DETAIL_1440x900). Root: beach data missing/stale. Impact: user sees header ("PLAGE DES SALINES", "À VÉRIFIER", score 60/100) but no 7-day forecast cards or recommendations.
2. COOKIE BANNER blocks BOTTOM NAV — the cookie consent banner overlays navigation buttons, preventing tab switching (NAV_LIST failed, "button 'Accepter' from cookie banner intercepts pointer events"). Impact: user cannot navigate between map/list/premium tabs.

P1 (degrades funnel/conversion):
3. Forecast cards show black/empty rectangles — in BEACH_DETAIL, the 7-day forecast cards appear as empty black bars (visible in screenshot 09).
4. Beach detail content missing — no recommendations ("Plutôt y aller maintenant", nearby beaches), only empty containers.
5. Cookie banner covers bottom content area — takes ~15% of screen height on mobile, obscuring part of beach detail.
6. No error state for stale data — the beach sheet shows "À VÉRIFIER" and a satellite message, but doesn't clearly tell the user that forecasts are unavailable due to stale data (no toast or warning visible in detail view).

P2 (polish/inconsistency):
7. Bottom nav z-index conflict with cookie banner — cookie banner has lower z-index but intercepts clicks anyway (CSS pointer-events issue).
8. Theme variants not fully tested — script halted before theme screenshots.
9. Deep links (brief=1, veille=1, demo=1) not tested — script halted.
10. Responsive at 320x640 has dense layout — bottom nav very compact.

P3 (cosmetic):
11. Some empty card containers visible in beach detail.
12. Font size consistency in score badges ("60/100" vs "INDICE").

=== TOP 10 FIXES (best impact) ===
1. Fix beach data validation — check sargData.stale and show clear message/toast when data is missing (P0)
2. Dismiss cookie banner before navigation tests (P1 — affects UX audit but also real users)
3. Fix cookie banner z-index / pointer-events (P1)
4. Ensure beach forecast cards render when data is available (P0 — content issue)
5. Add stale-data warning in beach detail (not just header) (P1)
6. Test theme variants (soft/comic/sticker) (P2)
7. Test deep links (P2)
8. Verify desktop responsive layout (P2)
9. Check paywall content on mobile (P1 — appears OK from screenshot)
10. Verify loading state and skeleton transition (P2)
