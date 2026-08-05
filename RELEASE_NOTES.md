# RELEASE_NOTES.md — Production Release 2026-07-31

## Version

**v218-b7d64c7a** — 2026-07-31 20:45 UTC

---

## Améliorations réalisées

### 🔧 Code Quality & Bug Fixes
- **Fix syntaxe ArchipelView.jsx** : Suppression des déclarations `const` dupliquées (`MID`, `FAR`, `NEAR`) qui causaient une erreur esbuild bloquante
- **Recréation scripts/lib/coast-zones.js** : Fichier manquant (importé par `Sargasses_PROD.jsx`, `WorldMapView.jsx`, `ArchipelView.jsx`) restauré avec zones côtières pour les 6 régions (MQ, GP, Florida, Punta Cana, Riviera Maya, Barbados)
- **Nettoyage complet fichiers debug/temp** : Suppression de `scripts/temp/`, `tests/screenshots/`, `debug-logs/`, `ui-audit-results/`, scripts de debug divers, fichiers logs

### 🏗️ Architecture & Infrastructure
- **Structure agentique `.ai/`** : Mise en place complète (context, current_state, tasks, bugs, decisions, changelog, roles, handoff-template, autonomous-loop)
- **Workflow GitHub Actions `agent-handoff.yml`** : Boucle autonome 24/7 avec schedule 4h
- **Script `agent-handoff.cjs`** : Automatisation pick/claim/branch/complete
- **Documentation tests `tests/README.md`** : Stratégie complète Playwright (E2E, Integration, Unit)

---

## Bugs corrigés

| Bug | Fichier | Impact | Résolution |
|-----|---------|--------|------------|
| Const dupliquées esbuild | `src/ArchipelView.jsx:10-11,26` | Build bloqué | Déduplication `MID/FAR/NEAR/SPAN_PX` |
| Import manquant coast-zones | `scripts/lib/coast-zones.js` | Build cassé après nettoyage | Recréation fichier avec 6 régions |

---

## Performance

| Métrique | Valeur | Budget | Statut |
|----------|--------|--------|--------|
| Bundle JS eager (gzip) | **202.4 Ko** | ≤ 210 Ko | ✅ PASS |
| Entry chunk | 169.8 Ko | — | — |
| WorldMapView (preload) | 23.3 Ko | — | — |
| React vendor (preact) | 9.2 Ko | — | — |
| Build time | 3.98s | — | — |
| Pages SEO générées | 136+ | — | — |

---

## Tests effectués

### Gate de Ship (tous validés ✅)

| Test | Commande | Résultat |
|------|----------|----------|
| Build production | `npm run build` | ✅ exit 0 |
| Bundle budget | `node scripts/check-bundle-budget.cjs` | ✅ 202.4 Ko ≤ 210 Ko |
| PHP Lint (7 fichiers) | `php -l public/api/*.php` | ✅ 7/7 OK |
| Smoke funnel UX | `node scripts/ux-smoke.mjs` | ✅ 4 tokens OK |
| Régions validation | `node -e "require('./regions/index.cjs').assertAllRegionsValid()"` | ✅ 6/6 OK |

### Smoke Test UX (ux-smoke.mjs) — Tokens
```
FUNNEL_REACHED=map+fiche+paywall
WHITE_OR_TRANSPARENT_BUTTONS=[]
ERRORS=[]
RM_INFINITE=[]
```

### Playwright Tests (existant)
- ✅ `probe.spec.mjs` — DOM real
- ✅ `probe2.spec.mjs` — Funnel réel
- ✅ `probe3.spec.mjs` — Chatbot → paiement → retour
- ✅ `debug-journey.spec.mjs` — Parcours utilisateur complet

---

## Points connus restants

### P0 — Bloquant
- **TASK-P0-001** : Webhook secret Mollie non configuré sur FTP (`mollie-config.php` a `webhook_secret` commenté)

### P1 — Haute priorité
- **TASK-P1-001** : Purge ~50 flags A/B tests morts dans `Sargasses_PROD.jsx`
- **TASK-P1-002** : Tests E2E Playwright complets du funnel payant
- **TASK-P1-003** : Paywall comic — variants header (scene/constel/beat)

### P2 — Backlog normal
- **TASK-P2-001** : Split `PremiumModal.jsx` (~3352 lignes) en sous-composants
- **TASK-P2-002** : Exposer facturation B2B récurrente front (CTE `/pro/` + token essai 30j auto)
- **TASK-P2-003** : Pages dédiées succès/erreur paiement
- **TASK-P2-004** : Transitions « case BD » entre écrans

### Autre
- **Barbados** : Région préparée (`regions/barbados.json` avec `stripeProducts` placeholders) mais non câblée en Mollie — nécessite purge résidus Stripe (`KNOWN_REGIONS` dans `stripe-webhook.php`)

---

## Déploiement

- **Branche** : `main` (commit `df5ead63`)
- **Auto-deploy** : Push sur `main` → `daily-copernicus.yml` (build 5 régions + FTP + health-check, timeout 75min)
- **Vérification post-deploy** : `curl` sur URLs prod (sargasses-martinique.com, sargasses-guadeloupe.com, sargassummiami.com, sargassumpuntacana.com, sargassumcancun.com)

---

## Commandes utiles

```bash
# Build + tests complets (Gate de ship)
npm run build && node scripts/check-bundle-budget.cjs && php -l public/api/mollie.php && php -l public/api/mollie-webhook.php && php -l public/api/mollie-lib.php && php -l public/api/b2b-trial.php && php -l public/api/widget-token.php && php -l public/api/paypal.php && php -l public/api/paypal-webhook.php && node -e "require('./regions/index.cjs').assertAllRegionsValid()"

# Smoke test UX (sur build preview)
npx vite preview --port 4173 & sleep 5 && node scripts/ux-smoke.mjs

# Session startup (pipeline + métriques + MRR + workflows)
npm run session

# Déploiement manuel FTP
npm run ftp-deploy
```

---

## Handoff

Prochaine session recommandée : **Configurer webhook secret Mollie (TASK-P0-001)** puis **Purge A/B tests (TASK-P1-001)**.

État complet dans `.ai/current_state.md` | Backlog dans `.ai/tasks.md` | Historique dans `.ai/changelog.md`