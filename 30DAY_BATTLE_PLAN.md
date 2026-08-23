# 30-DAY BATTLE PLAN — Sargagame

> **Derived from**: `MASTER_AUDIT.md`
> **Constraints**: 1 developer (Mimo), 2h/day, all changes reversible with `?flag=0`
> **Goal**: 2x conversion (0.009% → 0.02%) + unblock US expansion + harden money-path

---

## Week 1: Critical Fixes (P0)

### Day 1-2: Security + CI Gate
- [ ] **A12**: Rotate ALL secrets in `.env` (STRIPE_SECRET_KEY, FTP_PASS, SMTP_PASS, GITHUB_TOKEN, RESEND_API_KEY)
  - Proof: `.env` lines 1-33 in public GitHub repo
  - Rollback: N/A (security fix)
- [ ] **G15**: Fix CI gate — make `ux-smoke.mjs` exit 1 on failure + add `check-bundle-budget.cjs` to `ci-tests.yml`
  - Proof: `ci-tests.yml` (22 lines, no smoke/budget)
  - Rollback: `?ci_gate=0` (revert YAML)

### Day 3-4: Data Integrity
- [ ] **G1**: Migrate lead capture from Apps Script → Supabase (`leads` table)
  - Proof: `Sargasses_PROD.jsx:1819`, `CLAUDE.md:53` (7× undercount)
  - Rollback: `?leads_supabase=0` (revert to Apps Script)
- [ ] **G2**: Add analytics_events purge job (90-day retention)
  - Proof: `supabase/schema.sql:166`, no purge script
  - Rollback: N/A (maintenance job)

### Day 5-6: Money-Path Hardening
- [ ] **G3**: Mirror payment grants to Supabase (`grants` table)
  - Proof: `mollie-lib.php:101-112`, `public/api/data/` (no git history)
  - Rollback: `?grants_supabase=0` (revert to JSON-only)
- [ ] **G5**: Add error tracking (`window.onerror` → Supabase `client_errors`)
  - Proof: No Sentry/Bugsnag in `src/`
  - Rollback: `?error_tracking=0` (disable beacon)

### Day 7: Review + Verify
- [ ] Verify all P0 fixes pass build + smoke + PHP lint
- [ ] Update `NEXT_SESSION.md` with results

---

## Week 2: Conversion Quick Wins (P1)

### Day 8-9: The "aha moment" fix
- [ ] **A13**: Show J+1 (tomorrow) forecast for free on beach detail
  - Proof: `daily-metrics.json:37-43` (only `map_scrub_forecast` converts)
  - Rollback: `?j1_free=0`
- [ ] **A2**: Instrument `sg_first_verdict_view` event
  - Proof: No such event exists
  - Rollback: N/A (just tracking)

### Day 10-11: Paywall friction removal
- [ ] **A1**: Move email capture before CTA on paywall
  - Proof: `PremiumModal.jsx:3023` (email after CTA)
  - Rollback: `?email_pre=0`
- [ ] **E1**: PassOffer CTA copy specificity
  - Current: "Commencer maintenant →"
  - Proposed: "Activer mon accès 30 jours · 14,99€ →"
  - Rollback: `?cta_copy=0`

### Day 12-13: Trust + social proof
- [ ] **E2**: Add social proof to WorldPaywall + ComicPaywall
  - Proof: No `__COMM` on these paywalls
  - Rollback: `?social_proof=0`
- [ ] **E4**: Add duration + no-subscription to CTA subline
  - Current: "Paiement sécurisé · Accès immédiat"
  - Proposed: "30 jours d'accès · Paiement sécurisé · Sans abo"
  - Rollback: `?cta_subline=0`
- [ ] **E11**: Add trust row (lock/calendar/no-sub) in PassOffer
  - Rollback: `?trust_row=0`

### Day 14: Review + Verify
- [ ] A/B test: J+1 free vs control (measure `sg_conversion`)
- [ ] A/B test: new CTA copy vs old (measure `sg_pass_cta`)
- [ ] Update `NEXT_SESSION.md`

---

## Week 3: Distribution + B2B

### Day 15-16: US Expansion prep
- [ ] **G10**: Generate PHP allowlists from `regions/index.cjs`
  - Proof: `mollie.php:14`, `collect.php:16-19` (manual sync)
  - Rollback: N/A (build-time generation)
- [ ] **G9**: Add Cloudflare cache rules for `/api/copernicus/*`
  - Proof: `collect.php:56` (25MB/day cap)
  - Rollback: (Cloudflare dashboard toggle)

