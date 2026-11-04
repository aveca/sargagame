# SARGASSES — REVENUE, PRICING & DESIGN SPEC
Date: 2026-11-04
Branch: revenue/b2c-monthly-499-20261104
Base: main @ a460e4f6e5896778e5bef2f00a192824a3f608fb

## Commercial decision: three monthly subscriptions

New B2C subscriptions, no free trial. Charge the first month at signup; automatic monthly renewal; cancel online at any time; access remains until the end of the period already paid.

| Plan | EUR regions | USD regions | Included value |
|---|---:|---:|---|
| BEACH | €4.99/month | $5.99/month | 1 saved beach, its 7-day outlook, its alerts |
| ISLAND (recommended) | €7.49/month | $7.99/month | Up to 5 beaches, forecasts and alerts for each, comparison |
| EXPLORER | €9.99/month | $9.99/month | All beaches in region, regional morning brief, all-region alerts and comparison |

EUR: Martinique and Guadeloupe. USD: Florida, Punta Cana, Riviera Maya and Tulum. The amount must be derived server-side from the verified region + plan. Do not accept amount/currency/interval from the browser.

No annual plan in this launch. No free trial. Do not silently migrate old one-time pass customers or existing legacy subscribers. Old paid entitlements continue until their existing expiry.

## Tier product rules

BEACH: one selected/favourite beach. Unlock only its real available 7-day outlook, current observation timestamp/confidence, and notifications for that beach.

ISLAND: up to five selected beaches, each with the same outlook and notifications; allow a simple side-by-side comparison.

EXPLORER: all beaches in the selected region, regional morning brief, alerts across the region, complete comparison/history that is actually available.

The features above are the commercial target. Do not label a tier "available" until every included capability is enforced server-side and delivered end-to-end. If a function is not ready, label it as an upcoming feature on the landing page and do not charge for it as an existing entitlement.

## Design direction — replace the existing sales presentation

Maintain the recognizable Sargasses identity: deep ocean / dark teal, warm gold accent, the Veilleur character, strong editorial typography and existing comic/editorial visual language. Make the purchase path clearer, shorter and mobile-first. Do not perform a broad redesign unrelated to sales.

First screen must answer instantly:
1. Which beaches can I check?
2. What do I get when I pay?
3. What is the monthly price?
4. Can I cancel?

FR hero:
- Eyebrow: LE VEILLEUR DES PLAGES
- H1: "Choisis ta plage. Prépare ta journée."
- Subheadline: "Compare les plages, consulte les prévisions disponibles sur 7 jours et reçois une alerte quand la situation évolue."
- Primary CTA: "Voir les 3 formules"
- Secondary CTA: "Explorer la carte"
- Price anchor: "Dès 4,99 €/mois" on EUR domains; local currency elsewhere.

Keep a real map/beach preview above the fold. Display the actual observation timestamp and confidence next to the selected beach. If the data is stale, label it clearly as an old observation and suppress claims of current/live status. Never synthesize a beach status, satellite observation, accuracy rate, community count, testimonial or urgency.

Pricing section:
- Three cards, not more.
- ISLAND is recommended with neutral copy: "Le meilleur équilibre pour comparer plusieurs plages".
- One clear button per card, including exact amount/cadence:
  - "Débloquer BEACH — 4,99 €/mois"
  - "Choisir ISLAND — 7,49 €/mois"
  - "Passer à EXPLORER — 9,99 €/mois"
- Under every price: "Prélèvement aujourd'hui, puis chaque mois. Résiliable à tout moment."
- Make price + renewal + cancellation visible before redirecting to Mollie.
- No hidden selection, countdowns, fake scarcity, fake "most popular", or stacked modals.

Conversion path:
Visitor → real beach preview → compare plans → choose plan → email + explicit recurring-payment consent → Mollie hosted payment → confirmed paid state → server-side entitlement → first successful alert/brief → renewal/retention.

Use the shortest flow possible: region inferred, email once, plan selection once. Existing customers should have "Déjà abonné ? Restaurer mon accès". Provide an accessible cancellation link and confirmation.

Content structure:
1. Hero with real regional map/beach sample and three-plan CTA.
2. Real beach preview with observed-at timestamp, freshness and confidence.
3. Three benefits with actual product demonstration: choisir, comparer, être alerté.
4. Three pricing cards.
5. Reliability/method section using true measured data and explicit limits.
6. FAQ: included beaches, forecast availability, alerts, renewal, cancellation, receipts, refunds.
7. Footer: legal info, contact, terms, privacy, cancellation and support.

