# MISSION P1.2-D — Sécurité des assets et continuité du packaging FTP — Rapport final

**Date :** 27/10/2026  
**Verdict final : BLOCKED_SECURITY**  
**Dépôt :** `aveca/sargagame` — PR #1080  
**Branche :** `fix/assets-api-p12-20261027`  
**SHA de départ (distant) :** `1afefc34de32b2c976c755b97e3f62844e650fe9`  
**Chronologie des commits distants vérifiés :** `c526d6f1a2cb68220ab8e23855396629becbe1e6` → `719cd2fb5d93e50999b8b066d2f41086ffd40fe2` → `53a0c2745bdb93c14e422a2c032eadd7cb15b2f9` (HEAD courant)  
**HEAD distant actuellement vérifié :** `53a0c2745bdb93c14e422a2c032eadd7cb15b2f9`  
**Clone de travail isolé :** `C:\Users\user\AppData\Local\Temp\opencode\sargagame-p12d`

---

## 1. Verdict final : BLOCKED_SECURITY

Les workflows GitHub Actions vérifiés sur le HEAD distant exact 53a0c2745bdb93c14e422a2c032eadd7cb15b2f9 sont verts : CI Tests #3006 et Perf Budget + Lighthouse #2285. L’incident GitGuardian 39170333 reste toutefois au statut Triggered dans le commentaire visible de la PR. La branche de correctif est divergente par rapport à main (18 commits en avance, 2 en retard lors de la vérification).

La mission est donc **BLOCKED_SECURITY** : le code est corrigé, les preuves sont démontrées, mais un contrôle de sécurité externe ne peut pas être levé sans accès supplémentaire.

---

## 2. État initial et dépôt

| Élément | État |
|---------|------|
| Dépôt cloné | `C:\Users\user\AppData\Local\Temp\opencode\sargagame-p12d` (isolé) |
| Dépôt local sargagame (non touché) | `C:\Users\user\Documents\GitHub\sargagame`, branche `fix/guard-false-success`, HEAD `b942a2d4` |
| Branche de travail | `fix/assets-api-p12-20261027` |
| SHA de départ (distant) | `1afefc34de32b2c976c755b97e3f62844e650fe9` |
| SHA final poussé | `53a0c2745bdb93c14e422a2c032eadd7cb15b2f9` |

Le dépôt local `C:\Users\user\Documents\GitHub\sargagame` n'a pas été touché.

---

## 3. Cartographie du flux de publication (prouvée)

`public/` (source) → `vite build` → `dist/` → `scripts/prepare-ftp.cjs` → dossier régional FTP → `wrangler.template.jsonc` (`assets.directory="./<ftpDir>"`) → `wrangler deploy` → assets Cloudflare Workers, servis directement car `run_worker_first: false`.

**Preuve :** `Select-String` récursif sur tous les fichiers du clone confirme qu'**aucun script ne lit `.assetsignore`** ; ce fichier est consommé uniquement par Wrangler au déploiement.

---

## 4. Corrigé appliqué (commits `2a07fac6`, `9c451b5f`, `5138c96f`)

### `public/.assetsignore` — suppression du doublon
Le fichier contenait `**/.htaccess` et `**/.htpasswd` en double. Le bloc dupliqué a été supprimé. Le bloc unique est conservé :
```
**/.htaccess
**/.htpasswd
**/_private/
```

### `scripts/prepare-ftp.cjs` — `COPY_SKIP_TOP` et `prepareNewRegion`
- `COPY_SKIP_TOP` passe de `['_gp', '.htaccess', '.htpasswd', 'api/.htaccess']` à `['_gp', '_private']` : `.htaccess` et `api/.htaccess` sont **conservés** dans le dossier FTP ; `.htpasswd` est retiré (fichier inexistant, aucun usage FTP).
- `prepareNewRegion()` : les lignes `'.htaccess'`, `'api/.htaccess'`, `'.htpasswd'` ont été retirées du `skip` local. Seul `_private` reste exclu.

**Résultat :** le dossier FTP contient `.htaccess` et `api/.htaccess` (nécessaires côté serveur FTP), ne contient pas `_private` ni `.htpasswd`, et contient `.assetsignore` à sa racine (lu par Wrangler pour exclure ces fichiers des assets Workers publiés).

### Preuve par exécution contrôlée (test `tests/unit/prepare-ftp-region.test.cjs`)

