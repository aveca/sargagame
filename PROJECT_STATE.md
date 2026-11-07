# SARGAGAME — état partagé

**Relevé : 2026-11-07T16:20Z.** Faits relus sur GitHub et sur les six domaines. Les rapports plus anciens ne sont pas une preuve. GitHub est la seule source commune : pas d'accès aux tâches internes ChatGPT ni OpenCode.

Dépôt : https://github.com/aveca/sargagame
Verrous : `agents/locks.md`
Déploiements : `agents/deployments.md`

## Vérité courante

| Élément | Valeur | Preuve |
|---|---|---|
| Branche par défaut | `main` | GitHub |
| HEAD au relevé | `6dc44cebd1e6a4243bbee59d314268f5252db99d` | `git rev-parse origin/main` |
| Dernier commit | Merge #1328 SOS return | `git log -1` |
| Domaines de production | sargasses-martinique.com, sargasses-guadeloupe.com, sargassummiami.com, sargassumpuntacana.com, sargassumcancun.com, sargazotulum.com | matrice `cloudflare-production.yml` |
| Version servie | v221, date 2026-10-12, build `df18df5d` sur les six | GET `/version.json` 2026-11-07 après le run `42389099227` |
| #1323 | squash `0da0d417` | fulfillment dans `main`. Déploiement `sg-payments` tenu par y |
| #1287 | mergée `18cb16d7` | redaction. Valeur non recopiée |
| #1328 | mergée `6dc44cebd` | redirection SOS seulement si le retour est mémorisé |
| #1344 | fusionnée, `fa5f37f26` | URL annuelle seulement si `reachable===true` |
| #1294 | ouverte, non fusionnée | doublon de fulfillment |
| #1136 | ouverte, non fusionnée | ancien SOS |
| #1353 | brouillon | swap d'URLs, montants inchangés |
| Run production `42389099227` | failure, deploy skipped | observation MQ 3121 min > SLA 900 min |

## Autres agents, dernières 24 h

Tous les commits GitHub de ce dépôt sont signés `aveca`. On les distingue par la branche.

| PR | Branche | État | Sujet |
|---|---|---|---|
| #1350 | `agent/coding/multi-repo-bridge-handoff-20261106` | mergée 2026-11-06T18:47Z | mémoire AUTOPILOT |
| #1349 | `agent/coding/multi-repo-bridge-20261106` | mergée 2026-11-06T18:10Z | relais multi-dépôts |
| #1348 | `fix/erddap-capture-window-monitor-20261106` | mergée 2026-11-06T18:01Z | moniteur ERDDAP lecture seule |
| #1347 | `agent/devops/ai-docs-handoff-20261106` | mergée 2026-11-06T17:08Z | diagnostic Copernicus |
| #1346 | `agent/devops/ai-docs-paths-ignore-20261106` | mergée 2026-11-06T16:45Z | pushes mémoire hors déclencheur prod |
| #1342 | `p0/sync-multi-repo-bridge` | fermée 2026-11-06T18:20Z | pont multi-dépôts, remplacé par #1349 |

## Chantiers

#1323, #1287 et #1328 sont dans `main`. Le déploiement de `sg-payments` et les migrations Supabase sont tenus par y (`agents/locks.md`). Le brouillon #1353 attend les nouvelles URL Mollie. Le SLA satellite de 900 minutes n'a pas été abaissé : un verdict de baignade périmé n'est pas publié comme actuel, et le code de `main` masque déjà ce verdict dans la fiche (`satelliteDecisionCurrent`). Ce code n'est pas encore servi, parce que le déploiement est refusé tant que l'observation dépasse 900 minutes.
