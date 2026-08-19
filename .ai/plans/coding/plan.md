# Coding Agent Plan — Features, Bugs, Refactor, Tests

## Mission
Features, bugs, refactor, tests. Code existant réutilisé, patterns respectés.

## Principes (AGENTS.md)
- **Avant toute modif**: Lire CLAUDE.md + NEXT_SESSION.md + `.ai/current_state.md` + `.ai/tasks.md` + `.ai/bugs.md`
- **grep avant de coder** — ~80% déjà dans le repo
- **1 PR = 1 item**, additive + réversible, rollback `?flag=0`
- **Jamais** modifier `dist/`, inventer données, casser pipeline paiement

## Priorités P0-P2

### P0 — Paiement & Funnel (Revenue)
1. **OnsiteCheckout** (Mollie on-site) — DONE
   - Module: `src/PremiumModal/OnsiteCheckout.jsx` (z-index 1300)
   - Flow: `setPayStep(true)` → init Mollie Components → `createToken()` → `doSubscribe()`
   - Variants: Comic (full-screen) / World (sheet)
   - Tests: `funnel-payment.spec.ts` 15/15 pass

2. **Mollie webhook hardening** — DONE
   - Idempotence: `event_id` guard
   - Mirror retry: 5xx → retry flag
   - Tests: `contract-pass-one-time.spec.ts` 2/2 pass

### P1 — Features en cours
3. **PremiumModal decomposition** — DONE (TASK-P2-001)
   - 9 sous-modules: `ComicPaywall`, `WorldPaywall`, `OnsiteCheckout`, `B2BModal`, `AccountSheet`, `FiabiliteProof`, `PassOffer`, `ComicDetail`, `ErrorModal`
   - Shared hooks: `useModalA11y`, `useMediaQuery`
   - Lines: 240 → 31 (monolith) + modules

4. **Payment pages** — DONE (TASK-P2-003)
   - `public/payment/good.html` (147L) + `error.html` (177L)
   - i18n FR/EN/ES, comic design system
   - `mollie.php` redirect → `/payment/good.html`

5. **Easter egg Yole Martinique** — DONE (TASK-P2-005c)
   - Camera-tracked layer in `ArchipelView`
   - 150s drift + micro-rotation, reduced-motion frozen
   - Commit 920359a6

### P2 — Prochaines features
6. **OG Card serverless** (TASK-P2-005b — 3h)
   - Cloudflare Worker / Render endpoint
   - Input: beach_id + lang → output: PNG 1200×630
   - Cache: 1h (beach data stable), fallback generic
   - Usage: `<meta property="og:image" content="/api/og-card?beach=...">`

7. **Remotion clip** (TASK-P2-005d — 90min)
   - `video-remotion/src/PaywallHero.tsx`
   - 9:16, 15s, golden-hour wave + Le Veilleur + CTA
   - Export: MP4 + WebM <5MB

8. **Raie Manta Guadeloupe easter egg** (TASK-P2-005e)
   - Additive SVG layer in `ArchipelView` (camera-tracked)
   - Spec: `design/STORY/03-MOTIF-KIT.md`
   - Animation: slow glide 120s + wing flap 3s cycle

### Refactor & Tech Debt
9. **Monolith extraction** (progressive)
   - Next: `MapView` (lazy), `BeachSheet`, `SargaChat`, `ArchipelView`, `ScrollStory`
   - Pattern: dynamic import + Suspense + ErrorBoundary
   - Target: monolith <10k lines

10. **Shared hooks library**
    - `useModalA11y`, `useMediaQuery`, `useFrustrationDetection`, `useTrack`
    - Export: `src/hooks/index.js` → barrel file
    - Tests: unit pour chaque hook

11. **TypeScript migration** (optionnel)
    - Current: JSX pur, JSDoc types
    - Target: `.tsx` progressif, strict mode
    - Blockers: Vite config, team readiness

## Patterns de code (à respecter)
- **Imports**: `@/` alias pour `src/`, pas de `../` profonds
- **State**: `useState` + `useRef` (pas de Redux/Zustand)
- **Effects**: `useEffect` avec cleanup, pas de floating promises
- **Tracking**: `track("event_name", {props})` → `localStorage.sg_track_log`
- **i18n**: `_t(lang, "FR", "EN", "ES")` partout
- **Rollback**: tout ajout conversion/UI → `?flag=0` (ex: `?pwcomic=0`, `?fab=0`)

## Tests (obligatoires avant push)
```bash
npm run build                           # exit 0
node scripts/check-bundle-budget.cjs    # ≤210 Ko
php -l public/api/*.php                 # syntax OK
node scripts/ux-smoke.mjs               # 4 tokens
npx playwright test tests/e2e/funnel-payment.spec.ts tests/e2e/contract-pass-one-time.spec.ts
```

## Artefacts
- `.ai/bugs.md` — bugs connus + reproduction
- `.ai/decisions.md` — décisions techniques
- `.ai/changelog.md` — historique agents
- `tests/e2e/*.spec.ts` — E2E coverage

## SLA
| Métrique | Target |
|----------|--------|
| Build time | <3s |
| Bundle gzip | ≤210 Ko |
| E2E pass | 100% |
| Zero regression | Gate de ship |
| Rollback ready | `?flag=0` sur tout ajout |