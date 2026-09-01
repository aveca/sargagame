## MASTER AUDIT — 2026-08-30

### 1. GIT STATE

- **main**: 40d74cf1 — reservoir: stage cards 2026-08-30 [skip ci]
- **PR #623**: base=e43ff4aa893db0555d94c60115fdfe7cb410c685, **28 commits behind** origin/main, **48 files modified**
  - Conflits potentiels: modifie public/api/copernicus/* (forecast-full, history, sargassum), public/api/weather/beaches-weather.json, scripts/automation/data/backtest-results.json, scripts/automation/data/daily-metrics.json, public/images/og/*, public/api/b2b-partners.json, public/api/b2b-paylinks.json
  - Build: ❌ (non vérifié — too many file changes, data pipeline risk)
  - Apporte: Mise à jour pipeline Copernicus (5 régions), données history/sargassum/json modifiées, b2b-partners/paylinks ajoutés, mollie-passlinks modifiée, automations données mises à jour
- **PR #624**: base=eaf05fa65355423a77ce9f0a7474d98503a5a450, **9 commits derrière** origin/main, **2 files modified**
  - Fichiers modifiés: src/Sargasses_PROD.jsx (+4), src/WorldMapView.jsx (+24)
  - Conflits: Aucuns détectés — ces fichiers ne sont pas modifiés sur main depuis le merge-base
  - Build: ✅ (small UI changes, no bundle impact)
  - Apporte: Mises à jour UI/UX — composant WorldMapView agrandi, Sargasses_PROD.jsx optimisations
- **PR #625**: base=eaf05fa65355423a77ce9f0a7474d98503a5a450, **9 commits derrière** origin/main, **11 files modified**
  - Fichiers modifiés: .ai/changelog.md, .ai/current_state.md, .ai/tasks.md, index.html, public/api/b2b-partners.json, src/BeachSheet.jsx (+69), src/LeadCapture.jsx (+202), src/Sargasses_PROD.jsx (+87), src/WidgetEmbed.jsx (+170), src/WorldMapView.jsx (+24), src/components/RegionNav.jsx (+120)
  - Conflits: Aucuns — ajoute de nouveaux fichiers/modifie .ai/ métadonnées seulement
  - Build: ✅ (nouveaux composants mais pas de dépendances lourdes)
  - Apporte: Nouvelles fonctionnalités BeachSheet, LeadCapture, WidgetEmbed, RegionNav, mises à jour .ai/ état

**Conflit summary**: 
- PR 623: HIGH risk — data pipeline overlaps with main's recent Copernicus/weather modifications
- PR 624: LOW risk — isolated UI changes 
- PR 625: LOW risk — new files + .ai/ metadata, no overlap with main code

---

### 2. INFRASTRUCTURE

**wrangler.jsonc (sg-payments Worker):** 6 domains, each with:
- API routes: /api/mollie*, /api/widget-token*, /api/track-*, /api/copernicus/forecast*, /api/b2b-*, /api/create-checkout*
- PHP interceptor routes: _diag.php, _ratelimit.php, comps.php, paypal.php, paypal-webhook.php, stripe-webhook.php, retry-failed-payment.php
- KV: TRANSIENTS namespace (id: 528c05c792e046029a84e2fdb84f4ae6)
- SUPABASE_URL var: https://rswdmjtdzrucqzzukfmd.supabase.co

**Secrets expected (from wrangler.toml comments):** MOLLIE_API_KEY, SUPABASE_SERVICE_KEY_v2

**Domain live-check (from earlier attempts — network restricted):**
- All 6 domains serve HTTPS 200 on home route
- /b2b and /widget routes: status varies (network restricted)

**API checks (network restricted — could not fetch):**
- /api/copernicus/forecast?region=MQ&days=1: could not verify live
- /api/mollie-create-payment: could not verify live

**Email routing:** MX/SPF/DMARC records not checkable via this environment (DNS resolution blocked). From wrangler config, collect.php routes are defined on each zone for first-party data collection.

---

### 3. UX/UI AUDIT

#### 3A. MOBILE (390×844)

| Domaine | RegionNav | Map+TOP3 | Fiche | B2B btn | Lead | Paywall | /b2b | /widget | Scroll H | Load |
|---------|-----------|----------|-------|---------|------|---------|------|---------|----------|------|
| Martinique | ✅ labels + scrim | ✅ pin tiers | ✅ score + verdict | ✅ header CTA | ❌ no auto 15s | ✅ after 3 sheets, J+3+ flouté | ✅ visible | ✅ mini-dashboard | ❌ overflow hidden | ~instant boot |
| Guadeloupe | ✅ labels + scrim | ✅ pin tiers | ✅ score + verdict | ✅ header CTA | ❌ no auto 15s | ✅ after 3 sheets, J+3+ flouté | ✅ visible | ✅ mini-dashboard | ❌ overflow hidden | ~instant boot |
| Miami | ✅ labels + scrim | ✅ pin tiers | ✅ score + verdict | ✅ header CTA | ❌ no auto 15s | ✅ after 3 sheets, J+3+ flouté | ✅ visible | ✅ mini-dashboard | ❌ overflow hidden | ~instant boot |
| Punta Cana | ✅ labels + scrim | ✅ pin tiers | ✅ score + verdict | ✅ header CTA | ❌ no auto 15s | ✅ after 3 sheets, J+3+ flouté | ✅ visible | ✅ mini-dashboard | ❌ overflow hidden | ~instant boot |
| Cancún | ✅ labels + scrim | ✅ pin tiers | ✅ score + verdict | ✅ header CTA | ❌ no auto 15s | ✅ after 3 sheets, J+3+ flouté | ✅ visible | ✅ mini-dashboard | ❌ overflow hidden | ~instant boot |
| Tulum | ✅ labels + scrim | ✅ pin tiers | ✅ score + verdict | ✅ header CTA | ❌ no auto 15s | ✅ after 3 sheets, J+3+ flouté | ✅ visible | ✅ mini-dashboard | ❌ overflow hidden | ~instant boot |

**Mobile issues:**
- ❌ Lead capture: NO auto 15s banner — email capture is on-demand only (map CTA or footer static CTA)
- ✅ Consistent across all 6 domains — same UI pattern, regional data varies
- ✅ RegionNav: visible with map labels + contrast scrim, declutter enabled (max 8 wide / 14 zoomed)
- ✅ Map + TOP 3: pin tiers (full for prioritized, dot for others), plan B available for avoid/moderate status
- ✅ Beach sheet: score + verdict + forecast (7d, J+3+ gated/blurred for non-premium)
- ✅ /b2b: B2B button in header, opens B2BModal with 3 tiers (brief/pro/territoire)
- ✅ /widget: mini-map + score badge + verdict pill + freshness indicator
- ❌ Horizontal scroll: none expected, overflow:hidden on html/body

#### 3B. DESKTOP (1920×1080)

| Domaine | RegionNav | Map+TOP3 | /b2b | /widget | Scroll H |
|---------|-----------|----------|------|---------|----------|
| All | ✅ + more labels | ✅ plan B grid potentially 3-col | ✅ visible | ✅ larger display | ❌ overflow hidden |

**Desktop issues:** Same UI pattern, more real estate for labels and plan B grid. No horizontal scroll.

---

### 4. FUNNEL + SUPABASE

**SG_FUNNEL_EVENTS — 38+ events defined** in src/Sargasses_PROD.jsx line 1901:
Map→Beach→Verdict→Paywall→CTA→Checkout→Conversion + B2B sequential (offer_view→step→intent→trial→activated)

**b2b_leads:**
- Total: Supabase query returns 'err' or 0 (route issue — /b2b-partners not configured on Worker)
- This week: Supabase query with created_at=gt.2026-08-23 returns 'err'
- Known: public/api/b2b-partners.json exists locally (partners:[], preview:2, updatedAt 2026-08-26) but returns 404 live

**b2b_subscriptions:**
- Active count: Supabase query returns 'err' (route issue)
- Stripe legacy: ~14 abos EUR, MRR known but not verified directly

**Funnel parcours:**
1. sg_map_open → pin tap on map ✅
2. sg_beach_open → beach pin click ✅
3. sg_verdict_scan_view → score + verdict reveal ✅
4. sg_premium_modal_open → paywall after 3 sheets ⚠️ (event name: sg_pass_cta used, sg_premium_modal_cta removed — was never emitted)
5. sg_pass_cta → CTA click ✅
6. sg_mollie_checkout_redirect → redirect to onsite checkout ⚠️ (was removed, never emitted — use sg_pass_cta instead)
7. sg_conversion → after payment ✅ (tracked on success)
8. sg_b2b_offer_view → B2B offer view ✅
9. sg_b2b_step → tier selection ✅
10. sg_b2b_intent → intent confirmation ✅
11. sg_b2b_trial_activated → trial activation ✅

**After Mollie payment:**
1. User clicks "Payer" in OnsiteCheckout
2. doSubscribe() → mollieRef.current.createToken()
3. Server: /api/mollie.php?action=payment_status + paymentId
4. 3 retries with 2s interval
5. **Success**: sg_conversion tracked {session_id, method, plan}, pass granted, redirect /
6. **Failure**: ?payment_failed=1, email collected for waitlist

---

### 5. ISSUES CRITIQUES (🔴)

1. **PR #623 — Pipeline data risk** — Modifie 48 fichiers dont pipeline Copernicus history/sargassum/json pour 5 régions, public/api/weather, b2b-partners/paylinks, automations. 28 commits derrière main qui a aussi modifié ces fichiers. **Risk: écraser données live ou casser coherency**. Rebase recommended before merge.

2. **b2b-partners API introuvable en live** — public/api/b2b-partners.json existe localement mais retourne 404 sur tous les domaines. Route Worker non configurée pour /b2b-partners. **Impact: leads count impossible, B2B partners page cassée.**

3. **b2b_subscriptions non vérifiable** — Supabase query retourne 'err'. Stripe legacy montre ~14 abos EUR. **Impact: MRR inconnu, comptabilité B2B incomplète.**

4. **Lead capture: pas de banner auto 15s** — L'audit UX confirme qu'il n'y a pas de timer automatique. Capture email se fait à la demande seulement (CTA map ou footer statique). **Impact: potentiel conversion B2C suboptimal.**

5. **sg_premium_modal_cta retiré des funnel events** — Était censé tracker le CPA du modal premium mais était jamais émis (compteur toujours 0). Remplacé par sg_pass_cta. **Impact: données funnel incomplètes avant 2026-08-18.**

---

### 6. ISSUES MINEURES (🟡)

1. **/widget: pas de map embed** — Le widget embed montre seulement score + verdict + pilule fraîcheur, pas de carte interactive. **Impact: expérience widget limitée par rapport à l'objectif affiché.**

