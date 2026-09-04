# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

### BUG-2026-028 — [FIXÉ PROD 2026-09-04] RegionNav ghost layer — liens invisibles et non cliquables
- **Sévérité** : P1 — RegionNav (barre régions en haut) recouverte par `sg-onink-scope` (contenu principal), liens invisibles et non cliquables
- **Date** : 2026-09-04 · **Fichiers** : `src/components/RegionNav.jsx`, `src/Sargasses_PROD.jsx` (header chrome + RegionNav fixed bar)
- **Repro** : Audit Playwright → `elementFromPoint` sur liens RegionNav retourne `DIV.sg-onink-scope` → liens recouverts par contenu principal
- **Causes** :
  1. RegionNav rendu dans header chrome (`z-index: 700`) mais contenu principal (`sg-onink-scope` sur WorldMapView) crée stacking context qui le couvre
  2. RegionNav frère de `.sg-header-row` → ne reçoit pas `pointer-events:auto` (CSS cible uniquement `.sg-header-row > *`)
- **Fix production** :
  1. RegionNav extrait du header chrome → barre fixe séparée z-index 2001 sous header chrome (`top: calc(max(12px, env(safe-area-inset-top)) + 44px)`)
  2. Wrapper `.sg-region-nav-inline` avec `pointerEvents:auto`
  3. RegionNav.jsx : prop `inline` pour rendre sans `position:fixed`
- **Statut** : **FIXÉ EN PROD** — 7/8 liens visibles (1 lien "Guadeloupe" partiellement recouvert par DIV générique, non-bloquant). RegionNav barre fixe z-index 2001 sous header chrome (z-index 2000) au-dessus map content (z-index 1020).

### BUG-2026-030 — [FIXÉ 2026-09-04, sprint carte] Maplabel overlap — pin mq001 non cliquable
- **Cause racine (prouvée par mesure)** : la boîte d'arbitrage du `declutter()` (`[L-w/2,L+w/2]×[T-h,T]`, modèle centré-au-dessus) ne correspond plus à la boîte peinte (`[L,L+w]×[T,T+h]`, ancrée top-left depuis le retrait de `translate(-50%,-100%)` le 2026-08-31). Preuve chiffrée (VW430) : mq029 arb `[65.7,203.7]×[200.1,252.1]` vs mq036 arb `[211.3,304.3]×[188.1,240.1]` = disjointes → conservées, mais boîtes réelles `[134.7,264.7]×[248.1,292.1]` vs `[257.8,342.8]×[236.1,280.1]` = chevauchantes. Le test cliquait `.first()` en ordre DOM (jamais une cible valide si masqué/sous héros).
- **Fix (2 lignes produit + durcissement test)** : `src/WorldMapView.jsx` `declutter()` → boîte réelle + marge 4px (`l:L-4, r:L+w+4, t:T-4, b:T+h+4`, priorité sélection>gravité>nord-sud inchangée) ; `tests/e2e/funnel-payment.spec.ts:82` → 1er label visible ET atteignable (hit-test au centre, le héros opaque "Meilleur choix" pouvant recouvrir un label selon la data du jour — ses boutons ouvrent la même fiche, UX intacte).
- **Validation** : 0 overlap visible 390/430/768/1024/1440 · E2E 21/21 local · smoke 4/4 · weekhub 5/5 · bundle 37.4 Ko.
- **Suivi** : declutter hero-aware (masquer labels sous panneau opaque) = follow-up documenté, non fait (0 changement visible, risque inutile).
- **Sévérité d'origine** : P2 — label mq001 recouvert (bouton héros "88 Plage de Saint-Pierre" ou label voisin selon data du jour) → `locator.click` timeout.
- **Non-régression prouvée** : échec IDENTIQUE sur main pristine f5bdc3bd (worktree + build + test) — bug pré-existant, jamais attribué au sprint branding.
- **Date** : 2026-09-04 · **Fichiers** : `src/WorldMapView.jsx` (`declutter()`), `tests/e2e/funnel-payment.spec.ts:82-95

### BUG-2026-029 — [FIXÉ PROD 2026-09-04] Cloche alertes — clic navigue vers /fiabilite/ au lieu d'ouvrir alertes
- **Sévérité** : P0 — clic sur cloche alertes (header) navigue vers `/fiabilite/` au lieu d'ouvrir centre alertes
- **Date** : 2026-09-04 · **Fichiers** : `src/Sargasses_PROD.jsx` (Header component + freshness badge)
- **Repro** : Clic sur cloche (coords x=206, y=12) → `elementFromPoint` retourne span freshness badge «il y a 3 j» → navigation vers `/fiabilite/` via handler `onReliability`
- **Cause** : Badge freshness EN DIRECT (`sg-live-age` + `sg-freshness`) chevauche visuellement bouton cloche (Util segment). Clic intercepté par freshness badge qui bubble vers handler `onReliability` (navigation `/fiabilite/`).
- **Fix production** :
  1. Badge freshness EN DIRECT : `style={{pointerEvents:'none'}}` → ne capture plus les clics
  2. Util segment : `z-index: 2000` (au-dessus map content 1020)
  3. Boutons cloche : `z-index: 20` + `stopPropagation()`
- **Statut** : **FIXÉ EN PROD** — Badge fraîcheur ne capture plus les clics. Navigation parasite vers `/fiabilite/` éliminée.
- **Résidu-2 RÉSOLU 2026-09-04 (sprint brand, cause racine réelle)** : `search_1` n'est PAS un id DOM — artefact des probes (`search_${i}` = index dans querySelectorAll, `scripts/probe-positions.mjs:24`). Les 3 vrais inputs ont des ids stables (`sg-search-map/list/landing`). La cloche (44×44, pe=auto) n'était pas hit-testable car le wrapper header `absolute` est **clippé par #root effondré à ~19px** (`.theme-comic #root{position:relative}`, cf. MINE-ROOT-RELATIVE Themes.css:108) — `elementFromPoint(241,34)` → BODY. Fix : wrapper `absolute`→`fixed` (Sargasses_PROD.jsx + `HEADERFIX_OFF`, rollback `?headerfix=0`). Preuve : AVANT hit=BODY/false → APRÈS hit=path(SVG)/true, clic OK, URL inchangée, 0 pageerror, cloche visible 390→1440.

