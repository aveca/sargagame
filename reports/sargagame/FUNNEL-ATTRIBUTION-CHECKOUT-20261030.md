# Funnel attribution and onsite checkout aggregation — 2026-10-30

## Evidence
- The frontend allowlist in `src/Sargasses_PROD.jsx` already sends `sg_checkout_started`, `sg_conversion`, `sg_payment_failed`, `sg_sos_checkout_start` and `sg_sos_checkout_error` to Supabase.
- `scripts/automation/funnel-from-supabase.cjs` previously selected only `event,island,ts`; its `FUNNEL_KEYS` omitted `checkout_started`, `payment_failed` and SOS checkout events. It therefore discarded the on-site checkout-start event already emitted by Mollie/Stripe/PayPal flows.
- The aggregator grouped only by `island.toUpperCase()`, did not read `params`, and had no hostname dimension. Tulum and Riviera Maya intentionally share GA4/Clarity/OneSignal IDs, so first-party hostname attribution is needed; replacing those IDs with TBD placeholders would stop measurement.
- Read-only Supabase sample (24h): Tulum had 40 `sg_session_start`, 12 `sg_beach_open`, 6 `sg_verdict_scan_view`, and zero paywall/CTA/checkout-start events. Riviera Maya had 80 `sg_session_start`, 53 `sg_beach_open`, 39 `sg_verdict_scan_view`, 1 paywall, and zero CTA/checkout-start events.
- Read-only 7-day sample: Riviera Maya had 5 `sg_checkout_started` and no `sg_conversion` rows. This is an event-count observation, not proof of Mollie payment failure; the Mollie dashboard and Worker production logs were not exposed.

## Changes
- Fetch `params` with analytics rows.
- Add a public, non-PII `hostname` field to future Supabase analytics event params.
- Normalize region identifiers and known public hostnames into canonical region keys.
- Parse the existing embedded `params.d` JSON string for region/session IDs when present.
- Count `checkout_started`, `payment_failed` and SOS checkout events; add explicit `cta_to_checkout_started` and `checkout_started_to_conversion` rates.
- Preserve legacy `by_island` output while adding `by_region`, `by_host` and distinct-session dimensions.
- No checkout/payment flow, price, database schema, existing production row or external analytics property is modified.

## Safety
- No Supabase writes, migrations, Mollie calls, emails or notifications were performed.
- This PR changes only future event metadata and local aggregation logic.
- A live payment or Mollie redirect was not tested.
