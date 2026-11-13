# Mission 9.2 — Gate, merge et vérification post-déploiement

**Mise à jour finale : 2026-10-28 (UTC)**  
**Dépôt :** [aveca/sargagame](https://github.com/aveca/sargagame)

## 1. Résultat exécutif

Les deux PR SEO ont été fusionnées sur `main`. Les contrôles requis des PR étaient verts sur leurs HEAD exacts. Après fusion de #1100, les six déploiements de domaines et les six déploiements Pages ont réussi, ainsi que le contrôle de cohérence de flotte (`32/32 PASS`).

**La livraison n'est toutefois pas entièrement certifiée :**
- le job post-déploiement échoue sur la fraîcheur de l'observation satellite, mesurée à **2 314 minutes**, pour un seuil configuré à **2 160 minutes (36 h)** ;
- le code source corrigé est présent sur `main`, mais l'outil de consultation web continue à retourner une représentation ancienne de la page de recherche. La purge Cloudflare ciblée a été acceptée, mais la vérification HTML directe sans cache n'a pas pu être établie ; l'API Browser Rendering a répondu HTTP 429.

Ces deux problèmes ne doivent pas être transformés en faux succès en modifiant artificiellement les horodatages ou en abaissant les exigences de vérification.

## 2. Fusions confirmées

| PR | Résultat | Commit |
|---|---|---|
| [#1101 — méthodologie de persistance](https://github.com/aveca/sargagame/pull/1101) | Fusionnée (squash) | [`75d6d6ec4140751b565a75312d9f1abbdc67bd8b`](https://github.com/aveca/sargagame/commit/75d6d6ec4140751b565a75312d9f1abbdc67bd8b) |
| [#1100 — correction du mojibake](https://github.com/aveca/sargagame/pull/1100) | Fusionnée (squash) | [`e5a9b76b4838e3e41bd7a7b0eebce43dffe0e999`](https://github.com/aveca/sargagame/commit/e5a9b76b4838e3e41bd7a7b0eebce43dffe0e999) |

La PR #1100 a été fusionnée depuis le HEAD testé `29e5279a82e4034c8bd8a806fe7bc9c21eb001c9`. L'état GitHub avant fusion indiquait `mergeable=true`.

## 3. Périmètre nettoyé avant fusion de #1100

Les changements hors périmètre suivants ont été retirés de la PR avant validation finale :
- `public/api/b2b-partners.json` : instantané restauré depuis `main` ; le changement isolé de `updatedAt` n'appartenait pas à la correction d'encodage.
- `public/api/copernicus/sargassum.json` : instantané restauré depuis `main` ; le diff de données générées n'avait pas de lien avec le correctif SEO.
- `tests/e2e/ui-chat-button.spec.ts` : test lié au chat retiré de cette PR SEO, car il était indépendant et ne faisait pas échouer le test lorsque le bouton était absent.

Diff final déclaré par GitHub avant la fusion : **27 fichiers**.

## 4. Contrôles sur les HEAD exacts

### Avant la fusion de #1100

| Contrôle | Run | Résultat |
|---|---|---|
| CI Tests, HEAD `29e5279a` | [40620916649](https://github.com/aveca/sargagame/actions/runs/40620916649) | SUCCESS |
| Perf Budget + Lighthouse, HEAD `29e5279a` | [40620916550](https://github.com/aveca/sargagame/actions/runs/40620916550) | SUCCESS — `perf` et `lighthouse-report` réussis |

### Après la fusion, sur `main` / merge SHA `e5a9b76b`

| Contrôle | Run | Résultat |
|---|---|---|
| CI Tests | [40621433528](https://github.com/aveca/sargagame/actions/runs/40621433528) | SUCCESS |
| Perf Budget + Lighthouse | [40621433437](https://github.com/aveca/sargagame/actions/runs/40621433437) | SUCCESS — `perf` et `lighthouse-report` réussis |
| Cloudflare Production | [40621433419](https://github.com/aveca/sargagame/actions/runs/40621433419) | Déploiements réussis ; `post-deploy-verify` FAILED sur la fraîcheur satellite |
| Daily Copernicus + Deploy | [40621433529](https://github.com/aveca/sargagame/actions/runs/40621433529) | Builds et `health-check` réussis ; `fetch-data` SKIPPED sur cet événement `push` |

## 5. Vérifications de la source sur `main`

Les fichiers de source récupérés depuis GitHub contiennent la correction attendue :
- `public/pro/es/pricing/index.html` : `está` et `cuánto` présents ; `est¡` et `cu¡nto` absents.
- `public/research/index.html` : ancienne affirmation `3.5-day half-life` absente ; formulation de la demi-vie de cinq jours des nappes flottantes présente ; stock échoué à terre décrit séparément comme provisoire et non calibré sur la vérité terrain de saison active.
- `tests/unit/mojibake-regression.test.cjs` : test de régression inclus dans la PR fusionnée.

Les rapports de la mission locale indiquaient également un test mojibake réussi et un build local réussi avec un bundle de 180,03 Ko, inférieur au budget de 210 Ko. Le pipeline de performance GitHub est lui aussi vert sur le commit de fusion.

## 6. État du déploiement de la flotte

Dans le run [Cloudflare Production #40621433419](https://github.com/aveca/sargagame/actions/runs/40621433419) :
- les six builds de régions ont réussi ;
- `certification-gate` et `mollie-live-gate` ont réussi ;
- les six déploiements Pages et les six déploiements de domaines ont réussi ;
- `verify-fleet` a terminé avec **32/32 PASS**, avec `version.json` cohérent sur les six domaines (`v221`, build `fe9a6ea3`) ;
- `post-deploy-verify` a échoué pour les six domaines sur le contrôle `satellite_freshness` : **2 314 min > 2 160 min**.

Lien de l'incident existant : [#1058 — LIVE-INCIDENT](https://github.com/aveca/sargagame/issues/1058). L'incident a été mis à jour avec les résultats des runs #40620728256 et #40621433419.

Le workflow `Daily Copernicus + Deploy` déclenché par le push a ignoré `fetch-data`. Il n'a donc pas rafraîchi le snapshot. Au relevé GitHub, le snapshot versionné avait `updatedAt=2026-10-27T22:23:35.695Z` et `erddapTimestamp=2026-10-26T12:00:00Z` ; l'âge est recalculé depuis l'horodatage réel de l'observation, pas depuis `updatedAt`.

**Action à mener séparément :** vérifier si ERDDAP expose une observation plus récente et comprendre le déclenchement/skip du job `fetch-data`. Ne jamais modifier `erddapTimestamp`, `stale`, `dataAgeMinutes` ou le seuil de 36 h pour masquer le signal.

## 7. Vérification du contenu HTML public — non certifiée

Après les déploiements, la consultation web a encore retourné pour `https://sargassummiami.com/research/` l'ancienne formule `3.5-day half-life` et les caractères `âš` / `â‰`, alors que la source sur `main` est corrigée.

Une purge Cloudflare ciblée a été acceptée (HTTP 200) sur les URL exactes `/research`, `/research/`, `/research/index.html`, `/pro/es/pricing`, `/pro/es/pricing/` et `/pro/es/pricing/index.html`, sur les six zones :
- `sargassummiami.com`
- `sargasses-martinique.com`
- `sargasses-guadeloupe.com`
- `sargassumpuntacana.com`
- `sargassumcancun.com`
- `sargazotulum.com`

La consultation web a continué à restituer l'ancienne page après la purge. La tentative de vérification indépendante via Cloudflare Browser Rendering a reçu HTTP 429 (limite de débit). Il n'est donc **pas prouvé** si l'ancienne représentation vient encore du cache/CDN réel ou du cache de l'outil de consultation. Le contrôle automatisé actuel vérifie l'intégrité de l'HTML de la racine et les bundles, mais n'atteste pas directement le contenu de ces deux sous-pages.

**Action à mener :** effectuer un GET direct non mis en cache des deux pages après déploiement et comparer leur corps HTML aux artefacts préparés pour la région, en conservant les en-têtes et les empreintes de preuve. Ne conclure à la résolution que si le contenu effectivement servi est confirmé.

## 8. Conclusion finale

- **PR #1100 et #1101 :** fusionnées.
- **CI Tests et Perf/Lighthouse :** réussis sur les HEAD requis.
- **Déploiement des six domaines :** étapes de déploiement réussies ; cohérence flotte 32/32.
- **Certification post-déploiement complète :** non acquise, en raison du signal de fraîcheur satellite.
- **Validation indépendante des copies HTML corrigées :** non acquise ; la consultation web est ancienne et la vérification navigateur directe a été limitée par HTTP 429.
- **Incident #1058 :** ouvert et mis à jour.

Ce rapport distingue les commits fusionnés, les étapes de livraison confirmées et les preuves encore manquantes. Aucune hausse de trafic, de classement SEO ou de revenu n'est revendiquée sans mesure.

---
