# .ai/autopilot/ — Sargagame Autonomous Product Factory

> Usine autonome 24/7 : la machine locale observe la production, trouve des problèmes, prépare des améliorations sûres, exécute les gates et reprend la boucle sans demander un nouveau prompt pour chaque incident.

## Boucle

```
OBSERVE → RESEARCH → ANALYZE → PRIORITIZE → IMPLEMENT → TEST
→ BROWSER QA → VISUAL QA → PERF QA → REVIEW → PR → RESUME
```

Le runner est un processus long-lived avec lock unique, heartbeat, timebox et reprise après erreur. Le factory travaille dans son propre worktree ; le worktree du fondateur reste séparé.

## Self-healing

Le superviseur `scripts/autopilot/lib/self-healing.cjs` applique la politique suivante :

```
CAPTURE → CLASSIFY → CREATE REPAIR WORKTREE
→ APPLY PATCH → TEST → VERIFY → PUSH BRANCH → PR → RESUME
```

Les réparations automatiques sont limitées aux fichiers de l'usine/autopilot et aux tests autorisés. Les chemins sensibles restent denylistés : paiements, `public/api/**`, workers, régions, secrets, workflows, dépendances et money-path.

Une réparation qui échoue est bornée puis parquée ; elle ne doit pas récursivement relancer indéfiniment la même tâche.

## Live production sentinel

Le script `scripts/autopilot/live-production-sentinel.cjs` fournit un pont d'observabilité commun :

- production HTTP : pages, robots, sitemap, version ;
- endpoint paiement : smoke `__payment_smoke__` sans transaction ;
- GitHub Actions : récents workflows en échec via `gh` ;
- logs locaux : erreurs/régressions récentes ;
- Cloudflare Wrangler Tail : incidents Worker bornés lorsqu'un répertoire de capture est fourni.

Le workflow `.github/workflows/live-production-sentinel.yml` est planifié toutes les 10 minutes. Il peut créer/compléter un incident GitHub dédupliqué afin que la factory dispose d'un identifiant stable à diagnostiquer.

## Ce que l'autopilot ne fait jamais automatiquement

- modifier directement le worktree du fondateur ;
- modifier les fichiers de paiement, secrets ou workers via le mécanisme self-healing ;
- contourner les gates ;
- considérer un test statique ou une absence de log comme une preuve de réparation réelle.

## Contrôles fondateur

`config.json` reste la source de politique : cadence, denylist, limites de diff, budgets et kill-switch `.ai/autopilot/STOP`.

## Commandes

```powershell
npm run autopilot
npm run autopilot:observe
npm run autopilot:status
```

Pour une exécution continue, utiliser le runner 24/7 documenté dans `scripts/autopilot/runner.cjs`.