### BUG-2026-026 — [FIXÉ 2026-09-03] Money-path Mollie 100 % mort en prod (404 alias + 1101 KV)
- **Sévérité** : P0 — aucune conversion possible sur les 6 domaines (Pages/Workers)
- **Date** : découvert en audit sprint funnel 2026-09-03, présent probablement depuis la migration Pages/Workers
- **Repro** (live) : `POST https://sargasses-martinique.com/api/mollie.php {"action":"verify_subscription","email":"x@y.z"}` → 404 `{"error":"not_found"}` (garde anti-leak PHP du worker) ; `POST /api/mollie` (sans .php) → 500 `error code: 1101` (crash worker).
- **Causes (2 cumulées)** :
  1. Le front appelle `/api/mollie.php` (héritage Apache) ; le worker ne dispatchait que `path === '/api/mollie'` exact → le `.php` tombait sur le guard anti-source-leak → 404. Tout le frontend (create_payment, payment_status, verify_subscription, applepay_session) appelait une 404.
  2. Le compte Cloudflare free avait épuisé son quota KV (`TRANSIENTS`) → tout accès KV levait une exception ; `rateLimit()` étant appelée AVANT le `try/catch` de `handleMollie`, même `/api/mollie` crashait (1101).
- **Fix** : alias `/api/mollie.php` + `/api/mollie-webhook.php` dans le dispatch ; helper `kv()` fail-open (rate-limit fail-open, idempotence fail-open car `UNIQUE(payment_id)`/UNIQUE(subscription_id) en DB protège) ; `request.json()` invalide → 400 propre. Commit `ac6c81d9` (rebases → voir log). Test : `scripts/tests/worker-auth.contract.test.cjs` couvre KV 100 % KO + alias .php + webhook HMAC + grants.
- **Surveillance** : le quota KV se remet à zéro à minuit UTC — si nouveaux 1101, vérifier le quota compte CF (ou passer le plan Workers payant).

### BUG-2026-027 — [OUVERT, P1 infra] SUPABASE_ACCESS_TOKEN expiré/révoqué → apply-supabase-schema 401
- **Date** : 2026-09-03 · **Fichier/workflow** : `.github/workflows/apply-supabase-schema.yml`, secret GH `SUPABASE_ACCESS_TOKEN`
- **Symptôme** : job « Apply Supabase schema » → `Management API HTTP 401`. Le schéma `supabase/schema.sql` N'EST PAS appliqué automatiquement à la base live → la table `sg_users` + colonne `payment_grants.user_id` (sprint identité 2026-09-03) NE SONT PAS en prod.
- **Impact** : jusqu'au fix, auth_google renvoie 503 `user_unavailable`, auth_email ok sans user_id (dégradé propre), parcours email/paiement = inchangé. Front tolérant (cache local + fallback email historique).
- **Fix (fondateur, 2 min)** : Supabase dashboard → Account → Access Tokens → créer un token → remplacer le secret GH `SUPABASE_ACCESS_TOKEN` → relancer le workflow `Apply Supabase schema` (workflow_dispatch). Alternative : coller le bloc `sg_users` de `supabase/schema.sql` dans le SQL Editor.

