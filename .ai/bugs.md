# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

### BUG-2026-018 — Email tracking pixels return PHP source code on MQ+GP (cPanel PHP handler broken)
- **Date** : 2026-08-18 · **Sévérité** : P0 — all email open/click tracking broken since ~Aug 13
- **Fichiers** : `public/api/track-open.php`, `public/api/track-click.php` (live endpoints)
- **Symptôme** : `curl https://sargasses-martinique.com/api/track-open.php?id=test123` returns raw PHP source (1648 bytes, `Content-Type: application/x-httpd-php`) instead of executing → 1×1 transparent GIF (200 bytes). Same for `track-click.php`. `mollie.php` executes correctly (returns JSON) — different handler config.
- **Reproduction** :
  1. `curl -I https://sargasses-martinique.com/api/track-open.php?id=test123` → `Content-Type: application/x-httpd-php`
  2. `curl https://sargasses-martinique.com/api/track-open.php?id=test123` → raw PHP source code
  3. Compare with US domain: `curl https://sargassummiami.com/api/track-open.php?id=test123` → returns GIF, 200 OK
- **Timeline match** : Open rate was ~4.5% on Aug 12-13, dropped to 3.06% on Aug 14, then 1.51% on Aug 17. PHP handler broke ~Aug 13-14.
- **Root cause** : cPanel MultiPHP / AllowOverride not configured for `/api/` directory on MQ+GP shared hosting. Requires founder cPanel access (same blocker as GP doc root).
- **Impact** : First-party pixel tracking completely broken since ~Aug 13. No opens/clicks logged to Supabase `analytics_events` → daily-metrics.json "pixel_first_party" data is stale/frozen. Email metrics unreliable until fixed.
- **Workaround** : TRACKING_URL changed to `sargassummiami.com` (PR #576) — US domains work.
- **Fix required** : Founder action: cPanel → MultiPHP Manager / AllowOverride for `public_html/api/` on sargasses-martinique.com and sargasses-guadeloupe.com.
- **Verification** : After fix, `track-open.php` returns GIF, `track-click.php` redirects 302.
- **Rollback** : None needed — workaround deployed, proper fix is server config.
- **Statut** : [ ] Bloqué sur accès cPanel fondateur

---

### BUG-2026-017
- **Date** : 2026-08-13 (diag + fix) · **Sévérité** : P0 — Funnel cassé (fiche plage vide)
- **Fichiers** : `src/Sargasses_PROD.jsx`, `src/BeachSheet.jsx`, `src/app-runtime.css`, `scripts/ui-audit-screenshots.mjs`
- **Symptôme** : Après clic sur un pin carte, la fiche plage affiche `Beach detail length: 0 chars` et `Contains score: none`. Causé par :
  1. `sargassum.json` stale (41.5h old, `stale: true`)
  2. `selectedBeach` mis à jour sans validation des données
  3. Cookie banner (`sg-cookie-banner`) interceptait les clics sur la BottomNav (z-index conflict)
- **Reproduction** : Ouvrir l'app → cliquer un pin carte → fiche vide.
- **Fix** :
  1. **Validation des données** : `onBeachClick` vérifie désormais si la plage existe dans `sargassum.json`. Si les données sont périmées (`stale: true`), un toast est affiché : "Données non rafraîchies, prévisions basées sur des tendances."
  2. **z-index** : `.sg-bottom-nav` passe au-dessus du cookie banner (`--z-bottom-nav: 1040` > `--z-banner: 1030`).
  3. **Tests** : `ui-audit-screenshots.mjs` auto-accepte les cookies pour débloquer la navigation.
- **Tests réalisés** : `npm run build` ✓, `check-bundle-budget` ✓ (181.9 Ko ≤ 210 Ko), `ux-smoke.mjs` ✓ (4 tokens OK).
- **Rollback** : `git revert <hash> --no-edit` (3 fichiers modifiés, aucun impact sur `dist/` ou paiements).

---

### BUG-2026-016 — PassOffer onBuy prop was doSubscribe in WorldPaywall ( regression post-split )
- **Date** : 2026-08-11 (diag + fix) · **Sévérité** : P0 — bouton d'achat pass 30j cassé
- **Fichiers** : `src/PremiumModal/WorldPaywall.jsx:304`, `src/PremiumModal.jsx`
- **Symptôme** : clic "Commencer maintenant →" sur Pass 30j déclenchait `create_subscription` Mollie (abo) au lieu de `create_payment` (pass one-time) → erreur Mollie côté serveur, paiement bloqué.
- **Reproduction** : ouvrir paywall → cliquer Pass 30j → inspecter réseau : POST `/api/mollie.php` action=`create_subscription` au lieu de `create_payment`.
- **Cause racine** : après le split `PremiumModal` (commits `5b87b8b4` + `6020ae78`), la `passCtxRef` (refs qui disait à `doSubscribe` "c'est un pass one-time, pas un abo") a été perdue :
  1. `PremiumModal.jsx` ne créait plus les refs de paiement (`passCtxRef`, `payPlanRef`, `payEmailRef`, etc.), ne les passait plus aux paywalls.
  2. `WorldPaywall.jsx` câblait `onBuy={doSubscribe}` au lieu d'un wrapper qui remplit `passCtxRef.current` puis appelle `doSubscribe`.
  3. Donc `doSubscribe` lisait `passCtxRef.current = undefined` → partait sur la branche abonnement (path `_pc` falsy) → `create_subscription` → serveur Mollie répond error car pas de plan abo valide.
- **Fix** : [x] `PremiumModal.jsx` crée désormais toutes les refs/états de paiement en interne (miroir de l'ancien fichier monolithique ligne ~1739) + bridge `onPassBuy` qui remplit `passCtxRef.current = {pass, cents, days, cur: PAY_CUR}` puis appelle `doSubscribe` (restore comportement pré-split, ancien `onBuy` inline ligne ~2707). `WorldPaywall.jsx` câble `onBuy={onPassBuy}`. `ComicPaywall.jsx` reçoit aussi les props pour cohérence (mais n'a pas de PassOffer monté, juste un bouton narratif).
- **Tests** : `npm run build` ✓ (3.89s), `check-bundle-budget` ✓ (189.7 Ko ≤ 210 Ko), `php -l` ✓ (mollie.php, mollie-lib.php, mollie-webhook.php, create-checkout.php), `ux-smoke.mjs` ✓ (4 tokens OK). Tests Playwright `tests/e2e/funnel-payment.spec.ts` : 8 passent, 5 échouent — mais les 5 échouent **également sur main HEAD sans mes changements** (coquille modale `.sg-modal-panel` perdue post-split, tâche séparée à adresser TASK-P1-002).

### BUG-2026-016b — Byte NUL `\x00` dans WorldPaywall.jsx cassait le build
- **Date** : 2026-08-11 · **Sévérité** : P0 — build cassé en local
- **Fichier** : `src/PremiumModal/WorldPaywall.jsx:373`
- **Symptôme** : `npm run build` → `esbuild: ERROR: Unexpected "\x00"` à la ligne 373
- **Reproduction** : lecture des octets du fichier → byte 0x00 à l'offset 14789 (intercalé dans le commentaire `// force full build ...` ajouté manuellement)
- **Cause racine** : un commentaire `// force full build 2026-08-11 14:46:55Z` a été écrit en UTF-16 LE avec null bytes intercalés, corrompant la fin du fichier.
- **Fix** : [x] Troncation du fichier à l'offset 14761 (avant le commentaire corrompu) + réécriture propre de `export default WorldPaywall\n`. Diff réel = 2 lignes (export propre + newline final).

---

## 🟥 Non résolus

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

### BUG-2026-007 — mol_api() non définie dans retry-failed-payment.php

- **Date** : 2026-08-07 · **Sévérité** : HIGH
- **Fichier** : `public/api/retry-failed-payment.php:25`
- **Description** : `mol_api()` n'existe pas dans le codebase → crash fatal à chaque appel. L'endpoint de relance paiement échoué est totalement cassé.
- **Fix** : [x] Remplacé par `getMollieClient()->payments->get($pid)` (2026-08-07)

### BUG-2026-008 — sg_analytics_event() non définie dans b2b-trial.php

- **Date** : 2026-08-07 · **Sévérité** : HIGH
- **Fichier** : `public/api/b2b-trial.php:95`
- **Description** : `sg_analytics_event()` n'est pas définie dans mollie-lib.php. Appelée sans garde `function_exists()` → crash fatal. L'essai B2B ne retourne jamais le token au client (500).
- **Fix** : [x] Ajouté garde `function_exists()` (2026-08-07)

### BUG-2026-009 — mol_supabase_mirror() ne writes jamais (global $cfg toujours vide)

- **Date** : 2026-08-07 · **Sévérité** : HIGH
- **Fichier** : `public/api/mollie-lib.php:255`
- **Description** : `global $cfg` dans `mol_supabase_mirror()` est toujours vide car les callers chargent `$cfg` en scope local. Le mirror Supabase ne s'exécute jamais → les grants de passes/pro ne sont pas persistés côté serveur, cross-device cassé.
- **Fix** : [x] Paramètre `$cfg` optionnel ajouté, fallback `@include` mollie-config (2026-08-07)

### BUG-2026-010 — Open redirect dans track-click.php

- **Date** : 2026-08-07 · **Sévérité** : MEDIUM
- **Fichier** : `public/api/track-click.php:54`
- **Description** : L'endpoint de tracking email redirige vers n'importe quelle URL http/https sans allowlist de domaines. Vecteur de phishing via emails Sargasses.
- **Fix** : [x] Allowlist de domaines Sargasses ajoutée (2026-08-07)

### BUG-2026-011 — mol_access_for_email() non définie dans forecast.php

- **Date** : 2026-08-07 · **Sévérité** : MEDIUM
- **Fichier** : `public/api/copernicus/forecast.php:56`
- **Description** : `mol_access_for_email()` n'existe pas → l'accès forecast premium par email est cassé. Les utilisateurs payants ne peuvent pas débloquer la prévision J+2→J+7 depuis un autre appareil.
- **Fix** : [x] Fonction implémentée dans mollie-lib.php (query Supabase payment_grants) + garde `function_exists()` dans forecast.php (2026-08-07)

### BUG-2026-012 — Messages d'exception Mollie exposés en réponse HTTP

- **Date** : 2026-08-07 · **Sévérité** : MEDIUM
- **Fichiers** : `mollie-webhook.php:208`, `mollie.php:400`
- **Description** : Les messages d'exception Mollie API sont renvoyés bruts au client. Peuvent fuiter des détails internes (chemins fichiers, format API keys).
- **Fix** : [x] Messages remplacés par 'webhook_processing_error' / 'payment_processing_error' (2026-08-07)

### BUG-2026-013 — Validation email faible dans verify_subscription

- **Date** : 2026-08-07 · **Sévérité** : LOW
- **Fichier** : `public/api/mollie.php:284`
- **Description** : `strpos($email, '@')` accepte des emails invalides comme `@` ou `@.`. Risque d'injection requête Supabase via email malformé.
- **Fix** : [x] Remplacé par `filter_var($email, FILTER_VALIDATE_EMAIL)` (2026-08-07)

### BUG-2026-014 — index.html `<noscript>` + JSON-LD mojibake UTF-8 (SEO)

- **Date** : 2026-08-07 · **Sévérité** : HIGH (SEO)
- **Fichier** : `index.html` lignes 98, 101, 372-386
- **Description** : Le `<noscript>` SEO (contenu de secours crawlé par Google) + 2 JSON-LD `FAQPage` + `Organization` (rich snippets Google) contenaient du mojibake UTF-8 (double-encoding causé par éditeur Windows). Tous les caractères accentués français étaient corrompus : `rèel` (→ `réel`), `ÔåÆ` (→ `→`), `┬½` (→ `«`), `├¬` (→ `ê`), `├®` (→ `é`), `ao├╗t` (→ `août`), `Canc├║n` (→ `Cancún`), `protïge` (→ `protège`), `intïgre` (→ `intègre`), `pïse` (→ `pèse`), `libèrè` (→ `libéré`), `d'o├╣` (→ `d'où`), `donnèes` (→ `données`), `rafra├«chi` (→ `rafraîchi`), `mètèo` (→ `météo`), `ÔÇö` (→ `—`).
- **Impact** : FAQ rich snippets Google affichaient du texte corrompu, `<noscript>` aussi (SEO text de secours).
- **Fix** : [x] Noscript + 2 JSON-LD réparés avec caractères UTF-8 propres (2026-08-07)

### BUG-2026-015 — Fichiers morts JSX importent preact (jamais installé)

- **Date** : 2026-08-07 · **Sévérité** : LOW
- **Fichiers** : `src/VeilleurMascotte.jsx`, `src/useTideTransition.jsx`
- **Description** : 2 fichiers JSX importent `preact` et `preact/hooks` (non installé — l'app utilise React) mais ne sont jamais importés ailleurs dans le codebase. Risque : import accidentel → crash import (useCallback is not defined). Posait problème historique dans smoke (`[sg] errbound useCallback is not defined`).
- **Fix** : [x] Fichiers supprimés du repo (2026-08-07)

---

## 🟩 Résolus

### BUG-2026-004 Paiement Mollie monte fail (nothing"

- **Date** : 2026-07-29 done · **Fix** : soft via l'effet `preaurer

### BUG-2026-005 Error : msg nul; en bloc frib(La protection!)

- **Date** : 2026-07-31 done : réparé → `errMsg` au lieu de `msg` qui était undefined.    

### BUG-2026-006. terminé en regrouper: Mol duplicates et status.

- **Date** : 2026-07-30 done → and field to web.

### BUG-2026-007 mol_api() non définie — retry-failed-payment.php
- **Date** : 2026-08-07 · **Fix** : [x] Replaced with getMollieClient()->payments->get()

### BUG-2026-008 sg_analytics_event() non définie — b2b-trial.php
- **Date** : 2026-08-07 · **Fix** : [x] Added function_exists() guard

### BUG-2026-009 mol_supabase_mirror() global $cfg always empty
- **Date** : 2026-08-07 · **Fix** : [x] Added $cfg parameter + @include fallback

### BUG-2026-010 Open redirect — track-click.php
- **Date** : 2026-08-07 · **Fix** : [x] Domain allowlist added

### BUG-2026-011 mol_access_for_email() undefined — forecast.php
- **Date** : 2026-08-07 · **Fix** : [x] Added function_exists() guard

### BUG-2026-012 Exception messages leaked — mollie-webhook.php, mollie.php
- **Date** : 2026-08-07 · **Fix** : [x] Generic error messages returned

### BUG-2026-013 Weak email validation — mollie.php verify_subscription
- **Date** : 2026-08-07 · **Fix** : [x] Replaced strpos('@') with filter_var FILTER_VALIDATE_EMAIL

---

## Flux agent

1. Bug détecté → ajouter au plan (haut faite)
2. Assigner → [coding_agent] or relevant
3. Fix → lien PR / commit → @move to résolu().

---

> ***Début de session : toujours scanner ce fichier.***