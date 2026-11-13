# Runbook — Pont autonome GitHub ↔ Factory V3 ↔ OpenCode (24/7)

> Document d'exploitation du service `SargagameAutopilot` installé sur le PC
> du fondateur. Il décrit **l'état réel**, les commandes de diagnostic, le
> redémarrage, l'arrêt propre et les limites assumées.
>
> Dernière mise à jour : 2026-11-09 · Périmètre : `aveca/sargagame`,
> `aveca/bot-wow`.

---

## 1. Ce que fait le service

Le service est une **tâche planifiée Windows** qui exécute en boucle le
runner Factory V3. À chaque cycle il :

1. **Importe** les issues `[AUTOPILOT]` ouvertes des deux dépôts autorisés
   (corps complet + commentaires utiles + bloc `AUTOPILOT_TASK` validé) ;
2. **Publie** le cycle de vie de la mission sur l'issue source
   (`imported → started → heartbeat → completed`, ou `blocked` / `failed` /
   `retrying`) ;
3. **Exécute** la mission avec un agent réel (moteur `opencode` +
   `.ai/ux-agent/opencode-auto.cjs`), dans un **worktree dédié** ;
4. **Vérifie** avec le gate de ship (build, budget bundle, invariant régions,
   smoke UX) ;
5. **Commite, pousse une branche, ouvre une PR** ;
6. **Reprend** les missions abandonnées (watchdog), sans doublon.

Une mission **terminale** (`completed` / `blocked` / `failed`) n'est jamais
relancée. Une mission en cours est reprise après un crash, avec la **même**
`task_id`.

---

## 2. Où ça tourne

| Élément | Valeur |
|---|---|
| Clone runner | `C:\Users\user\sargagame-runner` |
| Branche du clone | `runner/factory-local` |
| Tâche planifiée | `SargagameAutopilot` |
| Déclencheur | `AtLogOn` (voir limite §7) |
| Redémarrage du service | automatique, 1 min / 999 tentatives |
| Verrou d'exclusion | `.ai\autopilot\orchestrator.lock` (PID + token) |
| Journal de service | `.ai\autopilot\runs\service-console.log` |
| Journal du runner | `.ai\autopilot\runs\runner.log` |
| État des missions | `.ai\autopilot\mission-state.json` |
| File d'attente | `.ai\autopilot\queue.json` |
| Kill-switch | `.ai\autopilot\STOP` (présence = arrêt propre demandé) |

---

## 3. Consulter l'état

```powershell
# État complet (missions, queue, verrous, scheduler)
node C:\Users\user\sargagame-runner\scripts\autopilot\status.cjs

# Tâche planifiée : état, dernier lancement, dernier code de sortie
Get-ScheduledTask -TaskName SargagameAutopilot
Get-ScheduledTaskInfo -TaskName SargagameAutopilot

# Processus réellement vivants
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'runner\.cjs' }

# Verrou (un seul runner doit le détenir)
Get-Content C:\Users\user\sargagame-runner\.ai\autopilot\orchestrator.lock
```

Dans `status.cjs`, la ligne

```
missions    : <N> active(s) / <M> suivie(s)
```

donne le nombre de missions **en cours** et le nombre total de missions
**suivies** depuis le début.

---

## 4. Redémarrer

```powershell
# Arrêt propre (kill-switch → attente → taskkill de l'arbre si besoin)
cmd /c "C:\Users\user\sargagame-runner\scripts\autopilot\autopilot-stop.cmd" C:\Users\user\sargagame-runner

# Relance
Remove-Item C:\Users\user\sargagame-runner\.ai\autopilot\STOP -Force -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName SargagameAutopilot
```

> **Pourquoi une commande d'arrêt dédiée ?**
> `Stop-ScheduledTask` tue le processus `wscript` du Planificateur mais **pas
> les descendants** (`cmd.exe → node run.cjs → node runner.cjs → node
> orchestrator.cjs`). Constaté le 2026-11-09 : les 3 processus `node`
> continuaient de tourner et le verrou PID restait détenu — un redémarrage
> était alors refusé (code 3).

---

## 5. Diagnostic

```powershell
# 40 dernières lignes du journal de service
Get-Content C:\Users\user\sargagame-runner\.ai\autopilot\runs\service-console.log -Tail 40

# Filtres utiles sur le journal du runner
Select-String -Path C:\Users\user\sargagame-runner\.ai\autopilot\runs\runner.log -Pattern 'CRASH|PARKED|SCOPE|GATE|PR ' | Select-Object -Last 30

# État durable des missions (reprise, heartbeat, terminalité)
node -e "const s=require('C:/Users/user/sargagame-runner/.ai/autopilot/mission-state.json'); Object.values(s.missions||{}).forEach(m=>console.log(m.key,m.state,m.attempts))"

# Nettoyage des runs anciens (sans toucher à l'état)
node C:\Users\user\sargagame-runner\scripts\autopilot\prune.cjs --quiet
```

### Codes de sortie du runner

