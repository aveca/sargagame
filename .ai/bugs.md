# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

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