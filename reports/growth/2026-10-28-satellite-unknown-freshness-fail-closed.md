# Rapport Growth — fraîcheur satellite fail-closed

**Date :** 28 octobre 2026 (UTC)  
**Dépôt :** `aveca/sargagame`  
**Incident suivi :** [#1102 — fraîcheur satellitaire et observabilité](https://github.com/aveca/sargagame/issues/1102)  
**Branche :** `fix/satellite-unknown-freshness-fail-closed-20261028`  
**Base vérifiée :** `b514f7c0505f627a26b76ade4eda7288c3d29a61`

## Problème démontré

`scripts/lib/satellite-freshness.cjs` retournait `{ dataAgeMinutes: null, stale: false }` si `erddapTimestamp` était absent, invalide, futur, ou si l'horloge fournie était invalide. Le booléen `stale:false` peut être interprété comme un état sain par les consommateurs qui ne contrôlent pas séparément l'âge inconnu.

Les tests existants documentaient cette convention et la validaient explicitement. L'incident #1102 demande un comportement fail-closed pour les horodatages non vérifiables. Il s'agit d'une correction de contrat local ; elle ne prétend pas réparer l'ingestion ERDDAP ni rendre les observations plus récentes.

## Modification

- `scripts/lib/satellite-freshness.cjs` : les horodatages absents, invalides, futurs ou évalués avec une horloge invalide donnent maintenant `dataAgeMinutes: null` et `stale: true`. Le commentaire précise que l'âge est inconnu et que le statut est stale/non vérifié, pas que l'âge exact est connu.
- `tests/unit/satellite-freshness-metadata.test.cjs` : assertions de régression pour ces cas, y compris le recalcul d'un payload dont l'âge statique était trompeusement bas ; vérification que les données de plage, scores et prévisions ne sont pas modifiés.
- Ce rapport versionné.

Le seuil numérique existant reste strictement supérieur à 36 heures : exactement 36 h demeure non périmé selon le contrat actuel. Aucune donnée de plage, prévision, route, canonique, sitemap, prix, paiement, secret ou configuration d'infrastructure n'est modifié.

## Hypothèse produit et KPI

Une observation dont l'âge ne peut pas être prouvé ne doit pas être présentée comme fraîche. KPI technique : les timestamps manquants/invalides/futurs ne produisent plus `stale:false`; `dataAgeMinutes` reste `null`. Aucun gain de trafic, de conversion ou de revenu n'est présumé.

## Critères d'acceptation

1. Tests de frontière 36 h inchangés.
2. Horodatage absent, invalide, futur ou horloge invalide : âge inconnu et `stale:true`.
3. `refreshSatellitePayload` remplace une ancienne valeur `dataAgeMinutes` par `null` pour un timestamp inconnu et marque le payload live comme non vérifié.
4. Les champs de décision `levels`, `weekly`, `scores` et `updatedAt` restent inchangés.
5. CI Tests et Perf Budget + Lighthouse terminent sur le SHA exact de la PR.

## Risques et rollback

Risque conservateur : certains consommateurs qui ne vérifient que `stale` peuvent désormais traiter un timestamp inconnu comme périmé et masquer un statut. C'est préférable à une affirmation de fraîcheur non prouvée ; les contrôles qui distinguent `dataAgeMinutes === null` peuvent continuer à afficher « vérification ».

Rollback : revert des commits de cette PR. Aucun merge ni déploiement n'est inclus.

## État de livraison

CODE, commits et push sont sur une branche dédiée. Les tests n'ont pas été exécutés dans un runtime local de cette session ; attendre la CI GitHub sur le HEAD final. Le correctif ne collecte pas de nouvelles observations et ne résout pas le retard amont ERDDAP/Copernicus. Aucune intégration Analytics, Search Console, abonnements, leads ou revenus n'a été utilisée.
