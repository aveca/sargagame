# PLAN 7 JOURS — sargagame (2026-06-27 → 2026-07-03)

> Préparé le 2026-06-26 après le go-live Mollie USD + l'audit repo complet.
> **Chaque jour** : ouvre Claude Code à la racine du repo → lis le bloc du jour →
> colle le **PROMPT** → exécute. Source de vérité du contexte = `NEXT_SESSION.md`
> (entrées 26/06). Ce plan ordonne le **backlog d'audit** + la **veille go-live**.

## ⚙️ Discipline (vaut pour CHAQUE session)
1. **Re-vérifier chaque finding contre le code RÉEL avant de le corriger** — l'audit a produit ~5 faux positifs (saison « absente » alors qu'elle y est, `?premium=1` QA, fichiers « orphelins » référencés, fix USD qui aurait cassé `PAYWALL_READY`). Skepticisme par défaut.
2. **1 fix vérifié à la fois** → `npm run build` (front) / `node -c` (cjs) / `php -l` (php) → PR **draft** → merge squash → deploy auto (push main → daily-copernicus). Garder les PR petites et thématiques.
3. **Revenu = Stripe/Mollie, JAMAIS le funnel** (fenêtre 28 j → mélange l'ancien design abo jusqu'à ~**23/07**). Le funnel compte `sg_pass_cta` seulement APRÈS le `clasp push` (action fondateur).
4. **Ne pas dupliquer les crons GitHub Actions** (ils tournent seuls, cf. plus bas). Un cron Claude mourrait avec le container web éphémère.
5. Finir chaque session par une mise à jour de `NEXT_SESSION.md` (ce qui est fait, ce qui reste).

