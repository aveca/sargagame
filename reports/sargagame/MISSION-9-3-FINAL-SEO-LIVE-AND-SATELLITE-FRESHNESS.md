# Mission 9.3 — fraîcheur Copernicus : état vérifié et limites

## 1. Résumé exécutif

La collecte a produit des données ERDDAP réelles avec l'observation datée du `2026-10-27T12:00:00Z`. Le seuil opérationnel strict du dépôt est de **900 minutes (15 heures)**. Au moment où les artefacts régionaux ont été écrits, l'observation avait déjà dépassé ce seuil : les données doivent donc être explicitement signalées comme périmées (`stale: true`).

Ce rapport distingue la récupération d'une source réelle, le marquage de fraîcheur des artefacts, les contrôles CI et la vérification en production. Ces éléments ne sont pas interchangeables. **La certification E2E en production n'est pas déclarée terminée** tant que les checks du PR et les réponses des domaines n'ont pas été vérifiés après déploiement autorisé.

## 2. Références Git vérifiées

| Élément | SHA / état |
|---|---|
| `main` au moment de cette vérification | `f937ee2a9d702594433f5cc620d2ac2e6c57f029` |
| Ancêtre commun de `main` et de la branche mission | `c061724e8d1a804fbaa37437261678d1fa2d589b` |
| HEAD de la branche avant le présent correctif | `77321ccf5b746806aa3365d963183cb4d2d98d19` |
| Branche de mission | `fix/mission-9-3-copernicus-refresh-20261028` |
| Écart comparatif avant correction | branche : 2 commits en avance et 1 en retard sur `main` |

La comparaison a montré que la branche est divergente de `main`. Aucune réinitialisation ni push forcé n'est autorisé ; conserver cet historique et intégrer les changements via une PR.

## 3. Source et âge des observations

- Source déclarée : `erddap-live`.
- `erddapTimestamp` : `2026-10-27T12:00:00Z`.
- Le pipeline a signalé une collecte à `2026-10-27T22:47:46Z`. À cet instant, l'âge calculé depuis l'observation est d'environ **647 minutes**, et non 1 122 minutes.
- Les artefacts JSON ont ensuite été générés autour de `2026-10-28T04:36:45Z–04:36:49Z`. À cette étape, l'âge calculé depuis la même observation était d'environ **997–1000 minutes**, donc supérieur au seuil strict de 900 minutes.
- `scripts/lib/satellite-freshness.cjs` définit `SAT_STALE_HOURS = 15` et renvoie `stale: true` quand l'âge dépasse 900 minutes.

Le timestamp ERDDAP n'a pas été avancé artificiellement. Cette mise à jour **ne prétend pas que la dernière observation disponible est encore fraîche** ; elle veille à ce que les artefacts n'affichent pas un état frais lorsque la limite opérationnelle est dépassée.

## 4. Incohérence régionale corrigée

La vérification de la branche a trouvé le JSON racine à `dataAgeMinutes: 1000, stale: true`, mais sept JSON régionaux à `dataAgeMinutes: 997, stale: false`. Ces valeurs étaient incohérentes avec le seuil de 900 minutes.

Le présent correctif change uniquement le booléen de premier niveau `stale` de ces sept artefacts régionaux, de `false` à `true`, sans modifier l'observation, les niveaux, les scores ni les champs `updatedAt` :

- `public/api/copernicus/barbados/sargassum.json`
- `public/api/copernicus/florida/sargassum.json`
- `public/api/copernicus/gp/sargassum.json`
- `public/api/copernicus/mq/sargassum.json`
- `public/api/copernicus/puntacana/sargassum.json`
- `public/api/copernicus/rivieramaya/sargassum.json`
- `public/api/copernicus/tulum/sargassum.json`

Le JSON racine était déjà à `stale: true`. Le snapshot sur `main` vérifié pendant la même inspection utilisait toujours `erddapTimestamp: 2026-10-26T12:00:00Z`, `dataAgeMinutes: 2064` et un champ statique `stale: false` : cette métadonnée ne doit pas être considérée comme un calcul dynamique de l'âge.

## 5. Tests et contrôles

La session précédente a rapporté :
- `node tests/unit/mojibake-regression.test.cjs` : 0 fichier et 0 occurrence détectés.
- `npm run build` : exit 0, bundle annoncé à 180,03 Ko, sous le budget de 210 Ko.
- Vérification de fraîcheur : `stale: true` pour un âge supérieur à 900 minutes.

Ces résultats sont les preuves rapportées par la session antérieure, et non une nouvelle exécution locale de toutes les suites au moment de ce correctif documentaire et des booléens régionaux. Les contrôles GitHub sur le HEAD final de la PR restent l'autorité pour l'état CI courant.

## 6. État de livraison

- Branche distante : `fix/mission-9-3-copernicus-refresh-20261028`.
- Données d'observation réellement disponibles : observation du `2026-10-27T12:00:00Z`, devenue périmée selon le seuil de 15 heures au moment de la génération régionale.
- Fusion et déploiement : non effectués par cette mission.
- Vérification HTTP des six domaines après déploiement : en attente.
- Ne pas modifier les seuils pour rendre les tests verts, ni changer le timestamp de source pour simuler une observation récente.

## 7. Sécurité et retour arrière

Ne pas revenir à `run_worker_first=false` pour annuler cette correction de fraîcheur : la protection des assets privés est un sujet de sécurité distinct. En cas de régression sur ce changement, créer un revert ciblé sur le commit de correction de fraîcheur, sans annuler les protections Worker.

---

Rapport mis à jour le 28 octobre 2026 à partir de l'état observé sur GitHub. L'état de la PR et les vérifications en production seront ajoutés après leur validation effective.
