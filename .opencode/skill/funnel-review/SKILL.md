# funnel-review — Revue complète funnel + screenshots + rapport

## Description
Skill unifié qui visite chaque écran critique, capture screenshots, exécute les actions funnel, valide les 4 tokens ux-smoke, et génère un rapport markdown consolidé.

## Ce qu'il fait (en une commande)

1. **Build preview** — `npm run build && npx vite preview --port 4173` (arrière-plan)
2. **Screenshots funnel** — 25 états × 4 viewports via `ui-audit-screenshots.mjs`
3. **Smoke tokens** — `ux-smoke.mjs` → `FUNNEL_REACHED`, `ERRORS`, `WHITE_OR_TRANSPARENT_BUTTONS`, `RM_INFINITE`
4. **E2E critique** — `playwright test funnel-payment contract-pass-one-time`
5. **Rapport** — `funnel-review-<timestamp>.md` avec :
   - Screenshots embeddés (base64 ou liens locaux)
   - Status pass/fail par étape
   - Tokens ux-smoke
   - Durée totale
   - Liens vers artifacts Playwright

## Utilisation

```bash
# Depuis la racine du projet
npx tsx .opencode/skill/funnel-review/funnel-review.ts
# ou
node .opencode/skill/funnel-review/funnel-review.mjs
```

## Sortie

```
funnel-review-2026-08-17T14-30-00/
├── funnel-review-2026-08-17T14-30-00.md     # Rapport principal
├── screenshots/                              # 25 screenshots
│   ├── MAP_390x844.png
│   ├── BEACH_DETAIL_390x844.png
│   ├── PAYWALL_390x844.png
│   └── ...
├── ux-smoke.json                            # Tokens bruts
├── playwright-report/                       # HTML report
└── trace.zip                                # Trace Playwright (si échec)
```

## Prérequis

- `npm run build` passe
- Port 4173 libre
- Playwright installé (`npx playwright install chromium`)

## Intégration CI

Peut être appelé dans `.github/workflows/ci-tests.yml` ou `perf-budget.yml` pour bloquer le merge si funnel cassé.