# SARGAGAME — REGLES CLAUDE

## Session Startup

**Raccourci (Cursor + terminal)** : `npm run session` → `scripts/cursor-session-startup.cjs` regroupe les points 1–5 ci-dessous + mémoire.

Au lancement de chaque session depuis ce dossier, exécuter automatiquement (zéro confirmation) :

1. **Pipeline freshness** :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const h=(Date.now()-new Date(d.updatedAt))/3.6e6;console.log('Source:',d.source,'| Age:',h.toFixed(1)+'h |',h<12?'OK':'STALE')"
   ```
2. **Métriques business du jour** :
   ```bash
   node -e "const d=JSON.parse(require('fs').readFileSync('scripts/automation/data/daily-metrics.json','utf-8'));const l=d[d.length-1];console.log('Last:',l.date,'| Payments:',l.payments,'| Emails:',l.emails,'| Feedbacks:',l.feedbacks)"
   ```
3. **Workflows GitHub Actions récents** : `gh run list --repo aveca/sargagame --limit 5` (skip si gh non-authed).
4. **Lire la mémoire projet** :
   - `~/.claude/projects/C--Users-user-Desktop-Backup-sargagame/memory/project_roadmap.md`
   - `~/.claude/projects/C--Users-user-Desktop-Backup-sargagame/memory/project_metrics.md`
5. **Auto-trigger si STALE** : si pipeline > 12h, lancer immédiatement (zéro confirmation) :
   ```bash
   gh workflow run daily-copernicus.yml --repo aveca/sargagame --ref main
   ```
6. Reporter l'état en 5 lignes max puis attendre les instructions.

## Règles de déploiement

- **Auto-deploy** : après tout build réussi, lancer le FTP directement, ne pas demander (cf. mémoire `feedback_deploy_auto`).
- Workflows GitHub Actions tournent en autonomie — ne pas créer de crons Claude pour ce projet.

## Architecture rapide

- **App** : `Sargasses_PROD.jsx` (~2500 lignes, React+Leaflet)
- **Pipeline v3** : `scripts/fetch-sargassum-live.cjs` + `scripts/lib/forecast.cjs` + `scripts/lib/confidence.cjs`
- **FTP deploy** : `scripts/prepare-ftp.cjs` → `martinique-ftp/` + `guadeloupe-ftp/`
- **Domains** : sargasses-martinique.com, sargasses-guadeloupe.com
- **Repo** : aveca/sargagame

Pour les opérations détaillées (deploy, A/B, backtest, stats), invoquer le skill `sargasses`.