| Code | Signification | Action |
|---|---|---|
| `0` | arrêt propre (kill-switch `STOP` présent) | rien — redémarrage manuel attendu |
| `2` | cycle interrompu (STOP demandé) | rien |
| `3` | un autre runner tient le verrou | ne rien faire : le service attend puis reprend |
| `1` | crash du runner | le service **relance** tout seul (1 min) ; si le crash persiste, lire `runner.log` |

---

## 6. Kill-switch

Créer le fichier `STOP` demande l'arrêt **propre** : le runner s'arrête au
prochain point de contrôle et libère le verrou.

```powershell
New-Item -ItemType File -Path C:\Users\user\sargagame-runner\.ai\autopilot\STOP -Force
```

Supprimer le fichier pour autoriser la reprise :

```powershell
Remove-Item C:\Users\user\sargagame-runner\.ai\autopilot\STOP -Force
```

---

## 7. Limites assumées (à lire avant de conclure à un bug)

| Limite | Conséquence | Correctif possible |
|---|---|---|
| `AtStartup` refusé sans droits admin | Le service démarre **à chaque ouverture de session**, pas au démarrage de la machine | exécuter l'installateur depuis une console **élevée** |
| Tâche `Interactive` | Le runner ne tourne que si une session utilisateur est **ouverte** | même correctif (une tâche `Interactive` exige une session) |
| PC éteint / réseau coupé | Aucune autonomie : le polling GitHub ne peut pas avoir lieu | laisser la machine allumée et connectée |
| `timeout` sans console | `timeout /t` échoue en mode caché (ligne d'entrée non prise en charge) | le service utilise `ping -n` comme attente |
| Accès Cloudflare API absent | La phase **PREVIEW** ne peut pas déployer l'aperçu Cloudflare Pages : la mission finit `blocked-preview` | fournir `CLOUDFLARE_API_TOKEN` + `.wrangler` |
| Moteur `opencode` uniquement | Aider / Hermes sont déclarés dans la Factory mais **n'ont pas de voie non interactive** : ils ne sont jamais annoncés comme exécutés | câbler un exécutable non interactif par agent |
| `bot-wow` sans harness | Une mission `aveca/bot-wow` est **relayée** (statut publié) mais n'est pas exécutée localement | installer le même harness `scripts/autopilot` sur le dépôt `bot-wow` |
| `f3.py` (Factory V3 Python) inexploitable | `INTERACTIVE`, `claims_allowed:false`, base figée au 2026-10-27 | — |

---

## 8. Garde-fous de sécurité (non contournables)

Une issue est une **donnée**, jamais une autorisation. Le pont **refuse
d'exécuter** et publie `blocked` quand la mission demande :

- un déploiement en production ou un merge ;
- une modification de paiement, de checkout ou de prix ;
- un paiement réel ou un remboursement ;
- un secret, une permission, une migration irréversible ;
- un envoi massif.

Ces catégories sont détectées **avec gestion des négations** (« ne fusionne
pas », « aucun déploiement ») : une consigne négative n'est pas un ordre.

Le périmètre du commit est revérifié **après** le gate de ship : tout fichier
hors périmètre est restauré, puis `scope + denylist + budget + secrets` sont
revalidés sur la liste **réellement commitée** (fail-closed).

---

## 9. Étiquettes de preuve

| Étiquette | Signification |
|---|---|
| `TEST VERIFIED` | le test a été réellement exécuté, avec son résultat |
| `LIVE VERIFIED` | vérifié sur la production réelle (HTTP, données) |
| `NOT VERIFIED` | non vérifiable dans l'environnement courant (limite documentée) |
| `BLOCKED` | bloqué par un garde-fou ; motif publié sur l'issue |

Aucun mock n'est présenté comme un test réel ; aucun secret n'apparaît dans
les journaux ni dans les commentaires publiés.

---

## 10. Journal des défauts corrigés (référence)

| Date | Défaut | Correction |
|---|---|---|
| 2026-11-09 | PR polluée : artefacts `public/api/**` commités (scope validé avant le gate) | restauration hors périmètre + revalidation post-gate (`lib/final-scope.cjs`) |
| 2026-11-09 | `ReferenceError: diff is not defined` au commit | phase de commit extraite (`phaseCommitAndPublish`), paramètres explicites |
| 2026-11-09 | `ReferenceError: allowedScope is not defined` au commit | idem + déclaration hors boucle + garde-fou statique (`lib/orchestrator-scope.test.cjs`) |
| 2026-11-09 | l'agent « narrait » son intention sans écrire | prompt : action en tête + rappel en fin + `write` en contenu complet (`lib/agent-prompt.cjs`) |
| 2026-11-09 | l'agent s'arrêtait sur « Could not find oldString » (CRLF) | prescription `read` puis `write` ; `edit` réservé aux fichiers longs avec ancre mono-ligne |
| 2026-11-09 | boucle de service sans délai (`timeout` sans console) | attente par `ping -n` |
| 2026-11-09 | `Stop-ScheduledTask` laissait les processus fils en vie | `autopilot-stop.cmd` / `autopilot-stop.ps1` (kill-switch + `taskkill /T /F`) |
