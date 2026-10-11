# SARGAGAME_ERRORS — 2026-10-11

Chaque anomalie : URL/domaine · étapes · attendu/observé · preuve · cause · correctif · re-test.

## MP-1 — P1 (CORRIGÉ localement, non poussé) — Réjeu du retour paiement Mollie
- URL : `/?mollie_return=1` (tous domaines)
- Repro (test E2E T5, harnais mock Mollie in-page) : seed `sg_mollie_pending` (session+local) avec `paymentId=tr_ret_e2e`, aller sur `/?mollie_return=1`
- Attendu : grant 1× + marqueur `sg_mollie_done_tr_ret_e2e=1` + pending purgé (2 stockages)
- Avant : `done=null`, `pendingLs` conservé → revisite URL = re-grant + re-track `sg_conversion` (extension pass indéfinie)
- Cause : `src/Sargasses_PROD.jsx` handler `mollie_return` : `clean()` ne purgeait que sessionStorage, jamais de marqueur idempotence
- Correctif : commit `168ee3b55` (branche `agent/qa/fix-mollie-return-antireplay-20261011`) — marqueur `sg_mollie_done_<id>` + purge des 2 stockages + early-return au rejeu
- Après : T5 **PASS** ; build exit 0 ; bundle 206.5 Ko ≤ 210 ; ux-smoke 4 tokens OK ; suite unitaire inchangée (174/220)
- Preuves : `logs/playwright-funnel.log` (avant) · `logs/playwright-money-after-fix.log` (après) · `logs/ux-smoke-after-fix.log`

## MP-2 — P1 (décision produit requise) — Pass premium gratuit via URL
- URL : `https://<domaine>/?pass=p120` (sans `session_id`)
- Repro local : probe `probes/p0-pass-grant.cjs` sur preview → `sg_premium_pass_end` posé, pass actif (capture `screenshots/local-pass-p30-no-session.png`)
- Observé : grant immédiat sans preuve de paiement. Vérifié aussi dans le **bundle prod live** (`origin/main` + asset `index-BzlPojMe.js` : `F==="trip"||/^p\d{1,3}$/` → `localStorage.setItem("sg_premium_pass_end",…)` sans contrôle)
- ATTENTION contexte : `public/api/comps.php` documente les liens `?pass=` comme **cadeaux honor-system volontaires** ; le test T4 (untracked, 2026-08-23) exige l'inverse. Conflit d'intention → pas de correctif unilatéral
- Recommandation : exiger `session_id` OU jeton signé (HMAC, expirant) pour les liens cadeaux ; sinon accepter et documenter le risque
- Équivalent : `?premium=1` seul → `sg_premium` à vie (même bloc 11483) — même décision

## AP-1 — P1 (CORRIGÉ localement, vérif prod après déploiement) — Apple Pay invérifiable
- URL : `/.well-known/apple-developer-merchantid-domain-association` → **404 sur les 6 domaines** (MQ vérifié : 404, quand `/api/apple-pay-domain-association` → 200, 9 095 o)
- Cause : fichier déployé sous `/api/apple-pay-domain-association` (allowlist worker `workers/sargagame/index.js:181`) mais le chemin canonique Apple n'est pas servi par les assets Workers
- Correctif local : rewrite explicite dans le worker + garde `.well-known/` fail-closed (commit `ac40caaeb`) — `node --check` OK
- Reste : déployer puis re-tester le chemin (200) sur chaque domaine

## TU-1 — P1 (CORRIGÉ côté repo ; nécessite déploiement Tulum) — Carte Tulum vide
- URL : `https://sargazotulum.com/data/region-outlines/tulum.json` → **404** ; homepage Tulum : 0 label plage (les 5 autres régions : OK)
- Cause : `public/data/region-outlines/tulum.json` **untracked** (jamais commité) → absent des builds CI → 404 prod
- Correctif : fichier ajouté au repo (commit `ac40caaeb`)
- Reste : déploiement Tulum (`deploy-live.yml`, worker `sargagame-tulum`) + re-test carte

## AN-1 — P2 (non corrigé) — CSP bloque Clarity + Cloudflare Insights
- Observé (6/6 domaines) : `Refused … r.clarity.ms / o.clarity.ms / t.clarity.ms / u.clarity.ms / h.clarity.ms … violates connect-src` ; `static.cloudflareinsights.com … violates script-src` ; erreur aussi présente en local preview
- Impact : analytics comportementales/RUM aveugles sur tous les domaines
- Cause présumée : directives CSP (headers worker / meta) sans allowlist Clarity/CF — à confirmer via headers prod (`logs/` : messages console capturés dans `logs/prod-walk.json`)

## AN-2 — P2 — Beacons `analytics_events` Supabase interrompus (contexte test)
- `POST https://rswdmjtdzrucqzzukfmd.supabase.co/rest/v1/analytics_events` → `net::ERR_ABORTED` répété (probe Playwright, tous domaines). Cause à qualifier (beacon à la navigation vs CORS vs réseau) — à investiguer avec observabilité Supabase

## TU-2 — P2 — Badge « DONNÉE EN RETARD » visible alors que la donnée du jour est à jour
- Homepage MQ desktop (capture `screenshots/prod-mq-home-desktop.png`) alors que `sargassum.json.updatedAt` = 2026-10-10T21:51Z. Probablement déclenché par `erddapTimestamp` satellite plus ancien (affichage honnête par design — à confirmer produit)

## INFRA-HARNAIS (pas des défauts produit)
- `wow-unlock-transition.test.cjs` : untracked local, teste un split `src/PremiumModal/` orphelin ; ignoré pour la certification
- T1/T4 `money-path-regression.spec.ts` : sélecteurs/contrat obsolètes (voir §3 du rapport audit)
- `funnel-payment.spec.ts` : intercepte `window.track` inexistant ; le produit écrit dans `localStorage.sg_track_queue`
- T2/T3/T6 : déjà marqués `test.fixme` dans le repo
