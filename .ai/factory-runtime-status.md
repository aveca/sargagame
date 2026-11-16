# Factory Runtime — État d'intégration Sargagame

> Dernière mise à jour : 2026-11-16.
> Ce document ne crée aucune implémentation concurrente. Il documente l'état réel.

## Composants existants dans le repo

### 1. Autopilot (scripts/autopilot/)

| Composant | Fichier | État |
|-----------|---------|------|
| Runner principal | `runner.cjs` | Existe, mort depuis 2026-10-22 (MAX_RESTARTS) |
| Orchestrateur | `orchestrator.cjs` | Existe |
| Bridge multi-dépôt | `multi-repo-bridge.cjs` | Existe, testé (37 assertions) |
| Bridge GitHub | `bridge.cjs` | Existe |
| Exécuteur d'agent local | `local-agent-executor.cjs` | Existe |
| Routeur de modèles | `local-model-router.cjs` | Existe |
| Observateur UX | `ux-observer.cjs` | Existe |
| Hypothèses UX | `ux-hypothesis.cjs` | Existe |
| Vérification | `verify.cjs` | Existe |
| Analyse | `analyze.cjs` | Existe |
| Découverte | `discover.cjs` | Existe |
| Implémentation | `implement.cjs` | Existe |
| Rapport | `report.cjs` | Existe |
| Prune | `prune.cjs` | Existe |
| Installateur scheduler | `install-scheduler.ps1` | Existe |
| Installateur service | `install-service.ps1` | Existe |

### 2. Factory V3 (scripts/factory-v3/)

| Composant | Fichier | État |
|-----------|---------|------|
| Exécution | `run.cjs` | Existe, intégré avec conditional-resume |
| Reprise conditionnelle | `conditional-resume.cjs` | Existe, testé (7/7) |
| État | `state/` | Existe (evidence, resume-signal) |

### 3. Scripts de contrôle

| Composant | Fichier | État |
|-----------|---------|------|
| Contrôle navigateur | `browser-recon.cjs` | Existe |
| Playwright runner | `playwright-runner.cjs` | Existe |
| Contrôle visuel QA | `visual-qa.cjs` | Existe |
| QA en ligne | `online-qa.cjs` | Existe |
| Observateur UX | `ux-observer.cjs` | Existe |

## Composants externes (pas dans le repo)

| Composant | Localisation | État |
|-----------|-------------|------|
| Supervisor Python | `C:\factory-service\v3\f3.py` | Existe (PID 15072, mode INTERACTIVE) |
| OpenCode Bridge | Externe | Non vérifié dans ce repo |
| Session Manager | Externe | Non vérifié dans ce repo |
| Desktop Control | Externe (OpenCode tools) | Disponible via l'agent |

## Ce qui est préparé

1. **Contrôle navigateur** : `browser-recon.cjs`, `playwright-runner.cjs`, `visual-qa.cjs` existent et sont testés.
2. **OpenCode Bridge** : Le repo contient des scripts d'automatisation qui peuvent être exécutés par OpenCode (scripts/autopilot/*.cjs).
3. **Session Manager** : Pas d'implémentation dédiée dans le repo. L'état est géré via `.ai/current_state.md` et `.ai/tasks.md`.
4. **Supervisor** : Le supervisor Python externe existe mais ne référence pas ce dépôt.
5. **Récupération après erreur** : Le runner a un mécanisme de retry (MAX_RESTARTS) et de parcage (blocked). Le conditional-resume module ajoute un pré-check bloquant.

## Ce qui n'est PAS préparé

1. **Intégration réelle** entre le supervisor Python et les scripts de ce dépôt.
2. **Session Manager** dédié pour gérer les sessions OpenCode.
3. **Desktop Control** automatisé (l'agent utilise les outils OpenCode manuellement).
4. **Récupération automatique** après erreur (le runner est mort, pas de redémarrage automatique).

## Recommandations (sans créer d'implémentation concurrente)

1. Réactiver le runner (`scripts/autopilot/runner.cjs`) avec un MAX_RESTARTS plus élevé.
2. Connecter le supervisor Python au runner de ce dépôt.
3. Utiliser les scripts existants (`browser-recon.cjs`, `playwright-runner.cjs`) pour le contrôle navigateur.
4. Documenter les points d'entrée pour l'OpenCode Bridge (scripts/autopilot/run.cjs, orchestrator.cjs).
5. Ne pas créer de nouvelle implémentation — réutiliser l'existant.