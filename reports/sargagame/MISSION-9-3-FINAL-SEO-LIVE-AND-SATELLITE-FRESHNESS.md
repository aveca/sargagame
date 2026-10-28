# Mission 9.3 — Copernicus : SLA opérationnel et certification

## Résumé

Le snapshot courant de `main` déclare `source: erddap-live`, `erddapTimestamp: 2026-10-27T12:00:00Z`, `updatedAt: 2026-10-28T05:01:34.483Z` et `dataAgeMinutes: 1022` au moment de sa génération. L'horodatage source n'a pas avancé lors du dernier rafraîchissement : c'est le run de publication qui est plus récent, pas l'observation satellite.

Il faut distinguer les contrats :

- **SLA de publication : 900 minutes (15 h).** Au-delà, la vérification post-déploiement doit refuser la certification.
- **Champ public `stale` : 36 h (2 160 min).** Ce marqueur historique reste faux entre 15 h et 36 h ; côté interface, le satellite n'est toutefois plus présenté comme « en direct » au-delà de 12 h.

À 1 022 minutes, le snapshot reste donc `stale: false` selon le contrat du marqueur, mais échoue au SLA de 15 h pour la publication certifiée. Un nouvel horodatage source ne peut être obtenu que par une observation ERDDAP réelle ; il ne doit jamais être simulé à partir de `updatedAt`.

## Références

- HEAD de `main` intégré à cette branche : `1efb0651dcf7944b4b30b5787dbfccdc522e9b94` (rafraîchissement Copernicus du 28 octobre à 05:01 UTC).
- PR : [#1107 — seuil strict de publication Copernicus](https://github.com/aveca/sargagame/pull/1107).
- Branche : `fix/mission-9-3-copernicus-refresh-20261028`.

## Correction apportée par cette PR

- `scripts/lib/satellite-freshness.cjs` conserve le marqueur historique `SAT_STALE_HOURS = 36`.
- `scripts/autopilot/post-deploy-verify.cjs` ajoute une vérification distincte `SATELLITE_OPERATIONAL_LIMIT_MINUTES = 900`. Une observation entre 901 et 2 160 minutes ne sera donc pas considérée comme « stale » par le contrat public, mais elle **bloquera quand même un déploiement certifié**.
- `tests/unit/post-deploy-satellite-freshness.test.cjs` couvre la limite exacte de 900 minutes et le refus à 901 minutes.
- `tests/unit/satellite-freshness-metadata.test.cjs` garde les assertions historiques de 36 h intactes.
- Le rapport ne modifie pas les artefacts de données : le rafraîchissement le plus récent sur `main` a déjà généré le snapshot de 05:01 UTC. Réintroduire la copie de 04:36 UTC de l'ancienne branche aurait fait reculer `updatedAt` sans fournir une observation plus récente.

## Tests et statut

Le premier run de la PR #1107 a révélé l'incompatibilité entre le changement global à 15 h et les tests de contrat à 36 h. Cette correction sépare le SLA de déploiement du marqueur public sans réduire aucun seuil. Les contrôles CI doivent être jugés sur le HEAD courant de la PR ; aucun résultat vert n'est annoncé avant achèvement.

Le snapshot source de 12:00 UTC échoue encore au SLA de 15 h. La collecte d'une observation ERDDAP plus récente et la vérification HTTP des six domaines restent nécessaires avant de déclarer la certification E2E terminée. Aucun déploiement ni fusion n'a été effectué.

## Garde-fous

Ne jamais avancer artificiellement `erddapTimestamp`, baisser le seuil de 900 minutes pour contourner le blocage, ni interpréter un HTTP 200 comme preuve de fraîcheur satellite. Ne pas annuler la protection Worker des assets privés pour revenir sur un changement de fraîcheur.

Mis à jour le 28 octobre 2026.
