=== TOP 10 FIXES (best impact / effort) ===
Based on audit INVENTORY + TOP20 + screenshots 01-13.

1. [P0] Beach data validation — add check in onBeachClick for sargData.stale; show toast with clear message when forecasts unavailable. (File: Sargasses_PROD.jsx, already partially done — stale toast exists but detail content still empty)
2. [P1] Cookie banner — add auto-dismiss for audit; fix z-index/pointer-events conflict with bottom nav. (File: app-runtime.css — z-index fix already done; cookie banner auto-accept needed for real UX)
3. [P0] Beach forecast cards — verify data pipeline returns weekly forecast for selected beach; check sargData?.weekly[beach_id] mapping.
4. [P1] Beach recommendations — verify nearby beach data is loaded and rendered.
5. [P1] Stale data warning in detail — add visible alert/badge inside beach sheet when data is stale.
6. [P2] Complete theme variant testing — run audit for soft/comic/sticker themes.
7. [P2] Deep link verification — test ?brief=1, ?veille=1, ?demo=1 with Playwright.
8. [P2] Loading state audit — verify skeleton → content transition.
9. [P1] Desktop responsive — verify 1280x800 and 1440x900 layouts.
10. [P2] Paywall checkout flow — full E2E test (map → beach → paywall → checkout).