Marketing assets:
- Create region-specific landing variants only where search intent and real unique regional value exist.
- SEO titles/meta should target "prévision sargasses [destination]", "plages sans sargasses [destination]" and local equivalents.
- Keep EN/ES copy consistent and native; never machine-copy French idioms.
- Campaign creative should use real map screenshots, date-stamped real observation cards and simple "check before you go" message.
- Organic acquisition: shareable beach cards, tourism/hotel partner links, local travel guides, regional internal links. No fake testimonials or unsupported performance claims.
- Measure the paid funnel by region, language, landing page and plan. Revenue is the total of confirmed captured payments, not CTA count or subscription creation.

## Important current repository / production facts

Verified main (2026-11-04):
- src/PassOffer.jsx sells p30 as a one-time pass: EUR €14.99 / USD $11.99 for 30 days.
- workers/sargagame/index.js has B2C one-time pass validation and grants; create_subscription currently allows only B2B pro_monthly €79 and brief_monthly €29.
- public/api/mollie.php + mollie-lib.php + mollie-webhook.php support B2B recurring subscriptions and lifecycle; CLAUDE.md says B2C recurring is not the active model and is legacy Stripe-only. This is a commercial architecture change, not a price-label edit.
- Supabase payment_grants currently has 3 rows, unique payment_id/subscription_id and columns for pass/plan/email/customer_id/currency/expires_at/island; no dedicated B2C tier subscription ledger is present.
- analytics_events currently has about 415,730 rows; b2c_alerts 235; b2b_leads 21; b2b_subscriptions 0; payment_grants 3 (read-only checks 2026-11-04).
- Supabase security advisor reports 8 tables with RLS enabled but no policies and sg_upsert_payment_grant mutable search_path. Do not weaken RLS; ask Codex to inspect grants/roles and fix where appropriate as a separate security task before exposing new subscription data.
- Cloudflare regional Workers were last modified/deployed 2026-10-28. Pages regional builds also last deployed from commit 164d70fd5a494c638c4a804a093381e28fc393de on 2026-10-28, while main is newer.
- Latest repository handoff states observation freshness SLA breach and inconsistent freshness fields across all six regions. Fix/verify the freshness truth before selling a product promising a reliable current forecast. Do not hide this by changing labels only.
- Latest reported gzip budget was 210.0 KB / 210 KB. Preserve it: lazy-load design components and avoid eager bundle growth.

## Mollie recurring requirements

Follow the current Mollie API, not an invented flow:
- https://docs.mollie.com/docs/recurring-payments
- https://docs.mollie.com/reference/create-customer-payment
- https://docs.mollie.com/reference/create-subscription
- https://docs.mollie.com/reference/list-subscription-payments

Mollie establishes consent using a successful first payment with customerId and sequenceType=first. Once paid and a valid mandate exists, create the monthly subscription with startDate one billing period after the first payment so signup is not double-charged. Subsequent subscription payments are new payment IDs; their payment objects carry subscriptionId. Mollie does not provide separate subscription lifecycle webhooks: reconcile subscription status through authenticated API calls, and handle normal payment webhooks for renewal success/failure. Mollie can retry failed recurring payments up to five times depending on failure reason.

Implementation:
1. Create/find customer safely; server derives plan, region, amount, currency, cadence.
2. Show exact recurring consent and first charge details before checkout.
3. First payment establishes mandate at selected tier price.
4. Fetch payment from Mollie server-to-server. Do not trust browser redirects or claimed webhook status.
5. Create exactly one monthly subscription after the first payment is paid and a mandate is valid; set first recurring charge after one billing month.
6. Persist durable subscription/renewal ledger with customer/subscription/payment IDs, plan, email, region, amount, currency, status, paid-through, next due, cancellation timestamp, last failed/successful charge.
7. Renewals correlate using Mollie subscriptionId and new payment ID; idempotent updates only after authoritative paid status.
8. Failed attempts do not extend entitlement. Respect Mollie's retries; do not cancel or revoke prematurely. No undisclosed grace period.
9. Cancellation stops future charges; keep access until paid-through expiry.
10. Self-service cancellation and verified-email subscription restoration.
11. Enforce tier limits on APIs/data/alerts server-side, not only by hiding buttons.
12. Keep B2B €79/€29 and legacy one-time passes unchanged.

