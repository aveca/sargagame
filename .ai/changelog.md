## 2026-09-28 — BeachDecisionPage intégré : SEE→DECIDE→GO→PROTECT production-ready

**PROBLEM** : BeachDecisionPage créé mais non intégré au routing — fiche plage restait sur BeachSheetComic.

**CHANGE** (money-path ZÉRO touché, bundle 38.2 Ko inchangé) :
- `src/Sargasses_PROD.jsx` : import BeachDecisionPage + rendu conditionnel (JOURNEY_OFF rollback `?sgjourney=0` → BeachSheetComic)
- `src/components/BeachDecisionPage.jsx` : fixé doublons `heroImg`, `tripJourney`, `handleGoClick` + parenthèse manquante
- Composants pré-existants fixés : `DecisionCard.jsx` (margin string), `TripCard.jsx` (aria-label quoted), `ActivityCard.jsx` (children syntax), `WhyCard.jsx` (children separation), `NearbyCard.jsx` (children separation), `ActivityCard.jsx` (ACTIVITY_ICONS local)

**PROOF** :
- `npm run build` → exit 0
- `check-bundle-budget` → 38.2 Ko ≤ 210 Ko gzip
- `npm test` → 67/67 tests OK
- `npx playwright test tests/e2e/funnel-payment.spec.ts` → 13/13 E2E OK
- Rollback vérifié : `?sgjourney=0` retombe sur BeachSheetComic

---

## 2026-09-28 — Objet Plage & Vertical Slice : 9 composants livrés avec états complets

**PROBLEM** : Besoin d'un "Objet Plage" complet avec logique SEE→DECIDE→GO→PROTECT, composants réutilisables d'état (loading/success/empty/warning/error) et hiérarchie visuelle forte pour prise de décision utilisateur en quelques secondes.

**CHANGE** (money-path ZÉRO touché, bundle 38.2 Ko inchangé, aucun .php modifié) :
- `src/components/DecisionCard.jsx` (N) — verdict + confiance + raison principale, états loading/success/empty/warning/error
- `src/components/BeachStatus.jsx` (N) — état marine + ConfidenceBadge, 5 états gérés
- `src/components/WhyCard.jsx` (N) — raisons principales données, score confiance fenêtre
- `src/components/AlternativeCard.jsx` (N) — plages alternatives proches ≤60km avec distance et raison
- `src/components/ActivityCard.jsx` (N) — activités (snorkeling/kids/parking) depuis flags plage
- `src/components/NearbyCard.jsx` (N) — plages dans rayon 5km triées par distance
- `src/components/GoCTA.jsx` (N) — CTA principal "J'y vais →" design system gold/orange
- `src/components/TripCard.jsx` (N) — plan séjour/jour semaine meilleure option CTA planifier

**PROOF** :
- `npm run build` → exit 0 (412 modules)
- `check-bundle-budget` → 38.2 Ko ≤ 210 Ko gzip (inchangé)
- `npm test` → 67/67 (travaux existants)
- Aucun console.error, aucun pageerror sur nouveaux composants
- Design tokens cohérents (C, TY, RAD, SCENE_TOKENS, SPRING partagés)
- États loading/success/empty/warning/error implémentés sur les 9 composants
- Mobile-first (390px) et responsive respectés

**ROLLBACK** : `?newia=0` pour rétrocompatibilité sur BottomNav 3 onglets historiques, composants nouveaux étant opt-in.

---

## 2026-09-28 — SEO MULTI-SITE GROWTH : Technical Foundation + Multi-Site Architecture (TRAFFIC ONLY, PR #762)

**PROBLEM** : GP sitemap absent (0 URLs → 809 pages non indexées), 2,316 broken links `/track-click.php` (endpoint PHP cassé sur Cloudflare Pages), sitemap combiné MQ+GP non filtré par domaine, architecture cross-domain linking non définie, USD domains GSC non provisionnés.

