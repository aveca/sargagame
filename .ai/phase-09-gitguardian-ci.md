# Procédure d'investigation GitGuardian et CI — PR #1473

> **Règle** : ne jamais désactiver les protections. Cette procédure documente comment investiguer, pas comment contourner.
>
> **Contrainte actuelle** : gh CLI indisponible, aucun token GitHub API, `gh run list` vide sur la branche. L'investigation nécessite un accès GitHub authentifié (fondateur ou release_agent avec token).

## État actuel (constaté)

| Élément | Statut |
|---------|--------|
| GitGuardian Security Checks sur PR #1473 | `IN_PROGRESS` (était `FAILURE` — alerte exacte inconnue) |
| CI runs sur branche `fix/phase-0.7-mollie-supabase` | Vide (`gh run list` = empty, tous les runs sont sur `main`) |
| Merge | Bloqué — nécessite CI verte + autorisation fondateur |

## Procédure d'investigation (à exécuter par le fondateur / release_agent avec token GitHub)

### Étape 1 — Identifier l'alerte GitGuardian exacte

1. Se connecter à GitHub avec un compte ayant accès au repo `aveca/sargagame`
2. Ouvrir PR #1473 : `https://github.com/aveca/sargagame/pull/1473`
3. Onglet « Checks » → cliquer sur « GitGuardian Security Checks »
4. Lire le détail de l'alerte :
   - Fichier concerné
   - Ligne
   - Type de secret détecté (si c'est un faux positif sur un nom de variable dans la documentation, ou une vraie valeur)
5. Si faux positif sur documentation : signaler comme « false positive » dans GitGuardian, ou supprimer la mention litigieuse du diff (ne pas committer de vraie valeur secrète)

### Étape 2 — Vérifier les runs CI sur la branche

1. Onglet « Actions » du repo
2. Filtrer par branche `fix/phase-0.7-mollie-supabase`
3. Vérifier qu'aucun run n'est en cours ou en échec
4. Si aucun run : le workflow `ci-tests.yml` n'est peut-être pas déclenché sur les PR de cette branche (vérifier les `on:` du workflow)

### Étape 3 — Résoudre avant merge

- [ ] GitGuardian : `success` ou `neutral` (pas de `failure`, pas de `pending`)
- [ ] CI : au moins un run vert sur `ci-tests.yml` pour la branche (lint + tests + build + bundle budget)
- [ ] Autorisation fundador pour le merge (jamais de merge auto sans accord)

### Étape 4 — Après merge (si autorisé)

- Le déploiement FTP est automatique via GitHub Actions (push main → build → FTP → health-check)
- Vérifier le déploiement via `scripts/verify-ftp-ready.cjs` et le health-check de production

## Ce que l'agent ne peut PAS faire (pas de token GitHub)

- Lister les runs CI de la branche
- Voir le détail de l'alerte GitGuardian
- Merger la PR
- Déclencher un re-run CI

---

**Résultat visé** : GitGuardian résolu, CI verte sur la branche, prêt pour merge autorisé par le fondateur.