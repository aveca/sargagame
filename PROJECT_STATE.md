# SARGAGAME — état partagé

**Relevé : 2026-11-07T16:15Z.** Faits relus sur GitHub et sur les six domaines. Le déploiement `sg-payments` version 382 est celui déclaré par y vers 16:04Z ; les GET santé ont été refaits ensuite. GitHub est la seule source commune.

Dépôt : https://github.com/aveca/sargagame
Verrous : `agents/locks.md`
Déploiements : `agents/deployments.md`

## Vérité courante

| Élément | Valeur | Preuve |
|---|---|---|
| Branche par défaut | `main` | GitHub |
| HEAD au relevé | `6a9fd7f81aeec4dbd3c8ac3279ddf898015d150e` | `git rev-parse origin/main` |
| Worker `sg-payments` | version 382, déploiement `08f46a03-ccff-437f-9cdd-1bb4d9be9c39`, 100 % | déclaré par y, source `18cb16d7e`. Rollback version 381 `36fa827a-a39c-4156-9359-30fc383eb6c5` |
| Supabase `rswdmjtdzrucqzzukfmd` | migrations 002–008 appliquées ; 001 déjà présente | déclaré par y, 2026-11-07 ~16:04Z |
| Santé paiement | `GET /api/mollie-health` 200 `ok:true` et webhook GET 200 sur les six domaines | relu après le déploiement. Achat réel non validé |
| Verrou `sg-payments deploy` | libéré (`done`) | `agents/locks.md` |
| Dernier commit | Merge #1354 verrou deploy | `6a9fd7f81` |
| Domaines de production | sargasses-martinique.com, sargasses-guadeloupe.com, sargassummiami.com, sargassumpuntacana.com, sargassumcancun.com, sargazotulum.com | matrice `cloudflare-production.yml` |
| Version servie | v221, date 2026-10-12, build `df18df5d` sur les six | GET `/version.json` 2026-11-07 après le run `42389099227` |
| #1323 | squash `0da0d417` | fulfillment dans `main`. Worker 382 déployé par y |
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

#1323, #1287 et #1328 sont dans `main`. Le verrou `sg-payments deploy` est libéré : y a appliqué les migrations 002–008 et déployé la version 382. Aucun achat réel n'a été validé. Le brouillon #1353 attend les nouvelles URL Mollie. Le SLA satellite de 900 minutes n'a pas été abaissé. La fiche sur `main` masque un verdict périmé, mais les six domaines servent encore v221, parce que le run `42389099227` a refusé le déploiement.