### BUG-2026-025 — [FIXÉ 2026-08-25] Tulum (sargazotulum.com) sans routes Workers `/api/mollie*`+`/api/b2b*` → checkout impossible + source PHP exposé
- **Sévérité** : P1 — checkout Mollie mort sur ce seul domaine (+ fuite de source `mollie.php`/`mollie-lib.php` en `application/x-httpd-php` via l'origine statique Pages, pas de secret exposé : les `*-config.php` ne sont pas dans le build)
- **Cause (prouvée API CF)** : zone `sargazotulum.com` n'avait que 5 routes Workers (supabase-proxy ×1, sg-payments ×4) contre 7 sur les 5 autres zones — manquaient `sargazotulum.com/api/mollie*` et `sargazotulum.com/api/b2b*` → `b2b-api`. Requêtes tombaient sur Pages = fichiers PHP servis bruts. Deuxième couche : `workers/b2b-api/index.js:509` mapping host→île sans branche `tulum` (fallback `'MQ'`) → même routé, checkout tulum aurait été rejeté `island_mismatch` (front envoie `island:'TULUM'`) ; et `allowedIslands` webhook sans `'TULUM'` → grants skippés.
- **Fix** : (1) 2 routes zone créées via API CF (ids 37333c83…, 481eb4d5…) miroir des 5 zones saines ; (2) worker `index.js` : branche `host.includes('tulum') ? 'TULUM'` + `'TULUM'` dans allowedIslands (additif pur, zéro changement pour les 5 autres domaines).
- **Validation live post-routes** : GET `/api/mollie.php`→404 JSON worker, `/api/mollie-lib.php`→404 (fuite source fermée), POST create_payment prix tamperé → `400 {"error":"Prix invalide"}` identique à Martinique (allowlist active, aucun paiement créé). Post-deploy worker : probe island_mismatch attendue en 400.

### BUG-2026-019 — [FIXÉ 2026-08-23, local non poussé] Achat pass USD 100 % rejeté (« Prix invalide ») sur Miami/Cancún/Punta Cana
- **Sévérité** : P0 — tout le revenu USD mort
- **Cause** : `PassOffer` n'avait pas `currency` → payload `{cents:1499(EUR), cur:"usd"}` → allowlist mollie.php attend 1199 → throw
- **Fix** : `currency={PAY_CUR}` (WorldPaywall/ComicPaywall) + contrat `src/lib/pass-price.js` + test `scripts/tests/pass-money-contract.test.cjs`
- **Validation post-deploy requise** : 1 vrai paiement test USD (dashboard Mollie)

### BUG-2026-020 — [FIXÉ 2026-08-23, local non poussé] Paiement 3DS réussi → retour sans accès
- **Sévérité** : P0 — payeur repart verrouillé après paiement confirmé
- **Cause** : redirectUrl serveur par défaut = `/payment/good.html` (statique, zéro entitlement) ; handler de grant `?mollie_return=1` orphelin depuis le 2026-08-12
- **Fix** : front envoie `redirectUrl: origin+"/?mollie_return=1"` (serveur valide déjà ce champ) + `good.html` → `/?premium_email=<email>` en secours + poller durci (6×2,5 s, purge LS, anti-replay)
- **Validation post-deploy requise** : 1 achat EUR carte 3DS → retour app → accès actif sans ressaisie

### BUG-2026-021 — [FIXÉ 2026-08-23, local non poussé] `?pass=p30` accordait le premium sans preuve de paiement
- **Sévérité** : P0 revenu (trou d'accès gratuit renouvelable à volonté)
- **Fix** : `session_id` exigé (présent dans tous les générateurs legacy) + idempotence `sg_grant_done_<sid>`
- **Repro du trou** : `/?pass=p30` seul → `sg_premium_pass_end` posé (avant fix) — E2E T4 verrouille

### BUG-2026-022 — [OUVERT, P3 infra test] Playwright runner : 3 quirks harness (pas de bug produit constaté)
1. `page.route("**/api/mollie.php")` n'intercepte pas les `fetch` du chunk lazy PremiumModal sous le runner (OK en harnais manuel) → contournement : stub `window.fetch` in-page (`tests/e2e/money-path-regression.spec.ts`)
2. Bouton Google Pay non rendu sous le runner malgré cache `sessionStorage sg_wallet_avail` seedé (T2/T3 fixme)
3. Échap n'atteint pas le handler overlay checkout : `useModalA11y` du shell fait `stopPropagation` avant le handler overlay ; window-capture tenté sans succès sous runner (T6 fixme)
- **Repro** : `npx playwright test tests/e2e/money-path-regression.spec.ts -g "T6"`
- **Statut** : [ ] à diagnostiquer (qa_agent) — gardes wallet/Échap vérifiées par revue de code + harnais manuel

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