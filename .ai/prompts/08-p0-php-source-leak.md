# 08 — P0 PHP SOURCE-LEAK HUNTER

Tu es le senior engineer sécurité chargé d'un incident P0 sur l'hébergement cPanel.

## Mission

Corriger et prouver la résolution du problème suivant sur les domaines **MQ + GP** :

- `public/api/track-open.php`
- `public/api/track-click.php`
- le serveur peut actuellement renvoyer le **source PHP brut** au lieu d'exécuter PHP.

Le `.htaccess` de `public/api/` contient déjà une tentative de correction via `AddHandler application/x-httpd-php .php`. Ne pars jamais du principe que cela suffit : vérifie le comportement réellement déployé.

## Règles non négociables

- **D'abord reproduire, ensuite corriger.**
- Ne jamais exposer, imprimer ou committer de secret (`*-config.php`, variables d'environnement, tokens).
- Ne remplace pas le backend par un nouveau service sans nécessité.
- Fix minimal : priorité à la configuration cPanel/.htaccess et à la chaîne de déploiement.
- Ne change pas le money-path Mollie/PayPal.
- Ne modifie pas Apps Script.
- Ne considère pas une réponse HTTP 200 comme preuve suffisante : le body doit être vérifié.

## Vérification initiale

Tester MQ et GP :

```bash
curl -i 'https://sargasses-martinique.com/api/track-open.php?id=probe'
curl -i 'https://sargasses-guadeloupe.com/api/track-open.php?id=probe'
curl -i 'https://sargasses-martinique.com/api/track-click.php?id=probe&url=https%3A%2F%2Fexample.com'
curl -i 'https://sargasses-guadeloupe.com/api/track-click.php?id=probe&url=https%3A%2F%2Fexample.com'
```

Une réponse contenant `<?php`, `function`, `require`, `include`, `PDO`, etc. dans le body est un **P0 confirmé**.

Pour `track-open.php`, vérifier aussi :
- `Content-Type` cohérent avec l'image retournée ;
- body binaire ;
- taille non nulle ;
- aucune fuite du code source.

## Analyse obligatoire

1. Lire :
   - `public/api/track-open.php`
   - `public/api/track-click.php`
   - `public/api/.htaccess`
   - `scripts/automation/lib/email-send.cjs`
   - `scripts/automation/email-events-from-supabase.cjs`
2. Vérifier comment `public/api/` arrive réellement sur les hosts MQ/GP.
3. Vérifier si `.htaccess` est effectivement pris en compte par Apache/cPanel.
4. Vérifier le handler PHP / MultiPHP Manager et la version PHP réellement assignée aux domaines.
5. Déterminer la **cause racine**, pas seulement ajouter des directives au hasard.

## Correction

Appliquer le plus petit correctif garantissant :

```text
HTTP request
   ↓
Apache/cPanel
   ↓
PHP handler actif
   ↓
track-open.php / track-click.php exécutés
   ↓
réponse binaire/HTTP attendue
```

Si la cause est purement cPanel et non versionnée, documenter précisément l'action manuelle requise dans le rapport sans inventer une action côté repo.

## Tests

Après correction :

```bash
php -l public/api/track-open.php
php -l public/api/track-click.php
```

Puis tests live MQ + GP. Refaire un test négatif garantissant l'absence de source PHP.

Vérifier également que le tracking Supabase n'est pas cassé.

## Definition of Done

- [ ] Source PHP impossible à obtenir publiquement sur MQ
- [ ] Source PHP impossible à obtenir publiquement sur GP
- [ ] `track-open.php` retourne le pixel attendu
- [ ] `track-click.php` exécute PHP correctement
- [ ] `php -l` OK
- [ ] Aucun secret touché
- [ ] Aucun changement du money-path
- [ ] Cause racine documentée
- [ ] Test live reproductible documenté

## Rapport imposé

```text
INCIDENT: P0 PHP source leak
DOMAINS: MQ / GP
CAUSE RACINE: [exacte]
FIX REPO: [fichier(s) + résumé]
FIX HOST: [action cPanel si nécessaire]
LIVE MQ: [PASS/FAIL + preuve]
LIVE GP: [PASS/FAIL + preuve]
PHP LINT: [PASS/FAIL]
TRACKING: [PASS/FAIL]
SECURITY: [PASS/FAIL]
ROLLBACK: [exact]
REMAINING BLOCKER: [none | description]
```

Ne clôture pas la mission sur « le fichier semble correct ». La clôture exige une **preuve live** que le code PHP n'est plus servi en clair.