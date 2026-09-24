# .ai/autopilot/ — Sargagame Autonomous Product Factory

> Usine autonome 24/7 : la machine Windows locale observe la prod, trouve des
> problèmes, implémente des améliorations sûres, teste (Gate de ship complet) et
> prépare des PR — sans prompt fondateur à chaque itération.

## Un fichier à lire

**`latest.md`** — le dernier cycle en 30 secondes (OBSERVED / FOUND / IMPLEMENTED / TESTED / PR / NEXT).
Historique complet : `runs/YYYY-MM-DD-HHMM.md`.

## Boucle (1 cycle = 1 run)

```
OBSERVE → RESEARCH → ANALYZE → PRIORITIZE → IMPLEMENT → TEST
→ BROWSER QA → VISUAL QA → PERF QA → REVIEW → PR → OBSERVE AGAIN
```

Un cycle = **UNE** opportunité max. Jamais deux écrivains sur les mêmes fichiers :
verrou PID (`orchestrator.lock`) + un seul worktree de travail dédié
(`../sargagame-autopilot-wt/`, `origin/main` frais à chaque cycle —
le worktree du fondateur n'est JAMAIS touché).

## Contrôles fondateur (sur mobile, zéro CLI)

| Action | Comment |
|---|---|
| **Tout arrêter** | créer un fichier `.ai/autopilot/STOP` (vide) → le prochain tick s'arrête et reste arrêté. Supprimer pour reprendre. |
| Changer le rythme | `config.json` → `loop.intervalMinutes` |
| Interdire un type de modif | `config.json` → `policy.denyGlobs` |
| Rejeter une idée | `decisions/rejected.json` (l'orchestrateur ne la re-proposera jamais sans preuve nouvelle) |
| Ajouter une idée | `queue.json` → objet `status:"new"` |
| Autoriser l'auto-merge | `config.json` → (défaut OFF ; whitelist docs/.ai uniquement) |

## Ce que l'autopilot ne fera JAMAIS

- écrire sur `main` directement (branch → PR, checks CI)
- toucher paiements / secrets / workers / `public/api/**` / `regions/**` / workflows (denylist dure, `policy.denyGlobs`)
- continuer après : prod down, régression tests, budget bundle dépassé, diff trop gros,
  3 réparations échouées, PR autopilot déjà ouverte, arbre en conflit
- répéter une expérience rejetée

## Structure

```
.ai/autopilot/
  config.json        ← réglages (budgets, fenêtres, denylist…)
  queue.json         ← opportunités (source de vérité du "quoi faire")
  latest.md          ← dernier cycle (lisible en 30 s)
  STOP               ← fichier kill-switch (présent = arrêté)
  runs/              ← 1 rapport horodaté par cycle + runner.log
  observations/      ← sondes Playwright prod (JSON + screenshots locaux)
  baselines/         ← captures de référence (locales, visual diff)
  research/          ← veille persistée (travel UX, motion, SEO, concurrence…)
  opportunities/     ← fiches détaillées des candidats retenus
  experiments/       ← expériences livrées + mesures
  regressions/       ← échecs documentés (auto-réparation épuisée)
  decisions/         ← rejected.json (mémoire anti-répétition)
```

## Code

`scripts/autopilot/` : `observe.cjs` (sonde prod) · `analyze.cjs` (priorisation) ·
`implement.cjs` (+ `recipes/`) · `verify.cjs` (Gate de ship) · `orchestrator.cjs`
(boucle) · `runner.cjs` (tick unattended, lock, timebox).

## Installation du service (une fois, sur la machine)

```powershell
# PowerShell en admin — crée la tâche planifiée (reboot-proof, toutes les 4 h)
powershell -ExecutionPolicy Bypass -File scripts\autopilot\install-scheduler.ps1
# Retirer :
powershell -ExecutionPolicy Bypass -File scripts\autopilot\uninstall-scheduler.ps1
```

Manuel : `npm run autopilot` (1 cycle) · `npm run autopilot:observe` (sonde seule) ·
`npm run autopilot:status` (état mémoire).
WSL : `scripts/autopilot/autopilot-wsl.sh` (cron possible, le verrou empêche les doublons).

## Vérités terrain

- L'autopilot travaille dans SON worktree ; le vôtre (même sale/with WIP) est sacré.
- Il ouvre des PR, il ne merge que si whitelisté (défaut : jamais pour du code).
- Chaque cycle est < 50 min (`loop.maxRunMinutes`) ; au-delà il s'arrête proprement.
- Zéro secret requis locallement : la prod est sondée en GET public, le Git via `gh`
  (compte déjà authentifié) — jamais de paiement, jamais d'email sortant.
