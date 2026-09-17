## État d'exécution

> Checklist d'exécution autonome — P0 → P1 → P2, un seul TODO à la fois. Format : `[x] DONE — commit <SHA>; <preuves>` ou `[!] BLOQUÉ — <raison précise>`.

### P0 — Critical

- [x] DONE — UX-R2-003 — Modal premium rendu SOUS la fiche plage (paywall invisible + incliquable depuis « Débloquer les prévisions 7 jours » ; z panel 1100→1260, backdrops premium 1005→1250, takeover ComicPaywall 1200→1260 ; checkout Mollie z1300 conservé au-dessus) — commit a1585b563; build OK (exit 0, 5.45s, bundle 38.1 Ko ≤ 210) ; Playwright mobile OK (390×844 : elementFromPoint centre = modal, CTA « Voir mes plages propres » pointable, Fermer cliquable, fermeture réelle vérifiée) ; Playwright desktop OK (idem 1440×900) ; fiche plage préservée après fermeture — preuves repro pré-fix : `.ai/ux-agent/runs/20260916T2245Z-run2-replay/evidence/`
- [!] BLOQUÉ — A12 — Rotate ALL secrets in .env (public repo) — commit 2535e9e11 (clé Mollie live purgée de l'arbre : 0 hit ; trou secret-scan `.ai/plans` bouché, gate prouvé sur l'ancien blob) ; rotation impossible : révocation dashboard Mollie requise, accès fondateur — clé live toujours valide + présente dans l'historique public (3f07490:render-env.txt)
- [x] DONE — G1 — Migrate lead capture from Apps Script → Supabase — commits f23199dc4 (sink primaire Supabase + backup Apps Script conservé pour le feed Sheet→drips, event sg_email_submit réparé) + b8d86fb14 (correctif routage découvert en prod : le hop worker POST /api/supabase répond 404 sur mq+gp via le catch-all Pages `functions/[[path]].js` — la route zone n'est pas câblée — donc écriture DIRECTE REST Supabase à clé anon, pattern logAnalyticsEvent déjà live) ; preuves prod sans écriture : POST /rest/v1/b2c_alerts et /b2b_leads sans email → 400 « 23502 not-null email » = RLS laisse passer l'insert anon ; contrat scripts/tests/lead-capture-g1.test.cjs 8/8 (row canonique b2c_alerts, mapping régions, emails invalides → 0 ligne, rollback ?lead_sb=0, zéro retour à /api/supabase) ; suite npm test 176/179 (3 échecs préexistants hors scope : 2 worktrees .claude stale + partners-contract drift) ; build OK (exit 0, 5.45s), bundle 38.1 Ko ≤ 210 ; flux utilisateur réel Playwright mobile (bannière Capture email → saisie → Activer → POST direct REST b2c_alerts avec apikey anon + row {email,region,domain,beaches[],status} exacte + message succès affiché) ; zéro écriture prod pendant les tests (route réseau interceptée)
- [x] DONE — G2 — Add analytics_events purge job — script purge-analytics.cjs (commit 1afc08b7f) + fix boucle DELETE (offset croissant → tête de file 0-999, mutation prouvée : ancien code laisse 1000/2500 lignes périmées survivre) + test purge-analytics.test.cjs ALL PASS (mock REST local : purge 2500+10, --dry, sans-clé, 0 écriture prod) + wiring daily-copernicus.yml schedule-only vérifié ; build OK (exit 0, 5.69s) ; bundle 38.1 Ko ≤ 210 ; suite 172/174 (2 échecs préexistants worktrees stale jolly-yalow hors scope)
- [x] DONE — G3 — Mirror payment grants to Supabase (not just JSON files) — gap PayPal : pass one-time sans record serveur + abos en api/data/paypal-subs/*.json uniquement ; nouveau public/api/pp-supabase-mirror.php (rows schéma-conformes, creds mollie-config.php/env existants, skip-sans-clé best-effort) + paypal.php (mirror capture_order/confirm_subscription, lookup fallback Supabase, verify LIVE inchangé) + paypal-webhook.php (ACTIVATED mirror, CANCELLED/EXPIRED expire, SALE.COMPLETED +30j, CAPTURE ignoré anti-doublon, 200 avant mirror) ; test paypal-grants-mirror.test.cjs ALL PASS (22 audits source + harness PHP réel 16/16, 0 réseau, 0 écriture prod) ; php -l 3 fichiers OK ; build OK (exit 0, 5.83s) ; bundle 38.1 Ko ≤ 210 ; suite 172/175 (2 jolly-yalow préexistants + 1 garde distro-contract qui passe une fois committé, tous hors scope)
- [x] DONE — G15 — Fix CI gate: smoke exit-1 + budget check in CI — ux-smoke.mjs sort désormais exit 1 si un token échoue (tokens imprimés inchangés, grep CI compat) + phrase doctrine CLAUDE.md MAJ ; budget déjà bloquant (exit 1 prouvé via BUNDLE_BUDGET_KB=1, câblé ci-tests/ci-funnel/perf-budget) ; test ci-gate.test.cjs ALL PASS (25 checks) ; preuves live Playwright : build réel exit 0 + 4 tokens + SMOKE_GATE=PASS, cible cassée exit 1 + SMOKE_GATE=FAIL, mutation ancien code HEAD exit 0 silencieux malgré ERRORS (trou prouvé et bouché) ; build OK (exit 0, 5.65s) ; bundle 38.1 Ko ≤ 210 ; suite 174/176 (2 jolly-yalow préexistants gitignorés, prouvés hors CI et indépendants)

### P1 — High impact, low effort

- [x] DONE — A1 — Move email capture before CTA on paywall — WorldPaywall (variant live unique, Comic dormant non touché) : champ optionnel pré-offre (jamais required, CTA jamais conditionné, décision J0-J30 conservée) + hook preCtaEmail.js (debounce 800ms, dédup, submitLead "paywall_pre" G1) + rollback ?email_pre=0 figé au mount (race replaceState ?paywall=1 documentée) ; test paywall-email-pre.test.cjs ALL PASS (13 audits + 8 units) ; preuve live Playwright 8/8 (CTA cliquable sans email → checkout ; saisie → POST /api/supabase {b2c_alerts} réel avant CTA + sg_email ; rollback ?email_pre=0 via vrai funnel ; contrôle sans flag) ; build OK ; bundle 38.1 Ko ≤ 210 ; j0 65/65 + distro 60/60 verts ; suite 175/178 (2 jolly-yalow gitignorés préexistants + 5 asserts partners-contract causés par modif concurrente regions/mq.json+partners.js mid-session, tous hors scope non touchés)
- [x] DONE — A13 — Show J+1 forecast free (the "aha" before paywall) — fiche BeachSheetComic (donnée J+1 réelle, rien de fabriqué) : gating i>1 (rollback ?j1_free=0), cadenas invisible 29% (15% rollback, masqué sans jour verrouillé), pastille INCLUS J+1, testids fc-day/data-gated ; premium/free7/ChasseHome inchangés, event sg_forecast_lock_click inchangé, commentaire E2E p1-03 MAJ ; test forecast-j1-free.test.cjs ALL PASS (12 checks) ; preuve live Playwright 8/8 vrai funnel (J+1 INCLUS sans cadenas, clic J+1 sans paywall, clic J+3 paywall, rollback J+1 reverrouillé+paywall) ; build OK ; bundle 38.1 Ko ≤ 210 ; suite 176/179 (2 jolly-yalow gitignorés préexistants + 5 asserts partners-contract causés par modif concurrente regions/mq.json+partners.js, tous hors scope non touchés)
- [x] DONE — A7 — Ensure all paths use simplified PassOffer — vérifié : les 3 sites <PassOffer (World×2, Comic×1) portent onBuy, UNE SEULE écriture passCtxRef (onPassBuy), setPayStep(true) uniquement là, OnsiteCheckout dérive de passCtx sans choix parallèle ; purge des résidus legacy morts pwPass/pwSocial/pwFresh/pwSocialProof (jamais lus, AB map pw_copy/pw_pass_seq laissée à E1) dans PremiumModal.jsx + World/ComicPaywall ; B2BModal hors scope acté ; test passoffer-paths.test.cjs ALL PASS (11 checks) ; preuve live Playwright 4/4 (offre p30 1499 → checkout "pass 30 jours / 14,99 €", 0 pageerror) ; build OK ; bundle 38.1 Ko ≤ 210 ; suite 178/180 (2 jolly-yalow gitignorés préexistants, partners-contract reverdi par la session concurrente elle-même)
- [x] DONE — E1 — PassOffer CTA copy specificity — hero CTA "Voir mes plages propres →" → "Voir la prévision 7 jours →" (FR/EN/ES, livrable nommé, longueur ≈ identique, sticky prix-spécifique et aria-label E2E intacts, contrat onBuy intact, E4/E11/E2 volontairement hors scope) + rollback ?sgcta=0 (copy historique) ; aucun test pw_copy actif en code (freeze-map zombie, rien ne le lit) ; test passoffer-cta-copy.test.cjs ALL PASS (9 checks) ; preuve live Playwright 6/6 (copy rendu FR, CTA→checkout, 0 pageerror, rollback via vrai funnel — deep-link ?paywall=1 nettoyant la query, limite pré-existante commune à tous les flags, documentée) ; build OK ; bundle 38.1 Ko ≤ 210 ; suite 179/181 (2 jolly-yalow gitignorés préexistants)
- [x] DONE — E2 — Add social proof to WorldPaywall/ComicPaywall — WorldPaywall/ComicPaywall: "Déjà N+ qui suivent leurs plages" (FR/EN/ES) via __COMM build-time, gate community>0, rollback ?sgsocial=0, testid paywall-social-proof ; test paywall-social-proof.test.cjs ALL PASS ; build OK ; bundle 38.1 Ko ≤ 210 ; suite 180/182
- [x] DONE — E4 — Mention duration + no-subscription in CTA subline — PassOffer: "Pas d'abonnement · 30 jours · Paiement sécurisé" (ligne 151-153), "Mollie · Sans engagement · 2 clics" (sticky), "Paiement sécurisé · Accès immédiat" (sous CTA) ; durée 30j et no-sub déjà présents en 3 endroits ; build OK ; bundle 38.1 Ko ≤ 210
- [x] DONE — E9 — Show data-quality proof when community=0 — WorldPaywall/ComicPaywall: bloc "98% des prévisions vérifiées · Satellite Copernicus · Backtest 99% sur J+3→J+6" quand community=0 & socialOn=true (chiffres alignés sur backtest-results.json: 98% global statusHitRate 30j/3339 paires, 99% J+3→J+6) ; rollback ?sgsocial=0 ; testid paywall-data-quality-proof ; test paywall-social-proof.test.cjs étendu (E2+E9) ALL PASS ; build OK (exit 0, 38.1 Ko ≤ 210) ; smoke PASS ; suite 180/182 ; commit cff1f89be
- [ ] TODO — E11 — Add trust row (lock/calendar/no-sub) in PassOffer
- [ ] TODO — F6 — Personalized change alerts (ML on existing forecast)
- [ ] TODO — F9 — AI-generated brief summaries
- [ ] TODO — F3 — Enhanced chat with data-grounded responses
- [ ] TODO — G10 — Generate PHP allowlists from regions/index.cjs
- [ ] TODO — G9 — Cloudflare cache rules for /api/copernicus/*
- [ ] TODO — G5 — Add error tracking (window.onerror → Supabase)

### P2 — Medium impact

- [ ] TODO — A2 — Instrument first-verdict-view event
- [ ] TODO — A5 — Add B2B onboarding checklist post-trial
- [ ] TODO — A10 — Win-back email for expired passes
- [ ] TODO — A14 — Event-driven behavioral emails
- [ ] TODO — E3 — Seasonal urgency banner (June-Nov)
- [ ] TODO — E5 — Add "moins qu'un café" price anchor
- [ ] TODO — E6 — Replace prompt() for "already have pass"
- [ ] TODO — E7 — Fix error retry (no full page reload)
- [ ] TODO — E10 — Simplify consent checkbox copy
- [ ] TODO — E18 — Add season pass option to PassOffer
- [ ] TODO — F1 — ML-enhanced sargassum forecast
- [ ] TODO — F2 — Personalized beach recommendations
- [ ] TODO — F5 — Automated SEO content generation
- [ ] TODO — F8 — Conversion propensity model
- [ ] TODO — G4 — Matrix builds (parallel per region)
- [ ] TODO — G6 — Split email lanes (transactional vs marketing)
- [ ] TODO — G7 — Analytics rotation + Supabase mirror
- [ ] TODO — G8 — Cloudflare cache for widget assets
- [ ] TODO — G10 — Money-path parity test in CI
- [ ] TODO — G14 — Shorten widget token validity + revocation
- [ ] TODO — G16 — External uptime monitoring
- [ ] TODO — G17 — Sentinel-2 auto-activation

---

# MASTER_AUDIT.md — Sargagame Strategic Audit

> **Source of truth** for all improvement initiatives. Synthesizes 7 specialized audits into a single prioritized backlog with cross-references.
> **Methodology**: Each audit used a different persona lens. Recommendations are numbered (A1, E1, F1, G1...) and cross-referenced.
> **Last updated**: 2026-07-28
> **Status**: READ-ONLY synthesis — no code changes here, only prioritization

---

## État d'exécution

### P0
- [ ] TODO — A12 — Rotate ALL secrets in .env (public repo)
- [ ] TODO — G1 — Migrate lead capture from Apps Script → Supabase
- [ ] TODO — G2 — Add analytics_events purge job
- [ ] TODO — G3 — Mirror payment grants to Supabase (not just JSON files)
- [ ] TODO — G15 — Fix CI gate: smoke exit-1 + budget check in CI

### P1
- [x] DONE — A1 — Move email capture before CTA on paywall
- [x] DONE — A13 — Show J+1 forecast free (the "aha" before paywall)
- [x] DONE — A7 — Ensure all paths use simplified PassOffer
- [x] DONE — E1 — PassOffer CTA copy specificity
- [x] DONE — E2 — Add social proof to WorldPaywall/ComicPaywall
- [x] DONE — E4 — Mention duration + no-subscription in CTA subline
- [x] DONE — E9 — Show data-quality proof when community=0
- [ ] TODO — E11 — Add trust row (lock/calendar/no-sub) in PassOffer
- [ ] TODO — F6 — Personalized change alerts (ML on existing forecast)
- [ ] TODO — F9 — AI-generated brief summaries
- [ ] TODO — F3 — Enhanced chat with data-grounded responses
- [ ] TODO — G10 — Generate PHP allowlists from regions/index.cjs
- [ ] TODO — G9 — Cloudflare cache rules for /api/copernicus/*
- [ ] TODO — G5 — Add error tracking (window.onerror → Supabase)

### P2
- [ ] TODO — A2 — Instrument first-verdict-view event
- [ ] TODO — A5 — Add B2B onboarding checklist post-trial
- [ ] TODO — A10 — Win-back email for expired passes
- [ ] TODO — A14 — Event-driven behavioral emails
- [ ] TODO — E3 — Seasonal urgency banner (June-Nov)
- [ ] TODO — E5 — Add "moins qu'un café" price anchor
- [ ] TODO — E6 — Replace prompt() for "already have pass"
- [ ] TODO — E7 — Fix error retry (no full page reload)
- [ ] TODO — E10 — Simplify consent checkbox copy
- [ ] TODO — E18 — Add season pass option to PassOffer
- [ ] TODO — F1 — ML-enhanced sargassum forecast
- [ ] TODO — F2 — Personalized beach recommendations
- [ ] TODO — F5 — Automated SEO content generation
- [ ] TODO — F8 — Conversion propensity model
- [ ] TODO — G4 — Matrix builds (parallel per region)
- [ ] TODO — G6 — Split email lanes (transactional vs marketing)
- [ ] TODO — G7 — Analytics rotation + Supabase mirror
- [ ] TODO — G8 — Cloudflare cache for widget assets
- [ ] TODO — G10 — Money-path parity test in CI
- [ ] TODO — G14 — Shorten widget token validity + revocation
- [ ] TODO — G16 — External uptime monitoring
- [ ] TODO — G17 — Sentinel-2 auto-activation

---

## Executive Summary

**Current state**: €69.86 MRR from 14 legacy Stripe subscribers. ~481 email leads. ~20 total Mollie payments. Funnel conversion 0.009% (MQ: 4.8%, GP: 0.5%). 5 regions live.

**Core insight**: The product has a strong moat (honesty/transparency via `/fiabilite/`) and hardened money-path (Mollie on-site). The bottleneck is **conversion** (0.009% funnel) and **distribution** (US SEO at ~0 traffic). Infrastructure is sound for 10x traffic but breaks at 10x regions/email volume.

**Three levers**:
1. **Conversion**: Show J+1 forecast free + capture email earlier → 2-3x conversion
2. **Distribution**: US SEO (Florida/Punta Cana/Barbados) → 10x traffic
3. **Monetization**: B2B hotels (0 sales to date) + AI features → 10x ARPU

---

## Audit Cross-Reference

| Audit | Persona | Focus | Recommendations |
|-------|---------|-------|-----------------|
| #0 | Product Manager | Paying user behavior | A1-A15 |
| #1 | UX Designer | Paywall CRO | B1-B10 |
| #5 | Growth Hacker | Quick wins | E1-E20 |
| #6 | AI/ML Expert | Competitive advantages | F1-F10 |
| #7 | CTO Scale | Hypergrowth bottlenecks | G1-G20 |

---

## Priority Matrix

### P0 — Critical (fix immediately)

| ID | Title | Impact | Effort | Audits | Proof |
|----|-------|--------|--------|--------|-------|
| A12 | Rotate ALL secrets in .env (public repo) | 🔴 CRITICAL | Low | A | `.env` lines 1-33, public GitHub repo |
| G1 | Migrate lead capture from Apps Script → Supabase | 🔴 CRITICAL | Medium | G | `Sargasses_PROD.jsx:1819`, `CLAUDE.md:53` |
| G2 | Add analytics_events purge job | 🔴 CRITICAL | Trivial | G | `supabase/schema.sql:166`, no purge script |
| G3 | Mirror payment grants to Supabase (not just JSON files) | 🔴 CRITICAL | Medium | G | `mollie-lib.php:101-112`, `public/api/data/` |
| G15 | Fix CI gate: smoke exit-1 + budget check in CI | 🔴 CRITICAL | Easy | G | `ci-tests.yml` (22 lines, no smoke/budget) |

### P1 — High impact, low effort

| ID | Title | Impact | Effort | Audits | Proof |
|----|-------|--------|--------|--------|-------|
| A1 | Move email capture before CTA on paywall | High | Medium | A, E8 | `PremiumModal.jsx:3023` (email after CTA) |
| A13 | Show J+1 forecast free (the "aha" before paywall) | High | Low | A, F1 | `daily-metrics.json:37-43` (only `map_scrub_forecast` converts) |
| A7 | Ensure all paths use simplified PassOffer | High | Medium | A, E1 | `PremiumModal.jsx:2249-2254` (legacy paths still exist) |
| E1 | PassOffer CTA copy specificity | +8-15% CTR | Trivial | E | `PassOffer.jsx:87` ("Commencer maintenant") |
| E2 | Add social proof to WorldPaywall/ComicPaywall | +5-10% CTR | Easy | E | WorldPaywall has no `__COMM` element |
| E4 | Mention duration + no-subscription in CTA subline | +4-8% CTR | Trivial | E | `PassOffer.jsx:93` (no duration mention) |
| E9 | Show data-quality proof when community=0 | +3-5% CTR | Trivial | E | `PassOffer.jsx:98` (gated on community > 0) |
| E11 | Add trust row (lock/calendar/no-sub) in PassOffer | +5-8% CTR | Easy | E | `PassOffer.jsx:88-94` (thin reassurance) |
| F6 | Personalized change alerts (ML on existing forecast) | +30% retention | Easy | F | `WeekHub.jsx:190-196`, OneSignal already wired |
| F9 | AI-generated brief summaries | +20-30% engagement | Easy | F | `BriefMatin.jsx:19-26` (static template) |
| F3 | Enhanced chat with data-grounded responses | High | Easy | F | `SargaChat.jsx:66-113` (4 hardcoded responses) |
| G10 | Generate PHP allowlists from regions/index.cjs | Unblocks Barbados | Easy | G | `mollie.php:14`, `collect.php:16-19` |
| G9 | Cloudflare cache rules for /api/copernicus/* | Prevents bandwidth crisis | Trivial | G | `collect.php:56` (25MB/day cap) |
| G5 | Add error tracking (window.onerror → Supabase) | Prevents blind incidents | Easy | G | No Sentry/Bugsnag in `src/` |

### P2 — Medium impact

| ID | Title | Impact | Effort | Audits | Proof |
|----|-------|--------|--------|--------|-------|
| A2 | Instrument first-verdict-view event | High | Low | A | No `sg_first_verdict_view` event exists |
| A5 | Add B2B onboarding checklist post-trial | High | Medium | A | `PremiumModal.jsx:543-557` (no checklist) |
| A10 | Win-back email for expired passes | Medium | Low | A | `Sargasses_PROD.jsx:11958-11970` (one-shot banner) |
| A14 | Event-driven behavioral emails | Medium | Medium | A | `drip-email.cjs` runs on schedule, not events |
| E3 | Seasonal urgency banner (June-Nov) | +3-7% CTR | Trivial | E | `PassOffer.jsx:120-125` (hidden USD surcharge) |
| E5 | Add "moins qu'un café" price anchor | +3-5% CTR | Easy | E | `ComicPaywall.jsx:965` (exists but not in PassOffer) |
| E6 | Replace prompt() for "already have pass" | +10-20% recovery | Easy | E | `PremiumModal.jsx:2910` (native prompt) |
| E7 | Fix error retry (no full page reload) | +15-25% recovery | Easy | E | `PremiumModal.jsx:3204` (location.reload) |
| E10 | Simplify consent checkbox copy | Medium | Trivial | E | `PremiumModal.jsx:3159-3162` (legal jargon) |
| E18 | Add season pass option to PassOffer | +5-10% ARPU | Easy | E | `WorldPaywall.jsx:912` (season pass not in PassOffer) |
| F1 | ML-enhanced sargassum forecast | 10x accuracy | Medium | F | `forecast.cjs:1-24` (known biases documented) |
| F2 | Personalized beach recommendations | +15-25% retention | Easy | F | `SargaChat.jsx:157-177` (regex-based) |
| F5 | Automated SEO content generation | +20-30% traffic | Medium | F | `BriefMatin.jsx` (static templates) |
| F8 | Conversion propensity model | +10-20% CVR | Easy | F | `useFrustrationDetection.js` (data exists) |
| G4 | Matrix builds (parallel per region) | Unblocks 10+ regions | Medium | G | `daily-copernicus.yml:734-743` (sequential) |
| G6 | Split email lanes (transactional vs marketing) | Prevents deliverability crisis | Easy | G | All email via one shared mailbox |
| G7 | Analytics rotation + Supabase mirror | Prevents blind funnel | Easy | G | `collect.php:53-56` (no rotation) |
| G8 | Cloudflare cache for widget assets | Prevents B2B churn | Easy | G | Widget served from shared Apache |
| G10 | Money-path parity test in CI | Prevents region drift | Easy | G | Only `test-stripe-webhook.cjs` exists |
| G14 | Shorten widget token validity + revocation | Prevents revenue leak | Easy | G | `widget-token.php:23` (400-day validity) |
| G16 | External uptime monitoring | Prevents silent rot | Easy | G | Health check only 4×/day in pipeline |
| G17 | Sentinel-2 auto-activation | Prevents data outage | Medium | G | `fetch-sargassum-live.cjs:114` (ERDDAP only) |

### P3 — Low priority / nice to have

| ID | Title | Impact | Effort | Audits | Proof |
|----|-------|--------|--------|--------|-------|
| A3 | Dynamic social proof numbers | Medium | Low | A | `__COMM` is static constant |
| A4 | Seasonal urgency (EUR) | Medium | Low | A | `seasonMsg` only in WorldPaywall |
| A6 | Exit-intent with free forecast hook | Medium | Low | A | `Sargasses_PROD.jsx:7754` (email only) |
| A8 | Prominent daily cost anchor | Low | Low | A | `PassOffer.jsx:62-63` (price larger than daily) |
| A9 | Move reliability link above CTA | Low | Low | A | `PassOffer.jsx:115-118` (above CTA = doubt) |
| A11 | B2B product demo before signup | Medium | High | A | `PremiumModal.jsx:109-568` (no demo) |
| A15 | Reframe reliability as "accuracy" | Medium | Low | A | `PassOffer.jsx:115-118` ("see our errors") |
| E12 | Mention "Pass 30 jours" in heading | +3-5% CTR | Trivial | E | `PassOffer.jsx:38-39` (no product name in H2) |
| E13 | Exit intent secondary CTA | -2-3% bounce | Easy | E | `Sargasses_PROD.jsx:14173` (single CTA) |
| E14 | CTA busy state (prevent double-click) | Low | Easy | E | `PassOffer.jsx:21-26` (no busy state) |
| E15 | Price visible above fold | +4-6% CTR | Easy | E | `PassOffer.jsx:38-62` (price 30 lines below H2) |
| E16 | Real-time card validation | +3-5% completion | Medium | E | `PremiumModal.jsx:1479-1486` (no listeners) |
| E17 | Humanize community count | +1-3% trust | Trivial | E | `PassOffer.jsx:103` (raw number) |
| E19 | Replace provider name with benefit | +1-2% completion | Trivial | E | `PremiumModal.jsx:2980` ("Mollie" meaningless) |
| E20 | Fix cross-device payment retry | +20-30% recovery | Easy | E | `PremiumModal.jsx:119-138` (sessionStorage only) |
| F4 | Computer vision on Sentinel-2 | Medium | Hard | F | `sentinel2-nearshore.json` (data exists) |
| F7 | Anomaly detection on grid data | Medium | Medium | F | `sargassum-grid.json` (2012 points) |
| F10 | Community report quality scoring | Low | Medium | F | `citizen-accuracy.json` (exists) |
| G11 | Git repo bloat (588MB) | Medium | Easy | G | `.git` 588MB, `fetch-depth: 0` |
| G12 | Monolith modularization | Velocity ceiling | Hard | G | `Sargasses_PROD.jsx` 14K lines, 4 test files |
| G13 | OneSignal subscriber ceiling | Scale risk | Trivial | G | Free tier ~10K subs/app |
| G18 | Barbados go-live residue | Unblocks region N+1 | Easy | G | `regions/barbados.json:34-36` (TODOs) |
| G19 | Single Mollie account risk | Existential at scale | Medium | G | One `MOLLIE_API_KEY` across all domains |
| G20 | Media weight on origin | Scale risk | Medium | G | `martinique-ftp/videos/` 150MB |

---

## Cross-Audit Insights

### The "aha moment" cluster (A13 + F1 + A2)
**Problem**: Users can't see the 7-day forecast before paying. The product's core value is "tomorrow's forecast" but free tier only shows TODAY.
**Evidence**: 
- `daily-metrics.json:37-43` — only `map_scrub_forecast` source produces conversions
- `PassOffer.jsx:42` promises "Prévision 7 jours" but free tier blocks J+2 through J+7
- No `sg_first_verdict_view` event exists (A2)
**Solution**: Show J+1 (tomorrow) for free + instrument the moment
**Cross-reference**: A13 (show J+1), A2 (instrument), F1 (ML forecast accuracy)

### The "trust but verify" cluster (A9 + A15 + F1 + G17)
**Problem**: The honesty moat (`/fiabilite/`) is positioned wrong — shown as "errors" right before purchase, creating doubt.
**Evidence**:
- `PassOffer.jsx:115-118` — "Avant de payer, voyez nos erreurs →" above CTA
- `CLAUDE.md:1796` — "garantie 30j volontaire a été RETIRÉE" (legal reality)
- F1 backtest shows known forecast biases
**Solution**: Reframe as "accuracy" not "errors", move above value props, show ML improvement
**Cross-reference**: A9 (move link), A15 (reframe copy), F1 (ML accuracy), G17 (Sentinel-2 backup)

### The "email funnel" cluster (A1 + A14 + G1 + G6)
**Problem**: Email capture happens too late (after CTA), leads go through Apps Script (losing 7× data), and all email goes through one shared mailbox.
**Evidence**:
- `PremiumModal.jsx:3023` — email input inside payment step
- `Sargasses_PROD.jsx:1819` — Apps Script URL
- `CLAUDE.md:53` — "le funnel Apps Script sous-compte ~7×"
**Solution**: Capture email before CTA, migrate to Supabase, split email lanes
**Cross-reference**: A1 (email timing), A14 (behavioral emails), G1 (migration), G6 (email lanes)

### The "conversion velocity" cluster (E1 + E2 + E4 + E11 + F8)
**Problem**: The paywall has multiple friction points that compound.
**Evidence**:
- E1: CTA copy too generic
- E2: No social proof on WorldPaywall/ComicPaywall
- E4: No duration mention in CTA subline
- E11: No trust row in PassOffer
- F8: No propensity-based paywall timing
**Solution**: Fix all friction points + add propensity model
**Cross-reference**: E1, E2, E4, E11 (friction), F8 (timing)

### The "region scaling" cluster (G4 + G10 + G18 + G19)
**Problem**: Adding regions requires 6+ manual sync points, sequential builds, and has Stripe residue.
**Evidence**:
- G4: Sequential per-region builds, 75-min CI ceiling
- G10: 6+ manual allowlist sync points
- G18: Barbados has TODO placeholders
- G19: Single Mollie account = single failure point
**Solution**: Generate allowlists from JSON, matrix builds, clean Barbados, add PayPal as backup
**Cross-reference**: G4, G10, G18, G19

---

## ROI-Ranked Backlog (Top 50)

### Week 1: Critical fixes (P0)

| Rank | ID | Title | Impact | Effort | Est. Revenue Impact |
|------|-----|-------|--------|--------|-------------------|
| 1 | A12 | Rotate ALL secrets in .env | 🔴 CRITICAL | Low | Security incident prevention |
| 2 | G1 | Migrate lead capture to Supabase | 🔴 CRITICAL | Medium | Fix 7× undercount → accurate funnel data |
| 3 | G2 | Add analytics purge job | 🔴 CRITICAL | Trivial | Prevent funnel sink death |
| 4 | G3 | Mirror payment grants to Supabase | 🔴 CRITICAL | Medium | Prevent premium grant loss |
| 5 | G15 | Fix CI gate (smoke + budget) | 🔴 CRITICAL | Easy | Prevent regressions reaching prod |

### Week 2: Conversion quick wins (P1)

| Rank | ID | Title | Impact | Effort | Est. Revenue Impact |
|------|-----|-------|--------|--------|-------------------|
| 6 | A13 | Show J+1 forecast free | High | Low | 2-3x conversion (0.009% → 0.02%) |
| 7 | A1 | Capture email before CTA | High | Medium | +10-15% checkout start |
| 8 | E1 | PassOffer CTA copy | HIGH | Trivial | +8-15% CTR |
| 9 | E2 | Social proof on paywalls | HIGH | Easy | +5-10% CTR |
| 10 | E4 | Duration in CTA subline | HIGH | Trivial | +4-8% CTR |
| 11 | E11 | Trust row in PassOffer | MEDIUM | Easy | +5-8% CTR |
| 12 | E9 | Data-quality proof when community=0 | HIGH | Trivial | +3-5% CTR |
| 13 | F6 | Personalized change alerts | HIGH | Easy | +30% premium retention |

### Week 3: Distribution + B2B (P1-P2)

| Rank | ID | Title | Impact | Effort | Est. Revenue Impact |
|------|-----|-------|--------|--------|-------------------|
| 14 | G10 | Generate PHP allowlists | Unblocks Barbados | Easy | Enables US expansion |
| 15 | G9 | Cloudflare cache rules | Scale | Trivial | Prevents bandwidth crisis |
| 16 | A5 | B2B onboarding checklist | High | Medium | +25-40% trial→paid |
| 17 | F9 | AI-generated briefs | HIGH | Easy | +20-30% engagement |
| 18 | F3 | Enhanced chat with data | HIGH | Easy | Higher chat→conversion |
| 19 | G5 | Error tracking | HIGH | Easy | Prevent blind incidents |
| 20 | G6 | Split email lanes | HIGH | Easy | Prevent deliverability crisis |

### Week 4: Infrastructure hardening (P2)

| Rank | ID | Title | Impact | Effort | Est. Revenue Impact |
|------|-----|-------|--------|--------|-------------------|
| 21 | G4 | Matrix builds | Scale | Medium | Enables 10+ regions |
| 22 | G7 | Analytics rotation | Scale | Easy | Prevent blind funnel |
| 23 | G8 | Widget Cloudflare cache | Scale | Easy | Prevent B2B churn |
| 24 | G16 | External uptime monitoring | Scale | Easy | Prevent silent rot |
| 25 | A10 | Win-back emails | Medium | Low | Reactivate lapsed users |
| 26 | E3 | Seasonal urgency banner | Medium | Trivial | +3-7% CTR (peak season) |
| 27 | E5 | "Café" price anchor | HIGH | Easy | +3-5% CTR |
| 28 | F2 | Personalized recommendations | HIGH | Easy | +15-25% retention |
| 29 | F8 | Conversion propensity model | Medium | Easy | +10-20% CVR |
| 30 | E6 | Replace prompt() for pass recovery | MEDIUM | Easy | +10-20% recovery |

---

## Rollback Flags

Every change should have a `?flag=0` rollback mechanism:

| Change | Rollback Flag |
|--------|---------------|
| J+1 forecast free | `?j1_free=0` |
| Email before CTA | `?email_pre=0` |
| Social proof on paywalls | `?social_proof=0` |
| Personalized alerts | `?smart_alerts=0` |
| AI briefs | `?ai_brief=0` |
| Enhanced chat | `?ai_chat=0` |
| Matrix builds | `?matrix_build=0` (in CI) |
| Cloudflare cache | (Cloudflare dashboard toggle) |

---

## Verification Framework

Every recommendation must be verifiable:

| Metric | Where Tracked | Current Value | Target |
|--------|---------------|---------------|--------|
| Funnel conversion | Apps Script / Supabase | 0.009% | 0.02% (+2x) |
| PassOffer CTR | `sg_pass_cta` event | Unknown | +15% |
| Paywall open → paid | `sg_conversion` | Unknown | +20% |
| Premium retention | `sg_premium_modal_close` | Unknown | +30% |
| B2B trial → paid | `sg_b2b_trial_activated` → `sg_b2b_paylink_click` | 0% | >5% |
| Bundle size | `check-bundle-budget.cjs` | 201 Ko | ≤210 Ko |
| Build time | CI duration | ~15 min | ≤30 min (10 regions) |
| Error rate | New error tracking | 0% (blind) | <1% |
| Email deliverability | ESP metrics | Unknown | >95% |

---

## Next Actions

1. **This session**: Implement P0 fixes (A12, G1, G2, G3, G15)
2. **Next session**: Implement Week 2 conversion quick wins
3. **Week 3**: Launch US SEO (Barbados + Florida)
4. **Week 4**: AI features (F6, F9, F3)
5. **Month 2**: B2B go-to-market
6. **Month 3**: ML forecast (F1)

---

*This document is the single source of truth for all improvement initiatives. All recommendations are cross-referenced across audits. Update this file when new audits are completed or priorities shift.*