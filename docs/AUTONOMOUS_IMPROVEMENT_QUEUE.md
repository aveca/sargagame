# Autonomous improvement queue

Priority order after v1.0.0

## P0 — conversion blockers
- [ ] Identify and eliminate confirmed dead/rage click hotspots on `/` and `/carte-sargasses/`.
- [ ] Verify the live map → beach detail → verdict → paywall path on 375x812.
- [ ] Preserve payment/pricing while improving contextual CTA clarity.

## P1 — interaction performance
- [ ] Reduce LCP from the last observed 3.47s toward <2.5s on mobile.
- [ ] Reduce INP from the last observed 414ms toward <200ms.
- [ ] Defer non-critical analytics/work after first interaction.
- [ ] Avoid map animation work during input handling where measurable.

## P1 — observability
- [ ] Give important map/home interactive targets stable first-party names for dead/rage click diagnosis.
- [ ] Keep funnel events: session → map → beach → verdict → paywall → CTA → checkout.

## Release gates
- Build green.
- Eager JS <= 210 KB gzip.
- Targeted Playwright funnel green.
- No payment regression.
- No unverified UX changes based only on aggregate rage/dead-click counts.