## Tests and release gates

Mollie test mode:
- EUR + USD amount/plan allowlist; tampered amount, interval, region rejected.
- First successful payment creates one subscription; failed/pending first payment creates none.
- No double charge at signup.
- Duplicate first-payment / renewal webhook cannot duplicate ledger rows or extend twice.
- Renewal success extends paid-through exactly once; failed renewal never extends.
- Cancellation prevents future charge while preserving already-paid period.
- Access expiry locks all gated endpoints and notifications.
- BEACH=1 / ISLAND=5 / EXPLORER=all region; legacy grants and B2B subscriptions still work.
- All six domains, all regional currencies, FR/EN/ES copy, mobile layout and legal disclosures verified.
- Build, accessibility, Playwright smoke, gzip budget and live endpoint checks.

Before production: resolve freshness SLA and verify all included features. Run end-to-end Mollie TEST, rollback rehearsal, reconciliation and cancellation tests. Only then enable LIVE subscription creation and deploy. No live customer charge until all launch gates pass.


## 10. SEO acquisition system — priority for paid traffic

The existing code already has meaningful SEO infrastructure:
- scripts/lib/region-seo-pages.cjs generates regional English/Spanish beach pages, beach hubs, resort pages, FAQ markup and regional sitemaps from data.
- Existing generated routes include beach pages, beaches/playas hubs, resort/hotel directories and SEO region pages.
- scripts/prepare-ftp.cjs rewrites robots.txt per region/domain and emits the sitemap URL for each generated regional build. Verify the final artifacts actually served on all six domains; do not assume the template is the deployed robots file.
- Reliability pages and monthly pages already append into regional sitemaps.

Do not rebuild this system blindly. Inventory actual indexable URLs, canonical URLs, hreflang alternates, internal links, page status, content freshness and sitemap inclusion first.

### Search-intent clusters to cover

Build and prioritize one genuinely useful landing page per unique intent, not a separate thin page per keyword.

FR / EUR regions:
- sargasses Martinique aujourd'hui / sargasses Martinique carte
- état des sargasses plage des Salines / Sainte-Anne / Pointe Faula / Tartane / Diamant
- plage sans sargasses Martinique / où aller à la plage aujourd'hui
- sargasses Guadeloupe aujourd'hui / carte sargasses Guadeloupe
- état des plages Grande-Terre / Basse-Terre / Sainte-Anne Guadeloupe

EN / USD regions:
- sargassum map Florida / sargassum Miami beach today / Florida sargassum forecast
- sargassum Punta Cana today / Bavaro beach sargassum / Cap Cana seaweed
- sargassum Cancun today / Riviera Maya sargassum / Playa del Carmen seaweed
- sargassum Tulum beach today / Tulum seaweed forecast / Akumal sargassum

ES / USD regions:
- sargazo Punta Cana hoy / playas sin sargazo Punta Cana
- sargazo Cancún hoy / sargazo Riviera Maya / playas sin sargazo Tulum
- estado del sargazo por playa / mapa de sargazo

Use GSC actual impressions/queries to pick the next page and title rewrite. These are initial intent hypotheses, not verified search-volume claims. Do not invent monthly search volumes, rankings, traffic, or keyword difficulty.

### Page intent and content templates

For each regional landing page:
- unique H1, title, description and canonical matching the real target domain and language;
- real geographic information, named beaches and useful travel context;
- actual source observation timestamp, age, freshness state and confidence;
- real beach-level data only when observation freshness is inside the 900-minute SLA;
- a clear explanation when no current classification can be published;
- CTA to save a beach, receive a factual alert or compare plans;
- links to relevant beach, coast, resort and methodology pages;
- no fabricated "clean today" counts, live status, accuracy claims or artificial freshness dates.

For beach pages:
- provide the actual beach name, commune/municipality, geographic context, available observations and source timestamps;
- explain what delayed/unknown data means for a visitor;
- link to nearby beaches and the regional comparison;
- show subscription value at the point the visitor asks for a longer horizon or an alert.

For resort/hotel pages:
- only include verified resorts and nearest relevant beaches;
- make unique local information genuinely useful;
- offer a B2B contact/request route separately from B2C pricing;
- avoid doorway pages that simply swap a resort name.

