# Growth Agent Plan — Conversion, Activation, Retention, CRO

## Mission
Optimiser la croissance : SEO, CRO, rétention, viralité, B2B sales. Gérer le funnel acquisition → conversion → rétention.

## Priorités P0-P2

### P0 — Cette semaine
1. **TASK-P1-006** Monitoring conversion 7j (J+5 post-fix)
   - Source: `scripts/automation/data/funnel-daily-report.json` (fixé 2026-08-12)
   - Seuil: >2% conversion = SUCCESS, sinon kill switch Comic variant
   - Livrable: Décision J7 documentée dans `.ai/decisions.md`

2. **Deploy verification** (avec devops)
   - 5 domaines: MQ, GP, Miami, Cancun, Punta Cana
   - Version v220, data <12h, paywall Mollie OK

### P1 — Sprint 1 (Conversion & Activation)
3. **Paywall CRO** (A/B: `pw_style`, `pw_copy`, `pw_pass_seq`)
   - Baseline: 0.27% modal→CTA, 100% CTA→redirect
   - Target: >2% conversion
   - Actions: test header variants, pricing cards, risk reversal, social proof

4. **B2B trial→paid** (mol_b2b_trial_email, onboarding)
   - Fix: `mol_b2b_trial_email()` undefined → Resend integration
   - Séquence: trial 30j → drip emails (J1, J7, J14, J25) → upgrade CTA
   - Tracking: `sg_b2b_trial_start`, `sg_b2b_trial_activate`, `sg_b2b_upgrade`

5. **Win-back emails** (expired passes)
   - Segment: Supabase `payment_grants` WHERE `expires_at < now()`
   - Séquence: J+1, J+7, J+30 avec offre ciblée
   - Template: `.ai/prompts/07-univers-motion-agent.md` copy column vertébrale 6 temps

### P2 — Sprint 2 (Scale)
6. **Retention / LTV model**
   - Activation events: `sg_map_open` → `sg_beach_open` → `sg_premium_modal_open` → `sg_conversion`
   - Cohort analysis: weekly retention, LTV by pass type
   - Dashboard: `.ai/plans/growth/retention-dashboard.md`

7. **Referral / viral loop**
   - Expose `sgMyReferralCode` + `claim_referral_credit` (déjà dans mollie-lib)
   - Incentive: 1 mois gratuit par referral validé

8. **SEO US expansion**
   - 136+ pages plages programmatiques (FL, Cancun, Punta Cana)
   - Schema.org Beach + FAQ + Review markup

## Artefacts à produire
- `funnel-daily-report.json` → analyse quotidienne
- `retention-dashboard.md` → cohérent avec `daily-metrics.json`
- `win-back-sequence.md` → templates email FR/EN/ES
- `b2b-onboarding-checklist.md` → 5 étapes post-trial

## KPIs
| Métrique | Baseline | Target J30 |
|----------|----------|------------|
| Conversion modal→CTA | 0.27% | >2% |
| Trial→paid B2B | 0% | >15% |
| Rétention J7 | ? | >40% |
| LTV pass one-time | €5.99 | €12+ |
| MRR B2B | ~€0 | >€500 |

## Rollback flags
- `?pwcomic=0` kill Comic variant
- `?pwcopy=0` kill CTA copy test
- `?ab=0` kill all A/B