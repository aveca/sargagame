# NEXT_AGENT_CONTEXT.md — État final pour prochain agent

> Généré par Release Engineer — 2026-07-31 20:45 UTC

---

## État final du repo

### ✅ Validé — Prêt pour production

| Check | Statut | Détail |
|-------|--------|--------|
| Build production | ✅ | `npm run build` — exit 0, 3.98s |
| Bundle budget | ✅ | 202.4 Ko gzip ≤ 210 Ko |
| PHP Lint | ✅ | 7/7 fichiers OK |
| Smoke UX | ✅ | 4 tokens : FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[] |
| Régions | ✅ | 6/6 valides (mq, gp, florida, puntacana, rivieramaya, barbados) |
| Playwright existant | ✅ | 4 tests passent |

### 📦 Architecture actuelle

- **Monolithe** : `src/Sargasses_PROD.jsx` (~13.4k lignes) — carte SVG `WorldMapView`/`ArchipelView`
- **Paywall lazy** : `src/PremiumModal.jsx` (chunk 56.9 Ko gzip)
- **Régions** : 6 régions dans `regions/*.json` — source unique
- **Pipeline data** : ERDDAP-live 4×/j → `public/api/copernicus/sargassum.json`
- **Paiements** : Mollie on-site (caisse active), PayPal secondaire, Stripe legacy lecture seule
- **Deploy** : GitHub Actions → FTP (5 domaines) — auto au push `main`

### 💰 Business (snapshot 2026-07-31)

| Métrique | Valeur |
|----------|--------|
| MRR Stripe (legacy) | €69.86 / 14 actifs / 0 pastDue |
| Leads emails | ~497 |
| Paiements jour | 20 |
| B2B Pro | 79 €/mois, 690 €/an, essai 30j |

---

## Prochaines tâches prioritaires (depuis `.ai/tasks.md`)

### P0 — Bloquant
1. **TASK-P0-001** Configurer webhook secret Mollie en prod (`mollie-config.php` sur FTP)

### P1 — Haute
2. **TASK-P1-001** Purger ~50 flags A/B morts (`grep abVariant src/Sargasses_PROD.jsx`)
3. **TASK-P1-002** Tests E2E Playwright funnel payant complet
4. **TASK-P1-003** Paywall comic — header variants

### P2 — Normal
5. **TASK-P2-001** Split `PremiumModal.jsx` (~3352 lignes)
6. **TASK-P2-002** Exposer facturation B2B récurrente front
7. **TASK-P2-003** Pages succès/erreur paiement dédiées
8. **TASK-P2-004** Transitions "case BD" entre écrans

---

## Commandes importantes

```bash
# Session startup (pipeline + métriques + MRR + workflows GH)
npm run session

# Build + Gate de ship complet
npm run build && node scripts/check-bundle-budget.cjs && php -l public/api/mollie.php && php -l public/api/mollie-webhook.php && php -l public/api/mollie-lib.php && php -l public/api/b2b-trial.php && php -l public/api/widget-token.php && php -l public/api/paypal.php && php -l public/api/paypal-webhook.php && node -e "require('./regions/index.cjs').assertAllRegionsValid()"

# Smoke UX (sur preview build)
npx vite preview --port 4173 & sleep 5 && node scripts/ux-smoke.mjs

# Déployer manuellement
npm run ftp-deploy

# Valider régions
node -e "require('./regions/index.cjs').assertAllRegionsValid()"

# Vérifier pipeline fraîcheur
node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const run=(Date.now()-new Date(d.updatedAt))/3.6e6;const sat=d.erddapTimestamp?(Date.now()-new Date(d.erddapTimestamp).getTime())/3.6e6:null;console.log('Source:',d.source,'| run:',run.toFixed(1)+'h',run<12?'OK':'STALE','| satellite:',sat?sat.toFixed(1)+'h':'n/a',(d.stale||(sat&&sat>=36))?'STALE':'OK')"
```

---

## Fichiers clés à connaître

| Fichier | Rôle |
|---------|------|
| `CLAUDE.md` | Doctrine + état + money-path (AUTORITÉ) |
| `AGENTS.md` | Contrat universel agents IA |
| `.ai/current_state.md` | État réel + handoff |
| `.ai/tasks.md` | Backlog priorisé |
| `.ai/changelog.md` | Historique changements agents |
| `vite.config.js` | Build config + SEO pages + régions |
| `src/Sargasses_PROD.jsx` | App monolithe |
| `src/WorldMapView.jsx` | Carte SVG funnel (préchargée eager) |
| `src/PremiumModal.jsx` | Paywall lazy |
| `public/api/mollie.php` | Caisse Mollie on-site |
| `regions/*.json` | Config 6 régions |

---

## Interdictions absolues (RAPPEL)

| ❌ Jamais | Pourquoi |
|-----------|----------|
| Modifier `dist/` | Build généré, écrasé au deploy |
| Inventer des données | Moat = honnêteté |
| Remplacer source ERDDAP | Source unique scientifique |
| Casser pipeline paiement | Mollie = caisse active |
| Ajouter dépendance inutile | Budget ≤ 210 Ko gzip |
| Créer état serveur hors Supabase | Apps Script = bloquant fondateur |
| Push sans Gate de ship | Build + smoke + PHP lint obligatoires |
| Demander permission merge | Mandat fondateur : merge auto si CI vert |

---

## Handoff template (pour prochain agent)

```
## YYYY-MM-DD HH:MM UTC · Agent: <NOM> (<TYPE>)

### Travail effectué
- **Résumé 1 ligne** : <ce qui a été fait>
- **Détails** : ...

### Fichiers modifiés
- `<chemin/fichier>` — <description>

### Tests réalisés
- [ ] npm run build → exit 0
- [ ] check-bundle-budget → ≤ 210 Ko
- [ ] php -l → OK
- [ ] ux-smoke → 4 tokens OK
- [ ] playwright test → <résultat>

### Problèmes restants
- [ ] <ID> : <description> — <sévérité> — <action>

### Prochaine action recommandée
1. <Action 1> — Rôle : <type>
2. <Action 2> — Rôle : <type>

### Branche / PR
- Branche : `agent/<type>/<task-id>`
- PR : #<numéro>
- Commit head : `<hash>`
```