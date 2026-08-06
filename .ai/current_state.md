# .ai/current_state.md — État actuel du projet
>
> Dernière mise à jour par agent. Format strict.

---

## 2026-08-05 21:30 UTC · Agent: coding_agent (OpenCode)

### Travail effectué
- **TASK-P1-003 — Paywall WorldPaywall conversion optimization** :
  - Header variants (scene/alert/watch/calm/constel) auto-sélectionnés selon contexte plage
  - 3 pricing cards avec decoy : Brief 29€/mo (ancre), Pro 79€/mo (cible, badge "Recommandé"), Pro Annual 690€/an (valeur, -33%)
  - RiskReversal : garantie inversée 14 jours ("Si la prévision ne t'aide pas, tu arrêtes. Aucun prélèvement.")
  - SocialProof : stats (12k+ voyageurs, 85% renouvellent, 4.8/5 App Store) + témoignage
  - CSS blindage complet pour nouveaux composants contre thèmes A/B
  - Gate de ship validé : build ✅, bundle 208.2 Ko ≤ 210 Ko, ux-smoke 4 tokens ✅, E2E 4/4 ✅, régions 6/6 ✅

### Fichiers modifiés
- `src/PremiumModal.jsx` — WorldPaywall avec header variants, PricingCards, RiskReversal, SocialProof + CSS blindage
- `public/api/b2b-partners.json` — régénéré par build
- `public/api/copernicus/sargassum.json` — mis à jour par build

### Tests réalisés
- [x] npm run build → exit 0
- [x] check-bundle-budget → 208.2 Ko ≤ 210 Ko
- [x] php -l → OK (aucun fichier PHP touché)
- [x] ux-smoke → 4 tokens OK (FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[])
- [x] playwright test → 4/4 passed (funnel-payment)

### Problèmes restants
- [ ] Webhook secret Mollie pas configuré sur FTP (TASK-P0-001) — fail-closed + idempotence en place, manque secret en prod
- [ ] 50+ flags A/B à consolider (TASK-P1-001)
- [ ] PremiumModal.jsx trop gros (~3352 lignes) (TASK-P2-001)
- [ ] Facturation B2B répétée pas encore exposée front (TASK-P2-002)
- [ ] Barbados préparée mais pas câblée (résidus Stripe à purger)

### Prochaine action recommandée
1. Configurer webhook secret Mollie en prod (TASK-P0-001)
2. Purger A/B tests non significatifs (TASK-P1-001)
3. Spliter PremiumModal.jsx (TASK-P2-001) — seulement si besoin budget bundle
4. Exposer facturation B2B récurrente front (TASK-P2-002)

### Branche / PR
- Branche : `agent/coding/TASK-P1-003`
- PR : # (à créer)
- Commit head : `ecf0a79a`

---

## 2026-08-05 20:15 UTC · Agent: coding_agent (OpenCode)

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