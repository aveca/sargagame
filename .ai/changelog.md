## 2026-11-13 — Parcours Pro hôtel en libre-service

- `/pro/pricing/` (FR, EN, ES) : boutons Mensuel et Annuel vers les Payment Links Pro, devise selon le domaine. Une ligne dit ce que l'hôtel reçoit et que c'est par e-mail. Plus d'essai 30 jours ni de widget offert sur ces pages. Support par e-mail. Le formulaire `POST /api/b2b-lead` reste une question facultative, après les boutons.
- Après un paiement Pro confirmé, le webhook envoie un e-mail Resend avec le lien d'accès, le code du widget et, si `STRIPE_SECRET_KEY` est une clé live, le portail client. Sinon, la résiliation se fait en répondant à l'e-mail. Une clé TEST n'ouvre pas le portail.

## 2026-11-13 — Caisse publique Stripe seulement, accès après confirmation serveur

- `create_payment` et `create_subscription` renvoient un Payment Link Stripe ou une erreur `no_mollie_fallback`. Plus d'appel Mollie ni de clé TEST pour une nouvelle vente.
- Le webhook n'accorde l'accès que sur `checkout.session.completed` ou `checkout.session.async_payment_succeeded` avec `payment_status=paid` et `livemode=true`. Il traite aussi `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` et `customer.subscription.deleted`.
- Remboursement, litige et résiliation retirent l'accès de façon idempotente. L'idempotence est l'`event.id`. `livemode` est stocké.
- `/merci` reste sur « paiement en cours de confirmation » tant que le statut serveur n'est pas `paid`. L'URL `?premium=1` ou `?session_id` n'écrit plus de droit dans le navigateur.
- Mesure sur la couche existante : `pricing_view`, `CTA_click`, `checkout_started`, et côté webhook `payment_success`, `payment_failed`, `entitlement_granted`, `refund`. Chaque événement porte `livemode` et un identifiant de corrélation sans email.

## 2026-11-13 — Pages d'offres par région, premier écran sans JS, grille Pro honnête

- `/offres/` générée par région (EN Miami, ES Cancún / Tulum / Punta Cana, FR MQ/GP) : gratuit vs payant, prix du catalogue, CTA, formulaire B2B.
- `/premium/` régénérée avec le nom de la région (plus « plages de Martinique » / title Martinique sur les domaines USD et la Guadeloupe).
- Grille Pro affichée : 79 €/mois ou 690 €/an, 89 $/mois ou 790 $/an. Retrait des prix non catalogués 199 € et 219 $ et de la mention fausse « 2 mois offerts ».
- Premier écran HTML : valeur, heure satellite, CTA hôtel et CTA pass, visible sans JavaScript.
- Leads : `POST /api/b2b-lead` vers `b2b_leads`, repli Apps Script déjà en production. Affiliation voyage inactive sans `AFFILIATE_ENABLED=1`.
- Liste Stripe LIVE : `docs/stripe-live-catalog-2026-11-13.md`. Aucune clé, aucun déploiement.

## 2026-11-11 14:00 UTC - Issue #1408 : semáforo EN hreflang réparé (Riviera Maya)

- **Defect #2 corrigé** : la page Semáforo del sargazo de Riviera Maya n'émettait que les hreflang `es` + `x-default`, manquant la variante `en`.
- `scripts/lib/region-seo-pages.cjs` :
  - `buildSlugMap` : `semaforo: lang === 'es' ? 'semaforo-del-sargazo' : null` → `primary === 'es' ? 'semaforo-del-sargazo' : null` (le slug est défini pour ES et ses secondaires, jamais pour les régions EN primaires).
  - `emitLangPages` : le bloc `if (lang === 'es')` devient `if (!slugIndex[lang].semaforo) { skip } else { ... }` avec copy EN complète (title `Sargassum Traffic Light —`, desc, H1, intro) quand `lang === 'en'`.
- `tests/region-seo-hubs-freshness.test.cjs` : +5 assertions de régression (titre EN, hreflang es/en/x-default sur les pages ES et EN).
- Vérifié sur build réel (Riviera Maya `es+en`) : `dist/semaforo-del-sargazo/index.html` et `dist/en/semaforo-del-sargazo/index.html` existent, cluster hreflang es+en+x-default sur les deux, contenu EN sur `/en/`.
- Florida (primaire `en`) : aucune page semáforo émise — pas de régression.
- Builds MQ (défaut), Riviera Maya, Florida : `npm run build` exit 0.
- `node tests/region-seo-hubs-freshness.test.cjs` → OK.
- Non corrigés (denylist `vite.config.js`) : défauts MQ/GP sur `/previsions/`, `/fiabilite/`, `/sargasses-pour-hotels/`, `/pro/widget-sargasses-hotel/` (hreflang manquants) et meta descriptions tronquées.

## 2026-11-10 23:20 UTC - Découverte live P0 : la conversion B2C est fermée hors fenêtre satellite (CTA paywall absent sur les 6 domaines)

- **Constat (mesuré en production, lecture seule)** : sur les **6 domaines**, la fiche plage s'ouvre mais **ne contient aucun CTA paywall** (`lockCtaCount = 0`), l'accueil ne contient **aucun CTA Premium**, et la carte n'affiche **aucun nom de plage** (`labels = 0`). Le paywall reste atteignable **uniquement par deep-link `?paywall=1`** (copie et prix p30 14,99 € corrects). Les 6 domaines répondent 200 (325–457 ms).
- **Cause racine prouvée** : `src/ChasseHome.jsx:522` — `satelliteDecisionCurrent` exige une observation ERDDAP de **moins de 12 h** (`src/lib/format-freshness.mjs:14`). L'observation live vaut `erddapTimestamp = 2026-11-09T12:00:00Z`, soit **2101 min (35 h)**, avec `source = erddap-live` et `stale = false` ⇒ gate faux ⇒ **le CTA « VOIR LES 7 PROCHAINS JOURS → » (l'entrée du paywall, `src/ChasseHome.jsx:667`) n'est pas rendu**. **NOAA ne publie qu'une fois par jour (12:00Z)** : la fenêtre 12:00Z→03:00Z laisse la donnée entre 12 et 36 h ⇒ **la vente est structurellement fermée ~12 h sur 24**.
- **Corroboration** : l'audit E2E planifié sur `main` (run `42909506789`) échoue avec **16 défauts bloquants**, tous `pick-beach`/`nav-broken` sur les 6 domaines — **une seule cause racine**.
- **Incohérence de seuil** : SLA de déploiement satellite = **900 min**, seuil UI = **720 min** : l'interface est plus stricte que le contrat de déploiement, sur une cadence de 1 publication / 24 h.
- **Décision requise du fondateur** (documentée dans `.ai/bugs.md` **BUG-2026-015**, **aucun correctif produit dans ce PR**) : (a) découpler l'**entrée paywall** du verdict satellite — la prévision 7 j vient du pipeline de *forecast*, pas de l'observation ERDDAP ; ou (b) aligner le seuil UI sur le SLA et la cadence NOAA. Le moat d'honnêteté n'est pas en cause : on ne fabrique aucun verdict, mais l'offre ne doit pas être conditionnée à la fraîcheur du verdict.
- **État live relevé au passage** : bundle servi **pré-#1383** (`/premium/` EUR 799/1499/2499 + USD 899/1699, season USD absent, surcharge **+15 %** encore présente, marqueurs SOS `sg-soscta`/`sg_sos_checkout`/`SOS PLAGE 24H`/`SOSPlage` présents, `/?sos=1` → 200) ; `GET /api/mollie-pay?pass=sos` → **410** sur les 6 ; worker financier `sg-payments` live = `e1d72c56-6d52-4fef-961d-9071ab1731c0` (2026-11-10T00:48Z, « Return 410 for SOS GET /api/mollie-pay ») ⇒ **non redéployé** ; worker frontal `sg-noso` = `2f8cf9c4-925c-4c08-9ef0-8d59002cbb77` (00:50Z, « Disable USD +15% display markup »). Aucun déploiement, aucun paiement, aucun envoi.

---

## 2026-11-10 21:33 UTC - P0 « chemin argent » : le serveur décide du SKU, du montant et de la livraison (PR #1370 reprise et réconciliée)

- **Contexte** : PR **#1370** (« chemin argent P0 », head `4809a76f83a174c3c8778eb369ac0b84c3c1bc60`) reprise sur une branche neuve `agent/coding/p0-money-hardening-20261110`, **basée sur `origin/main` `0160a4dd73a2b4bf5505ec2507a243b80f7b84ac`** (le SHA cité dans #1384). #1370 était **en retard sur #1383** (déjà mergée, `1261f1ebf`) : ses prix étaient périmés, et son diff vs `main` **supprimait** `handleMollieReturn`, `handleMolliePayPage`, `handleLegacyCheckout`, les 410 B2B, les plans B2B annuels et les abonnements B2C → un merge naïf aurait été une **régression**. Elle n'est donc **pas** mergée telle quelle : les éléments retenus ont été **réécrits** sur la grille live. #1294 (head `89760080…`) est un **doublon** (contenu déjà dans `main`) → **pas de cherry-pick**, documenté.
- **Failles fermées dans `workers/sg-payments/index.js`** (serveur réel des 6 domaines sur `/api/*`) : `pass` inconnu ou **absent** ⇒ montant libre encaissable ; montant/devise dictés par le client ; `source`/`plan`/`offer_kind` client **choisissant la classification du webhook** ⇒ **365 jours d'accès B2B « pro_annual » payés 29 €** (offre annuelle approuvée : 690 €) ; `redirectUrl` client (open redirect) ; `Host` client en URL de webhook (exfiltration) ; `pfl_…` de profil marchand codé en dur (jamais utilisé) ; paiement `mode:"test"` rapporté `paid` par `payment_status` (Premium déverrouillé côté front).
- **Correctifs** : `resolvePassOffer(pass, cur)` (serveur autoritaire, grille unique `PASS_PRICES`), `400 unknown_offer` / `400 price_mismatch` avec **0 appel Mollie**, `offer_kind` écrit par le serveur, métadonnées client filtrées (`RESERVED_METADATA_KEYS`), `source` = attribution seule, **durée B2B dérivée du CATALOGUE du plan** (`B2B_PLANS[plan].interval`) avec refus `offer_kind_plan_mismatch` et `b2b_offer_with_pass`, **un pass B2C légitime reste B2C**, `requestHost()` + `safeRedirectUrl()` (retour/webhook confinés à la flotte), `mollieProfileId()` (binding uniquement), `payment_status` avec `mode` exposé + `paid=false` si test + contrôle propriétaire. Même traitement pour `workers/sargagame/index.js` (workers régionaux), `public/api/mollie.php` et `public/api/mollie-webhook.php` (webhook PHP : B2B annuel reconnu par **montant approuvé** (290/690/1990 € · 390/790 $) ou `offer_kind` serveur).
- **Tests** : `tests/unit/p0-money-path-offer-resolution.test.cjs` (**99 assertions**, 0 paiement réel, tous les appels sortants interceptés). Le contrat `b2b-conversion-instrumentation` est **RENFORCÉ** (exige désormais `mol_paylink_classify` + `$isApprovedAnnual && !$pass`), jamais affaibli.
- **Harnais E2E réparé** (cause racine : la carte ne peint un verdict que si l'observation satellite a **moins de 12 h**, NOAA publie 1×/jour à 12:00Z ⇒ les tests n'étaient verts que dans la fenêtre de fraîcheur) : helper `tests/e2e/helpers/satellite-freshness.ts` (charge utile réelle, horodatage ERDDAP « maintenant », **aucun verdict fabriqué**), capture des events au **sink first-party** `/collect.php` (l'interception de `window.track` n'interceptait **rien** : le front appelle sa fonction importée, et la télémétrie distante est désactivée en local), assertions **renforcées** (`sg_session_start` **ET** `sg_beach_open`), specs `around-me` corrigées (serveur du harnais, gate réel `?world_around_me=1`, bandeau cookies). **`tests/e2e` : 11 passed / 14 failed → 18 passed / 7 failed** ; les 7 restants ont **une seule** cause racine = **vrai bug produit** → `.ai/bugs.md` **BUG-2026-014** (la carte `z-index:1020` recouvre le panneau `z-index:20` ⇒ « Me localiser » incliquable) — **hors périmètre** de ce PR (feature flaggée, domaine UI).
- **Gate de ship (local, sur le SHA exact)** : `npm run build` exit 0 · budget **206,3 Ko gzip ≤ 210 Ko** (211232/215040) · `php -l` **3/3 OK** · `esbuild` 2/2 OK · `npm test` **190/190 OK** (le seul échec initial — `sitemap-guard-beach-pages` — était un **ordre de build**, il passe une fois `dist/` présent) · smoke UX **4 tokens OK** (`FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`) · `npx playwright test tests/e2e/funnel-payment.spec.ts` **4/4** (stable sur 3 exécutions) · régions OK · `git diff --check` exit 0.
- **NON ACTIVÉ / BLOQUÉ** : **aucun paiement réel** (ni test ni live), **aucun envoi d'e-mail**, **aucun changement de prix**, **aucun secret** lu/écrit/deviné, **aucun déploiement**, **aucun merge**. Preuve bout-en-bout LIVE impossible sans clé Mollie / `sk_test` Stripe / clé service Supabase staging. Worker `sg-payments` **non redéployé** (action manuelle du fondateur) ; version live `e1d72c56-6d52-4fef-961d-9071ab1731c0` (pré-#1383), SHA-256 `C478F188…CFA1A`. Déploiement production **toujours bloqué** par le SLA satellite (`sourceAgeMinutes 1129 > 900`, NOAA 1×/jour à 12:00Z → fenêtre 12:00Z→03:00Z). Les **7 brouillons B2B** restent **0 envoi**.
- **Commits** : `ddefd5e2f` (chemin argent) · `bb61ac37c` (harnais E2E) · handoff `docs(handoff)`. Branche `agent/coding/p0-money-hardening-20261110`.
## 2026-11-11 14:05 UTC - PR B « chemin argent » : le paiement Pro livre enfin l'accès (email + jeton au retour) — PR #1411, non mergée, aucun déploiement

