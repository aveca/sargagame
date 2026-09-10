SPRINT_5_DECISION:

> ⚠️ ERRATUM 2026-09-10 (Sprint 6 reconciliation) — Les chiffres COMIC ci-dessous sont **INVALIDES**.
> Preuve : `pw_style` absent de `AB_FREEZE_MAP` → `abVariant("pw_style",…)` retourne `"world"` 100% (Sargasses_PROD.jsx:1920-1942).
> `ComicPaywall` **non servi en prod** depuis purge A/B 2026-08-05.
> `by_pw_style` funnel réel = `{world: {modal_open:70}}` seulement.
> `WORLD_CTA:0` = zéro structurel (attribution non implémentée `funnel-daily-report.cjs:155-156`).
> Fix comic local-only non déployé (`git diff` non commité).
> Lecture correcte post-fix 24h : **70 WORLD modals, 1 pass_cta inattribuable**. Sprint 6 = réconciliation.

SPRINT_5_DECISION:

AXIS: A — Revenue / CRO B2C

BOTTLENECK:
B2C funnel conversion rate CTA→conversion at 1.8% (below 2% success metric threshold).
Comic paywall variant: 17% of modals (16/96), 0 CTA measured — fundamental conversion failure.
World variant: 83% of modals (80/96), CTA conversion occurring — dominant but overall funnel
conversion insufficient for revenue sustainability.

EVIDENCE:
- OBSERVED: Funnel technically works (13/13 E2E funnel-payment.spec.ts passed, all 4/4 smoke tokens
  green: FUNNEL_REACHED=map+fiche+paywall, ERRORS=[], WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[]).
- MEASURED: 7-day conversion monitoring data (TASK-P1-006): modal→CTA 18.5%, CTA→conversion 1.8%
  (funnel-daily-report.json, 24h glissantes). Comic: 16/96 modals = 17%, 0 CTA. World: 80/96 modals
  = 83%, CTA conversion occurring. Data source: scripts/automation/data/funnel-daily-report.json +
  funnel-snapshot.json + daily-metrics.json mollie.paid bloc.
- INFERRED: Comic variant has fundamental CTA/conversion issue; World variant UX/path is superior.
  A/B variant distribution dilutes conversion potential (32+ dead A/B tests purged TASK-P1-001).
- UNKNOWN: Exact UI/UX reason for comic 0 CTA rate; long-term revenue impact of optimization;
  whether fix would push CTA→conversion above 2% threshold sustainably.

BASELINE:
- Current CTA→conversion: 1.8% over 7 days (funnel-daily-report.json, under 2% success metric)
- Comic variant share: 17% of modals (16/96), 0 CTA measured
- World variant share: 83% of modals (80/96), CTA conversion occurring
- Modal→CTA rate: 18.5% (7j monitoring)
- Success metric threshold: 2% CTA→conversion over 7 days
- Prior A/B test state: 32+ dead tests purged; pw_beat/pw_caml/pw_constel hardcoded (85% promotion);
  AB_FREEZE_MAP simplified to 2 active tests (pw_copy, pw_pass_seq)

HYPOTHESIS:
If the comic paywall variant's CTA conversion failure is identified and resolved through UI/UX
optimization (CTA text, design, placement, or variant configuration — without touching pricing,
Mollie, payment processing, or data pipeline), and/or the configuration shifts toward a
world-variant-dominant experience, then the CTA→conversion rate will exceed the 2% threshold
in subsequent 7-day monitoring, improving B2C revenue per session.

PROPOSED_CHANGE:
Conduct a comic paywall variant CTA audit using Playwright session recordings and heatmaps across
all 6 regions (MQ, GP, Florida, Punta Cana, Riviera Maya, Tulum) to identify why 0 CTA occurs
from comic modals. Implement UI/UX fix: CTA button text/design optimization, variant transition
logic review, or user flow optimization within the existing comic pathway. Changes must NOT touch
pricing, Mollie, payment processing, or data pipeline. Use `?flag=0` rollback flag for any
conversion/UI change. Post-fix, validate with ux-smoke.mjs and run 7-day monitoring run
(funnel-daily-report.json) to measure CTA→conversion rate against 2% threshold.

SUCCESS_METRIC:
- CTA→conversion rate exceeds 2% threshold in 7-day monitoring after fix
- Comic variant achieves >0 CTA rate (was 0/16 modals = 0%)
- Overall B2C revenue per session increases (measured via daily-metrics.json mollie.paid bloc)
- All 4/4 smoke tokens remain green: FUNNEL_REACHED=map+fiche+paywall, ERRORS=[],
  WHITE_OR_TRANSPARENT_BUTTONS=[], RM_INFINITE=[]
- No regression in E2E funnel-payment.spec.ts (must retain ≥13/13 passed)

RISK:
- LOW: Changes are UI/UX only within paywall variant, no payment/Mollie/data pipeline modifications
- Mitigation: `?flag=0` rollback flag available; world variant config preserved intact; smoke test
  gate must pass before and after; E2E funnel test suite must retain ≥13/13 passed
- Risk of unintended consequence on other variants minimized by keeping world variant unchanged
- If fix fails to improve conversion, rollback via `?flag=0` restores prior state in <15 min

NEXT_ACTION:
Conduct comic paywall variant CTA audit across all 6 regions using Playwright session recordings
and heatmaps; identify the UI/UX reason for 0 CTA rate from comic modals; implement CTA button
text/design optimization; validate with ux-smoke.mjs; initiate 7-day monitoring run
(funnel-daily-report.json) to measure CTA→conversion against 2% threshold.

UNE SEULE ACTION : Audit comic paywall CTA across 6 regions via Playwright + heatmaps, identifier
pourquoi 0 CTA, et proposer fix UI/UX (texte/design bouton CTA dans pw_variant comic).