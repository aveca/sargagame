# Active B2C CRO funnel

## Scope

Optimize only the live card-first journey:

**Map → Beach → Verdict → Paywall → Checkout**

Legacy landing/A-B arms (`HomeAZ`, `HomeJuicy`, `Chasse`, `GameFunnel`, `HeroVerdict`) are not part of the organic path and must not be modified as part of this CRO sprint.

## Conversion priorities

1. Make the beach verdict immediately understandable.
2. Surface forecast freshness and satellite/data provenance near the verdict.
3. Make the premium value proposition contextual to the selected beach.
4. Put the primary CTA within thumb reach on mobile.
5. Preserve the existing payment implementation and pricing.
6. Preserve existing analytics events and add instrumentation only when necessary.

## Acceptance criteria

- No payment/backend changes.
- Mobile 375x812 smoke test reaches map, beach sheet, verdict and paywall.
- No white screen, infinite loader, or console errors introduced.
- Eager JS remains <= 210 KB gzip.
- Existing payment/funnel E2E remains green.

## Proposed UI hierarchy

### Beach sheet
- Beach name
- Current verdict as the dominant element
- One-sentence plain-language explanation
- 7-day preview with premium days clearly differentiated
- Freshness timestamp / Copernicus provenance
- Primary action: `Voir les prévisions 7 jours`

### Paywall
- Repeat selected beach + current verdict for context
- Lead with outcome/value, not technical features
- 3–4 concise benefits
- Risk reversal/trust proof
- One dominant CTA
- Existing pricing/payment logic unchanged
