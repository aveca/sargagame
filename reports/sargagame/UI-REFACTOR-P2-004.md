# P2-004 — Refactoring UI global et Playwright

## Portée livrée sur la branche dédiée

- `src/Sargasses_PROD.jsx` : écran de chargement conditionnel tant que `dataReady=false`, avec rollback contrôlé par `?sgload=0`; classe de focus visible ajoutée aux cinq FAB concernés.
- `src/app-runtime.css` : anneau de focus clavier doré, écran de chargement avec animation respectant `prefers-reduced-motion`, cible tactile mobile de 48 px sur le CTA principal.
- Neuf captures versionnées : trois captures historiques « avant » et six captures « après » (captures pleine page et au-dessus de la ligne de flottaison).
- `playwright.ui-refactor.config.ts` : configuration Playwright explicite pour un preview déjà démarré.
- `tests/e2e/ui-refactor-after.spec.ts` : assertions de rendu fonctionnelles au lieu de l'ancienne assertion triviale `expect(true).toBe(true)`.
- `.github/workflows/ci-tests.yml` : scénario UI Playwright ajouté à la CI et captures publiées en artefact de run.
- `.ai/tasks.md`, `.ai/current_state.md` et `.ai/changelog.md` mis à jour.

## Mesures et preuves

Le workspace source a rapporté `npm run build` avec exit 0, un bundle JavaScript eager gzip de 208.2 Ko (budget 210 Ko) et un smoke test funnel réussi. Il s'agit de mesures rapportées par l'agent source ; le build et le test navigateur seront rejoués par la CI sur le commit de cette PR avant certification.

Les captures sont conservées dans `tests/e2e/screenshots/` afin de permettre une comparaison visuelle vérifiable.

## Problèmes encore ouverts

1. Le serveur preview renvoyait des POST HTTP 501 dans le diagnostic initial. Cela ne prouve pas un bug de rendu UI, mais doit être investigué séparément avant de certifier les fonctions serveur associées.
2. Le diagnostic initial indiquait `FAB count = 0` et le bouton SOS non détecté. Les sélecteurs/tests d'interaction correspondants ne sont donc pas déclarés réussis. Le scénario ajouté vérifie les préconditions de rendu et la visibilité du CTA mobile, mais ne prétend pas certifier chaque FAB.
3. Les assertions Playwright ajoutées doivent passer sur le SHA de la PR. Toute défaillance devra être corrigée avant de considérer le travail validé.

## Sécurité de livraison

- Aucun snapshot Copernicus, historique scientifique, fichier de paiement ou artefact de production n'est inclus dans le périmètre de cette livraison UI.
- Pas de merge ni de déploiement de production dans cette mission.
- Le déploiement reste conditionné à la CI, à la revue et à une autorisation explicite.

## Statut

Livraison poussée sur une branche dédiée et soumise à validation CI. Ne pas annoncer la mission comme certifiée tant que les résultats GitHub du commit de PR ne sont pas terminés.
