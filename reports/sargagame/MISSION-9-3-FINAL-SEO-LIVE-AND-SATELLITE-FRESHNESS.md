# Mission 9.3 — fraîcheur Copernicus : vérification et contrat de publication

## 1. Résumé exécutif

La source ERDDAP a fourni l'observation réelle `2026-10-27T12:00:00Z`. La pipeline l'a récupérée le 27 octobre à 22:47:46 UTC : l'âge était alors d'environ **647 minutes**. Les fichiers régionaux ont ensuite été réécrits autour du 28 octobre à 04:36:45–04:36:49 UTC ; à ce moment, l'âge avait atteint **997–1000 minutes**.

Deux seuils distincts s'appliquent :

- **SLA opérationnel de publication : 900 minutes (15 h).** Au-delà, `post-deploy-verify.cjs` refuse de certifier le déploiement.
- **Champ public `stale` : 36 heures (2 160 minutes).** C'est le contrat existant du JSON/UI : entre 12 et 36 heures, l'interface présente une lecture satellite neutre, sans l'étiquette « en direct » ; au-delà de 36 heures, le marqueur `stale` s'active.

À 997–1000 minutes, la donnée **échoue au SLA strict de publication**, mais le champ `stale` doit rester `false` selon le contrat 36 h. Les tests historiques l'exigent explicitement. La précédente tentative de ramener ce champ à 15 h faisait échouer deux tests contractuels ; cette version sépare correctement les deux seuils au lieu d'affaiblir les tests.

La certification E2E en production n'est pas déclarée terminée : le snapshot disponible ne satisfait pas encore le SLA de 15 h, les checks CI du HEAD final doivent être verts, et les réponses des domaines doivent être confirmées après déploiement autorisé.

## 2. Références Git vérifiées

| Élément | SHA / état |
|---|---|
| `main` au moment de la vérification | `f937ee2a9d702594433f5cc620d2ac2e6c57f029` |
| Ancêtre commun de `main` et de la branche mission | `c061724e8d1a804fbaa37437261678d1fa2d589b` |
| HEAD avant corrections de cohérence | `cee35cd8bce46859f6d4973cb6c09a6c7b25c6bb` |
| Branche de mission | `fix/mission-9-3-copernicus-refresh-20261028` |
| PR | [#1107 — seuil strict de publication et contrats de fraîcheur](https://github.com/aveca/sargagame/pull/1107) |

La branche contient des artefacts de données régionaux et est divergente de `main`. La fusion doit passer par la PR ; aucun push forcé, aucune fusion automatique ni aucun déploiement n'a été effectué.

## 3. État des snapshots

- Source : `erddap-live`.
- `erddapTimestamp` : `2026-10-27T12:00:00Z`.
- JSON racine : âge enregistré de 1 000 minutes.
- Sept JSON régionaux : âge enregistré de 997 minutes chacun.
- Âge strict requis pour un déploiement certifié : au plus 900 minutes.

Le marqueur `stale` des huit JSON est laissé à `false`, car ils se situent sous le seuil historique de 36 heures. Ils ne sont **pas pour autant aptes à la publication certifiée** : la vérification post-déploiement échoue au-dessus de 900 minutes. Aucun timestamp source n'a été avancé et aucune observation synthétique n'a été créée.

## 4. Corrections de cohérence

- `scripts/lib/satellite-freshness.cjs` conserve `SAT_STALE_HOURS = 36`, conformément au contrat public existant.
- `scripts/autopilot/post-deploy-verify.cjs` applique séparément la limite stricte `SATELLITE_OPERATIONAL_LIMIT_MINUTES = 900`.
- `tests/unit/post-deploy-satellite-freshness.test.cjs` vérifie une observation de 15 h acceptée et une observation de 15 h 01 refusée.
- `tests/unit/satellite-freshness-metadata.test.cjs` conserve les tests du marqueur `stale` à 36 h.
- Les huit JSON d'observation respectent le marqueur de 36 h sans toucher aux scores, niveaux, historiques ni à l'observation ERDDAP.

## 5. État des tests et contrôles

Le premier run CI de la PR #1107 a échoué parce que le seuil global avait été changé à 15 h tandis que les tests contractuels verrouillaient 36 h. Les logs identifient précisément :
- `tests/unit/post-deploy-satellite-freshness.test.cjs` : test de la frontière des 36 h.
- `tests/unit/satellite-freshness-metadata.test.cjs` : assertion `SAT_STALE_HOURS === 36`.

Cette version traite le conflit au bon endroit, dans le code et les tests du gate de déploiement. GitHub doit relancer les checks sur le nouveau HEAD. Aucun résultat vert n'est annoncé avant leur achèvement.

Les résultats rapportés par la session précédente — test mojibake et build de 180,03 Ko — restent des preuves antérieures, pas une nouvelle exécution dans cette session.

## 6. État de livraison et étapes restantes

- PR : [#1107](https://github.com/aveca/sargagame/pull/1107).
- CI : à vérifier sur le dernier HEAD après ce correctif.
- Snapshot source : toujours trop ancien pour passer le SLA strict de 900 minutes ; il faut obtenir une observation réelle plus récente avant d'autoriser un déploiement.
- Vérification HTTP des six domaines après déploiement autorisé : en attente.
- Fusion et déploiement de production : non effectués.

Ne pas réduire les exigences, falsifier les timestamps, ou considérer un HTTP 200 seul comme preuve de fraîcheur satellite. Le rapport ne pourra marquer E2E terminé qu'après un snapshot respectant le SLA, des checks CI verts et la vérification réelle des domaines.

---

Mis à jour le 28 octobre 2026. Aucun changement de production n'a été déclenché.
