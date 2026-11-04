# SARGASSES — REVENUE + DESIGN SPEC (2026-11-04)

Branch: revenue/b2c-monthly-499-20261104
Base: main @ a460e4f6e5896778e5bef2f00a192824a3f608fb

## Commercial offer

New consumer offer: three monthly auto-renewing tiers, no free trial.

| Plan | EUR | USD | Who it is for |
|---|---:|---:|---|
| Beach | €4.99/month | $5.99/month | One beach, one decision |
| Island | €7.49/month | $7.99/month | Up to five beaches, compare before going |
| Explorer | €9.99/month | $9.99/month | All beaches in the selected region |

Recommend Island visually as the best-value choice. Do not invent popularity labels or customer counts. Price currency is region-specific: MQ/GP EUR; Florida/Punta Cana/Riviera Maya/Tulum USD. First month charged on signup, recurring monthly, cancel anytime; access remains until paid-through expiry after cancellation. Display exact price, auto-renewal and cancellation next to every CTA and before payment confirmation.

This changes the commercial model for new B2C signups only. Keep all legacy one-time passes and existing subscriptions valid until their current paid entitlement ends. Never silently migrate old customers or take a new recurring mandate without explicit consent.

## Visual direction

Retain the recognizable Sargasses identity: deep ocean / dark teal surfaces, warm golden accent, the Veilleur personality and the existing editorial/comic energy. Improve clarity and speed; do not redesign for decoration.

The site must answer in the first viewport:
1. Which beach should I choose?
2. What does this product give me?
3. How much does it cost?
4. Can I cancel?

Suggested FR hero:
- Eyebrow: "LE VEILLEUR DES PLAGES"
- H1: "Choisis ta plage. Prépare ta journée."
- Subheadline: "Compare les plages, consulte les prévisions disponibles sur 7 jours et reçois une alerte quand la situation évolue."
- CTA: "Voir les 3 formules"
- Secondary CTA: "Explorer la carte"
- Product proof: one real regional map + one real selected beach preview. Never synthesize a beach status or forecast.

EN/ES translations must preserve the same meaning and terms.

## Homepage / paywall layout

1. Above fold: compact navigation, powerful headline, visible map or beach-preview, primary CTA, price anchor "Dès 4,99 €/mois" for EUR or regional equivalent. On mobile show one CTA only.
2. Preview: real selected beach, observed status, timestamp of source observation, freshness/confidence. If data is stale, label "Observation ancienne" or local equivalent and suppress current-sounding claims. No "live" badge unless live data has passed freshness SLA.
3. Value strip: "Ta plage / Tes alertes / Ton brief" with actual feature behavior.
4. Pricing: three clear cards with plan name, monthly price, exact included quota, subscription recurrence, cancel-anytime wording.
5. FAQ: what happens after payment, how alerts work, which beaches are covered, what data freshness means, how to cancel, how renewals work.
6. Reliability/method section linking to existing transparent methodology.
7. Footer: support, privacy, terms, cancellation and billing information.

Pricing cards:
- Beach — €4.99 / $5.99 per month. One saved beach, 7-day forecast for that beach, alerts for that beach.
- Island — €7.49 / $7.99 per month. Up to 5 saved beaches, forecast and alerts for each, quick comparison.
- Explorer — €9.99 / $9.99 per month. All beaches in selected region, regional morning brief, regional alerts and comparison.
Use exact entitlement labels; do not show a feature as included until server-side gating and delivery are complete.

## Conversion system

- Preselect no plan by dark pattern; recommend Island visually with a neutral "Le meilleur équilibre" label.
- CTA copy includes amount and cadence: "Débloquer Island · 7,49 €/mois".
- Keep all recurring details visible: "Prélèvement aujourd'hui, puis chaque mois. Résiliable à tout moment."
- One short checkout sequence: choose plan → enter email/explicit recurring consent → hosted Mollie checkout. Infer region and currency server-side; no redundant registration.
- Returning customers: "Déjà abonné ? Restaurer mon accès".
- Mobile sticky footer with selected plan + price + CTA; do not cover important content.
- Avoid modal stacking, vague CTA text, forced timer, false urgency, fake reviews or invented savings.
- Build dedicated campaign landing variants by region and language using the existing domain/SEO structure, but don't duplicate thin pages.
- Track offer view, tier selection, consent, first payment started/paid, subscription created, renewal paid/failed, cancellation and access expiry. Use paid invoices as revenue truth, not clicks.

## Technical/payment constraints discovered

- src/PassOffer.jsx currently sells p30 as a one-time €14.99 / $11.99 pass for 30 days.
- workers/sargagame/index.js currently has B2C one-time pass validation; create_subscription allows B2B plans only (pro_monthly €79, brief_monthly €29).
- public/api/mollie.php already supports B2B recurring, customer creation, and subscription creation; public/api/mollie-webhook.php handles subscription lifecycle for B2B. B2C recurring is explicitly described in CLAUDE.md as not sold / legacy Stripe-only.
- payment_grants currently includes payment_id, subscription_id, customer_id, type, plan, email, expires_at; verify deployed schema and hosting routes before using.
- Latest main handoff says satellite freshness SLA is breached across all six regions with inconsistent freshness fields. Fix this before claiming current/real-time observations or spending on acquisition.
- Latest reported gzip budget is 210 KB / 210 KB. Do not add eager frontend code; use lazy loading and respect budget.

## Mollie subscription implementation requirements

Read current Mollie docs and repository-specific code before implementation:
- https://docs.mollie.com/docs/recurring-payments
- https://docs.mollie.com/reference/create-customer-payment
- https://docs.mollie.com/reference/create-subscription

Implement:
1. Customer + explicit consent.
2. Server-side plan/region/price allowlist only.
3. Mollie first payment with correct customerId and sequenceType=first to establish mandate.
4. Verify payment status from Mollie API on server; do not trust browser return.
5. After first payment is paid and mandate valid, create the monthly subscription. Do not charge twice on signup; set the first recurring charge at the next billing interval.
6. Durable subscription ledger with provider IDs, tier, email, region, currency, amount, status, created/canceled timestamps, paid-through and next-charge dates.
7. Idempotent handling for first payment and recurring payment webhooks, correlated using Mollie subscriptionId on renewal payments.
8. Extend paid-through only after confirmed renewal. Failed payment never extends access.
9. Cancellation stops future payments but preserves already-paid access until period end.
10. Self-service cancellation and verified-email access recovery.
11. Enforce tier limits on server/API, not only in frontend.
12. Keep historic one-time grants and B2B €79/€29 subscriptions unchanged.

## Tier entitlement tests

- Beach cannot access more than one saved beach.
- Island cannot access more than five saved beaches.
- Explorer can access all beaches for its region.
- Failed renewal does not extend paid-through.
- Cancellation preserves current paid-through period and blocks next charge.
- Access expires at paid-through timestamp.
- Duplicate webhooks cannot double-extend.
- Existing one-time and B2B customers remain valid.
- Correct region currency/price on all six domains.
- Consent and billing details are visible in mobile and desktop payment flow.

## Launch rules

Build and verify everything in Mollie TEST mode first. Live subscriptions, production migration, live checkout, secrets and deployment require the owner's explicit authorization. Do not turn on campaigns while satellite freshness is in breach or premium features are not deliverable.