Un `dist/` factice a été créé avec `.htaccess`, `api/.htaccess`, `_private/nested/secret.json`, `index.html`, etc. `prepare-ftp.cjs` a été exécuté pour `mq` (build partagé) et `puntacana` (région individuelle). Résultats :

| Chemin dans le FTP | mq | puntacana | Rôle |
|-------------------|-----|-----------|------|
| `.htaccess` | ✓ présent | ✓ présent | Protège la racine côté FTP |
| `api/.htaccess` | ✓ présent | ✓ présent | Protège `api/mollie-config.php` côté FTP |
| `_private/` | ✗ absent | ✗ absent | Exclu du FTP (données premium) |
| `.htpasswd` | ✗ absent | ✗ absent | N'existe pas dans le repo |
| `.assetsignore` | ✓ présent | ✓ présent | Lu par Wrangler pour exclure des assets Workers |

**13/13 assertions passées** lorsque le test est exécuté isolément.

---

## 5. Nouveaux tests de régression

**Fichier :** `tests/unit/prepare-ftp-region.test.cjs` (13 assertions)

Le test crée un `dist/` factice avec `.htaccess`, `api/.htaccess`, `_private/nested/secret.json`, exécute `prepare-ftp.cjs` pour `mq` et `puntacana`, et vérifie :
1. `.htaccess` et `api/.htaccess` sont présents dans chaque dossier FTP
2. `_private` et `.htpasswd` sont absents des dossiers FTP
3. `.assetsignore` est présent à la racine de chaque FTP avec les règles `**/.htaccess`, `**/.htpasswd`, `**/_private/`
4. Le contenu de `.htaccess` est intact (règles de protection serveur)

Résultat : **13/13 assertions passées** lorsque exécuté isolément.

---

## 6. Tests et CI — résultats vérifiés

