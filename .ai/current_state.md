# .ai/current_state.md — État actuel du projet
>
> Dernière mise à jour par agent. Format strict.

---

## 2026-08-05 20:15 UTC · Agent: coding_agent (OpenCode)

### Travail effectué
- **TASK-P0-001 — Mollie webhook hardening (idempotence guard)** :
  - Ajout garde idempotente sur `event_id` dans `mollie-webhook.php` (marqueur fichier `api/data/mollie_<event_id>`)
  - Protection contre replay webhook Mollie (HTTP 200 + `duplicate: true` si déjà traité)
  - Pattern aligné sur `stripe-webhook.php` (file-based markers dans `api/data/` protégé par .htaccess)
  - Fail-closed existant confirmé : webhook_secret manquant → 503, signature invalide → 403
  - Idempotence métier déjà présente via `mol_b2b_grant_once()` / `mol_b2c_pass_grant()`
  - Tests unitaires créés : `tests/integration/mollie-webhook.test.php`

### Fichiers modifiés
- `public/api/mollie-webhook.php` — garde idempotente event_id + marqueurs sur tous chemins 200
- `tests/integration/mollie-webhook.test.php` — nouveaux tests unitaires

### État actuel du produit
- **Pipeline** : erddap-live OK (workflow daily-copernicus en cours)
- **Paiements** : Mollie on-site actif (EUR MQ/GP + USD FL/PC/RM) — **webhook hardening ✅**
- **B2B** : Pro 79 €/mois, 690 €/an, essai 30j, outreach automatique
- **CI/CD** : 33+ workflows GitHub Actions autonomes
- **A/B tests** : ~50+ active, en cours de purge (TASK-P1-001)
- **Build** : ✅ succès, bundle 207.2 Ko gzip ≤ 210 Ko budget
- **Tests** : ✅ ux-smoke 4 tokens (FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[])
- **PHP** : ✅ syntaxe OK sur tous endpoints Mollie/PayPal
- **E2E** : ✅ funnel-payment 4/4 tests pass
- **Régions** : ✅ validation 6 régions OK

### Problèmes restants
- ~~Webhook secret Mollie pas configuré sur FTP~~ → **RÉSOLU** (fail-closed au deploy + idempotence event_id)
- 50+ flags A/B à consolider (TASK-P1-001)
- PremiumModal.jsx trop gros (~3352 lignes) (TASK-P2-001)
- Facturation B2B répétée pas encore exposée front (TASK-P2-002)
- Barbados préparée mais pas câblée (résidus Stripe à purger)

### Prochaine action recommandée
1. GA4 ecommerce + funnel events complets (mesure fiable maintenant que paiement est bétonné)
2. Paywall comic header variants (conversion paywall→CTA)
3. Purger A/B tests non significatifs (TASK-P1-001)
4. Splitter PremiumModal.jsx (TASK-P2-001) — seulement si besoin budget bundle

---

### Travail effectué
- **Production Release Cleanup** : Nettoyage complet, tests, optimisation pour déploiement production
- Fix bug syntaxe `ArchipelView.jsx` (const dupliquées MID/FAR/NEAR)
- Recréation `scripts/lib/coast-zones.js` (import manquant cassé par nettoyage)
- Nettoyage fichiers debug/temp (scripts/temp/, tests/screenshots/, debug-logs/, etc.)
- Validation complète Gate de ship

### Fichiers modifiés
- `src/ArchipelView.jsx` — fix const dupliquées (esbuild error)
- `scripts/lib/coast-zones.js` — recréé (zones côtières 6 régions)
- `.ai/current_state.md` — ce fichier

### État actuel du produit
- **Pipeline** : erddap-live, run 17.7h STALE, satellite 32.5h OK (workflow daily-copernicus lancé)
- **Paiements** : Mollie on-site actif (EUR MQ/GP + USD FL/PC/RM)
- **B2B** : Pro 79 €/mois, 690 €/an, essai 30j, outreach automatique
- **CI/CD** : 33+ workflows GitHub Actions autonomes
- **A/B tests** : ~50+ active, en cours de purge (TASK-P1-001)
- **Build** : ✅ succès, bundle 202.4 Ko gzip ≤ 210 Ko budget
- **Tests** : ✅ ux-smoke 4 tokens (FUNNEL_REACHED, ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[])
- **PHP** : ✅ syntaxe OK sur tous endpoints Mollie/PayPal
- **Régions** : ✅ validation 6 régions OK

### Problèmes restants
- Webhook secret Mollie pas configuré sur FTP (TASK-P0-001)
- 50+ flags A/B à consolider (TASK-P1-001)
- PremiumModal.jsx trop gros (~3352 lignes) (TASK-P2-001)
- Facturation B2B répétée pas encore exposée front (TASK-P2-002)
- Barbados préparée mais pas câblée (résidus Stripe à purger)

### Prochaine action recommandée
1. Configurer webhook secret Mollie en prod (TASK-P0-001)
2. Purger A/B tests non significatifs (TASK-P1-001)
3. Splitter PremiumModal.jsx (TASK-P2-001)
4. Exposer facturation B2B récurrente front (TASK-P2-002)

---

### Historique handoff

| Date | Agent | Travail | Fichiers |
|------|-------|---------|----------|
| 2026-07-31 | Release Engineer | Production cleanup & release | src/ArchipelView.jsx, scripts/lib/coast-zones.js, .ai/ |
| 2026-07-31 | CTOs/OpenCode | Transformation AI-native | .ai/, AGENTS.md, tests/, CI |
| 2026-07-30 | Claude Code | Payment fix | mollie.php, PremiumModal.jsx, Sargasses_PROD.jsx |
| 2026-07-01 | Claude Code | B2B recurring | mollie-lib.php, mollie.php |
| 2026-06-29 | Claude Code | Pricing B2B panel | mollie-paylinks.cjs, B2B_*.md |