## 📊 DATA DOC — tableau de bord à checker en DÉBUT de chaque session
```bash
# 1. Fraîcheur pipeline — run <12h (re-run corrige) + composite satellite <36h (re-run ne corrige PAS)
node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const run=(Date.now()-new Date(d.updatedAt))/3.6e6;const sat=d.erddapTimestamp?(Date.now()-new Date(d.erddapTimestamp).getTime())/3.6e6:null;console.log('Source:',d.source,'| run:',run.toFixed(1)+'h',run<12?'OK':'STALE','| satellite:',sat?sat.toFixed(1)+'h':'n/a',(d.stale||(sat&&sat>=36))?'STALE':'OK')"
# 2. Métriques du jour
node -e "const d=JSON.parse(require('fs').readFileSync('scripts/automation/data/daily-metrics.json','utf-8'));const l=d[d.length-1];console.log('Last:',l.date,'| payments',l.payments,'| emails',l.emails,'| feedbacks',l.feedbacks)"
# 3. MRR — VÉRITÉ = Stripe (legacy EUR)
node -e "const d=JSON.parse(require('fs').readFileSync('scripts/automation/data/daily-metrics.json','utf-8'));const s=[...d].reverse().find(x=>x.stripe&&x.stripe.active!=null).stripe;console.log('MRR €'+s.mrr.eur,'|',s.active,'actifs | pastDue',s.pastDue,'| cancel',s.cancelScheduled)"
```
- **Conversions USD** (Mollie pass) : **dashboard Mollie** (les 16 abos Stripe legacy n'y sont pas). C'est LA métrique à surveiller cette semaine (go-live USD 26/06).
- **Funnel** (engagement only, pas le revenu) : `curl -sL "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel"`
- **UX criticals** : `scripts/automation/data/ux-report.json` (regénéré hebdo) — et **ux-watch** t'emaile les nouveaux criticals automatiquement.
- **Auto-alertes mail (déjà actives)** : `revenue-watch` (mouvement Stripe) + `ux-watch` (criticals) → boîte fondateur, dans daily-copernicus.

## 🤖 Cadence autonome (tourne SANS session — ne pas refaire à la main)
`daily-copernicus` (data 4×/j + deploy + dunning `--send` + revenue-watch + ux-watch) · `daily-brief`/`morning-brief`/`weekend-email` (emails) · `weekly-ux-report` · `weekly-optimize` · `ab-evaluator` · `weekly-seo-automation` · `seo-guard` · `weekly-outreach`.

## ⚠️ Action fondateur en attente (quand sur un ordi, 30 s)
`cd scripts/appscript && clasp push` → active le funnel corrigé (compte le vrai `sg_pass_cta`). Non-urgent (reporting only).

---

## J1 · 2026-06-27 — Veille go-live USD + fraîcheur data ⭐
**Objectif** : confirmer que l'USD encaisse + corriger le plus gros trou data de l'audit.
**Data** : dashboard Mollie → 1res conversions USD ? · daily-metrics stripe.
**Tâches** :
- **Fix fraîcheur pipeline (medium, haute valeur)** : `scripts/fetch-sargassum-live.cjs:1637-1647` + `213-218` — le pipeline publie `source:'erddap-live' + updatedAt:now` même si le composite satellite est vieux → le check de fraîcheur ne peut JAMAIS détecter un ERDDAP périmé. Propager le **vrai timestamp satellite** dans `updatedAt` (ou un champ `satTimestamp`) + le comparer dans le check. Vérifier vs un run réel.
**Gate** : `node -c` + un run dry de fetch si possible. **DoD** : un composite vieux ressort STALE.
**PROMPT** : « Lis NEXT_SESSION.md + PLAN_7J.md (J1). Vérifie les 1res conversions USD (Mollie). Puis corrige la fraîcheur data (fetch-sargassum-live.cjs:1637/213) : propage le vrai timestamp satellite pour que le check de fraîcheur détecte un ERDDAP périmé. Vérifie, PR, merge. »

## J2 · 2026-06-28 — Robustesse emails
**Objectif** : éliminer les classes de re-envoi/spam trouvées par l'audit.
**Tâches** :
- `email-weekend.cjs:382-389,509-589,603` — dédup all-or-nothing (marqueur écrit en fin de run → re-envoi du bulletin entier si crash partiel). Passer à un **marqueur incrémental par destinataire** (comme drip-sent). Vérifier aussi la dédup Apps Script `weekend_email` (documentée mais absente du code SMTP migré) → réintroduire OU retirer la mention.
- `incident-apology.cjs:153,161` — flush marqueur en fin de boucle (même bug que ce script répare) → flush incrémental.
- `welcome-email.cjs` — ajouter throttle/cap SMTP par envoi (cohérent avec weekend `sleep` tous les 25).
**Gate** : `node -c` + dry-run. **DoD** : un crash mid-run ne re-spamme pas.
**PROMPT** : « PLAN_7J J2 : robustesse emails — marqueur incrémental weekend-email + incident-apology, throttle welcome-email. Vérifie en dry-run, PR, merge. »

## J3 · 2026-06-29 — Garde-fous paiement (SOIN)
**Objectif** : sécuriser le chemin argent sans rien casser.
**Tâches** :
- **Double-submit wallet** : `walletRedirect` (src/Sargasses_PROD.jsx) — ajouter `if(payBusy)return` + `payBusy` aux deps. **VÉRIFIER d'abord que le cancel Apple Pay reset `payBusy`** (sinon lockout = pire que le bug). Tester le natif (sheet couvre la page → pas de double-tap) vs le redirect (fenêtre fetch = vrai risque).
- **SKU saison divergent** : `PassOffer` 2499¢/210j vs `onSeason` hardcodé 1999¢/183j (8433) → aligner sur 2499/210 (ou décider la valeur, puis allowlist `mollie.php` cohérente).
**Gate** : build + test manuel du flux pass (carte + wallet) sur `?pay=mollie`. **DoD** : double-tap = 1 paiement, retries OK.
**PROMPT** : « PLAN_7J J3 : garde double-submit wallet (vérifier reset payBusy au cancel AVANT) + aligner SKU saison. Soin chemin paiement. Build + test, PR, merge. »

## J4 · 2026-06-30 — Sweep bugs UX bas
**Tâches** (src/) :
- `WorldMapView:1400` CTA « Voir la plage » double `onOpenBeach` (onPointerDown + onClick) → dédup (ref timestamp : skip click si pointerdown récent ; garde le clavier).
- `Sargasses_PROD:10211` FeedbackWidget timer jamais clear → cleanup + mounted guard.
- `:14104` tags OneSignal `fav_` jamais retirés au unfav → retirer dans l'effet de sync.
- `:13846` redirect premium efface TOUS les query params → préserver les params co-occurrents.
- `Conditions.jsx` : aria-label manquant (530) + `island` pas re-propagé dans `update()` (407).
**Gate** : build. **DoD** : pas de régression visuelle (Playwright si dispo).
**PROMPT** : « PLAN_7J J4 : sweep bugs bas (WorldMapView double-fire, FeedbackWidget timer, OneSignal unfav, premium redirect params, Conditions). Build, PR, merge. »

## J5 · 2026-07-01 — Dead-code + résilience build
**Tâches** :
- Dead-code : `Sargasses_PROD` Stripe.js chargé chaque session (provider=Mollie) → ne charger qu'au besoin ; `stripeLinkFor`/`stripeUrlWith` morts ; engagement auto-open unreachable (15215) ; `drip-email.cjs` STRIPE_BASE/stripeLink morts.
- **Résilience deploy** : `regions/index.cjs:23-46` — 1 JSON région invalide casse TOUT le deploy (incl. MQ/GP). **Décider fail-loud vs fail-isolé** : recommandation = isoler (skip la région cassée + log warning, garder MQ/GP) car revenue-critique. + `ci-tests.yml:19` valider TOUTES les régions (pas que mq).
**Gate** : build + `node -e "require('./regions/index.cjs').getAllRegions()"`. **DoD** : une région volontairement cassée ne tue pas MQ/GP.
**PROMPT** : « PLAN_7J J5 : purge dead-code paiement + isole les régions au build (1 JSON cassé ≠ tout le deploy) + CI valide toutes les régions. Build, PR, merge. »

## J6 · 2026-07-02 — Sécurité-profondeur (endpoints, surtout legacy)
**Tâches** (public/api/, bas mais bon à durcir) :
- `collect.php` : vérif Origin + rate-limit (écriture disque déclenchable par n'importe qui).
- `verify_subscription` (mollie/paypal/create-checkout) : unlock par email seul = énumération → au minimum rate-limit + log.
- `fast-deploy.cjs:52` : `DEPLOY_TOKEN` en query string (loggé) → passer en header/POST body.
- `_deploy.php:107` : garde anti zip-slip explicite (défense en profondeur).
- `.htaccess` seul protège collect/config → ajouter une garde applicative (refus si chemin sensible).
**Gate** : `php -l`. **DoD** : endpoints durcis, rien cassé (tester un vrai paiement après).
**PROMPT** : « PLAN_7J J6 : sécurité-profondeur endpoints (collect Origin+RL, verify_subscription RL, deploy token hors URL, zip-slip). php -l, PR, merge, retester un paiement. »

## J7 · 2026-07-03 — Re-priorisation sur données POST-refonte
**Objectif** : repartir de la donnée fraîche, pas du plan.
**Data** : le funnel `sg_pass_cta` a ~1 sem. de trafic post-flip (si `clasp push` fait) ; conversions USD de la semaine ; `weekly-ux-report` frais.
**Tâches** :
- Relancer le **workflow de priorisation** (multi-agents) sur les KPIs frais → nouveau backlog ordonné.
- Évaluer les A/B (`ab-evaluator`) sur données post-refonte.
- Décider les **prochains paris croissance** (SEO seulement si GSC le justifie — au 19/06 : 0 orphelin, 0 striking-distance, home déjà pos 4,7).
**PROMPT** : « PLAN_7J J7 : re-priorisation. Checke le data doc (USD conversions, funnel sg_pass_cta, ux-report frais), lance un workflow de priorisation multi-agents (vérif adversariale), et exécute le top safe. »

---
**Bilan attendu fin J7** : trou fraîcheur data fermé · emails robustes · paiement durci (double-submit, sécu) · UX/dead-code nettoyés · backlog re-priorisé sur données réelles · 1res conversions USD mesurées.