Evergreen content cluster:
- how to interpret a satellite sargassum observation;
- what to check before choosing a beach;
- regional beach guides and coastal exposure patterns;
- seasonal sargassum guide with dated sources;
- how alerts and 7-day outlooks work, including explicit limits.
Use a real author/editorial review process, cited public sources and update dates tied to real changes. Refreshing the page build date alone does not make its content current.

### Technical SEO checks

- Verify all six domain robots.txt and sitemap.xml endpoints: HTTP 200, correct host, no cross-domain leakage, Tulum included, only indexable canonical URLs listed.
- Check XML parse, duplicate URLs, missing generated pages, stale lastmod values, canonical/hreflang reciprocity, x-default where appropriate, status code and redirects.
- Preserve canonical URLs and useful legacy paths; do not rename URL structures casually.
- Add BreadcrumbList/Organization and page-specific structured data only when it accurately matches visible content. Do not promise a rich result.
- Ensure titles/descriptions are unique, readable and written for click intent; no keyword stuffing.
- Internal linking: regional hub → coast/commune → beach → nearby beaches → pricing/methodology; no orphan pages.
- Optimize real image files: descriptive filenames/alt text, modern formats, intrinsic dimensions and lazy loading below fold.
- Respect mobile Core Web Vitals, accessibility and existing gzip limit (reported 210.0 KB / 210 KB).
- Confirm indexable pages have useful server-rendered HTML and are not dependent on blocked scripts for their main meaning.
- Never use cloaking, doorway pages, link schemes, mass-generated near-duplicates, hidden text or fake reviews.

### Critical current SEO issue

A live Google result for the Martinique beach hub currently says "en temps réel" and lists satellite statuses dated 2026-10-28; the same date appears in live regional beach pages. At the current audit date 2026-11-04, that is at least a week old. The main branch contains newer freshness logic for regional SEO generation, but live regional Workers/pages were last deployed on 2026-10-28. Reconcile the generated HTML and deployed response. Fix any stale "today"/"live"/"real-time" claims before driving search traffic to those pages.

### Ethical authority / distribution

- Publish small, genuinely useful regional data explainers and seasonal summaries from verified dated source records.
- Offer embeddable beach status cards or partner links to hotels, tourism offices, guides and local operators, with attribution and source freshness visible.
- Seek relevant editorial links from local tourism partners, regional travel guides and universities/associations where the data is genuinely useful.
- Share useful destination cards and guides in relevant travel communities without spam.
- No paid link schemes, private blog networks, automated comment links or mass directory submissions.

## 11. Lead capture and B2C/B2B funnels

### Read-only production signals observed 2026-11-04

Supabase public analytics_events contains approximately 415,730 rows overall. A last-30-day aggregate query returned:
- 90,274 combined session event rows across the known regional labels. This sums sg_session and sg_session_start events; it is NOT a count of unique visitors.
- 7,571 combined paywall/pass-offer event rows across six regions; these event names can overlap and are not unique people.
- 717 sg_lead_banner_view rows; 1 sg_lead_banner_submit row; 101 banner dismiss rows.
- 4 additional sg_email_submit / sg_hero_email_submit / sg_capture_gate_submit rows.
- 64 combined sales CTA event rows, 5 sg_checkout_started rows, 30 sg_checkout_redirect rows and 23 sg_conversion rows. The checkout event taxonomy is inconsistent across regions; do NOT calculate a single funnel conversion rate from these raw totals.
- All 23 sg_conversion events in this specific 30-day query were tagged MQ; other regions had zero such event rows in that window. This may be tracking coverage, not proof of zero payments.
- Current tables: 234 active b2c_alerts and 1 unsubscribed; 21 b2b_leads (20 contacted, 1 new); 3 payment_grants, all b2c_pass.

These are event/table counts, not unique people, and must be refreshed before using as a baseline. Do not infer SEO traffic, unique users or revenue from these counts.

### Capture design

