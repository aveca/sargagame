# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

---

## 🟥 Non résolus

### BUG-2026-120 Sitemap de secours Tulum : pages partagées absentes (pré-existant au baseline prod)

- **Date** : 2026-11-05 · **Sévérité** : MEDIUM · **Statut** : [ ] Ouvert (hors périmètre P0.118 §9)
- **Fichier** : `tests/region-sitemap-ownership.test.cjs` (test) · `scripts/prepare-ftp.cjs` (sitemap de secours) · `public/about/index.html`, `public/research/index.html`, `public/investigacion/index.html`, `public/for-hotels/index.html` (pages partagées)
- **Description** : le sitemap de secours généré pour la région Tulum **ne référence pas les pages partagées** `/about/`, `/research/`, `/investigacion/` et `/for-hotels/`. Le test `tests/region-sitemap-ownership.test.cjs` échoue donc avec 4 assertions `FAIL` sur « page partagée auto-référencée présente ». Le défaut est **antérieur à la release P0.118** : il est présent sur le baseline production `164d70fd` (le test et les pages partagées y ont été introduits par `ca3191df1` et `682ad9924`, tous deux ancêtres du baseline).
- **Reproduction** :
  1. `git worktree add --detach <dir> 164d70fd5a494c638c4a804a093381e28fc393de`
  2. `VITE_REGION=tulum npm run build && node scripts/prepare-ftp.cjs`
  3. `node tests/region-sitemap-ownership.test.cjs` → `FAIL /about/ … /for-hotels/ …` (4 échecs)
- **Preuve de non-régression P0.118 §9** : le build du baseline `164d70fd` et le build de la branche `release/code-only-fail-closed-20261105` produisent un `tulum-ftp/sitemap.xml` **byte-identique** — SHA-256 `162EC429872EA67DEF536D01EE9E649700CFFD84F7E31CE4FB746CCB1694C5A5` pour les deux. L'écart ne peut donc pas provenir de la release.
- **Plan** : traiter hors §9 (le sitemap de secours est une surface SEO, explicitement hors du périmètre « code-only » qui interdit de toucher aux routes/SEO). Correctif candidat : faire remonter les pages partagées dans `_pageBelongsToRegion` / la génération du sitemap régional, avec un test de non-régression sur les 5 régions.

### BUG-2026-121 Schéma réel `b2b_leads` / `b2b_subscriptions` absent du dépôt

- **Date** : 2026-11-05 · **Sévérité** : HIGH (bloquant P0.118 §1 et §7) · **Statut** : [ ] Ouvert — lecture autorisée requise
- **Fichier** : `workers/sg-payments/index.js` (à créer), `scripts/migrations/` (RLS `public.b2b_leads`), `workers/sargagame/index.js`
- **Description** : aucune occurrence de `b2b_leads` ni de `b2b_subscriptions` dans le dépôt (recherche sur `*.sql`, `*.cjs`, `*.js`, `*.php`, `*.md`, hors `node_modules`/`dist`/`.git`/`.ai`). La Worker live récupérée (`sg-payments` v381) écrit donc des colonnes **inexistantes** (`company_email`, `domain`, `plan`, `subscription_id`, `customer_id`), ce qui échoue silencieusement côté PostgREST. Le RPC `public.sg_upsert_payment_grant` est, lui, documenté (`scripts/migrations/001_idempotent_payment_grant.sql`) : 7 arguments exacts, `payment_grants(payment_id, type, pass, email, currency, expires_at, granted_at, metadata)`.
- **Reproduction** : `Select-String -Path <tous les .sql/.cjs/.js/.php> -Pattern "b2b_leads|b2b_subscriptions"` → 0 résultat.
- **Plan** : obtenir une **lecture autorisée** du schéma (base jetable ou lecture Supabase read-only) avant d'écrire le moindre code B2B. Ne jamais inventer de colonnes ni de mappings de plan/offer (interdiction produit : « pas de données inventées »).

### BUG-2026-001 Webhook secret Mollie pas configuré

- **Date** : 2026-07-30 · **Sévérité** : HIGH
- **Fichier** : `public/api/mollie-config.php`
- **Description** : `webhook_secret` est commenté/absent → `mollie-webhook.php` accepte n'importe quel appel sans vérifier le hash. À configurer manuellement sur chaque serveur FTP.
- **Reproduction** : Envoyer un POST à `/api/mollie-webhook.php` avec un `id` aléatoire → accepté.
- **Plan** : Ajouter le secret dans le flux de déploiement FTP (`prepare-ftp.cjs`).
- **Statut** : [ ] En attente provisioning serveur

### BUG-2026-002 — Florida + US builds incomplets unique

- **Date** : 2026-07-17 **Sévérité** : MEDIUM
- **Fichier** : `prepare-ftp.cjs`
- **Description** : Les US (Florida, Punta Cana, Riviera Maya) ne sont pas buildés comme région fullavant ; leur FTO-na schedule une route shallow.
- **Reproduction** : lancer `prepare-ftp.cjs` with `--regions florida` — plusieurs pages manquants.
- **Statut** : [ ] Dans le pipe

### BUG-2026-003 — Trop de flags A/B (>50) — dilue significativité

- **Date** : 2026-07-31 · **Sévérité** : LOW (pas visible/ser propose)
- **Fichier** : `src/Sargasses_PROD.jsx`
- **Description** : 50+ `abVariant()` dans la source créént un montage Statistical à mesure, à remettre UTILE que version pour obtenir un signal dans une évaluation valide; cela ralentit also les nouveaux
- **Plan** : `à résoudre comme partie` du Nettle P1 purge précnom.

---

## 🟩 Résolus

### BUG-2026-004 Paiement Mollie monte fail (nothing"

- **Date** : 2026-07-29 done · **Fix** : soft via l'effet `preaurer

### BUG-2026-005 Error : msg nul; en bloc frib(La protection!)

- **Date** : 2026-07-31 done : réparé → `errMsg` au lieu de `msg` qui était undefined.    

### BUG-2026-006. terminé en regrouper: Mol duplicates et status.

- **Date** : 2026-07-30 done → and field to web.

---

## Flux agent

1. Bug détecté → ajouter au plan (haut faite)
2. Assigner → [coding_agent] or relevant
3. Fix → lien PR / commit → @move to résolu().

---

> ***Début de session : toujours scanner ce fichier.***