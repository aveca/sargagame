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