| Contrôle | Résultat | Preuve |
|----------|----------|--------|
| `worker-private-guard.test.cjs` | 17/17 PASS (résultat local rapporté) | Compte rendu de mission |
| `prepare-ftp-region.test.cjs` | 13 assertions PASS isolément (résultat local rapporté) | Compte rendu de mission ; distinct des exécutions CI ci-dessous |
| Bundle | 208,0 Ko gzip ≤ 210 Ko (mesure locale historique) | Clone de travail, région MQ |
| `CI Tests` | **SUCCESS** sur le HEAD distant exact | [Run #3006](https://github.com/aveca/sargagame/actions/runs/40578646840) — SHA `53a0c2745bdb93c14e422a2c032eadd7cb15b2f9` |
| `Perf Budget + Lighthouse` | **SUCCESS** sur le HEAD distant exact | [Run #2285](https://github.com/aveca/sargagame/actions/runs/40578646822) — SHA `53a0c2745bdb93c14e422a2c032eadd7cb15b2f9` |
| `GitGuardian Security Checks` | **BLOQUANT — incident encore Triggered** | [Commentaire GitGuardian sur la PR](https://github.com/aveca/sargagame/pull/1080#issuecomment-6451351117), incident `39170333`, occurrence du commit `1afefc34de32b2c976c755b97e3f62844e650fe9` |

Les deux workflows Actions verts ci-dessus sont vérifiés sur le HEAD courant. Ils ne démontrent ni la classification GitGuardian, ni la synchronisation avec `main`, ni une fusion ou un déploiement en production.
---

## 7. Incident GitGuardian — analyse

L'incident `39170333` est signalé sur le commit `1afefc34de32b2c976c755b97e3f62844e650fe9`, fichier `scripts/prepare-ftp.cjs`, détecteur `Generic Password`.

Dans le commit `1afefc34`, `COPY_SKIP_TOP` contenait `['_gp', '.htaccess', '.htpasswd', 'api/.htaccess']`. GitGuardian a détecté `.htpasswd` comme un mot de passe générique.

Dans le commit `c526d6f1` (état historique à cette étape ; voir la section 12 pour le HEAD actuel) :
- `COPY_SKIP_TOP = ['_gp', '_private']` — `.htpasswd` n'est plus présent
- `prepareNewRegion` ne contient aucune occurrence de `.htpasswd` (vérifié)
- Le fichier `.htpasswd` n'existe pas dans le repo

**Conclusion : c'est un faux positif.** `.htpasswd` est un nom de fichier de configuration Apache standard (fichier contenant des mots de passe hachés, stockés localement sur le serveur FTP), pas un mot de passe en clair. Le fichier n'existe même pas dans le dépôt. Aucune valeur sensible n'est exposée.

Comme je n'ai pas accès au dashboard GitGuardian pour classifier cet incident comme faux positif, je ne peux pas lever le blocage CI. Le maintainer de la PR ou un administrateur GitGuardian doit classer cet incident comme faux positif depuis le dashboard.

---

## 8. Opérations NON effectuées

- Aucun merge de branche
- Aucun push sur `main` (le push a été fait uniquement sur `fix/assets-api-p12-20261027`)
- Aucun workflow GitHub Actions déclenché manuellement par la mission ; les workflows automatiques déclenchés par les commits ont bien tourné, comme l’attestent les runs listés en section 6.
- Aucun déploiement Cloudflare (wrangler deploy non exécuté)
- Aucun secret réel, clé API ou jeton n’a été créé, modifié, affiché ou exporté. Le dernier commit ajoute une fixture de test synthétique représentant un fichier .htpasswd ; elle ne contient pas d’identifiant de production.
- Aucun `git reset --hard`, `git clean -fd` ni destruction de travail existant
- Le dépôt local `C:\Users\user\Documents\GitHub\sargagame` n'a pas été touché
- `STOP-Autonomy` n'existe pas dans l'environnement et n'a pas été créé/désactivé
- Le superviseur et le pont Factory V3 tournent normalement et n'ont pas été arrêtés

---

## 9. Prochaines actions (autorisation requise)

1. **GitGuardian :** un maintainer ou administrateur ayant accès au dashboard doit examiner l’occurrence `39170333` et la classer comme faux positif uniquement après confirmation que la détection porte sur un nom de fichier, pas sur une vraie valeur secrète. Revérifier le statut ensuite.
2. **Synchronisation Git :** la comparaison distante `main...fix/assets-api-p12-20261027` indique 18 commits en avance et 2 en retard. Réconcilier la branche sans réécriture forcée de l’historique, puis relancer les contrôles sur le nouveau HEAD exact.
3. **Revue et fusion :** après classification GitGuardian, synchronisation, CI verte sur le HEAD final et revue humaine, envisager la fusion de la PR #1080 via GitHub.
4. **Production :** aucun déploiement n’est autorisé par ce rapport. Après autorisation explicite et éventuel déploiement, vérifier réellement `/.htaccess` sur les six domaines, archiver les réponses HTTP et contrôler les assets servis.
---

## 10. Preuves disponibles

- Clone isolé observé pendant la phase initiale : `C:\Users\user\AppData\Local\Temp\opencode\sargagame-p12d` (HEAD local `c526d6f1` à cette étape ; la branche distante a ensuite avancé jusqu’au SHA indiqué en section 12).
- Sortie `check-bundle-budget.cjs` : 208,0 Ko gzip
- Sortie `worker-private-guard.test.cjs` : 17/17
- Sortie `prepare-ftp-region.test.cjs` : 13/13 assertions (exécuté isolément)
- Réponses HTTP réelles des 6 domaines (capturées dans la mission P1.6 antérieure : `/.htaccess` = 200 avant correctif, 404 attendu après déploiement)
- Réponses API GitHub (PR #1080, check-runs sur `c526d6f1`)
- Fichier de test : `tests/unit/prepare-ftp-region.test.cjs` (dans le clone)


---

## 11. Addendum de vérification GitHub — 27 octobre 2026, 16:12 AST

Cet addendum complète le compte rendu initial sans effacer les constats historiques.

### État le plus récent vérifié

- PR de correctif : https://github.com/aveca/sargagame/pull/1080 — toujours ouverte, non fusionnée.
- HEAD observé lors de cet addendum historique : `719cd2fb5d93e50999b8b066d2f41086ffd40fe2`. La section 12 contient la vérification plus récente du HEAD `53a0c2745bdb93c14e422a2c032eadd7cb15b2f9`.
- CI Tests #3004 : **SUCCESS** — https://github.com/aveca/sargagame/actions/runs/40574694649
- Perf Budget + Lighthouse #2283 : **SUCCESS** — https://github.com/aveca/sargagame/actions/runs/40574694119

- Comparaison historique `main...fix/assets-api-p12-20261027` : branche divergente, 17 commits en avance et 1 en retard à cet instant. La vérification plus récente en section 12 observe 18 en avance et 2 en retard.
- Aucun merge ni déploiement en production n'a été effectué par cette vérification.

### Incident GitGuardian toujours à traiter

Le commentaire GitGuardian visible dans la conversation de la PR conserve l'incident **39170333 — Generic Password — état “Triggered”**, référencé au commit `1afefc34de32b2c976c755b97e3f62844e650fe9`, dans `scripts/prepare-ftp.cjs`. Le commentaire décrit une détection liée à la chaîne `.htpasswd`. Les éléments examinés indiquent un nom de fichier Apache, et non une valeur de mot de passe ; cela soutient l'hypothèse d'un faux positif, mais seul le propriétaire/administrateur autorisé peut classer l'incident dans GitGuardian. Aucune preuve d'une classification ou d'une clôture n'a été trouvée dans les commentaires accessibles.

Incident visible : https://github.com/aveca/sargagame/pull/1080#issuecomment-6451351117  
Lien GitGuardian : https://dashboard.gitguardian.com/workspace/929969/incidents/39170333?occurrence=307607679

### Suite autorisée

1. Demander au propriétaire ayant accès à GitGuardian de vérifier l'occurrence et de la classer comme faux positif uniquement après confirmation que la chaîne est bien un nom de fichier et non un secret.
2. Ne pas réécrire l'historique, désactiver le contrôle, contourner le scan ou prétendre que l'incident est résolu sans preuve.
3. Après levée documentée du blocage, réconcilier le retard d'un commit avec `main`, relancer les contrôles et obtenir une revue humaine de la PR.
4. Garder la production inchangée jusqu'à autorisation explicite. Après un éventuel déploiement autorisé, vérifier réellement `/.htaccess` sur les six domaines et archiver les réponses HTTP.

**Verdict actualisé : BLOCKED_SECURITY.** Les deux workflows CI accessibles sont verts au HEAD observé ; la classification GitGuardian, la réconciliation avec `main`, la revue humaine et l'autorisation de déploiement restent des conditions distinctes.


---

## 12. Correction de précision — vérification indépendante, 27 octobre 2026

### SHA et CI vérifiés sur GitHub

Le HEAD distant de la branche fix/assets-api-p12-20261027 est vérifié comme suit :

- SHA exact : 53a0c2745bdb93c14e422a2c032eadd7cb15b2f9.
- Le préfixe 53a0c274 est correct ; le SHA complet anciennement inscrit dans une version de ce rapport était erroné.
- CI Tests #3006 : **SUCCESS** — https://github.com/aveca/sargagame/actions/runs/40578646840
- Perf Budget + Lighthouse #2285 : **SUCCESS** — https://github.com/aveca/sargagame/actions/runs/40578646822
- Le commit actuel ajoute .htpasswd à COPY_SKIP_TOP dans scripts/prepare-ftp.cjs et ajoute dans la fixture de régression un fichier de test synthétique afin de vérifier son exclusion des packages FTP. Cette fixture est une donnée de test et non un compte de production.

### État de la PR et divergence

- PR #1080 : toujours ouverte et non fusionnée — https://github.com/aveca/sargagame/pull/1080
- Comparaison distante main...fix/assets-api-p12-20261027 : **18 commits en avance et 2 commits en retard** au moment de la vérification.
- Les workflows verts ne démontrent ni la résolution de GitGuardian ni la synchronisation de la branche.

### Incident GitGuardian

L’incident 39170333 reste **Triggered** dans le commentaire visible de la PR : https://github.com/aveca/sargagame/pull/1080#issuecomment-6451351117. Le commentaire référence le commit 1afefc34de32b2c976c755b97e3f62844e650fe9 et le nom de fichier .htpasswd dans scripts/prepare-ftp.cjs. Les faits appuient l’hypothèse d’un faux positif, mais aucun élément consulté ne prouve la classification/dismissal dans le dashboard. Il faut examiner le scan après le commit courant et ne pas considérer l’incident résolu sans statut confirmé.

### Suite

1. Un maintainer disposant de l’accès GitGuardian doit examiner puis, uniquement après confirmation, classer l’occurrence comme faux positif.
2. Réconcilier les deux commits de retard sur main sans force-push ; relancer les workflows sur le nouveau SHA exact.
3. Obtenir une revue humaine avant toute fusion. Aucun merge ni déploiement n’a été effectué.
4. Maintenir la production inchangée jusqu’à autorisation explicite. Après tout déploiement autorisé, vérifier réellement les réponses HTTP de /.htaccess sur les six domaines.

**Verdict actualisé : BLOCKED_SECURITY.** Les deux workflows GitHub Actions sont verts sur le HEAD distant exact, mais la classification GitGuardian, la synchronisation avec main, la revue humaine et l’autorisation de production restent distinctes.
