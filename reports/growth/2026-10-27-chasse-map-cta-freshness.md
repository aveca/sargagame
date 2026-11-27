# Rapport Growth — CTA carte conditionné à la fraîcheur satellite

**Date :** 27 octobre 2026, heure de Martinique (28 octobre UTC)  
**Dépôt :** `aveca/sargagame`  
**PR :** https://github.com/aveca/sargagame/pull/1104  
**Branche :** `fix/chasse-map-cta-satellite-freshness-20261027`  
**SHA du code testé :** `78141e120715ef3e2a57ad47172d3c561fd8b8bd`

## Constat vérifié

Le CTA `lc-gomap` de `src/ChasseHome.jsx` comptait les plages au statut `clean` et affichait toujours « aujourd'hui · en direct » en français, anglais et espagnol, sans condition sur l'âge de l'observation.

Pendant ce cycle, les endpoints publics `/api/copernicus/sargassum.json` de Martinique, Guadeloupe, Miami, Punta Cana et Riviera Maya ont été récupérés. Au moment de leur lecture, ils exposaient tous `erddapTimestamp=2026-10-26T12:00:00Z`, `dataAgeMinutes=2313` et `stale=true`. L'observation dépassait le seuil de 36 heures. Le lecteur web n'a pas pu récupérer l'endpoint Tulum ; aucune conclusion n'est tirée pour ce domaine.

Les PR #1048 (widget hôtelier), #1052 (métadonnées et sentinel), #1053 (landing B2B), #1077 et les PR UI consultées ne corrigent pas le CTA `ChasseHome`. Aucune PR concurrente couvrant ce fichier n'a été trouvée dans la recherche effectuée.

## Correctif

- Ajout de `chasseMapCtaSummary()` dans `src/lib/format-freshness.mjs`.
- Le calcul s'appuie sur l'âge de `erddapTimestamp`, pas sur `updatedAt`.
- <12 h : le compteur « aujourd'hui / live » reste autorisé.
- 12–36 h : le compteur est masqué et l'âge de la dernière mesure est affiché.
- >=36 h : le compteur est masqué et le texte signale le retard satellite.
- Timestamp absent, invalide ou futur : le compteur est masqué et la vérification est annoncée.
- Les traductions FR/EN/ES sont conservées. Les statuts, scores, prévisions, routes, prix, paiements et données de plage ne changent pas.

## Fichiers

1. `src/lib/format-freshness.mjs`
2. `src/ChasseHome.jsx`
3. `tests/unit/chasse-home-cta-freshness.test.cjs`

## Validation observée sur le SHA de code

- Nouveau test de régression : **14/14 assertions PASS**.
- Suite `npm test` : **85/85 fichiers de test PASS**.
- Build : PASS.
- Packaging MQ/GP et garde d'exclusions Worker : PASS.
- UX smoke Playwright du parcours mobile : PASS, `ERRORS=[]`.
- Budget JavaScript eager gzip : PASS.
- Perf Budget : PASS.
- Lighthouse mobile : encore en cours au moment de la création de ce rapport (workflow run `40623161401`).
- CI Tests : succès (workflow run `40623161453`).

Le workflow CI construit le projet, lance un Vite preview dans le runner et utilise Playwright/Chromium. Ce connecteur ne fournit ni navigateur local ni URL de preview déployé. Les captures avant/après propres à ce CTA en 390×844 et 1440×900, ainsi que la vérification de l'interaction vers la carte, restent demandées pour la revue ; aucune capture de ce CTA n'est revendiquée ici.

## KPI, risques et rollback

**KPI technique :** aucune affirmation « aujourd'hui / live » depuis ce CTA lorsque l'observation a 12 heures ou plus, ou lorsque son âge est inconnu. Aucun gain de trafic, de conversion ou de revenu n'est présumé ; les intégrations Analytics autorisées n'ont pas été consultées.

**Risque :** le compteur est volontairement masqué si la fraîcheur n'est pas démontrée. Le bouton et son interaction restent inchangés.

**Rollback :** revert de la PR #1104.

## État de livraison

- CODE : fait.
- COMMIT/PUSH : fait sur la branche dédiée.
- PR : #1104 ouverte.
- CI : tests et budget réussis sur le SHA de code indiqué ; Lighthouse encore en cours à l'heure du rapport.
- MERGE/DEPLOY : non effectués.
- LIVE : aucune modification de production revendiquée.

Ce rapport décrit le SHA de code testé. Le commit qui ajoute ce rapport est documentaire et ne change pas le code exécutable.
