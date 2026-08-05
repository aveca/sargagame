# Rôle : Coding Agent

## Mission
- Développer les features (frontend React, backend PHP, scripts Node)
- Corriger les bugs identifiés
- Refactorer le code (split fichiers, extraction composants)
- Écrire les tests unitaires/intégration

## Fichiers travaillés
- `src/Sargasses_PROD.jsx` — app principale (~13k lignes)
- `src/WorldMapView.jsx` — carte SVG (composant funnel vedette)
- `src/PremiumModal.jsx` — paywall lazy-loaded (~3.3k lignes)
- `src/ChasseHome.jsx` — écran d'accueil comic
- `public/api/mollie.php` — endpoint paiement principal
- `public/api/paypal.php` — endpoint PayPal
- `public/api/mollie-webhook.php` — webhook Mollie
- `public/api/mollie-lib.php` — lib partagée paiements
- `scripts/` — automation, data pipeline, build tools

## Processus de travail
1. **Lire** : `.ai/current_state.md` + `.ai/tasks.md` (tâche assignée) + code existant (`grep` avant tout)
2. **Créer branche** : `agent/coding/<tache-id>` (ex: `agent/coding/TASK-P1-001`)
3. **Analyser** : comprendre le pattern existant, réutiliser le code
4. **Implémenter** : petit changement, commit fréquent
5. **Tester localement** :
   - `npm run build` (exit 0)
   - `node scripts/check-bundle-budget.cjs` (≤ 210 Ko)
   - `php -l` sur chaque `.php` touché
   - `node scripts/ux-smoke.mjs` (4 tokens OK)
6. **Commit** : message conventionnel `type(scope): description`
7. **Documenter** : MAJ `.ai/changelog.md` + `.ai/current_state.md`
8. **Handoff** : pousser la branche, créer PR, MAJ task `[x] done`

## Patterns obligatoires
- **Chercher avant créer** : ~80% existe déjà (`grep`/`rg`)
- **Rollback flag** : tout ajout conversion/UI → `?flag=0` (modèle `pwcomic`, `fc7`, etc.)
- **i18n** : `_t(fr, en, es)` pour tout texte visible
- **Money-path** : additif uniquement, `php -l` obligatoire
- **WorldMapView** : jamais de refacto sans screenshot régression

## Interdictions
- Ne JAMAIS modifier `dist/`
- Ne JAMAIS inventer des données (moat = honnêteté)
- Ne JAMAIS casser le pipeline paiement
- Ne JAMAIS ajouter dépendance sans justification bundle
- Ne JAMAIS créer nouvel état serveur hors Supabase
- Ne JAMAIS push sans Gate de ship passé

## Métriques de succès
- Build vert + bundle budget OK + PHP lint OK + smoke OK
- Commits atomiques, messages clairs
- Code réutilise patterns existants
- Rollback documenté et testé
- Changelog à jour