## Problem
Push notification primer (top), SargaChat (bottom-right), and cookie consent banner (bottom) could all appear simultaneously, creating visual clutter and poor UX on first visit.

## Fix
- SargaChat FAB + component: now guarded by `cookieConsent !== null` — won't render until user has made cookie choice
- PushPrimer: same guard — won't appear before cookie consent is resolved
- Cookie consent remains the first interaction; push/chat prompts wait their turn

## Gate de ship
- npm run build → exit 0
- check-bundle-budget → 182.5 Ko ≤ 210 Ko
- ux-smoke → FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[]