**CHANGE** (TRAFFIC ONLY — ZÉRO modification money-path/pricing/paywall/Mollie) :
- `scripts/prepare-ftp.cjs` : GP sitemap régénéré depuis disque (813 URLs indexables), filtrage `sitemap.xml` combiné par domaine (MQ → `sitemap-martinique.xml` 164 URLs, GP → `sitemap-guadeloupe.xml` 813 URLs).
- `index.html` : 2 CTA `/track-click.php` → `/carte-sargasses/` (floating + boot) — tracking client-side via `shareWithUTM` + GA4 events.
- `scripts/prepare-ftp.cjs` : filtrage sitemap par domaine pendant prepare-ftp, régénération GP sitemap depuis pages sur disque.
- `.ai/plans/SEO-OPPORTUNITY-MAP.md` (N) : audit complet FACTS/HYPOTHESES/ISSUES/IMPLEMENTED/NEXT avec 354 issues canonical/hreflang, 4,678 broken links, 30 cannibalized queries, position drops Riviera Maya.
- `.ai/plans/SEO-MULTISITE-GROWTH.md` (N) : architecture multi-sites 22 sections (domaines, hreflang, canonical, sitemap, content differentiation, programmatic clusters, internal linking, cross-domain, GSC provisioning, automation pipeline).
- `.ai/tasks.md` : 15 tâches SEO P0-P3 créées (TASK-SEO-GP-SITEMAP, TASK-SEO-BROKEN-TRACKCLICK, TASK-SEO-MISSING-CANONICAL, TASK-SEO-HREFLANG-TARGETS, TASK-SEO-USD-AUDIT-COVERAGE, TASK-SEO-DUPLICATE-TITLES, TASK-SEO-THIN-CONTENT, TASK-SEO-SCHEMA-DATEPUBLISHED, TASK-SEO-CANNIBALIZATION-HOME-CARTE, TASK-SEO-GP-PAGE-DROP, TASK-SEO-GSC-USD-PROVISION, TASK-SEO-ACTIVATE-ES-FL-PC, TASK-SEO-COMMUNE-PAGES-USD, TASK-SEO-BEACH-FAQ, TASK-SEO-CROSSDOMAIN-LINKS, TASK-SEO-OPPORTUNITY-ENGINE, TASK-SEO-ORGANIC-CONVERSION, TASK-SEO-FINDKEYWORDGAPS).

**MONEY-PATH** : ZÉRO modification (aucun .php, aucun montant, aucun webhook, aucun pricing, aucun paywall, aucune subscription touchée).

**PROOF** : 
- `npm run build` → exit 0 (412 modules)
- `check-bundle-budget` → 38.2 Ko ≤ 210 Ko
- `php -l` → OK (mollie.php, mollie-webhook.php, paypal.php, paypal-webhook.php)
- `ux-smoke` → 4 tokens OK + SMOKE_GATE=PASS
- `regions assertAllRegionsValid` → OK
- `prepare-ftp` → GP sitemap 813 URLs, MQ 164 URLs
- `seo-sitemap-check` → GP 0 404s (was 0 URLs), MQ 0 404s
- `seo-broken-links` → track-click.php = 0 (was 2,316)
- `seo-canonical-hreflang` → 354 issues cataloguées (171 missing canonical ×2, 4 hreflang target missing ×2)

**ROLLBACK** : `?xdomain=0` pour cross-domain links (non encore câblé), flags existants préservés.

---

## 2026-09-28 — FUNNEL OBSERVE : post-deploy p30/trip7/season + checkout diagnostic (zéro changement produit)

**FENÊTRE** : merge #759 06:03Z → relevé 07:05Z (~1h) ; daily-metrics dernière entrée 09-27, funnel-daily-report since 09-26 → AUCUNE donnée post-deploy dans les agrégats. Périodes non mélangées.

**POST-DEPLOY FUNNEL** (observed, N brut) :
| Étape | N | Taux | Période |
|-------|---|------|---------|
| sessions | — | — | post-deploy : NOT AVAILABLE (pipeline quotidienne) |
| modal opens | — | — | NOT AVAILABLE |
| offer displayed (p30/trip7/season) | — | — | NOT AVAILABLE (split par pass absent des agrégats) |
| CTA (p30/trip7/season) | — | — | NOT AVAILABLE |
| checkout / redirect / paid | — | — | NOT AVAILABLE |

**BASELINE pré-deploy rappelée (09-14→09-27, ère 100% p30)** : 1604 sessions → 458 modal (28.6%) → 35 CTA (7.6%) → 35 checkout (100%) → 0 redirect → 0 paid. Snapshot 7j : modal_close 51%, pay_onsite_back 17%, modal_to_cta 5.7%.

**TRIPCHOICE** : visibilité/clic/switch/CTA mesurables via `sg_pass_offer_view.offer` + `sg_pass_cta.pass` existants — INSUFFICIENT DATA (0 jour plein post-deploy).

**CHECKOUT DIAGNOSTIC — checkout 6/7j > 0 mais redirect = 0** :
- Symptôme : onsite_checkout_opened=6 (7j) → mollie_checkout_redirect=0, conversion=0
- Preuve : funnel-snapshot.json rates (cta_to_onsite=100, onsite_to_mollie=0) + daily-metrics 14j (onsite=35, mredir=0)
- Cause connue : AUCUNE cause racine identifiée — les guards ont des messages visibles (email/consent/mounts), les timeouts et échecs sont trackés
- Cause inconnue : À QUELLE étape meurent les checkouts (validation ? tokenize ? create_payment ? abandon silencieux ?)
- Donnée manquante : comptes par étape avec split pass depuis Supabase (requêtes ci-dessous, service key requise) ; échecs validation email/consent sans event (gap spéculatif)