### Day 17-18: B2B conversion
- [ ] **A5**: Add B2B onboarding checklist post-trial
  - Proof: `PremiumModal.jsx:543-557` (no checklist)
  - Rollback: `?b2b_checklist=0`
- [ ] **A11**: Add "Preview what your guests see" demo to B2BModal
  - Proof: `PremiumModal.jsx:109-568` (no demo)
  - Rollback: `?b2b_demo=0`

### Day 19-20: AI features
- [ ] **F6**: Personalized change alerts (ML on existing forecast)
  - Proof: `WeekHub.jsx:190-196`, OneSignal already wired
  - Rollback: `?smart_alerts=0`
- [ ] **F9**: AI-generated brief summaries
  - Proof: `BriefMatin.jsx:19-26` (static template)
  - Rollback: `?ai_brief=0`

### Day 21: Review + Verify
- [ ] Verify Barbados region can be added with 1 JSON file
- [ ] Measure B2B trial → paid rate
- [ ] Update `NEXT_SESSION.md`

---

## Week 4: Infrastructure + Scale

### Day 22-23: Build pipeline
- [ ] **G4**: Matrix builds (parallel per region)
  - Proof: `daily-copernicus.yml:734-743` (sequential)
  - Rollback: `?matrix_build=0` (revert to sequential)
- [ ] **G11**: Fix git repo bloat (`fetch-depth: 50`)
  - Proof: `.git` 588MB, `fetch-depth: 0`
  - Rollback: N/A (CI optimization)

### Day 24-25: Email + monitoring
- [ ] **G6**: Split email lanes (transactional vs marketing)
  - Proof: All email via one shared mailbox
  - Rollback: N/A (config change)
- [ ] **G7**: Analytics rotation + Supabase mirror
  - Proof: `collect.php:53-56` (no rotation)
  - Rollback: N/A (maintenance)
- [ ] **G16**: External uptime monitoring
  - Proof: Health check only 4×/day in pipeline
  - Rollback: N/A (external service)

### Day 26-27: B2B widget + money-path
- [ ] **G8**: Cloudflare cache for widget assets
  - Proof: Widget served from shared Apache
  - Rollback: (Cloudflare dashboard toggle)
- [ ] **G14**: Shorten widget token validity + add revocation
  - Proof: `widget-token.php:23` (400-day validity)
  - Rollback: N/A (security fix)

### Day 28-30: Review + Plan Month 2
- [ ] Full regression: build + smoke + PHP lint + bundle budget
- [ ] Measure: conversion rate, funnel accuracy, error rate
- [ ] Plan Month 2: ML forecast (F1), anomaly detection (F7), B2B go-to-market
- [ ] Update `NEXT_SESSION.md` with Month 2 plan

---

## Daily Rhythm

| Time | Activity |
|------|----------|
| 0-30 min | Check pipeline freshness + metrics |
| 30-90 min | Implement 1-2 recommendations |
| 90-105 min | Build + smoke + PHP lint |
| 105-120 min | Update NEXT_SESSION.md + plan next day |

---

## Success Metrics (Week 1 → Week 4)

| Metric | Baseline | Week 1 Target | Week 4 Target |
|--------|----------|---------------|---------------|
| Funnel conversion | 0.009% | 0.009% (P0 fixes) | 0.015% (+67%) |
| PassOffer CTR | Unknown | +15% (E1+E4) | +20% (all E fixes) |
| Build time | ~15 min | ~15 min | ≤30 min (G4) |
| Error visibility | 0% (blind) | 100% tracked | <1% error rate |
| Bundle size | 201 Ko | 201 Ko | ≤210 Ko |
| Funnel accuracy | 7× undercount | 1× (G1) | 1× |
| B2B trial→paid | 0% | 0% | >5% |
| US region ready | No | Yes (G10) | Live (Barbados) |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Secret rotation breaks deployment | Low | High | Test in staging first |
| Supabase migration loses data | Low | High | Dual-write during transition |
| J+1 free reduces conversion | Medium | Medium | A/B test with `?j1_free=0` |
| Matrix builds fail | Medium | High | `?matrix_build=0` rollback |
| Email lane split causes delivery issues | Low | Medium | Test with small batch first |

---

*This plan is derived from `MASTER_AUDIT.md`. Each task has a rollback flag. Update `NEXT_SESSION.md` daily.*