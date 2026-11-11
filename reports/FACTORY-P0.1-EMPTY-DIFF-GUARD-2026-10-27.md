# Rapport de validation — Factory P0.1 : garde-fou anti-faux-succès

**Date :** 27 octobre 2026  
**Dépôt :** [aveca/sargagame](https://github.com/aveca/sargagame)  
**PR de correction isolée :** [#1082 — fail closed on required edits with empty diff](https://github.com/aveca/sargagame/pull/1082)  
**Branche :** `fix/p0-1-empty-diff-guard-20261027`  
**Base :** `main`

## Résultat

Le garde-fou est réintroduit dans une branche propre basée directement sur `main`, avec une fonction pure dédiée et des tests de régression automatiques. La PR est **ouverte en brouillon** pour revue et CI. Aucun merge ni déploiement n'a été effectué.

## Incident trouvé lors de la vérification du rapport précédent

La branche initiale [`fix/guard-false-success`](https://github.com/aveca/sargagame/tree/fix/guard-false-success) ne devait pas être fusionnée telle quelle :

1. Le fichier `scripts/autopilot/local-agent-executor.cjs` contenait deux déclarations identiques de `const ev = policy.evaluateFiles(diff.files, cfg);` dans la même portée, ce qui provoquait une erreur de syntaxe.
2. La comparaison avec `main` montrait une branche divergente : 13 commits en avance, 184 en retard, avec 12 fichiers touchés, dont des changements de file de tâches et d'autres scripts sans rapport direct avec ce correctif.
3. Aucun PR correspondant à cette branche n'a été retrouvé, contrairement à une indication portée dans un ancien rapport intermédiaire.

Pour éviter d'inclure ces modifications sans rapport, la correction a été isolée sur une branche neuve issue de `main`. L'ancienne branche n'a pas été fusionnée ni supprimée.

## Changements de la PR #1082

- `scripts/autopilot/local-agent-executor.cjs` : refuse une tâche qui exige un fichier modifié si le diff produit est vide ; l'évaluation de politique n'est déclarée qu'une seule fois.
- `scripts/autopilot/lib/edit-required-guard.cjs` : fonction pure et fail-closed qui applique l'invariant et renvoie les métriques de contrôle.
- `scripts/autopilot/lib/edit-required-guard.test.cjs` : quatre cas de régression : édition requise sans diff, diff réel, tâche en lecture seule, diff manquant/invalide.

Le runner du dépôt, `scripts/run-tests.cjs`, découvre automatiquement les fichiers `*.test.cjs`.

## État des validations

- Comparaison GitHub avant ajout de ce rapport : branche basée sur `main`, sans retard, avec seulement les trois fichiers de code/tests attendus.
- **Exécution locale isolée :** copie temporaire du helper et du script de test exécutée sous Node.js ; `node --check` a réussi sur ces deux fichiers et les assertions du helper ont donné `4/4`. Cette exécution ne constitue pas un test du dépôt complet.
- Le fichier de test du dépôt a également été renforcé pour exécuter `node --check` sur le vrai `scripts/autopilot/local-agent-executor.cjs`, afin de détecter notamment les déclarations `const` dupliquées.
- Au dernier relevé du HEAD précédent (`66ac3972`), `npm ci` et `Verify Build` étaient réussis ; la suite `*.test.cjs` était encore en cours. Ces résultats ne peuvent pas être hérités automatiquement par le HEAD actuel après modification.
- La validation décisive est la CI sur le HEAD courant de la PR #1082. Consulter les vérifications attachées à la PR ; ne pas fusionner tant que les contrôles requis ne sont pas verts.

## Garde-fous

- Aucun merge.
- Aucun déploiement en production.
- Aucun changement de paiement, prix, secrets ou données opérationnelles.
- Aucune réactivation de l'autonomie.
- Aucun téléchargement de modèle.
- La PR reste en brouillon jusqu'à validation des tests et revue du code.

## Rollback

Revertir les commits de la PR #1082 ou fermer la PR. La branche initiale divergente reste séparée et ne doit pas être utilisée comme base de fusion.

## Preuves GitHub

- [PR #1082](https://github.com/aveca/sargagame/pull/1082)
- [Branche corrigée et isolée](https://github.com/aveca/sargagame/tree/fix/p0-1-empty-diff-guard-20261027)
- [Commit d'intégration du garde-fou](https://github.com/aveca/sargagame/commit/9238b1d086cc89d4cd8b03fdeefb8665e1477d75)
- [Commit du helper](https://github.com/aveca/sargagame/commit/d11dc02b501471727f6742bd348c1459768fc39c)
- [Commit des tests](https://github.com/aveca/sargagame/commit/366cdce0653104f6d2dfcb18df2f1821b075208f)

**Conclusion :** correction isolée et publiée pour revue. Le correctif n'est pas déclaré prêt pour fusion tant que la CI ne confirme pas le HEAD final de la PR.
