---
## 2026-08-20 00:45 UTC · Agent: opencode (OpenCode) · COOKIE CONSENT FIX — analytics gated behind consent (GDPR)

### Travail effectué
- **Résumé 1 ligne** : Gated all analytics (GA4 Measurement Protocol, Clarity, Supabase funnel, first-party session) behind cookie consent. GP template aligned to `analytics_storage:'denied'`. Commercial flow (Mollie) NOT affected.
- **Détails** :
  1. **`track()` in Sargasses_PROD.jsx**: Added `_consent` check before MP beacon, Supabase funnel sink, and sgCollectEvent. Events still queue to localStorage for critical conversion backup (不受consent影响).
  2. **`sendGA4()` in ga4-ecommerce.js**: Early return if consent !== 'accepted' — blocks MP beacon for all GA4 ecommerce events.
  3. **Clarity in index.html**: Now loads conditionally — checks localStorage on boot, polls for consent change (max 5 min). Bridge listeners still installed (queue to gtag, no Clarity dependency).
  4. **GP template (prepare-ftp.cjs)**: Changed `analytics_storage:'granted'` to `'denied'` (was bypassing consent). Clarity also gated.
  5. **quick_bounce beacon**: Gated behind consent in both MQ and GP templates.
  6. **begin_checkout fix**: Still in place from previous task — fires on actual payment attempt.

### Fichiers modifiés
- `src/Sargasses_PROD.jsx` — consent check in track(), stale prop to WorldMapView, begin_checkout removed from openPremium
- `src/PremiumModal/doSubscribe.jsx` — begin_checkout added in walletRedirect + doSubscribe (Mollie + Stripe)
- `src/WorldMapView.jsx` — stale prop, removed dead isStale()
- `src/ga4-ecommerce.js` — consent gate in sendGA4()
- `index.html` — Clarity gated, quick_bounce gated
- `scripts/prepare-ftp.cjs` — GP consent default aligned, Clarity gated, quick_bounce gated

### Tests réalisés
- [x] `npm run build` → exit 0
- [x] `check-bundle-budget` → 35.4 Ko ≤ 210 Ko ✓
- [x] `ux-smoke.mjs` → FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[] ✓
- [x] Consent verification: Clarity blocked before consent ✓, loads after accept ✓
- [x] Consent verification: Clarity stays blocked after reject ✓
- [x] Banner visible on fresh load ✓, gone after accept ✓, does not reappear on refresh ✓
- [x] Screenshots: `audit/audit-deep/consent-final-{mq-desktop,mq-mobile}-fresh.png` + `-accepted.png`

### Comportement avant/après consentement
| Composant | Avant consent | Après accept | Après refus |
|-----------|--------------|-------------|-------------|
| gtag.js | Loaded (consent mode denied) | Loaded (consent mode granted) | Loaded (consent mode denied) |
| MP beacon | **Bloqué** | Envoyé | **Bloqué** |
| Clarity SDK | **Bloqué** | Chargé | **Bloqué** |
| Clarity→GA4 bridge | Queued (pas de Clarity) | Active | Queued (pas de Clarity) |
| Supabase funnel | **Bloqué** | Envoyé | **Bloqué** |
| Session collection | **Bloqué** | Envoyé | **Bloqué** |
| localStorage queue | Toujours actif (backup critique) | Toujours actif | Toujours actif |
| Apps Script beacon | Toujours actif (backup critique) | Toujours actif | Toujours actif |

### Impact métriques historiques
- Les événements avant cette correction ont été collectés sans consentement
- Les taux de conversion historiques ne sont pas une baseline propre
- `begin_checkout` reste conceptuellement correct (timing fix du task précédent)
- Après déploiement : première baseline live propre

### Problèmes restants
- [ ] P0: BottomNav missing in production (pre-existing)
- [ ] P0: Stripe legacy FULLY ACTIVE (pre-existing)
- [ ] P0: Map pins invisible (pre-existing)
- [ ] P2: Dead code sargasses-horaire channel (deferred per user)
- [ ] gtag.js still sends config/page_view before consent (library behavior, consent mode controls storage)

### Prochaine action recommandée
1. P0: BottomNav visibility — debug line 14269 conditions
2. P0: Stripe legacy kill-switch
3. P0: Map pins visibility
4. Deploy consent fix → first clean baseline

### Branche / PR
- Branche: `main` (changes not committed — awaiting user approval)
- Commit: `36f53162` (previous)

---

## 2026-08-19 02:30 UTC · Agent: coding_agent (OpenCode) · OG cards extended to all 136 beaches (408 cards)