Capture the lead after delivering a useful preview, not before the user understands the product:
1. Visitor lands on the beach/region page.
2. Show useful free current observation if fresh, timestamp and limitations.
3. Offer a contextual value exchange: "Recevoir une alerte pour cette plage", "M'avertir quand une observation fraîche est disponible", or "Comparer mes 5 plages".
4. Collect only email + selected beach/region + language; infer region where possible.
5. Separate service-alert consent from optional marketing/newsletter consent. Never pre-check marketing consent.
6. Verify email, provide unsubscribe and deletion paths, and store consent version/time/source.
7. Do not block the map or public observations behind an email wall.
8. Use existing b2c_alerts / planner_alerts / email infrastructure where appropriate; do not create a duplicate newsletter table or a second competing lead system.
9. Keep B2B hotel/resort lead capture separate from the B2C subscription. Keep the 21 existing B2B records, normalize region/status/source, and track a genuine human follow-up.

### Lead nurturing and recovery

- Transactional beach alerts are delivered only for the selected beach and according to service consent.
- Marketing newsletter and promotional offers require a separate valid opt-in.
- Abandoned checkout follow-up may only be sent where the user knowingly supplied the email for checkout and applicable law permits the message; preserve consent evidence and an unsubscribe mechanism.
- Send helpful content first: observation freshness explainer, beach-selection checklist, regional guide, then a transparent subscription offer.
- Trigger an offer when the visitor saves/compares beaches or asks for more forecast horizon, not with repeated interruptive modals.
- If data are delayed, offer "notify me when the next verifiable observation is available"; do not sell "today's answer" as though it exists.

## 12. Unified acquisition-to-revenue funnel

Implement consistent event names and event payload schema across all six domains:
- seo_landing_view (page, keyword cluster if available, region, language, source/medium/campaign);
- beach_preview_view (beach, source timestamp, freshness state);
- lead_capture_view / lead_capture_submit / email_verified;
- tier_table_view / plan_select / recurring_consent;
- checkout_started / first_payment_paid / subscription_created;
- renewal_paid / renewal_failed / cancellation_requested / subscription_canceled / access_expired;
- alert_delivered / alert_opened / return_visit.

Rules:
- Normalize region casing and aliases before storage.
- Generate a privacy-safe first-party session ID; never fingerprint. Respect cookie/analytics consent and applicable data-minimization rules.
- Never put raw email, full name, payment data or tokens in analytics params.
- Preserve UTM source/medium/campaign/content/term through payment return and webhook ledger.
- Emit paid conversion only from the authoritative server webhook after confirmed payment; browser return is not revenue.
- Distinguish alert registrations, marketing leads, B2B leads, checkout starts, successful first charges and recurring renewals.
- Provide a per-region / per-language / per-landing-page report from SEO click → landing → preview → captured lead → tier → paid → renewed.
- Use the highest-value pages and leads to prioritize improvements, not raw impressions alone.

## 13. Execution order for fast growth

P0 (before paid search acquisition):
1. Bring deployed region sites/Workers into sync with current main after the freshness contract passes.
2. Fix any stale "today"/"live" text and prove source timestamp on all six domains.
3. Repair unified checkout/conversion tracking; reconcile real payment grants.
4. Fix high-intent CTA → checkout path by region and currency.
5. Add a non-intrusive email alert capture tied to a beach.

P1:
1. Improve title/description/H1 of existing ranking pages using GSC data.
2. Fix robots/sitemaps/canonicals/hreflang and internal links.
3. Ship the highest-intent regional beach/coast/resort pages where unique value exists.
4. Build three-tier pricing comparison and one short recurring checkout.

P2:
1. Add evergreen regional guides and partner embeddable widgets.
2. Build a permission-based helpful email sequence.
3. Publish a monthly SEO + paid revenue report by region and intent.

No paid campaigns until a landing page, current data, capture/checkout, legal disclosure and payment delivery are proven.


## 14. Fresh Supabase funnel evidence — 2026-11-04T04:14:13.298Z

Read-only aggregation of `public.analytics_events` for the trailing 30 days. Counts below are **event rows**, not unique visitors, users, or a same-session funnel. Only 22 of 3,324 `sg_pass_offer_view` rows contain a session key; none of the 34 `sg_pass_cta` rows contain one. Therefore the ratios below are directional diagnostics only, not conversion rates.