- **PR** : **#1411** (https://github.com/aveca/sargagame/pull/1411), branche `agent/coding/p0-pro-delivery-20261111`, commit head `4098f7866c194ecc697d8fdcd85de802b5d4641a`, base `origin/main` `37336290afdf54c274f80cddd2300a9fbfb80fec`. **NON mergée, AUCUN déploiement** (chemin financier → validation explicite requise).

- **Défaut commercial P0 mesuré sur le LIVE** : le parcours `https://sargasses-martinique.com/pro/espace/` (« S'abonner — 79 €/mois ») **encaissait sans livrer**. Audit du Worker live `sg-payments` (version `payfix-20261110-b2c`, 48 routes) : `fulfillPaidPayment` créait le grant durable + le jeton KV, **mais aucun email n'était envoyé**, et `handleMollieReturn` affichait « Paiement reçu » **sans aucun lien jeton** → un client payait 79 €/mois sans jamais recevoir son accès.
- **Correctifs (PR B)** :
  1. `deliverProAccessEmail()` — email transactionnel de livraison (FR/EN/ES) portant `https://<domaine>/pro/espace/?k=<jeton>` + `/?k=<jeton>`, offre/montant repris de `B2B_PLANS` (source de vérité), envoi via `sendEmail()` (4 fournisseurs, issue honnête). **Idempotent** : marqueur KV `mollie_pro_access_<id>` → un rejeu n'envoie rien ; ambiguïté conservée (pas de doublon), refus explicite libéré (réessai possible).
  2. `handleMollieReturn` — bouton « Mon Espace Pro » portant le jeton quand l'accès est actif.
  3. **Garde-fou double abonnement** : `maybeCreateFollowupSubscription` recréait un abonnement à chaque renouvellement (héritage `metadata.firstPaymentId` + `sequenceType: "recurring"`) → débit 2×/3× par mois. Refus explicite des renouvellements + marqueur scopé **client + offre**.
  4. `public/api/mollie.php` — URL de webhook par défaut : `/public/api/mollie-webhook.php` (**404 live**) → `/api/mollie-webhook.php` (route joignable).
- **Preuve (test comportemental, pas d'inspection de texte seule)** : `tests/unit/p0-pro-access-delivery.test.cjs` → **40 assertions PASS** : webhook d'un paiement Pro payé → 1 email contenant le lien `/pro/espace/?k=` → le jeton **extrait de l'email** est vérifié par `/api/widget-token.php` (`pro: true`) ; rejeu + second événement → **0 email** ; page de retour → lien jeton + « Mon Espace Pro » ; renouvellement → **0 abonnement** + email de jeton renouvelé ; URL PHP vérifiée.
- **Gate** : `npm test` **190/190 OK** · `npm run build` exit 0 · budget **206,3 Ko ≤ 210 Ko** · `php -l` OK · `esbuild` exit 0 · `git diff --check` exit 0 · 14 tests Mollie existants rejoués PASS.
- **Checkout TEST de bout en bout (live, antérieur)** : `POST /api/mollie.php {action:"create_subscription", plan:"pro_monthly"}` → checkout Mollie **79,00 €** « testmode payment » → carte test 4543 4740 0224 9996 → statut **Payé** → retour `/api/mollie-return` « Paiement reçu ». **Aucun droit créé** : `validatePaymentForFulfillment` refuse `mode !== "live"` (`not_live_mode`) — comportement voulu, la preuve bout-en-bout exigera une transaction LIVE.
- **BLOQUANT VENTE (fondateur)** : le secret `MOLLIE_API_KEY` déployé est une clé **TEST** sur les 6 domaines → **zéro encaissement réel possible** tant que la clé LIVE n'est pas posée. Aucun secret touché, aucun prix modifié, aucune donnée inventée, **aucun déploiement**.

---
## 2026-11-10 08:05 UTC - Les 3 livrables sont produits : patch durable vérifié, audit UX live + maquette GP conformes, 7 brouillons B2B (0 envoi)

- **Panel de personas exécuté** (obligation AGENTS.md) : `product-manager` + `ux-critic` + `adversarial-reviewer`, lecture seule. Verdicts convergents : p30 = carte primaire (seule surface or), honnêteté de la donnée avant conversion, plafond de 7 brouillons. Arbitrages et désaccords résolus : `ux-audit/panneau-verdicts.md`.
- **Livrable 1 — patch durable** : `sargagame-b2c-offer-durable.patch` (422 225 o, 64 fichiers, `git diff --binary ff12dbfd3 17d75ec0a`). `git apply --check` OK sur `ff12dbfd3`, application réelle → **arbre identique au commit de la PR** (hash `b5fb19a4…` contrôlé). *Piège évité* : un patch écrit via `Set-Content` PowerShell avait été **corrompu par l'encodage** → réécriture directe par `git diff --output`.
- **Livrable 2 — audit UX factuel + maquette** : `ux-audit/AUDIT-UX.md` + `ux-audit/mockup-gp.html` + `mockup-qa.json` + `audit-live-report.json` + `audit-live-verify.json` + 10 captures. Audit **live** (iPhone 12, reduced-motion, lecture seule, deep-link `?paywall=1`, **0 clic sur un CTA de paiement**) : « LA plage propre chaque matin, 7h » (`src/PassOffer.jsx:91`), aperçu de prévision **codé en dur** « Net/Limpio » (`src/PremiumModal.jsx:894`, visible sur Tulum), compteur « ★ 630+ », badge « 0,50 €/jour » / « $0.57/day », 2ᵉ bouton de paiement « Payer 4,99 € », barre collante « Voir le prix → » qui déclenche le paiement, cibles < 44 px, « 4×/jour » encore publié. **2 faux positifs corrigés** : le « 4,99 € » est l'abonnement mensuel distinct ; les contrastes « non-AA » étaient des éléments masqués par le modal (mesure refaite sur le pixel réellement peint). Maquette : **3 langues × 0 violation**, 1 seule surface or, 0 cible < 44 px, 0 contraste non-AA, 0 texte < 12 px, 0 débordement, 3 cartes / 3 CTA, prix au format de la langue, badge « Notre recommandation » (teal) au lieu de « Le plus choisi ».
- **Livrable 3 — 7 brouillons B2B #4–#10, 0 ENVOI** : `b2b_outreach.md` (+ `b2b_outreach_qa.json` → **7/7 conformes**, 190–221 mots). État de contact réconcilié par **hash strict** : c0 (28/06) + c4 (02/07) pour les 7, + une touche de juillet **à leur adresse** pour Majesty Palm (07/07) et La Suite Villa (14/07) → **n° 4 pour eux, n° 3 pour les 5 autres** ; pour Karibea la touche de juillet est partie sur **une autre adresse** de la société (hash différent) → 2 messages à cette adresse, **3 touches à l'entreprise**. Dernier envoi 118–130 j (cadence 90 j OK), **0 bounce, 0 opt-out**. Faits cités vérifiés : observation du **9 nov. 12:00 UTC**, **21/21 plages suivies propres**, Anse Mitan `clean` (0,07), Pointe des Châteaux `clean` (0,06). **Aucune plage nommée pour Le François** ; aucun statut avancé pour Pointe du Bout / Anse Gros Raisins / Anse Mabouya (hors des 21 suivies). Écartés : « la saison bat son plein » (faux), « 4×/jour », « X jours à éviter », « Le plus choisi », alerte « avant l'échouage », tout pourcentage mono-région, tout appel. Les 4 liens des brouillons (`/pro/espace/` et `?unsub=1` × 2 régions) répondent **200**.
- **Déploiement : toujours BLOQUÉ, même cause** : run 06:49Z → `BLOCKED_STALE_SOURCE`, `sourceAgeMinutes 1129 > 900` ; l'observation NOAA est toujours `2026-11-09T12:00:00Z` (le commit de données `a6e14b9ce` ne change pas l'ancienneté de la source). Reprise automatique à 12:00Z / 18:00Z. **Aucun contournement du gate.** Le retrait de `sg-noso` reste suspendu à la séquence déploiement → vérification → remplacement de route → re-vérification.
- **Script de remplacement de routes CORRIGÉ (aucune écriture exécutée)** : `sg-cf-remove-noso-routes.cjs` en mode `apply` **supprimait** les 6 routes `DOMAINE/* → sg-noso` **sans jamais créer** la route de remplacement → l'appliquer tel quel aurait laissé les 6 domaines **sans route**. Réécrit en **create → verify → delete** (création de `DOMAINE/* → sargagame-<région>`, relecture de la zone, suppression de l'ancienne route seulement si le remplacement est prouvé présent, revérification finale). `plan` rejoué : 6 routes à remplacer, 102 conservées, 0 worker manquant, **aucune écriture**.
- **Mapping live du remplacement PROUVÉ** (service bindings réels de `sg-noso`, lus via l'API Cloudflare) : `GP → sargagame-gp` · `MQ → sargagame-mq` · `FL → sargagame-florida` · `PC → sargagame-puntacana` · **`CN (cancun) → sargagame-rivieramaya`** · `TL → sargagame-tulum`. Les 6 workers `sargagame-*` existent **et** portent un binding `assets` + 3 secrets + l'URL Supabase → ils peuvent servir les domaines directement ; les 102 routes `/api/* → sg-payments` (plus spécifiques) restent prioritaires.
- **⚠️ Risque nouvellement établi, qui impose la séquence** : `sg-noso` réécrit le bundle **à l'exécution** (table de prix gelée, neutralisation SOS, titre du paywall) → le retirer **avant** le déploiement du bundle #1383 exposerait le **VIEUX** bundle (anciens prix 4,99 € / 499 et **surface SOS non masquée**). Séquence impérative : déploiement → vérification live → remplacement de route → re-vérification.
- **Perimètre de la livraison** : `.ai/**` uniquement dans le dépôt (aucun code applicatif, aucun prix, aucun secret, aucun déploiement) ; les livrables sont dans la racine de session `C:\Users\user\AppData\Local\Temp\opencode\sargagame-cycle4\`.

---
## 2026-11-10 05:45 UTC - PR #1383 MERGED (offre B2C durable) · déploiement bloqué par le SLA satellite · `sg-noso` : retrait NON neutre, décision Yacov requise

- **PR #1383 MERGED** sur `main` (`1261f1ebf`) après **CI verte sur le SHA exact** `17d75ec0a` (`test-frontend` ✅ · `perf` ✅ · `lighthouse-report` ✅ · `GitGuardian` ✅ · 6 builds régionaux ✅). Patch : prix de l'offre validée partout (trip7 7,99 € / $8.99, p30 14,99 € / $16.99, season 24,99 € / $27.99), suppression de la surcharge USD « +15 % », SOS absent de la création (410) mais conservé en livraison, fenêtre historique bornée au 2026-11-09, `workers/sg-payments/index.js` resynchronisé à l'identique sur son code LIVE + garde-fous re-appliqués.
- **Déploiement production BLOQUÉ par la DONNÉE (cause externe)** : `Cloudflare Production` échoue sur `Pre-deploy satellite freshness gate` (`observation hors SLA (1039.17 min > 900 min)`). ERDDAP NOAA publie `time_coverage_end = 2026-11-09T12:00:00Z` : **rien de plus récent n'existe**, le pipeline est à jour. Cadence NOAA = 1 observation/jour à 12:00Z, SLA de déploiement = 900 min → fenêtre de publication **12:00Z → 03:00Z**. Reprise **automatique** (cron `daily-copernicus` 12:00Z/18:00Z → commit → `workflow_run` → `Cloudflare Production`). **Aucun contournement du gate n'a été tenté.**
- **État live AVANT déploiement** (lecture seule) : `/api/mollie-pay?pass=sos` → 410 sur les 6 domaines ; `/?sos=1` → surface SOS encore servie ; marqueurs SOS encore dans les bundles ; `/premium/` live EUR 799/1499/2499 + USD 899/1699 (**season USD absent**) ; bundle live USD encore à 499 ; `HIGH_MONTHS`/`RATE = 0.15` encore présents dans `/premium/`.
- **`sg-noso` analysé (code live récupéré) : ce n'est pas un proxy, c'est un réécrivain runtime** — table de prix gelée, taux saisonnier à 0, parcours SOS neutralisé, réécriture du titre, et une injection `extraTiers` (Pass 7 jours + Pass Saison) **dont l'effet est prouvé MORT sur le bundle courant**. Il relaie les 6 domaines vers `sargagame-*` par **service binding**.
- **Une conséquence qui interdit un retrait « à l'aveugle »** : les workers `sargagame-*` n'ont **aucune route publique** (service binding uniquement) → le retrait doit **REMPLACER** `DOMAINE/* → sg-noso` par `DOMAINE/* → sargagame-<région>` (mapping live exact : gp→`sargagame-gp`, mq→`sargagame-mq`, fl→`sargagame-florida`, pc→`sargagame-puntacana`, cancun→`sargagame-rivieramaya`, tulum→`sargagame-tulum`), sans quoi les 6 sites tombent.
- **Second impact — RÉFUTÉ par preuve (correction d'une conclusion antérieure)** : l'injection `extraTiers` du shim est **MORTE** sur le bundle courant. Sur les **33 chunks live** du domaine Martinique, les chaînes **uniques** à `extraTiers` (`Une escapade, un week-end prolongé`, `pass:"trip7",days:7`, `pass:"season",days:210`) sont **absentes**, et le chunk paywall live `PremiumModal-CXOkM4NX.js` (230 362 car) contient **exactement** le paywall du dépôt : titre `Sache où sera la mer`, sous-titre honnête `Dernière observation satellite · Prévision 7 jours · Alerte si ta plage bascule. Un prix, pas d'abonnement.`, **un seul** bouton `sg-passcard-hero` (la réécriture du titre par le shim est elle aussi inactive). **Conclusion : le paywall live EST déjà le paywall du dépôt → le retrait du shim est financièrement NEUTRE** (ni « 3 offres → 1 », ni perte d'offre).
- **Déjà durable, indépendant du shim** : la correction d'honnêteté « Satellite 4×/jour » → « Dernière observation satellite » est dans `src/PassOffer.jsx` ; prix, absence de SOS et refus 410 sont dans le dépôt et seront déployés.
- **Gate local après fusion `origin/main`** : build exit 0 · budget 206,3 Ko ≤ 210 Ko · `php -l` 5/5 · `node --check` 4/4 · `npm test` **189/189** · smoke 4 tokens · régions OK · `git diff --check` exit 0.

---
## 2026-11-10 04:40 UTC - Offre B2C durable : prix alignés sur le live (7,99 € / $8.99 · 14,99 € / $16.99 · 24,99 € / $27.99), surcharge USD +15 % supprimée, SOS définitivement retiré, worker `sg-payments` resynchronisé sur son code LIVE

- **Point de départ (vérifié LIVE, lecture seule)** : le serveur de paiement `sg-payments` **en production** facture déjà l'offre validée (trip7 7,99 € / $8.99, p30 14,99 € / $16.99, season 24,99 € / $27.99), **sans** surcharge saisonnière ; le **dépôt** était en retard (trip7 4,99 €, season 19,99 €, USD 5,99 $ / 11,99 $). Le code live a été **récupéré** (`GET …/workers/scripts/sg-payments/content/v2`, SHA-256 `C478F188…CFA1A`, 137 457 o) et **resynchronisé à l'identique** dans `workers/sg-payments/index.js` : déployer le fichier du dépôt aurait **régressé** la production. `workers/sg-payments/PROVENANCE.md` §8 documente la resync (SHA, taille, offre), §8.2 les garde-fous re-appliqués, §8.3 le **contrôle de non-régression** (0 fonction du durcissement P0.118 perdue ; seule variable #1383 absente du live : `FULFILL_PRICES`, ré-appliquée).
- **Prix alignés sur l'offre validée, partout** : `src/lib/pricing.js` (source unique client), `src/PassOffer.jsx`, `src/PremiumModal.jsx`, `src/Sargasses_PROD.jsx`, `src/HomeAZ.jsx`, `src/HomeJuicy.jsx`, `src/VerticalesMap.jsx`, `public/api/mollie.php`, `public/api/create-checkout.php`, `public/api/paypal.php`, `scripts/lib/premium-page.cjs`, `public/premium/index.html`, `workers/sargagame/index.js` (déployé par la CI sur les 6 workers régionaux) et `workers/sg-payments/index.js`.
- **Surcharge USD « +15 % » (juin→novembre) supprimée** : elle existait côté serveur (mollie.php ×1,15) et côté affichage. Un client voyait « 16,99 $ » et payait 19,54 $ — divergence affichage/débit. Le serveur live facture le montant **affiché** : le bandeau de surcoût de `PassOffer.jsx` est **retiré** (il affichait un montant différent du débit), la fenêtre `HIGH_MONTHS`/`RATE` disparaît de `/premium/`, et la CGV annonce explicitement « le montant affiché est le montant facturé ».
- **SOS définitivement absent** : `sos` hors des grilles de **création** (client, PHP, 2 workers) → refus **410 `offre_indisponible`** (contrat live) ; `sos` **conservé dans la grille de LIVRAISON** (`FULFILL_PRICES` 1,00 €) pour livrer un paiement déjà encaissé — encaisser sans livrer serait un trou de confiance. 0 marqueur SOS dans `dist/` (`sg-soscta`, `sg_sos_checkout`, `SOS PLAGE 24H`, `sos_success`, `SOSPlage`).
- **Fenêtre historique bornée par une date vérifiable** : `HISTORICAL_PASS_PRICES` / `HISTORICAL_PRICES` + `OFFER_CUTOFF_DATE` = **2026-11-09T00:00:00Z** : les montants de l'ancienne offre (4,99 € / $5.99 / $11.99 / 19,99 €) restent livrables **uniquement** pour un paiement créé **avant** la coupure. Un paiement **nouveau** à l'ancien tarif est **refusé** (400).
- **Copy publique alignée** : `/offres/`, `/cgv.html`, `/a-propos/`, `/about/`, `/onboarding.html`, `/veilleur/`, `regions/*.json` (`tripPass` = 7,99 € / $8.99) et `regions/seo-content/*.json` (`USD 8.99 / 16.99 / 27.99`). Le `/premium/` servi expose désormais les **3 passes en USD** (le catalogue live n'en avait que 2).
- **Tests** : `tests/unit/price-parity.test.cjs` **réécrit** (parité sur 8 sources + surfaces publiées + contractualisation affichage = débit) ; `pass-offer-copy`, `sos-public-surface-removed` (410 + 7,99 € + refus 4,99 €), `mollie-payment-logic` (410), `mollie-fulfillment-review` (799/2499), `puntacana-es-observation-copy` ($8.99) alignés.
- **Gate de ship (local)** : `npm run build` exit 0 · budget **206,3 Ko gzip ≤ 210 Ko** (211235/215040) · `php -l` 5/5 OK · `node --check` 4/4 OK · smoke UX **4 tokens OK** (`FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`) · `npm test` **188/188 OK** · régions valides · `dist/` sans marqueur SOS et sans ancien montant USD.
- **NON ACTIVÉ / BLOQUÉ** : **aucun paiement réel** (ni test ni live), **aucun secret** lu/écrit/deviné, **aucun déploiement**, **aucun merge** à la date de cette entrée, **aucune migration** rejouée, **aucune donnée scientifique** touchée. Preuve bout-en-bout LIVE impossible sans clé Mollie / `sk_test` Stripe / clé service Supabase staging. `sg-noso` n'est retiré des 6 routes Cloudflare **qu'après** correctif déployé + vérification live des 6 domaines.

---
## 2026-11-09 12:40 UTC — retrait du parcours de paiement SOS (1 €) + webhook Mollie LIVE fiabilisé

- **Surface publique SOS retirée** (confirmé) : deep-link `?sos=1`, state `showSOS`, FAB `.sg-soscta`, bloc SOS de la fiche plage, modal `src/SOSPlage.jsx` (supprimé), `src/lib/sos-observation-state.mjs` (supprimé), classe `.sg-soscta` (CSS), grille `src/lib/pricing.js`, catalogue `/premium/` (`scripts/lib/premium-page.cjs` + `public/premium/index.html`), template `public/api/mollie-config.example.php`. Aucun événement de funnel `sg_sos_*` n'est plus émis ni allowlisté.
- **Script dangereux supprimé** : `test-mollie-api.mjs` (racine) créait un **paiement LIVE de 1 €** contre `https://sargasses-martinique.com/api/mollie.php` avec `redirectUrl=/?sos_success=1`. Non référencé → supprimé.
- **Création serveur fail-closed** : `sos` retiré des grilles de **création** (`public/api/mollie.php`, `PASS_PRICES` des deux workers) et des catalogues. **Trou refermé dans le worker de production `workers/sg-payments/index.js`** : `if (pass && PASS_PRICES[pass]) … else if (!pass …)` laissait passer **tout pass inconnu** sans contrôle de prix (montant libre encaissable). Règle : pass connu → montant contrôlé ; pass inconnu → `400 Prix invalide`. Prouvé par exécution réelle sur les deux workers (**0 appel de création Mollie** pour `sos` et pour un pass arbitraire).
- **Livraison `sos` CONSERVÉE** (décision de mission) : `FULFILL_PRICES` (2 workers), `DAYS_TABLE`/`PASS_DURATIONS` (sos = 1 j), `mol_pass_prices()` (PHP) et le webhook PHP livrent toujours un paiement `sos` **déjà encaissé** — encaisser sans livrer serait un trou de confiance.
- **Webhook Mollie fiabilisé** :
  - `public/api/mollie-webhook.php` réécrit : parse **classique** (`application/x-www-form-urlencoded`, `id=tr_…`) **+ Next-gen** (JSON `{resource:"event", id:"event_…", type:"payment.paid", entityId:"tr_…"}` ; l'`id` d'événement ≠ l'`entityId`), signature `X-Mollie-Signature` comparée à temps constant (**503** sans secret, **403** signature invalide), état réel relu auprès de l'API Mollie (jamais le corps), `settled` = payé, **révocation** sur `canceled`/`expired`/`failed`/`refunded`, délivrance idempotente.
  - `workers/sargagame/index.js` : le webhook **ne vérifiait aucune signature** (POST `id=tr_…` forgé → délivrance de droit) → signature fail-closed + deux formats + `revokeB2CPass()` (expiration durable de `payment_grants`, la table n'ayant pas de colonne `status`).
- **BUG CRITIQUE corrigé — l'argent était encaissé sans accès** : `validateMollieAmountPHP()` lisait `$payment->amount->currency` alors que le runtime renvoie un **tableau** → montant `null` → **tout pass B2C payé était refusé** (`amount_mismatch`). Correctif : `mol_validate_pass_amount()` via `mol_payment_amount()` (tableau OU objet). Le test `b2b-conversion-instrumentation.test.cjs` **verrouillait ce bug** comme un comportement attendu → inversé (p30 à 14,99 € accepté, montant faux toujours refusé).
- **Confirmation serveur** : `payment_status` (PHP et `workers/sg-payments`) relit l'état chez Mollie, refuse un paiement d'un autre email (`403 payment_owner_mismatch`), délivre le droit de façon **idempotente** (RPC `sg_upsert_payment_grant`) et valide le format `tr_…`. Le webhook n'est plus le point unique de délivrance. **Contrôle propriétaire désormais effectif** : les 5 appels client `payment_status` (`src/PremiumModal.jsx` ×4, `src/Sargasses_PROD.jsx` ×1) transmettent l’email de la commande — sans lui, le refus `payment_owner_mismatch` du serveur aurait été inerte. Garde-fou ajouté dans `tests/unit/mollie-payment-logic.test.cjs` (audit automatique de tous les appels).
- **Idempotence** : `public/api/mollie-lib.php` passe par la **RPC** `sg_upsert_payment_grant` (`ON CONFLICT (payment_id) DO NOTHING`) au lieu d'un POST direct (échouait sur `unique(payment_id)` → 500 → rejeu en boucle de Mollie). Repli INSERT conservé.
- **Post-déploiement inversé** : `--sos-test` vérifie désormais l'**ABSENCE** de surface SOS servie (marqueurs + catalogue `/premium/`). Lecture seule : **aucune création de paiement** émise (interdit sans validation).
- **Tests** : nouveau `tests/unit/sos-public-surface-removed.test.cjs` (absence de surface + création refusée par exécution réelle + livraison conservée + confirmation serveur) ; webhook P0.3 et revue de fulfillment mis à jour (signature obligatoire, Next-gen, 403/503) ; parité des prix, `pass-offer-copy`, `funnel-checkout-events`, `observation-freshness`, `b2b-conversion-instrumentation` alignés ; 5 tests SOS supprimés (le parcours qu'ils couvraient n'existe plus).
- **Gate de ship** : `npm run build` exit 0 · budget **206,3 Ko gzip ≤ 210 Ko** (211220/215040) · `php -l` OK sur les 4 PHP · smoke UX **4 tokens OK** (`FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`) · `npm test` **179/180** (le dernier exige `dist/`, il passe après build) · `git diff --check` exit 0 · régions valides.
- **NON ACTIVÉ / BLOQUÉ** : aucun paiement LIVE créé, aucun refund, aucun déploiement, aucun secret modifié, aucune migration rejouée, aucun prix modifié. La **preuve bout-en-bout LIVE** (paiement réel + webhook + attribution d'accès) reste **impossible sans clé Mollie LIVE** : elle est explicitement étiquetée **bloquée**, pas « validée ». L'état du code réellement déployé reste **non vérifiable** (SHA du dépôt ≠ SHA annoncé pour la v382).

---
## 2026-11-10 00:03 UTC — fraîcheur satellite publiable sans casser le SLA, e-mails de vente rebranchés

- Le SLA opérationnel reste **900 min** (`evaluateObservation.ok`). Une observation plus récente que celle déjà commitée ou live, de moins de 7 jours, peut être publiée et déployée. Refus maintenu : plus ancienne, source non live, pic tout-vert, plus de 7 jours.
- Le classement `BLOCKED_STALE_SOURCE` ne se déclenche que si `verify-ftp-ready` sort en erreur. Sinon le job restait rouge après un simple avertissement et la donnée ne partait jamais en prod.
- Dispatch prod de `data-refresh` / `daily-copernicus` seulement si `publish.outputs.changed == true`.
- Bulletin week-end : timeout job 40 min.
- Nouveau workflow `sales-lifecycle-emails` : briefing matin opt-in, panier abandonné **une fois** (Mollie inclus, cap 40), expiration, bienvenue, digest B2B **uniquement** `yacovassaraf@gmail.com`. CTA pass 30 jours **14,99 € / $16.99**. Aucun e-mail prospect hôtel. Dry-run par défaut sur dispatch manuel.
- Aucun fichier `workers/sg-payments`, paywall, prix front ou SOS modifié.

---

## 2026-11-09 15:36 UTC — Pont autonome GitHub ↔ Factory V3 ↔ OpenCode : cycle de vie live complet + 9 défauts corrigés

- **Défaut #23 — un test NON DÉTERMINISTE échouait en CI.** `multi-repo-bridge-e2e.test.cjs` exigeait `opp.agent.agent` non vide : le routeur ne retient que les agents **réellement installés** (binaire `opencode` présent sur le PC du fondateur, **absent** sur le runner CI) → le test passait en local et **échouait en CI** (run 42651059357 : « FAIL agent routé décidé … Aucun agent exécutable installé »). Correctif : le pont expose un **point d'injection** `options.router` (symétrique à `options.safety` déjà présent) ; le test injecte une décision **déterministe** et vérifie le routage **décision** (agent retenu, moteur réel, écart avec le profil Factory, modèle, raison) au lieu de « un agent est installé sur cette machine ». Nouveau scénario **4b** : sur une machine **sans aucun agent**, la mission est **quand même importée et reste actionnable** (une mission est une donnée : elle ne doit pas être perdue) et la décision porte sa raison (« aucun agent exécutable installé »). Nouveau `lib/agent-router.test.cjs` : mapping type → profil, invariant « l'agent retenu est **toujours** exécutable en non-interactif » (jamais de fausse preuve sur l'issue), stabilité de la décision, absence de secret.


- **Cycle de vie live COMPLET publié sur l'issue #1376** (`aveca/sargagame`, mission `AUTOPILOT-E2E-BRIDGE-20261109-R4`) : `imported` → `started` → `failed` ×5 → `retrying` ×3 → `heartbeat` ×2 → **`blocked`**. Le compte exact est vérifiable sur l'issue : `{imported:1, started:6, failed:5, retrying:3, heartbeat:2, blocked:1}`. **Aucun `completed` sans preuve.** La PR **#1377** a été ouverte par le pont (head `cff6e8f2f122cf5cd2ea31051b18ba23010b1fa0`), **CI 4/4 verte** (GitGuardian, lighthouse-report, perf, test-frontend), **diff conforme** (1 seul fichier `.ai/autopilot/README.md`, +16/−0 — **aucun** `public/api/**` despite le gate qui régénère ces artefacts).
- **Service 24/7 installé, démarré et VÉRIFIÉ sur le PC réel** : tâche planifiée Windows `SargagameAutopilot` (`Running`, `AtLogOn`, `RestartInterval` 1 min ×999, `ExecutionTimeLimit` 0, `IgnoreNew`), chaîne `wscript.exe → run-hidden.vbs → cmd → autopilot-service.cmd → autopilot-live.cmd → run.cjs --live --continuous → runner.cjs`, **verrou PID à un seul runner**. Runner vivant (PID 7372) au dernier contrôle.
- **Défaut #13 — PR polluée par les artefacts de build.** Le gate de ship lance `npm run build`, qui régénère des fichiers versionnés (`public/api/**`, `public/data/**`, `public/version.json`). Le diff était **recalculé** juste avant `commitAll`, alors que le scope-guard et la denylist n'avaient été validés que sur le diff **antérieur** au gate → **PR #1374** (mission « documenter un README ») contenait 4 fichiers au lieu d'1. Correctif fail-closed en 4 temps : restaurer tout fichier hors périmètre → recalculer le diff **réellement committé** → revalider scope + denylist + budget + secrets → committer **uniquement** cette liste (`lib/final-scope.cjs`, `lib/gitops.cjs#restoreOutOfScope`).
- **Défaut #14 — `ReferenceError: diff is not defined` au commit.** Le bloc de commit vivait **après** la boucle `while (attempt <= …)` alors que ses entrées étaient déclarées **dans** la boucle ou supprimées entre-temps. Résultat : agent qui a **réellement travaillé**, gate **VERT**, et mission **perdue** au moment du commit (`2026-11-09 12:59:19`).
- **Défaut #15 — `ReferenceError: allowedScope is not defined` (même famille).** `allowedScope` déclaré dans la boucle, consommé après (`2026-11-09 14:00:15`). Correction **structurelle**, pas un déplacement de ligne : la phase de commit est extraite en `phaseCommitAndPublish({ opp, wt, branch, allowedScope, gateFiles, gate })` — **paramètres explicites**, aucune variable implicite ne traverse la frontière de la boucle ; la famille de bugs devient structurellement impossible. `allowedScope` est hoisté hors de la boucle (invariant de mission, pas de l'agent).
- **Défaut #16 — le pont CRASHAIT sur un bug interne.** Toute exception non rattrapée tuait l'orchestrateur (`exit 1`) : le travail déjà fait par l'agent était perdu et le service devait redémarrer. Correctif : `dispatchOpportunity` attrape, publie `failed` puis `retrying`, reprogramme l'opportunité (`picked`) jusqu'à `MAX_BRIDGE_ERROR_RETRIES = 3`, puis **parque** (`blocked`) avec son diagnostic. Reprise bornée, jamais de boucle infinie, jamais de statut avalé.
- **Défaut #17 — l'agent « narrait » son intention au lieu d'écrire.** Trois échecs successifs (#1373, #1375, #1376) avec le modèle local 9B : prompt de production ≈ 19 000 caractères, la consigne d'action était **noyée** ; le modèle s'arrêtait après `Read` ; puis `edit` avec `oldString` multiligne recopié en LF **échouait** sur les fichiers **CRLF** du dépôt (« Could not find oldString »). Correctifs : (a) le prompt devient une **fonction pure exportée** `buildAgentPrompt()` (`lib/agent-prompt.cjs`) — action en **TÊTE** (primauté) + rappel d'action en **FIN** (récence) ; (b) prescription `read` puis **`write` (contenu complet)** pour les fichiers courts (pas d'`oldString` ⇒ pas de piège CRLF), `edit` réservé aux fichiers longs avec ancre **mono-ligne** ; (c) le module permet une **sonde réelle** (`lib/agent-prompt.probe.cjs`) qui appelle le **même** constructeur et le **même** adaptateur → `Read` → `Write` → « Wrote file successfully. », 5/5 contrôles OK, prompt 14 370 car.
- **Défaut #18 — le watchdog annonçait des `completed` FANTÔMES.** Il écrivait `completed` pour **toute** opportunité terminale : une mission bloquée par une PR ouverte était donc annoncée « completed » — sans commit ni PR dans l'état durable. Correctif : l'état durable **reflète** l'état terminal réel (`ready-to-merge`/`done` → `completed`, `blocked` → `blocked`, `rejected` → `failed`, opportunité absente → `failed`).
- **Défaut #19 — le statut final n'était JAMAIS publié.** La mission #1376 produisait une PR et une CI verte, mais l'issue ne recevait **aucun** statut final (dernier commentaire : un `heartbeat`). Le fondateur ne pouvait pas savoir que le travail était fini. Correctifs : publication des **preuves dès l'ouverture de la PR** (`heartbeat` portant commit SHA + PR + branche + tests réellement exécutés) **et** publication de l'état final dans les deux cas (opportunité sélectionnée **ou** mission d'origine retrouvée par `lifecycle.findByPr`), avec anti-spam par marqueur durable `finalPublishedFor`.
- **Défaut #20 — arrêt propre impossible.** `Stop-ScheduledTask` tuait `wscript` mais **pas les descendants** (`cmd → node run.cjs → node runner.cjs → node orchestrator.cjs`) : les 3 processus `node` continuaient et le verrou PID restait détenu (redémarrage refusé, code 3). Correctif : `autopilot-stop.cmd` / `autopilot-stop.ps1` (kill-switch `STOP` → attente → `taskkill /T /F` sur l'arbre via le PID du verrou). **Testé** : verrou libéré en 3–15 s.
- **Défaut #21 — boucle de service sans délai.** `timeout /t` **échoue en mode caché** (ligne d'entrée non prise en charge) → le service rebouclait sans attendre. Correctif : attente par `ping -n`.
- **Défaut #22 — le moteur exécuté était announced faux.** `implement.cjs` annonçait le profil Factory figé (« hermes »), alors que le seul moteur **réellement câblé** en non-interactif est `opencode`. Correctif : le **moteur réel** est toujours annoncé, l'écart avec le profil déclaré est documenté dans la preuve.
- **Garde-fous** : 5 nouveaux modules (`safety-guard`, `mission-lifecycle`, `mission-watchdog`, `mission-publisher`, `agent-router`, `final-scope`, `agent-prompt`) + **6 fichiers de test** (`safety-guard.test`, `mission-lifecycle.test`, `final-scope.test`, `restore-scope.test`, `orchestrator-scope.test`, `multi-repo-bridge-e2e.test`) + extension du test de câblage (**47 assertions**). Le garde-fou anti-fuite de portée est **mutation-testé** : le défaut réel réintroduit → **3 échecs** sur le code muté, restauration → OK. `npm test` **185/189** ; les **4 échecs sont PRÉEXISTANTS** (identiques à `origin/main`, lisent `dist/` et `scripts/automation/**`, aucun fichier modifié par ce travail).
- **Sécurité** : une issue est une **donnée**, jamais une autorisation. Le `safety-guard` refuse et publie `blocked` pour : déploiement production, merge, paiement/checkout/prix, paiement réel/remboursement, secret/permission, migration irréversible, envoi massif — avec gestion des **négations** (« ne fusionne pas ») et filtrage de nos propres commentaires. `maskSecrets` ne masque que si la clé est sensible **ou** la valeur a une forme de jeton connue (masquage excessif supprimé). Aucun secret dans les logs ni les commentaires publiés.
- **État runtime non versionné** : `.ai/autopilot/mission-state.json` (état live des missions : heartbeats, PR, motifs) est désormais **ignoré** — il est régénéré au démarrage. `queue.json` et `scheduler.json` restent **versionnés** (convention existante du dépôt : « la mémoire exploitable reste trackée ») ; un futur nettoyage de suivi est possible mais hors périmètre.
- **Runbook** : `docs/AUTOPILOT-RUNBOOK.md` — état réel, commande de diagnostic, redémarrage, arrêt propre, codes de sortie, kill-switch, limites assumées, garde-fous, étiquettes de preuve, journal des défauts corrigés.
- **Limites assumées (documentées, non contournées)** : déclencheur `AtStartup` refusé sans droits admin → `AtLogOn` uniquement ; tâche `Interactive` → session ouverte requise ; pas d'accès API Cloudflare local → phase **PREVIEW** non vérifiable (la mission finit `blocked-preview`) ; `aveca/bot-wow` sans harness `scripts/autopilot` → ses missions sont **relayées**, pas exécutées ; `f3.py` (Factory V3 Python) inexploitable (`INTERACTIVE`, `claims_allowed:false`, base figée au 2026-10-27) ; le pont control `C:\factory\control\github-bridge.cjs` est mort et hors du chemin retenu.
- Aucun Worker, binding, secret, paiement, prix, donnée scientifique, seuil ou interface touché. **Aucune fusion, aucun déploiement.**

---


## 2026-11-08 06:15 UTC — la boucle Factory PRODUIT : premier agent local exécuté + 2 défauts de supervision corrigés

- **Premier agent local réellement exécuté** : après le correctif du contrat d'agent (handoff précédent), la boucle a sélectionné une opportunité de découverte (`visual-shift-high on mq/deep-1`), créé le worktree, lancé l'agent local, et l'agent a **sorti en code 0** après ~15 min. Première exécution complète de l'agent local dans ce dépôt.
- **Défaut #11 — le heartbeat se taisait pendant les cycles longs.** Heartbeat du lock, instantané `status.json` et ping healthchecks n'étaient rafraîchis qu'aux **frontières de cycle**. Un cycle qui exécute l'agent dure jusqu'à 25 min : pendant tout le travail, `status.json` affichait un `lastHeartbeat` vieux de **674 s** (mesuré) et le dead-man's switch ne recevait aucun ping. Un opérateur ou un watchdog externe concluait à une panne et pouvait arrêter le runner **au moment où il produisait enfin du travail**. Le lock n'était jamais en danger (`lib/lock.cjs` est *fail-closed* sur un pid vivant) : le défaut était dans le **signal**, pas dans la sécurité. Correctif : `writeStatusSnapshot()` factorisé + **gardien de vie** par cycle (heartbeat + instantané + ping toutes les 60 s), arrêté en `finally`.
- **Défaut #12 — un agent « réussi » sans changement était INDIAGNOSTIQUABLE.** Le parcage ne disait que `scope violation: FAIL_TARGET_UNCHANGED: no files modified by agent`. Sonde contrôlée : l'agent appelle bien son outil d'écriture (« Wrote file successfully ») mais le modèle local (9B) produit un **chemin corrompu** — `tests/u nit/.agent-probe.txt` au lieu de `tests/unit/.agent-probe.txt` (artefact supprimé, runner vérifié propre). L'écriture part à côté de la cible, le diff reste vide, et le garde-fou refuse **correctement** le no-op. Deux manques : (a) `implement.cjs` ne gardait que **stdout**, alors que le CLI OpenCode écrit les **appels d'outils sur stderr** ; (b) le motif de parcage ne mentionnait jamais l'agent. Correctif : `agentLog` garde stdout **et** stderr, et le motif de parcage porte un extrait de la trace. **Le scope-guard n'est pas assoupli.**
- **Limite honnête du modèle local** : `tripolskypetr/qwen3.5-uncensored-aggressive:9b` corrompt les chemins à la tokenisation. Le routeur local **préfère déjà** `qwen3-coder:30b` > `qwen2.5-coder:32b` > `*-coder` : installer un modèle `*-coder` suffit, **sans modification de code**. Aucun workaround inventé dans le dépôt.
- **Garde-fous** : 6 assertions ajoutées sur l'invariant « le heartbeat bat pendant le cycle », 3 sur l'invariant « un agent sans changement reste diagnostiquable ». Le garde du heartbeat a été **prouvé** capable de détecter sa régression (dépôt recopié dans une arborescence temporaire, `runner.cjs` amputé de son gardien, **vrai test** rejoué → échec sur l'assertion exacte « must install a periodic guardian during the cycle »).
- `npm test` **179/183** (les **4 échecs sont PRÉEXISTANTS**, identiques à `origin/main`). CI de la PR #1364 : **4/4 verte** sur le head `5cc35f23b`.
- **Neutralité production** : `runner.cjs`, `orchestrator.cjs` et `implement.cjs` sont **déjà** exclus fichier par fichier du `paths-ignore` de `cloudflare-production.yml`.

---

## 2026-11-08 05:25 UTC — boucle Factory activée en persistance sur le PC du fondateur + 10 défauts d'exécution corrigés

- **Activation persistante RÉELLE, pas simulée.** `install-scheduler.ps1` échoue (« Accès refusé », session non élevée) et `schtasks /create` échoue aussi : la tâche `SargagameAutopilot` **n'existe pas** sur ce PC. Remplacement **sans droit admin** par une clé **`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`** → `run-hidden.vbs` → `C:\Users\user\local-tools\sargagame-autopilot.cmd` → `autopilot-live.cmd` → `run.cjs --live --continuous`. Kill-switch : `sargagame-autopilot-disable.cmd` (retire la clé + pose le `STOP`). **Testé** : runner vivant, lock détenu, heartbeat frais, `status.json` écrit, arrêt propre → redémarrage OK.
- **La boucle est prouvée bout-en-bout sur GitHub** : #1362 `imported` ; #1357 / #1345 / #1338 `imported → blocked → started → blocked` ; #1341 `imported → started → completed` (historique). 10 missions importées.
- **10 défauts d'exécution trouvés en conditions réelles** (le runner était mort depuis le 2026-10-22 : aucun n'était visible) :
  1. **`lib/notify.cjs` jamais commité** (`require` ajouté par `efdcde9da` sans le fichier) → `MODULE_NOT_FOUND` avant le 1er cycle sur tout checkout propre. Restauré à l'identique, sans secret.
  2. **Trace perdue** : `cmd.exe` tient `runner.log` en mode exclusif → `EBUSY` sur chaque append, avalé par un `catch` vide. Journaux séparés (`runner.log` / `runner-console.log`).
  3. **`C.paths.statusFile` inexistant** → l'instantané d'état n'était jamais écrit.
  4. **`manualOpencodeSessionActive()` jamais exportée** → `TypeError` à chaque cycle.
  5. **Contrat de mission non normalisé** → toutes les missions parquées « type manquant » avant dispatch. Normalisation côté pont (l'adaptateur), pas côté orchestrateur.
  6. **AHA = `'n/a'`** (3 caractères, minimum 20) → missions parquées « AHA insuffisamment défini ». Dérivé de l'`acceptance`.
  7. **Instantané mensonger** : `autoMergeEnabled` codé en dur à `true` (config : `false`) et `cycleSuccess` structurellement toujours `false`.
  8. **Angle mort de supervision** : code de sortie non nul n'incrémentait pas `consecutiveErrors` → ni alerte Discord, ni pause de sécurité.
  9. **Boucle infinie** : les opportunités d'analyse/découverte n'étaient jamais écrites en queue → `parkTask()` NO-OP → même candidat re-sélectionné toutes les 30 s, **0 travail produit**. `upsertOpportunity()` + persistance avant parcage → la boucle **converge**.
  10. **Agent local jamais démarré** (`exit 3`) : (a) `implement.cjs` ne nettoyait pas l'env → credentials cloud hérités → refus de l'adaptateur local-only ; (b) OpenCode 1.18.34 n'a **aucun** provider `ollama` intégré sur cette machine → erreur opaque « Unexpected server error ». Correctif : nettoyage d'env + **déclaration à l'exécution** du provider local via `OPENCODE_CONFIG` (fusionnée avec la config globale, jamais écrasée). **Prouvé : `exit 0`, le modèle local répond.**
- **Garde-fous** : 3 nouveaux tests dédiés (`autopilot-clean-checkout-runnable`, `autopilot-queue-persistence-loop`, `autopilot-local-agent-contract`) + extension du test de câblage (44 assertions). `npm test` **179/183** (les **4 échecs sont PRÉEXISTANTS**, reproduits sur `origin/main` — ce sont les feux rouges de la mission #1362).
- **Neutralité production** : chaque fichier local touché est exclu **fichier par fichier** du `paths-ignore` de `cloudflare-production.yml` (jamais `scripts/autopilot/**` en bloc — la production appelle `check-predeploy-satellite-freshness.cjs`, `check-prepared-html.cjs`, `html-integrity.cjs`, `post-deploy-verify.cjs`). Aucun Worker, binding, secret, paiement, prix, donnée scientifique, seuil ou interface touché.
- **PR #1364 ouverte, CI 4/4 verte, NON mergée** (le checkout runner reste épinglé sur la branche).

---

## 2026-11-07 22:55 UTC — pont multi-dépôt RÉELLEMENT branché dans la boucle Factory locale

- **Le gap du pont multi-dépôt est comblé.** La PR #1349 (`87702066`) avait livré `scripts/autopilot/multi-repo-bridge.cjs`, mais sur `main` le runner chargeait encore `bridge.cjs` (`runner.cjs:28`) et appelait `ingestOpenIssues()` (`:158`) : **le module n'était jamais exécuté** par la boucle. Allowlist fermée, routage strict et statuts corrélés n'existaient que sur le papier.
- **Câblage** : `runner.cjs` → `multiRepoBridge.ingestMultiRepo({ dry, log })`, journalisation `imported/relayed/ignored/rejected` + `localRepo`, échecs de publication **comptés** (`statusFailures`), étape **non bloquante** (`bridge failed (non-fatal)`).
- **Statuts de cycle de vie** : `orchestrator.cjs` publie `started` (prise en charge), `completed` (PR prête à merge humain), `blocked` (tâche parquée) et `failed` (erreur) **sur l'issue source**, via `multiRepoBridge.publishStatus()`. Publication jamais bloquante, **jamais en `--dry`**, dépôt hors allowlist refusé.
- **Défaut corrigé (démontré par test)** : une mission relayée n'était pas mémorisée → **re-relayée et republiée à chaque cycle** (flottement de commentaires `imported` en mode continu). Trace durable `queue.relayed` (clé `repo|issue|task_id`), bornée à 200, + `saveQueue()` sur relay.
- **Neutralité production** : `scripts/autopilot/runner.cjs` et `scripts/autopilot/orchestrator.cjs` ajoutés au `paths-ignore` **strict fichier par fichier** de `cloudflare-production.yml` (aucun workflow ne les exécute) → un push sur `main` ne redeploie pas le Worker et ne réécrit pas les secrets de paiement. `scripts/autopilot/**` reste **non** exclu en bloc ; le garde-fou `tests/unit/autopilot-bridge-paths-ignore.test.cjs` est étendu.
- **État réel du PC (vérifié, lecture seule)** : le runner du dépôt est **mort depuis le 2026-10-22** (« MAX_RESTARTS atteint — abandon ») ; la tâche planifiée `SargagameAutopilot` **n'existe pas** ; le lock pointe encore vers le pid `9404` (mort) ; **PID `15072` = `pythonw.exe C:\factory-service\v3\f3.py supervise`** (superviseur Python Factory V3 — `mode=INTERACTIVE`/`interactive_lock` sont ses états, il ne référence **ni** `runner.cjs` **ni** `sargagame`) : ce n'est pas le poller de ce dépôt ; `Factory-Control-Runner` lance `C:\factory\control\github-bridge.cjs` (pont **par labels** `factory:*` sur le canal privé, pas le contrat `[AUTOPILOT]`) ; `SargaFactory-Supervisor` pointe l'ancienne stack `scripts/local-factory/`. → **le poller multi-dépôt n'était actif nulle part**, ce qui explique l'absence d'accusé `imported` sur #1362.
- **Tests** : nouveau `tests/unit/autopilot-runner-multirepo-wiring.test.cjs` (**37 assertions**, zéro réseau) ; `multi-repo-bridge.test.cjs` inchangé et vert ; `npm test` **176/180** — les **4 échecs sont PRÉEXISTANTS** (reproduits à l'identique sur `origin/main` via `git stash`) : `sitemap-guard-beach-pages`, `b2b-outreach-proof-freshness`, `generate-og-beaches-freshness`, `regional-homepage-freshness-copy` — ce sont les feux rouges que la mission **#1362** doit traiter.
- Aucun Worker, binding, secret, paiement, prix, donnée scientifique, seuil ou interface touché.

---
## 2026-11-06 18:35 UTC — mission AUTOPILOT #1337 : pont autopilot multi-dépôt livré (`completed`)

- **PR #1349 fusionnée** (`87702066a79c03ff930500a2bad524df58c1f6f7`, head `8c34d6ce9e1bbfa0742fb476c194a3a07f779511`, 2026-11-06T18:10:59Z) : pont autopilot multi-dépôt, allowlist fermée `aveca/sargagame` + `aveca/bot-wow`, **routage strict**, idempotence par `repo + issue + task_id`, statuts GitHub corrélés, CLI `--status`.
- **Reprise de la PR #1342 après revue** (fermée **sans merge**, supersedée par #1349). 7 défauts corrigés : (1) 85 octets UTF-8 invalides ; (2) `requiredContract` **rejetait les missions réelles** (#1336/#1337 ne portent que `id`) — désormais acceptées, écart reporté (`contract.missing`) ; (3) clé de dédup incompatible avec `bridge.cjs` → risque de double import — clé canonique qualifiée par le dépôt + reconnaissance de la clé historique et de l'`id` ; (4) les missions `bot-wow` étaient **enfilées dans la queue sargagame** (violation « BOT-WOW missions stay in BOT-WOW ») → désormais **relayées** ; (5) le dry-run **mutait la queue** → il ne mute plus rien et distingue `wouldImport` de `imported` ; (6) aucun moyen de publier les statuts, échecs avalés → CLI + `statusFailures` comptés ; (7) une mission pouvait déclarer un dépôt différent de celui de son issue → rejet `repository_mismatch`.
- **Symétrie prouvée** : le même module, dans le checkout BOT-WOW, détecte `aveca/bot-wow` comme dépôt local et y **enfile** les missions BOT-WOW tout en **relayant** les missions sargagame. Un seul pont, deux runners déjà en place — **aucun nouveau runner, aucune API LLM payante, aucun runner cloud**.
- **Preuves** : `npm test` **169/169** ; suite du pont **57 assertions** sans réseau ni écriture ; **mutation check des 5 garde-fous centraux** (routage strict, clé historique, dry-run non mutant, allowlist, correspondance de dépôt) → tous détectés ; dry-run bout-en-bout réel `imported=5 relayed=2 ignored=0 rejected=0 statusFailures=0` ; **idempotence contre la queue VIVANTE du runner** (26 opportunités : #1336/#1337 correctement ignorés, **aucun doublon**) ; chaînes E2E réelles `imported → started → completed` dans les deux dépôts (bot-wow #125 → PR #126 ; sargagame #1341 → PR #1343, **ouvertes et non fusionnées**).
- **Neutralité production vérifiée** : exclusion `paths-ignore` **stricte fichier par fichier** du pont (`scripts/autopilot/multi-repo-bridge.cjs`, `…test.cjs`, + le garde-fou). `scripts/autopilot/**` **n'est PAS** exclu en bloc — la production appelle elle-même `check-predeploy-satellite-freshness.cjs`, `check-prepared-html.cjs`, `html-integrity.cjs`, `post-deploy-verify.cjs`, et une exclusion large empêcherait le déploiement de leurs correctifs ; le garde-fou `tests/unit/autopilot-bridge-paths-ignore.test.cjs` **interdit explicitement** cette régression (mutation vérifiée → `exit=1`). **Aucun run `cloudflare-production.yml` créé** (`total_count` 437 → 437).
- **Contrôle live après fusion** : 6/6 domaines HTTP 200, `b: df18df5d` (18:28:12Z) ; audit Playwright live 12 parcours / 12 défauts **tous** `stale-current-decision` — le défaut d'honnêteté **préexistant**, **aucun nouveau type** introduit (cette PR ne touche aucune interface).
- **Acks publiés sur #1337** : `imported` (6684377579) → `started` (6690440198) → `completed` (6692370601, publié **par la CLI livrée** depuis `main`) → rapport de preuves (6692456511).
- Runner Factory V3 **inchangé** : PID `15072`, `mode=INTERACTIVE`, heartbeat vivant. Aucun Worker, binding, secret, paiement, prix, donnée scientifique ou seuil touché.

---

## 2026-11-06 16:50 UTC — mission AUTOPILOT #1336 : release code-only `failed` + cause racine Copernicus recorrectée

- **Release code-only des six domaines : échec terminal, cause racine architecturale.** Les six domaines publics sont servis par les **Workers** `sargagame-<region>` (routes catch-all `<domaine>/*`, binding `ASSETS`), pas par les projets Pages — qui n'ont **aucun domaine personnalisé** et ne servent que `*.pages.dev`. Une release Pages-only ne peut donc pas atteindre les six domaines.
- Gate de release corrigé par deux PRs fusionnées : **#1339** (`7974ccff1`, workflow Pages isolé dans `paths-ignore` de `cloudflare-production.yml`) et **#1340** (`3f60d84b2`, `npm run build` avant `npm test` dans le job `gate`). Aucune n'a créé de run `cloudflare-production.yml`.
- Re-déploiement Pages-only (run **42227027205**) : `gate` ✅ / `prepare` ×6 ✅ / `deploy-pages` ×6 ✅ / **`verify` ❌** (12 défauts bloquants `stale-current-decision`) / **rollback ✅**. Production vérifiée intacte : 6/6 HTTP 200, `b: df18df5d`, payload scientifique identique (SHA-256), Workers non redéployés, bindings et secrets inchangés.
- **Phase Copernicus — diagnostic RECORRECTÉ (l'hypothèse « latence de source ≈ 26 h » est infirmée).** La cellule ERDDAP du jour D est publiée **avant** l'échéance SLA (D+1 03:00Z), **prouvé 10 fois sur 10** (19→27 oct, âge 840–900 min ≤ 900). La rupture est une **cadence de sonde** : aucune livraison planifiée dans la fenêtre `D+1 00:00Z–03:00Z` du 28 oct au 6 nov (exception unique le 3 nov à 00:49Z, âge 771 min → `FRESH_AND_PUBLISHED`, commit `1583c36d4`) → 14 échecs consécutifs. Correctif proposé : densifier les crons sur `00:00Z–03:00Z` + élargir l'observabilité à `03:00Z–06:00Z` (coût mesuré : 1 min de CI par run hors SLA). **SLA 900 min inchangé, gate fail-closed, aucune publication hors SLA, ERDDAP = source unique jamais remplacée.**
- Le correctif Copernicus **n'est pas mergé** : une publication réussie dispatche `cloudflare-production.yml` en `workflow_dispatch` (non filtré par `paths-ignore`) → `Deploy Worker` + `Configure Worker secrets`, interdit par le périmètre de la mission.
- **PR #1346 fusionnée (`877730677`) :** `.ai/**` + son garde-fou ajoutés à `on.push.paths-ignore` de `cloudflare-production.yml` — un handoff agent ne peut plus redéployer le Worker ni réécrire les secrets de paiement. Vérifié : **aucun run `cloudflare-production.yml` créé** (total_count 437 → 437). Garde-fou : `tests/unit/ai-docs-paths-ignore.test.cjs`.
- **PR #1342 (`feat(bridge): support multi-repo`) non fusionnée** : revue faite, 85 octets UTF-8 invalides dans la source, clé de déduplication incompatible avec `bridge.cjs` (risque de double import), et les missions `bot-wow` seraient enfilées dans la queue sargagame (violation « BOT-WOW missions stay in BOT-WOW »).
- Aucune publication de données, aucun commit de données, aucun seuil modifié, aucun Worker/paiement/prix/secret/binding touché.

---

## 2026-11-04 04:40 UTC — correction de l'état P0 attribution funnel

- Stratégie finale candidate simplifiée : `track()` reste inchangé côté payload destiné aux autres sinks ; `src/supabasePhotos.js` enrichit uniquement la copie `payloadParams` Supabase avec `sessionStorage.sg_sid`, uniquement après `sg_cookie_consent=accepted`.
- Le parseur de session ignore `sid='x'`. Aucun cookie, fingerprint, PII, migration SQL ou dépendance ajoutés.
- Tête branche `fix/funnel-session-correlation-20261104` : `f1648ac1d3f3f83bfa6123f8bd3aaaa0d0e19642`; PR #1255 Draft.
- CI : tests fonctionnels passent jusqu'au garde-fou final ; échec budget exact `215067 / 215040` bytes gzip (27 bytes au-dessus). Budget inchangé à 210 Ko. Aucune livraison autorisée tant qu'il ne passe pas.
- Revue Codex demandée sur l'isolation Supabase-only et le consentement ; optimisation de moins de 30 bytes demandée à Codex. Aucun merge/déploiement ni write prod.

---

## 2026-11-04 — ChatGPT · funnel attribution session key (branch fix/funnel-session-correlation-20261104)

**Correction ciblée de la corrélation du funnel Supabase, sans nouveau stockage ni tiers.**

- `track()` réutilise le `sg_sid` anonyme déjà créé dans `sessionStorage` par le collecteur first-party ; le champ `sid` est ajouté uniquement à la copie envoyée à `logAnalyticsEvent` (Supabase).
- GA4 conserve le payload `p` inchangé ; la file/beacon Apps Script et le collecteur first-party restent inchangés.
- Le sentinel `x` (sessionStorage inaccessible) est exclu ; aucun cookie, fingerprint, PII, dépendance ni migration SQL ajoutés.
- Test `tests/unit/funnel-session-correlation.test.cjs` : périmètre Supabase-only, sid fallback, invariance GA4 et compatibilité du parseur existant.
- CI + revue confidentialité restent pendantes ; aucun merge, déploiement, paiement, emailing ou mutation de données en production.

---

﻿
## 2026-11-04 - coding_agent (OpenCode) · Cycle 4 - correction des défauts de revue P0 du fulfillment Mollie (branche fix/p0-mollie-fulfillment-review, commit c294d11c8)

**Défauts de revue corrigés.** Aucun changement de production, aucune route Cloudflare, aucune écriture Supabase, aucun backfill exécuté, aucun email client.

### P0-2 - Vraie coupure historique `p7` (`workers/sargagame/index.js`)
- Date unique `LEGACY_CUTOFF_DATE = "2026-08-01T00:00:00Z"`, contrôlée côté serveur sur `payment.createdAt`.
- Vérifié dans le **webhook** ET dans **`payment_status`** : refus `legacy_expired` si la date est absente, invalide, sans fuseau explicite, égale ou postérieure à la coupure. **Aucun RPC sur ces rejets.**
- `create_payment` refuse explicitement `p7` (400). Aucun tarif public modifié ; montants historiques EUR 7,99 / USD 5,99 conservés.
- Le chemin PHP legacy (`public/api/mollie-webhook.php`) rejette déjà `p7` (`unknown_pass` → 400) : aucun `.php` touché.

### P0-3 - Logs sans identifiant de paiement (`workers/sargagame/index.js`)
- Correlation id **aléatoire** par requête (`crypto.getRandomValues`), **sans lien dérivé** du paymentId. FNV-1a et tout hash de l'identifiant abandonnés (un hash reste un lien dérivé).
- Whitelist stricte des champs journalisés (`status`, `code`, `reason`) : un paymentId, un email ou un secret passé par erreur est **ignoré**, pas journalisé.
- Aucun paymentId, email, metadata ni secret dans les logs. Les réponses HTTP conservent `paymentId` (utile au client).

### P0-4/5/6 - Backfill fail-closed (`scripts/automation/backfill-mollie-grants.cjs`, nouveau)
- HTTP 200 **obligatoire** sur : payment Mollie, refunds, chargebacks (endpoint dédié `/v2/payments/{id}/chargebacks`, pages parcourues), `payment_grants` Supabase.
- Toute lecture en échec **bloque** la ligne et marque le contrôle `indeterminate` : une erreur API n'est **jamais** convertie en « aucun remboursement » ou « aucun grant ».
- Rapport **sans PII** : ni paymentId brut, ni email (même masqué ou hashé), ni metadata Mollie brute, ni webhook URL, ni aperçu de payload contenant l'email. Identifiant de ligne aléatoire + pass + états des contrôles + raison technique.
- **DRY RUN par défaut** : aucune écriture Supabase, aucun fichier écrit dans le dépôt. Rapport détaillé uniquement vers un chemin **absolu hors dépôt** (mode 0600).
- `--apply` seul **n'écrit jamais** ; confirmation explicite obligatoire ; **re-vérification immédiate** des 4 lectures avant chaque RPC ; résultat HTTP du RPC vérifié ; exécution interrompue sur échec ; jamais de prolongation d'un grant existant.

### Tests
- `tests/unit/mollie-fulfillment-review.test.cjs` (nouveau) → **29/29** : p7 avant/à/après la coupure, date absente/invalide/sans fuseau, webhook + `payment_status`, aucun RPC sur refus, `create_payment` refuse `p7`, prix publics inchangés, Mollie 401/404/429/500/réseau, RPC 401/404/500 → HTTP 503, rejeu webhook, **capture réelle de `console.error`** prouvant l'absence de paymentId/email, correlation id aléatoire et distinct par requête.
- `tests/unit/mollie-backfill-failclosed.test.cjs` (nouveau) → **42/42** : erreurs API (payment/refunds/chargebacks/grants, 401/404/429/500/réseau), chargebacks absents/présents/multiples/paginés, déjà délivré, remboursé, chargeback, email manquant, p7 avant/après coupure, rejeu backfill, rapport sans PII, aucun fichier dans le dépôt, `--apply` sans confirmation, re-vérification pré-écriture, RPC en erreur, refus CLI.
- Runner officiel : **main 136/138 → branche 138/140**, jeu d'échecs **identique** (`sitemap-guard-beach-pages`, `morning-brief-freshness`) → aucun échec lié à ce changement (preuve par comparaison factuelle).
- `npm run build` → exit 0 ; `esbuild` Worker → OK ; `node -c` script → OK.

---

## 2026-11-04 - coding_agent (OpenCode) · Mission P0.67 · branches §5/§7/§1/§4 · 4 Draft PR (#1243, #1247, #1252) + 1 fusion (#1244)

**Sécurité paiement, honnêteté de fraîcheur, séparation de release, sécurité des automatisations sortantes.**

- **§1 — garde-fou identifiants secrets** (PR #1247 Draft) : `scripts/scan-hardcoded-credentials.cjs`
  (6 règles, classifieur caractère par caractère, masque d'empreinte, exit 1 sur finding) +
  14 sondes de test. CI `138/138`, `scanned=970 findings=0`. Bug latent d'offset corrigé au passage :
  la construction `line.length + 1` dérivait de 1 par ligne CRLF et MASQUAIT de vrais secrets.
  Reste ouvert : la source autoritaire `sg-payments` n'est pas dans le dépôt (0 occurrence des 5
  marqueurs) — aucun miroir inventé ; corrections F1-F3/F5-F7 et rotation à faire avec le fondateur.
- **§4 — purge analytics fail-closed** (PR #1252 Draft) : le cron appelait le script de purge en
  destructeur PAR DÉFAUT, 4×/jour, sans identité d'opérateur ; le dernier DELETE réel est parti en
  `return=minimal` (nombre supprimé inconnaissable). Dry-run désormais par défaut, `--execute` exige
  `--approved-by=<identité>`, plancher `--days` à 90 j, `return=representation`+`select=id` recoupé
  avec `content-range` (arrêt immédiat sur écart), re-comptage post-boucle. Workflow : input
  `purge_analytics` (défaut false, modèle `relance-gap`), cron en dry-run, chemin manuel portant
  `github.actor`. Tests 7→22 + 17 nouveaux assertions ; falsification CAUGHT ; CI `139/139`.
- **§5 — fraîcheur avant paiement SOS** (PR #1243 Draft) : `handleBuy` n'émet plus
  `window.__sosHandleBuyCalled`/`track`/`POST /api/mollie` si `observationCurrent !== true`.
  CTA maintenu actif (asserté par l'E2E) → blocage explicite au clic.
- **§7 — régression `main`** (PR #1244 fusionnée) : regex de chemin natif dans
  `region-seo-methodology-scope.test.cjs`.
- **Mesuré et à retenir** : budget bundle à **210.0 / 210 Ko, marge nulle** ; SLA de fraîcheur en
  RUPTURE sur les 6 régions (`erddapTimestamp` 2026-10-27T12:00:00Z → 10 828 min pour un SLA de
  900 min) alors que les API publient `stale: false`. §2/§3 restent bloquées faute d'autorisation.
  Aucune action de production, aucun déploiement, aucun merge sur `main` hors §7.

---

## 2026-10-27 - coding_agent (OpenCode) · branche agent/coding/p0-first-screen-chat · commit abc721593

**Mission P0 UI/UX premier écran : le chat d'hésitation ne s'occlut plus le premier écran.**

- Défaut prouvé en prod (zéro interaction) : auto-ouverture du chat « Le Veilleur » à 10 s → 44,8 % d'occlusion mobile, police 10,5 px (< 12 px plancher dur), 9 emojis OS, CTA sous la ligne de flottaison. Preuves : captures .ai/autopilot/observations/screenshots (avant) + sonde p0-probe (après : chat absent t=0/5/13/20 s, 0 event d'intention).
- Fix : useFrustrationDetection n'ouvre le chat qu'après un contact intentionnel (clic/keydown/touchstart). Rollback ?frustration=0 (inchangé).
- Tests : ux-first-screen-cta.test.cjs (+3 assertions de verrouillage) + e2e p0-first-screen-chat.spec.ts (1 passed mobile).
- Collatéral : réparation de scripts/autopilot/visual-qa.cjs (2 bugs rendaient l'outil de capture inutilisable).
- Prix, paiement, checkout, emails : non touchés. Budget : 209.2/210 Ko gzip.

---

## 2026-10-15 - devops_agent (directive DG : bascule gratuite, boucle codage unique)

**Neutralisation du runner de codage GitHub hébergé + fermeture par défaut des appels LLM payants.**

- `.github/workflows/factory-cloud-runner.yml` : triggers push + cron 15 min supprimés ; exécution uniquement en workflow_dispatch avec double opt-in (input `confirm=RUNNER-CLOUD` + variable repo `FACTORY_CLOUD_RUNNER_ENABLED=true`). ci-tests / perf-budget / user-journey-audit / cloudflare-production / daily-copernicus intacts.
- `scripts/veilleurs/run-veilleur.cjs` : chemin LLM Anthropic uniquement si `SARGA_PAID_LLM=1` (absent par défaut → recon déterministe, même si le secret existe).
- `.github/workflows/veilleurs.yml` : clef Anthropic non injectée (réactivable en déclarant le flag).
- Rationale : PC1 (Ollama + OpenCode) = seul moteur d'implémentation.

---

## 2026-10-14 - ui_agent (OpenCode) · branche gent/ui/p0-first-screen-20261014

**Mission P0 refonte UX visible : CTA « Trouve ta plage » sur l'accueil + bannière consentement non bloquante + SOS doré restauré.**

- CTA primaire teal .sg-mapfind sur la carte (i18n FR/EN/ES), ouvre TrouvePlage IN-APP via onFind → showRecommend. Rollback ?trouveplage=0. Deep-link ?recommend=1 conservé (rétro-compat).
- Bannière cookies compactée (~108px→~100px) + --sg-consent-h : CTA/SOS/chat/découverte remontent au-dessus d'elle (RGPD intact : texte + Accepter/Refuser conservés).
- Régression prod SOS corrigée : .sg-fab (fond encre !important) strippait le gradient or inline → classe dédiée .sg-soscta armurée.
- Tests : 
pm test 43/43 OK ; build exit 0 ; budget 209.1/210 Ko gzip ; esbuild OK ; parcours Playwright mobile+desktop (consentement→CTA→TrouvePlage→retour carte) 0 erreur JS.
- Nouveau test de verrouillage 	ests/ux-first-screen-cta.test.cjs (CTA, i18n, rollback, --sg-consent-h, onClose, SOS).
# .ai/changelog.md — Historique des changements agents

> Chaque agent ajoute une entrée après toute modification du code côté produit.

---

## 2026-10-09 — coding_agent (OpenCode) · branche `agent/security/e2e-automation`

**Automatisation de bout en bout : contrat v3 par étapes + câblage réel des composants.**

- Contrat v3 (blocage circulaire résolu, protections conservées) :
  `PREDEPLOY_ELIGIBLE` (check-runs CI `test-frontend`+`perf` verts SUR LE SHA
  exact, via API GitHub — preuve authentique, rien de simulé) autorise le
  déploiement ; `DEPLOYED_PENDING_VERIFICATION` tant que le contrôle
  post-déploiement n'a pas tourné ; `PRODUCTION_VERIFIED` uniquement via
  attestation complète committée (preuves réelles scellées au SHA) ;
  `NOT_PROVEN`/`FAILED` = refus. Attestation présente-mais-invalide ⇒ REFUS
  dur, aucun repli predeploy. Hors-ligne local ⇒ REFUS (jamais d'autorisation).
- Composants factory adoptés et RÉELLEMENT branchés (propriétaire identifié :
  session automation concurrente du 2026-10-08, fichiers stables) :
  `lib/scope-guard.cjs` (validation de scope), `pr-automation.cjs` (RÉPARÉ :
  erreur de syntaxe ligne 28 + doublons, sécurité WIP anti-`git add -A`,
  extraction PR par URL, câblage job-trace), `ci-certification-audit.cjs` +
  `deploy-audit.cjs` (branchés comme étapes gate dans ci-tests.yml),
  `post-deploy-verify.cjs` (RÉPARÉ : contrat paiement réel POST
  `__payment_smoke__`→400, GA4 par région depuis regions/*.json, états
  VERIFIED/NOT_VERIFIED/FAILED, `--report`, `--job`), `lib/job-trace.cjs`
  (utilisé tel quel par pr-automation, post-deploy-verify et les workflows).
- Workflows : `cloudflare-production.yml` gate = token `GH_TOKEN` + permission
  `checks: read`, trace `job_id=job-<run>-<attempt>` uploadée en artefact ;
  nouveau job `post-deploy-verify` (needs: deploy) avec rapport
  `post-deploy-report.json` + summary. `ci-tests.yml` : + audits de câblage.
- Sécurité gouvernance : une ATTESTATION FORGÉE détectée en critique sur le
  dépôt réel (attestations/2f21d8ed….json, créée par processus concurrent,
  hashes de fichiers sources présentés comme preuves) → le verrou l'a REFUSÉE
  (comportement prouvé) ; fichier mis en quarantaine non destructive
  `.ai/certification/quarantine-2026-10-09/` (conservé pour audit).
- Tests : predeploy-gate 8/8, deploy-binding 22/22, certification-status 20/20,
  suite complète npm test 13/13.
- Chaîne E2E prouvée sur cette PR même (job_id corrélé, livraison autorisée,
  post-vérification réelle) — détails dans le rapport de mission.

**Fichiers :** `scripts/CHECK_certification_status.cjs`,
`scripts/lib/certification-gate.cjs`, `scripts/autopilot/{pr-automation,
post-deploy-verify,ci-certification-audit,deploy-audit}.cjs`,
`scripts/autopilot/lib/{job-trace,scope-guard}.cjs`,
`.github/workflows/{cloudflare-production,ci-tests}.yml`, `.gitignore`,
`tests/unit/certification/{predeploy-gate,deploy-binding}.test.cjs`,
`.ai/certification/quarantine-2026-10-09/`, `AGENTS.md`, `.ai/changelog.md`.

---

## 2026-10-08 — coding_agent (OpenCode) · branche `agent/security/governance-lock`

**Verrouillage RÉEL des chemins de promotion/déploiement (mission 2/2) :**

- **Contrat v2 — autoréférence résolue** : un manifeste versionné ne peut pas
  contenir le SHA de son propre commit. Désormais
  `.ai/certification/attestations/<sha-produit>.json` (version 2, `target` ==
  nom du fichier) est portée par des commits ultérieurs **ne touchant que
  `.ai/certification/`**. Le mode deploy remonte HEAD (first-parent) en sautant
  ces commits pour trouver le **commit produit effectif** ; tout commit de code
  non attesté (ou mêlant code+attestation) redevient la cible et bloque.
- **Deux contrôles séparés** dans `scripts/CHECK_certification_status.cjs` :
  `--mode pr` (Contrôle A, CI PR : vocabulaire strict + cohérence attestations,
  TOLÈRE NOT_PROVEN — une réparation de gouvernance reste mergeable) et
  `--mode deploy` (Contrôle B, strict : trois PASS + sha256 + scellement SHA +
  péremption + règles PRODUCTION/BUSINESS ; `--commit`/`--now` ignorés — aucune
  option ne contourne le refus). Mode `manifest` historique inchangé (20/20
  tests de la mission 1 toujours verts).
- **Chemins fermés** (emplacements exacts) :
  - `.github/workflows/cloudflare-production.yml` : job `certification-gate`
    (Contrôle B) + `needs: [build, certification-gate]` sur `deploy` (wrangler
    Worker) et `deploy-pages` (wrangler-action Pages). Pas de needs, pas
    d'upload, pas de secrets écrits.
  - `scripts/manual-ftp-deploy.cjs` : `assertDeployCertified()` exécuté AVANT
    `loadProjectEnv()` et toute connexion basic-ftp/fastDeploy — couvre
    `npm run ftp-deploy|deploy-files|deploy-provision` et tous les workflows
    appelants (`weekly-optimize.yml`, `weekly-seo-automation.yml`,
    `provision-barbados.yml`) qui reçoivent en outre une étape gate visible
    (`Certification gate (deploy)` avant l'étape deploy).
  - `daily-copernicus.yml` : deploy FTP DÉJÀ désactivé en amont (commentaire
    « Legacy FTP deploy disabled — handled by cloudflare-production.yml ») ;
    aucun upload restant dans ce workflow.
  - `scripts/autopilot/lib/gitops.cjs::enableAutoMerge` : lève
    `CERTIFICATION_REFUSED` avant tout `gh pr merge --auto` (aucun appelant
    actif aujourd'hui — chemin futur fermé).
  - `ci-tests.yml` : étape Contrôle A après `npm test`.
- Tests : `tests/unit/certification/deploy-binding.test.cjs` — 20 scénarios sur
  fixtures git isolées en %TEMP% (commits P→Z distincts, refus SHA non
  attesté, hash altéré, attestation forgée, gate FTP réel arrêté en 720 ms
  sans connexion, enableAutoMerge refusé avant gh, câblage workflow vérifié).
  Suite complète : 12/12 fichiers OK.
- État honnêt : dépôt réel `--mode deploy` = NOT_PROVEN (exit 1) — aucune
  attestation LIVE n'existe ; `--mode pr` = OK (exit 0).
- Reste dans cette mission : protection API de `main` + merge de cette PR
  (résultats API dans le rapport de mission).

**Fichiers modifiés :** `scripts/CHECK_certification_status.cjs`,
`scripts/lib/certification-gate.cjs` (nouveau), `scripts/manual-ftp-deploy.cjs`,
`scripts/autopilot/lib/gitops.cjs`, `scripts/autopilot/verify.cjs`,
`.github/workflows/{ci-tests,cloudflare-production,weekly-optimize,weekly-seo-automation,provision-barbados}.yml`,
`tests/unit/certification/{check-certification-status,deploy-binding}.test.cjs`,
`.ai/certification/status.json`, `.ai/certification-report-template.md`,
`AGENTS.md`, `.ai/changelog.md`. (`src/Sargasses_PROD.jsx` : modification
préexistante hors périmètre, laissée non commitée.)

---

## 2026-10-08 — coding_agent (OpenCode)

**Verrouillage de gouvernance et certification fail-closed (directive exécutée) :**

- Réécriture de `scripts/CHECK_certification_status.cjs` : le fichier précédent se
  contentait de lire des lignes `TECHNICAL: PASS` dans `.ai/current_state.md`,
  ce que la directive interdit explicitement. Nouveau contrat machine :
  `.ai/certification/status.json` (version 1, `controlledCommit` sha40) +
  preuves `path`+`sha256` dont le contenu doit sceller le commit contrôlé.
  Blocages : statut absent/invalide/ambigu (seules valeurs `PASS`/`FAIL`/`NOT_PROVEN`),
  preuve absente/illisible/périmée (>31 j) ou non vérifiable (hash), preuve
  rattachée à un autre commit, preuve `simulated:true`, `tr_test_`/paymentMode!=live
  pour PRODUCTION, métriques historiques (>31 j) ou non attribuables pour BUSINESS.
  Toute erreur (lecture, JSON, argument, commit introuvable) → exit 1. Jamais de doute → promotion.
- `scripts/autopilot/verify.cjs` : la correction amont (test de contrat absent :
  SKIP → FAIL) est conservée ; ajout d'un filet : toute erreur interne de
  vérification produit un échec explicite `{ok:false, failedStep:'internal-error'}`
  + exit 1 (jamais de crash muet).
- `.ai/certification-report-template.md` : règle absolue des valeurs autorisées,
  contrat machine associé, fence d'exemple refermée.
- `.ai/certification/status.json` : baseline honnête — TECHNICAL / PRODUCTION /
  BUSINESS = `NOT_PROVEN` (aucune preuve LIVE vérifiable n'existe dans le dépôt ;
  `MOLLIE_TEST_CERTIFICATION.md` = 15/15 scénarios en mode TEST, ne valide
  jamais PRODUCTION).
- Tests : `tests/unit/certification/check-certification-status.test.cjs`
  (20 scénarios sur fixtures isolées en %TEMP%, aucune preuve réelle touchée).
  Résultat réel : 20/20 conformes ; `npm test` global 11/11 fichiers OK ;
  verdict réel du dépôt : `NOT_PROVEN` (exit 1).

**Traçabilité des chemins de promotion (audit 2026-10-08, vérifié par `gh api`) :**

| # | Chemin de promotion | Contrôle appliqué aujourd'hui | Contournement possible | Modification nécessaire pour fermer | Statut |
|---|---|---|---|---|---|
| 1 | Agent local → commit | Aucun contrôle requis local (Gate de ship = discipline documentée, non forcée) | Un agent peut committer n'importe quoi, y compris un `PASS` auto-attribué | Hook pre-commit/pre-push exécutant `CHECK_certification_status.cjs` | NON FERMÉ |
| 2 | Orchestrateur autopilot → branche → PR | `verify.cjs` (build/budget/régions/tests/smoke) + policy whitelist + parcage `ready-to-merge` | `policy.autoMergeEnabled` + `gh pr merge --auto` (lib/gitops.cjs) sans contrôle certification ; observation « mock » en dry-run | Appeler CHECK dans l'orchestrateur avant toute mise en `ready-to-merge` | NON FERMÉ |
| 3 | Git push direct sur `main` | AUCUN — branche `main` **non protégée** (vérifié : `gh api repos/aveca/sargagame/branches/main` → `"protected": false`, protection 404) | Push direct = bypass total de CI et de tout contrôle | Protection de branche + required status check exécutant CHECK (accès admin repo requis) | NON FERMÉ |
| 4 | GitHub Actions CI (`ci-tests.yml`, `perf-budget.yml`) | Build + tests + bundle sur PR/push | Checks non requis (branche non protégée) → merge possible CI rouge ; CHECK non appelé par les workflows | Étape CHECK dans `ci-tests.yml` + statut requis | NON FERMÉ |
| 5 | Merge PR → `main` | Auto-merge possible sans gate certification | Merge manuel ou auto possible avec CI rouge | Branch protection : « Require status checks to pass » | NON FERMÉ |
| 6 | Déploiement (`daily-copernicus.yml` push→FTP, `cloudflare-production.yml`, `npm run ftp-deploy` manuel) | Aucun gate certification | Deploy déclenché par tout push sur `main` ; deploy manuel local sans contrôle | Étape CHECK bloquante en tête des workflows de deploy ; suppression/guard du deploy manuel | NON FERMÉ |
| 7 | Production (vérification post-deploy) | `live-production-sentinel` observe seulement | Détecte, ne bloque pas | Alerte + rollback conditionné au verdict CHECK | NON FERMÉ |

**Déclaration d'honnêteté (règle de la directive) :** un script autonome ne
suffit pas à verrouiller le dépôt. Les chemins réels de merge et de déploiement
**n'exécutent pas** le contrôle ci-dessus à cette date, et leur fermeture exige
des modifications de configuration GitHub (protection de branche, required
checks) et des workflows — changements interdits pendant cette phase et/ou
requérant un accès d'administration. **Le verrouillage global du dépôt est donc
déclaré `NOT_PROVEN`.** Actions humaines restantes listées dans le rapport de
session. Aucun merge, deploy ou changement de configuration de production
n'a été effectué.

**Fichiers modifiés :**

- `scripts/CHECK_certification_status.cjs` — réécrit (verrou fail-closed sur preuves vérifiables)
- `scripts/autopilot/verify.cjs` — erreur de vérification = échec explicite (complète le fix SKIP→FAIL)
- `.ai/certification-report-template.md` — valeurs autorisées + contrat machine
- `.ai/certification/status.json` — baseline NOT_PROVEN (nouveau)
- `tests/unit/certification/check-certification-status.test.cjs` — 20 scénarios isolés (nouveau)
- `.ai/changelog.md` — cette entrée

---

## 2026-10-05 — coding_agent (OpenCode)

**TASK-P1-003: Comic paywall header variants**

- Added 3 header variants to ComicPaywall:
  - **scene** (default): golden-hour scene with Veilleur character (existing)
  - **constel**: constellation map with beach stars + Veilleur mood (from pwConstel A/B)
  - **beat**: beat panel style with 3 feature cards (from PanelStoryEngine)
- Variants selectable via `?pwheader=scene|constel|beat` query param
- Build generates only current region's variant (MQ or GP) — prevents cross-region content leakage
- All variants share identical CTA/payment logic (zero logic changes)
- Gates: Build OK, Bundle 204-206KB ≤ 210KB, PHP lint OK, CI Tests + Perf Budget passed

**Files:** `vite.config.js`, `tests/e2e/funnel-payment.spec.ts`, `tests/e2e/b2b-flow.spec.ts`, `tests/e2e/responsive.spec.ts`, `tests/e2e/a11y.spec.ts`, `tests/e2e/paypal-flow.spec.ts`, `tests/e2e/pwa.spec.ts`, `tests/utils/selectors.ts`, `tests/utils/mock-server.ts`, `tests/fixtures/sargassum.sample.json`

PR: #810 (auto-merged)

---

## 2026-10-05 — coding_agent (OpenCode)

**Audit de gouvernance et verrouillage certification :**
- Audit initial : trois défautsstructurels identifiés (A. pas de contrôle global, B. preuve absente ignorée, C. gel non garanti)
- Création de `scripts/CHECK_certification_status.cjs` : verrouillage fail-closed des trois certifications indépendantes (TECHNICAL / PRODUCTION / BUSINESS)
- Correction de `scripts/autopilot/verify.cjs` : passage en fail-closed — test absent → échec (plus de SKIP)
- Création de `.ai/certification-report-template.md` : modèle imposant le format séparé des trois certificats
- Mise à jour de `.ai/changelog.md` avec cartographie des chemins de promotion
- Gel du développement fonctionnel déclaré dans la session courante
- Déclaration : `NOT_PROVEN` pour PRODUCTION et BUSINESS tant que preuves en production absentes

**Chemins de promotion audités (référence) :**

| Chemin | Contrôle appliqué | Possibilité de contournement | Modification nécessaire |
|--------|-------------------| ----------------------------- | ---------------------- |
| agent → orchestrator → Git → GH Actions → merge → déploiement → vérification LIVE | Vérifie les 3 certificats indépendants avant toute promotion | Potentiel de bypass si le script CHECK n'est pas appelé dans le workflow CI | Intégrer l'appel CHECK dans `.github/workflows/ci-tests.yml` et `agent-handoff.yml` |
| agent → tasks.md → PR → merge | Vérifie les tâches marquées `[x] done` | Leclaim `[~]` in `tasks.md` peut être ignoré sans validation globale | Ajouter condition `CHECK_certification_status.cjs` comme gate de merge |
| agent → current_state.md → rapport | Le rapport contient les trois statuts | Un agent peut s'auto-attribuer `PASS` global | Interdire l'auto-promotion ; exiger attestations indépendantes |
| agent-handoff.yml (schedule 4h) | Déclenche le prochain agent | N'a pas de vérification de certification intégrée | Ajouter étape de lecture `.ai/current_state.md` et validation des 3 statuts avant tout `PASS` |
| orchestrator.cjs / policy.cjs | Décisions de promotion basées sur liste de fichiers autorisés | Ne vérifie pas les 3 certificats indépendants | Remplacer / compléter le prédicat par l'appel au script CHECK |

**Fichiers modifiés :**

- `scripts/CHECK_certification_status.cjs` — nouveau ( créé dans cette session)
- `scripts/autopilot/verify.cjs` — corrigé (fail-closed sur preuves absentes)
- `.ai/certification-report-template.md` — créé (modèle de rapport)
- `.ai/changelog.md` — mis à jour (traçabilité des chemins)

---

## 2026-10-04 — principal_agent (OpenCode)

**Suite de l'audit governance :**
- Vérification des trois barrières indépendantes non encore intégrées dans les runners en cours
- Test du scénario négatif : suppression volontaire d'une preuve → le script CHECK renvoie `exit 1` et bloque la promotion
- Confirmation que `verify.cjs` échec maintenant les tests déclarés `SKIP` par défaut (passage en FAIL)
- Déclaration que AUCUN merge ou déploiement en production ne sera effectué tant que les trois certifications ne sont pas toutes `PASS`

**Fichiers modifiés :**

- `scripts/autopilot/verify.cjs` — corrigé (voir entrée 2026-10-05)
- `.ai/changelog.md` — mis à jour (voir entrée 2026-10-05)

## 2026-10-04 — principal_agent (OpenCode)

**Preuve d'autonomie factory 24/7 (cycle réel, 19/19 checks) :**

- Fix factory-runner : mapping queue-id → TASK-ID (executeCodeTask/executeGenericTask/processQueue) — le claim ne matchait plus rien après le merge distant
- Fix executeTestTask : NPM_CMD + playwright cli.js via node (bare npm/npx + .cmd cassés sur Windows) ; require ../lib/process-runner.cjs (./lib inexistant → MODULE_NOT_FOUND → retry → park)
- Exports additifs (lock/queue/recovery, zéro changement comportemental) pour vérification réelle
- Preuve live : lock unique (2e runner refusé), bounded exec (exit 3 + timeout), breaker open→STRONG→reset, cycle queue→npm-test→cleanup, kill ciblé→aucune perte→reprise→succès
- Chaîne complète : branche agent/coding/PROOF-001 → test factory-queue-invariants → commit → PR #804 (CI verte : test-frontend, perf, GitGuardian) → fermée sans merge, branches supprimées, main intact
- Docs handoff mergées (#802), fix YAML agent-handoff mergé (#803) — stub-runs 0s terminés

**Files :** `scripts/local-factory/factory-runner.cjs`, `.ai/changelog.md`, `.ai/current_state.md`

---

## 2026-10-03 — principal_agent (OpenCode)

**Mission autonome production + paiement + factory 24/7 :**

- Smoke test Windows corrigé via `scripts/run-smoke.cjs` (orchestrateur `withPreviewServer`, cross-platform) — 4 tokens OK
- Gate de ship complet validé : tests 5/5, build OK, bundle 207.1 Ko ≤ 210 Ko, smoke OK, PHP lint OK
- Fix factory-runner : mapping queue ID `task-TASK-XXX` → tasks.md ID `TASK-XXX` (executeCodeTask, executeGenericTask, updateTaskInProgress)
- Fix agent-handoff : `git add -A` avant commit (échec sur arbre sale), skip si déjà claim/done
- Fix agent-handoff.yml : 3 blocs `run: |` avaient du contenu colonne-0 (heredoc Python, --body issue/PR) → YAML invalide, stub-runs 0s en échec sur chaque push. Réindenté, 35/35 workflows valides (commit local 1967f985 — push bloqué : token sans scope `workflow`)
- Merge origin/main (25 commits distants : hardening factory/cloudflare/paiement) — conflit `queue/.gitignore` résolu en faveur version distante durcie (`state/` + `*.json`)
- Push 934ec1c7 → CI verte : Daily Copernicus + Deploy SUCCESS (FTP + health-check), CI Tests SUCCESS, Perf Budget SUCCESS
- Post-deploy vérifié : homepage 200, sargassum.json live, mollie.php 405-sur-GET (POST-only OK), sitemap.xml + robots.txt live
- Cloudflare Production : workers uploadés OK, échec route attach (`No access`) → token API sans permission routes (BLOCKED_EXTERNAL)

**Files :** `scripts/local-factory/factory-runner.cjs`, `scripts/agent-handoff.cjs`, `.github/workflows/agent-handoff.yml`, `.gitignore`, `queue/` (runtime untracked)

---

## 2026-07-31 — release_engineer (OpenCode)

**Production Release Cleanup & Validation :**

- Fix bug syntaxe `ArchipelView.jsx` : const dupliquées `MID/FAR/NEAR` (esbuild error bloquant)
- Recréé `scripts/lib/coast-zones.js` (import manquant cassé par nettoyage debug files)
- Nettoyage complet fichiers debug/temp : `scripts/temp/`, `tests/screenshots/`, `debug-logs/`, `ui-audit-results/`, scripts debug
- Gate de ship complet validé :
  - ✅ `npm run build` — exit 0
  - ✅ `check-bundle-budget` — 202.4 Ko gzip ≤ 210 Ko
  - ✅ PHP lint — 7 fichiers OK (mollie, paypal, widget, b2b-trial)
  - ✅ `ux-smoke.mjs` — 4 tokens : `FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`
  - ✅ `regions/index.cjs` — 6 régions valides
- MAJ `.ai/current_state.md` + `.ai/tasks.md` (handoff)

**Files :** `src/ArchipelView.jsx`, `scripts/lib/coast-zones.js`, `.ai/current_state.md`

---

## 2026-07-31 — CTO_agent (OpenCode)

**Transformation AI-native complète :**

- Créé mémoire partagée `.ai/` : `context.md`, `current_state.md`, `tasks.md`, `bugs.md`, `decisions.md`, `changelog.md`
- Créé roles d'agents `.ai/roles/` : 7 fiches (product, architect, coding, QA, UX, security, devops)
- Structuré `AGENTS.md` avec règles globales, procédure commune, workflow Git agentique
- Créé `agent-handoff.cjs` + `agent-handoff.yml` automatisant le handoff entre agents
- Ajouté `playwright.config.cjs` + `tests/README.md` (stratégie de tests)
- Ceci est la base AI‑native initiale pour 7 jours 10h.

---

## 2026-07-30 — coding_agent (Claude Code)

**Payment grouping fixes :**
- Classified Mollie API errors (user-friendly fr/en/es)
- Terminal status handling (canceled/expired/failed)
- Redirecting UI overlay (spinner + "Ne ferme pas")

**Fix Boogyman string :**
- `msg` → `errMsg` in `=lse` fallback

**Files :** `mollie.php`, `PremiumModal.jsx`, `Sargasses_PROD.jsx`

---

## 2026-12— XX — Old entry example

> Note: Use this format abon.**

---

## 2026-11-11 15:20 UTC - PR #1412 : les captures B2B ne s'annoncent plus « réussies » sans confirmation serveur

- **Défaut commercial mesuré sur le LIVE** : les **20 blocs de capture B2B** (hotels, collectivités, brief gratuit, landing `/for-hotels/`) affichaient « merci / you're in / listo » **SANS confirmation serveur**. Le POST partait en `mode:'no-cors'` (ou en `sendBeacon` sur `/for-hotels/`, sans réponse possible) → le navigateur ne pouvait pas savoir si la demande avait été enregistrée → **un prospect perdu se voyait comme un succès** (0 signal, 0 relance, 0 vente).
- **Le sink répondait très bien** (le défaut était côté client) : `POST https://script.google.com/macros/s/AKfycb…/exec` (Content-Type `text/plain` + en-tête `Origin`) → **200**, `Access-Control-Allow-Origin: *`, corps `{"ok":true,"action":"email_saved"}`.
- **Correctif (PR #1412**, branche `agent/coding/b2b-capture-ack-20261111`, commit `5e742758a`, base `origin/main` `37336290a` — **NON mergée, AUCUN déploiement**) :
  1. `public/b2b-capture.js` (nouveau, partagé par les 12 pages) : POST en `mode:'cors'` + `Content-Type: text/plain` → **requête simple → aucun preflight** ; **le succès n'est affiché que si le serveur confirme `{ok:true}`** ; en cas d'échec → formulaire **resté visible**, message d'erreur FR/EN/ES, bouton **réactivé** (réessai possible, l'Apps Script déduplique par email → pas de doublon), événement **`sg_b2b_capture_failed`** (CTA en échec mesurable).
  2. Les 20 blocs : panneau de succès **déplacé dans `onSuccess`** ; l'**événement d'intention** (`sg_b2b_signup` / `sg_b2b_leadmagnet`) reste émis au submit → aucun dashboard cassé ; `/for-hotels/` passe de `sendBeacon` à la voie confirmée.
  3. **Aucun état serveur nouveau** (le sink reste l'Apps Script), aucun secret, aucun prix, aucune donnée inventée.
- **Preuve** : `tests/unit/b2b-capture-ack.test.cjs` → **84 assertions PASS** (contrat de source sur les 12 pages + comportement du helper : succès confirmé → `onSuccess` ; erreur HTTP / `{ok:false}` / réseau coupé → **aucun** `onSuccess`, erreur affichée, bouton réactivé).
- **Gate** : `npm test` **190/190** · `npm run build` exit 0 · budget **206,3 Ko ≤ 210 Ko** · 12 scripts inline vérifiés (`node --check`) · `dist/b2b-capture.js` présent.
- **Constats voisins (non corrigés, action fondatrice)** : la sheet `emails` ne garde que `[date, email, island, source]` → **hôtel / zone / langue perdus** à l'écriture (corriger = `clasp push` = fondateur mobile) ; `sargassumpuntacana.com/pro/es/pronostico-sargazo-punta-cana-hotels/` → **404** (la version ES est sur le domaine Martinique) ; la landing `sargassumpuntacana.com/es/sargazo-para-hoteles/` **n'a aucun formulaire** → aucune capture pour le visiteur espagnol de Punta Cana.

---

## Conventions

- Date JJJJ-MM
- Agent name (code, QA, product, etc.)
- List of changes with file names
- Never delete previous entries — they satisfy AI pièe memory.