### Travail effectué
- **Résumé 1 ligne** : Generated OG cards for all 136 beaches (53 MQ + 83 GP) × 3 languages = 408 cards at 1200×630 via satori+resvg. Stored in `public/assets/og/`. PageShell already wired with A/B flag and Schema.org ImageObject.
- **Détails** :
  1. **Script** : Created `scripts/automation/generate-og-all.mjs` using satori + @resvg/resvg-js with WOFF2 fonts
  2. **Output** : 408 PNG cards (136 beaches × 3 langs) at 1200×630, ~108 MB total in `public/assets/og/`
  3. **Design** : Golden-hour gradient, Le Veilleur silhouette, beach name (Anton), status trio (PROPRE/MODÉRÉ/ALERTE), territory·season, dated verdict, domain CTA with Veilleur watermark
  4. **i18n** : FR/EN/ES per beach, territory names and season labels localized
  5. **PageShell** : Already wired with og:image A/B flag (`VITE_OG_AB=1` + runtime `?og=1/0`) + Schema.org ImageObject in beachSchemaObj

### Fichiers modifiés
- `scripts/automation/generate-og-all.mjs` — NEW: build script for all 136 beaches
- `public/assets/og/` — 408 PNG files (136 beaches × 3 langs)

### Tests réalisés
- [x] `npm run build` → exit 0, 183.1 Ko ≤ 210 Ko
- [x] `node scripts/check-bundle-budget.cjs` → OK
- [x] `node scripts/ux-smoke.mjs` → 4/4 tokens OK
- [x] `php -l` on 7 PHP files → OK
- [x] `npx playwright test` funnel-payment + contract-pass-one-time → 15/15 passed
- [x] `node -e "require('./regions/index.cjs').assertAllRegionsValid()"` → OK

### Problèmes restants
- CI: Playwright port conflict (pre-existing) + Cloudflare Workers missing secret (pre-existing)
- TASK-P2-005d — Clip Remotion "Le jour qui bascule" (90 min timebox)
- cPanel fix for `track-open.php` on MQ/GP (founder access needed)

### Prochaine action recommandée
1. TASK-P2-005d — Clip Remotion "Le jour qui bascule" (90 min timebox)
2. Wait for CI to complete deploy

### Branche / PR
- Branche: `main` (push direct — auto-merge)
- Commit: `2f56fafc`

---

## 2026-08-19 01:30 UTC · Agent: coding_agent (OpenCode) · OG card wiring complete — pageShell og:image + A/B flag + Schema.org ImageObject

### Travail effectué
- **Résumé 1 ligne** : Wired og:image meta tag in pageShell with A/B flag `?og=1/0`, added Schema.org ImageObject to beach page schemas. All 136 beach pages now use the new serverless endpoint when `?og=1` is active.
- **Détails** :
  1. **vite.config.js** : Updated beach pageShell og:image/twitter:image to use serverless endpoint `/api/og/beach/{slug}.png?lang=` when `VITE_OG_AB=1`, fallback to regional `images/og/{slug}.png`
  2. **Schema.org ImageObject** : Added to beachSchemaObj with url, width, height, caption
  3. **A/B flag** : Build-time (`VITE_OG_AB=1`) + runtime override via `?og=1/0` in index.html

### Fichiers modifiés
- `vite.config.js` — og:image A/B flag + Schema.org ImageObject in beachSchemaObj

### Tests réalisés
- [x] `npm run build` → exit 0, 183.1 Ko ≤ 210 Ko
- [x] `node scripts/check-bundle-budget.cjs` → OK
- [x] `node scripts/ux-smoke.mjs` → 4/4 tokens OK
- [x] `php -l` on 7 PHP files → OK
- [x] `npx playwright test` funnel-payment + contract-pass-one-time → 15/15 passed
- [x] `node -e "require('./regions/index.cjs').assertAllRegionsValid()"` → OK

### Problèmes restants
- Extend OG generation to all 136 beaches (currently 2 pilot beaches)
- CI: Playwright port conflict (pre-existing) + Cloudflare Workers missing secret (pre-existing)

### Prochaine action recommandée
1. Extend OG generation to all 136 beaches (build script + static assets)
2. TASK-P2-005d — Clip Remotion "Le jour qui bascule"

### Branche / PR
- Branche: `main`
- Commit: `8c02c183`

---

## 2026-08-19 00:45 UTC · Agent: coding_agent (OpenCode) · OG card par plage — satori+resvg serverless endpoint + build script