| Event / data point | Observed rows | Latest observed |
|---|---:|---|
| `sg_premium_modal_open` | 3,479 | 2026-11-04 01:49 UTC |
| `sg_pass_offer_view` | 3,324 | 2026-11-04 01:49 UTC |
| `sg_pass_cta` | 34 | 2026-10-29 07:52 UTC |
| `sg_checkout_started` | 5 | 2026-10-28 16:29 UTC |
| `sg_checkout_redirect` | 30 | 2026-10-30 18:44 UTC |
| `sg_conversion` | 23 | 2026-10-30 02:52 UTC |
| `sg_lead_banner_view` | 714 | 2026-10-07 20:48 UTC |
| `sg_lead_banner_submit` | 1 | 2026-10-05 |
| `sg_email_submit` | 4 | 2026-10-08 |

### 14.1 Regional distribution and interpretation

- Pass-offer views: MQ 1,999; Punta Cana 588; Florida 372; Guadeloupe 282; Riviera Maya 83. No Tulum row was present for this event in the 30-day grouping.
- Recorded `sg_pass_cta`: MQ 16, Guadeloupe 6, Riviera Maya 12, in total 34 (reconciled from a direct region aggregation; the earlier draft's Guadeloupe subtotal of 5 was short by one event). The most recent click row was 2026-10-29 07:52 UTC.
- The five `sg_checkout_started` rows are all tagged Riviera Maya (2 from `chasse_detail`, 2 from `chasse_detail_fc`, 1 from `beach_sheet`). The separate `sg_checkout_redirect` population is older and mostly MQ (28 MQ, 2 Tulum), with mixed legacy/capture paths.
- The 23 `sg_conversion` rows are not a homogeneous paywall cohort: 14 carry plan `p30` (last 2026-10-11) and 9 carry plan `sos` (last 2026-10-30). Do not treat all 23 as PassOffer purchases or attribute them to the current 30-day-pass offer.
- The current `PassOffer.jsx` emits `sg_pass_offer_view` on mount and `sg_pass_cta` in its buy handler, then the parent opens the on-site payment step. The database shows a material instrumentation/funnel gap: the offer continues to be viewed through Nov 4, but its latest recorded CTA is Oct 29. This could be low click intent, event delivery loss, or a version/region discrepancy; current data cannot distinguish these explanations.

### 14.2 B2B and lead capture

- `sg_b2b_offer_view`: 101 rows in the 30-day window; `sg_b2b_step`: 31 rows, latest 2026-10-29 19:53 UTC.
- `b2b_leads`: 21 stored records (20 `contacted`, 1 `new`); the latest created record is 2026-10-05 10:47 UTC. No B2B subscription rows were returned by the status/plan/region aggregation.
- Lead-banner views and submissions have effectively stopped in the recorded events after Oct 7 / Oct 5 respectively. This is an instrumentation or acquisition/capture issue to diagnose, not proof that the UI is absent.

### 14.3 Data hygiene / next actions

- The 30-day aggregation found 234 B2C alert rows in an earlier status count; 186 `unknown`-region active rows are associated with domains `localhost` (185) and `127.0.0.1` (1). Treat these as likely development/test records, not real regional customers. Do not delete them from production as part of this analysis. Verify any notification or export job excludes localhost/test-domain rows before it uses the table.
- Do not send follow-up emails or mass outreach from this analysis. Existing workflows include manual send gates; keep them closed.
- P0 measurement work: add/verify a privacy-safe first-party session ID to offer-view, CTA, payment-step-open, `sg_checkout_started`, payment outcome, and server-confirmed conversion events; normalize the region and preserve one stable correlation ID across the journey. Respect consent; do not fingerprint; never place emails, payment data, or tokens in analytics.
- P0 product diagnosis: run the same paywall/PassOffer visual smoke on all six production hosts (mobile + desktop) in read-only mode: verify page availability, CTA visibility/enabled state, labels, layout and source SHAs/deployment versions. Never click through to a production payment-creation endpoint. Any click -> email field -> payment creation -> webhook/entitlement validation must use a dedicated staging host or a fully mocked/local endpoint with Mollie test credentials that cannot reach the production Worker/PHP endpoint. No real payment.
- P0 B2B: inspect form step transitions and API availability by region without submitting to the live endpoint. Any submit/lead persistence/trial-token/email validation must run against a local mock or isolated staging backend. Do not submit even a test email to the production B2B endpoint: it can create a real trial token, persist a lead and send an email.
- Preserve the current prices, Mollie live configuration, recurring-payment state, and production data. No checkout, price, email, or production write was made as part of this snapshot. Production smoke is explicitly read-only; no test payment creation, trial provisioning, lead insertion, or email may target a live endpoint.