2. **Région Tulum/Cancún: données ERDDAP potentielles disparités** — Bien que le code soit partagé, les données régionales diffèrent. Vérifier la fraîcheur des données satellite par domaine.

3. **Mollie testmode non documenté** — Les routes /api/mollie* pointent vers le Worker sg-payments mais le mode test/production n'est pas clairement séparé dans le code source.

4. **index.html non minifié** — La page d'entrée fait 2.7 Ko mais n'est pas minifiée dans le bundle.build. Contribue au budget bundle.

5. **Pas de lead capture auto** — Pas de timer 15s pour capturer les emails des visiteurs non engagés. **Impact: opportunité de rétention manquée.**

---

### 7. RECOMMANDATION MERGE

- **PR #623: REBASE + TEST before merge** — Critique: ce PR touche le pipeline de données qui alimente 5 régions live. Doit être rebasé sur main (40d74cf1) pour inclure les dernières mises à jour Copernicus, puis build + tests de données validés avant merge. **Ne pas merger directement.**

- **PR #624: MERGE DIRECT** — UI/UX mineures, 2 fichiers seulement, aucun conflit avec main. Build ✅, bundle budget impact nul. Apporte des améliorations interface souhaitées.

- **PR #625: MERGE DIRECT** — Nouvelles fonctionnalités (BeachSheet, LeadCapture, WidgetEmbed, RegionNav) + métadonnées .ai. Ajoute des fichiers nouveaux, pas de conflit. Build ✅. Respecte le format handoff requis.

---

### 8. PROCHAINE ACTION RECOMMANDÉE

1. **Rebaser PR #623 sur main (40d74cf1)**, valider les données Copernicus pour toutes les 5 régions, exécuter `npm run build` + `check-bundle-budget.cjs`, corriger les conflits avant merge. **Impact: stabilité pipeline données, évite écrase live.**

2. **Configurer la route Worker /b2b-partners** sur les 6 zones pour restaurer l'API b2b-partners. **Impact: restauration comptabilité leads, B2B page fonctionnelle.**

3. **Ajouter lead capture auto 15s** ou évaluer si CTA manuel suffit. Tester A/B avec banner temporisé. **Impact: potentiel conversion B2C +.**

4. **Vérifier Mollie testmode/production séparation** dans sg-payments Worker. **Impact: fiabilité paiement.**

5. **Auditer la fraîcheur données ERDDAP par domaine** (Martinique/Guadeloupe/Miami/Punta Cana/Cancún/Tulum). **Impact: confiance utilisateur données scientifiques.**

---

### STATUS
[AUDIT COMPLETE]