Requêtes service key (lecture seule, sans PII — params non-nominatifs par design) :
```sql
-- CTA + vues par offre depuis le deploy
select params->>'pass' as pass,
  count(*) filter (where event='sg_pass_cta') as cta,
  count(*) filter (where event='sg_pass_offer_view') as views
from analytics_events
where event in ('sg_pass_cta','sg_pass_offer_view') and ts >= '2026-09-28T06:00:00Z'
group by 1;
-- chaîne checkout→redirect avec pass
select event, params->>'pass' as pass, count(*)
from analytics_events
where event in ('sg_onsite_checkout_opened','sg_card_tokenize_attempt','sg_card_tokenize_success','sg_payment_submit','sg_create_payment_request','sg_create_payment_response','sg_mollie_checkout_redirect','sg_payment_failed','sg_checkout_abandon')
  and ts >= '2026-09-28T06:00:00Z'
group by 1, 2 order by 1, 2;
-- raisons d'échec + abandons
select params->>'reason' as reason, count(*) from analytics_events
where event='sg_payment_failed' and ts >= '2026-09-28T06:00:00Z' group by 1;
select params->>'via' as via, count(*) from analytics_events
where event='sg_checkout_abandon' and ts >= '2026-09-28T06:00:00Z' group by 1;
```

**REVENUE TRUTH** : dernier paid Mollie 2026-07-19 (70j) ; Stripe legacy 14 actifs stables ; CTA/checkout/redirect ≠ revenu.

**VERDICTS** : Trip choice → **INSUFFICIENT DATA** (relever 2026-10-05) · Checkout → **INSTRUMENTATION REQUIRED** (pas de cause identifiable sans les comptes par étape).

---

## 2026-09-28 — B2C REVENUE/CRO SPRINT : trip7 secondaire dans le paywall (?tripchoice=)

**PROBLEM** : baseline 14j — 1604 sessions → 458 modal (28.6%) → 35 CTA (7.6%) → 35 checkout (100%) → 0 redirect → 0 paid ; dernier paid Mollie 2026-07-19. Levier mesurable sans toucher prix/paiement : proposer trip7 (€4.99, déjà chargeable) sous l'offre p30.

**CHANGE** (money-path/pricing/grants/subscriptions ZÉRO touchés) :
- `src/PassOffer.jsx` : rangée `passoffer-trip-choice` sous la carte hero (inchangée), défaut ON, rollback `?tripchoice=0`, masquée hors p30, prix via offerDisplayCents, clic → `onSelectOffer`
- `src/PremiumModal.jsx` : état offre + `selectOffer` (replaceState, pas de reload, pas de piège retour)
- `WorldPaywall.jsx` (2 sites) + `ComicPaywall.jsx` (1 site) : relais `onSelectOffer`
- `src/Sargasses_PROD.jsx` : deep-link préserve aussi `?tripchoice=0`
- Expérience : hypothèse/modal→CTA global+par pass/secondaires/7j min/rollback documenté. Analytics : zéro nouvel event (sg_pass_cta.pass + sg_pass_offer_view.offer existants)

**PROOF** : npm test 67/67 · build exit 0 · bundle 38.2 Ko · smoke 4/4 · funnel 13/13 · offer-exposure 12/12 · trip-choice 8/8 · regions OK · CI PR #759 7/7 verte · merge squash `42ab1024b`.

---

## 2026-09-28 — B2C OFFER EXPOSURE : ?offer=trip7/season dans le paywall (fallback p30, money-path intact)

**PROBLEM** : offres serveur trip7/season chargeables mais inaccessibles (seul p30 servi) — aucune rampe contrôlée pour les exposer.

**CHANGE** (money-path ZÉRO touché — aucun .php/worker/grant/subscription modifié, aucun prix changé) :
- `src/lib/offers.js` (+) : `resolveOffer()` déterministe + `offerBaseCents()`/`offerDisplayCents()` (miroir serveur exact, trip7 exclu de la surcharge USD) + kill-switch `?offerlab=0`
- `src/PassOffer.jsx` : `offerKey` (défaut p30), titre/durée/prix dynamiques, buy() même forme `{c,pass,days,segment}`, view track +offer/+offer_requested
- `src/PremiumModal.jsx` + `WorldPaywall.jsx` (2 sites) + `ComicPaywall.jsx` (1 site) : threading offre
- `src/Sargasses_PROD.jsx` : deep-link `?paywall=1` préserve `?offer=` valide
- `src/PremiumModal/OnsiteCheckout.jsx` : récap/bouton/wallet via offerDisplayCents (fix affichage trip7-USD-saison), fallback historique

**PROOF** : npm test 67/67 · build exit 0 · bundle 38.2 Ko · smoke 4/4 · funnel-payment 13/13 · offer-exposure 12/12 · regions OK · CI PR #757 7/7 verte · merge squash `ec3f68db2`.

**NOTE COLLISION** : checkout principal partagé avec session SEO parallèle (branche switchée, fichiers revert mid-turn, dist/ écrasé) — travail isolé en worktree dédié, PR depuis `agent/offer/expose-trip7-season2` (la branche `...-season` portant un commit SEO). Rien de la session SEO modifié.