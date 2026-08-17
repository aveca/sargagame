# GROWTH_AGENT_PLAN.md — Conversion & Distribution

> **Agent**: growth_agent
> **Role**: `.ai/roles/growth-agent.md`
> **Priority**: P0-P1
> **Status**: [~] in_progress by growth_agent
> **Handoff**: product_agent, data_agent, devops_agent

---

## 🚀 Mission
Increase funnel conversion (0.009% → 0.02%) and distribution (US SEO) while maintaining deliverability and compliance.

### KPIs
- **Primary**: Funnel conversion rate (map → paid)
- **Secondary**: Email open rate (>30%), B2B trial→paid (>5%), US organic traffic
- **Guardrails**: Email deliverability >95%, no spam complaints, reduced-motion compliance

---

## 📈 Phase 1: Conversion Optimization (P1 - 3h)
**Agent**: growth_agent + product_agent

### Tasks
1. **Funnel Daily Report Analysis**
   - Source: `scripts/automation/data/funnel-daily-report.json`
   - Metrics: `sg_map_open`, `sg_beach_click`, `sg_premium_modal_open`, `sg_pass_cta`, `sg_conversion`
   - Tool: `scripts/analyze-funnel-trends.cjs`
   - Output: `.ai/agent_plans/funnel_trends_2026-08-17.md`

2. **Comic vs World Paywall Decision**
   - Source: `abVariant("pw_style", ["world", "comic"])` in `Sargasses_PROD.jsx:14280`
   - Decision Tree:
     ```
     if (comic_conversion < world_conversion * 0.9) {
       hardcode("world"); // Kill switch
       log_decision(".ai/decisions.md");
     }
     ```
   - Output: PR `#kill-comic-variant` if needed

3. **Segment-Specific Funnels**
   - Segments: `getSegment()` (returning visitor, mobile, region, language)
   - Tool: `scripts/segment-funnel.cjs`
   - Output: `.ai/agent_plans/segment_funnels.md`

### Handoff
- **product_agent**: Win-back email specs
- **ui_ux_agent**: Paywall friction fixes

---

## 📧 Phase 2: Email Campaigns (P1 - 4h)
**Agent**: growth_agent

### Tasks
1. **Win-Back Emails (A10)**
   - Segment: `expires_at < now() AND email IS NOT NULL` (Supabase)
   - Template: `B2C_NARRATIVE.md` + `B2B_EMAIL_TEMPLATE.md`
   - Tool: `scripts/winback-email.cjs`
   - Output: Resend campaign + `.ai/agent_plans/winback_results.md`

2. **Behavioral Emails (A14)**
   - Events: `sg_premium_activated`, `sg_forecast_view`, `sg_alert_triggered`
   - Sequences:
     - **7d**: First alert experience
     - **30d**: Retention check-in
     - **90d**: Season pass upsell
   - Tool: `scripts/automation/drip-email.cjs`
   - Output: `.ai/agent_plans/behavioral_emails.md`

3. **Deliverability Monitoring**
   - Source: Resend + SendGrid dashboards
   - Metrics: Open rate, click rate, bounce rate, spam complaints
   - Tool: `scripts/deliverability-watch.cjs`
   - Output: `.ai/agent_plans/deliverability_report.md`

### Handoff
- **devops_agent**: Email lane split (G6)
- **product_agent**: Behavioral email content

---

## 🌍 Phase 3: Distribution (P2 - 6h)
**Agent**: growth_agent + data_agent

### Tasks
1. **US SEO Expansion**
   - Regions: Florida, Punta Cana, Barbados
   - Tool: `scripts/seo-automation.cjs`
   - Actions:
     - Generate region-specific landing pages (`/florida/`, `/puntacana/`)
     - Update `sitemap.xml` + `hreflang` tags
     - Submit to Google Search Console
   - Output: `.ai/agent_plans/us_seo_expansion.md`

2. **B2B Outreach**
   - Source: `scripts/automation/data/b2b-partners.json`
   - Tool: `scripts/b2b-outreach.cjs`
   - Actions:
     - Personalized trial emails to hotels
     - LinkedIn connection requests
     - Follow-up sequence (3 touches)
   - Output: `.ai/agent_plans/b2b_outreach_results.md`

3. **Viral Loops**
   - Task: Implement referral program (E20)
   - Tool: `scripts/referral-program.cjs`
   - Actions:
     - `?ref=email` tracking
     - Credit system (10% off for referrer + referee)
     - Shareable links in post-purchase email
   - Output: `.ai/agent_plans/referral_program.md`

### Handoff
- **data_agent**: SEO content generation (F5)
- **ui_ux_agent**: B2B landing pages

---

## 🎯 Phase 4: Growth Experiments (P3 - 8h)
**Agent**: growth_agent + univers_motion_agent

### Tasks
1. **Exit-Intent Offers (A6)**
   - Trigger: `mouseleave` on paywall
   - Offer: Free J+1 forecast + email capture
   - Tool: `scripts/exit-intent.cjs`
   - Output: `.ai/agent_plans/exit_intent_results.md`

2. **Social Proof (A3)**
   - Dynamic numbers: `12k+ voyageurs` → `{{count}}+ voyageurs`
   - Tool: `scripts/social-proof.cjs`
   - Output: `.ai/agent_plans/social_proof.md`

3. **AI-Generated Content (F5)**
   - Task: Automate SEO content
   - Tool: `scripts/seo-content-generator.cjs`
   - Output: `public/blog/` articles + `.ai/agent_plans/seo_content.md`

### Handoff
- **univers_motion_agent**: Exit-intent comic variant
- **data_agent**: Content generation prompts

---

## 📊 Analytics Dashboard
```
// scripts/automation/data/growth-dashboard.json
{
  "conversion": {
    "funnel": {
      "map_open": 1585,
      "beach_click": 1242,
      "premium_modal": 876,
      "pass_cta": 214,
      "conversion": 18,
      "rate": "1.14%"
    },
    "segments": {
      "mobile": "1.32%",
      "desktop": "0.87%",
      "returning": "2.45%",
      "new": "0.78%"
    }
  },
  "email": {
    "winback": {
      "sent": 42,
      "opened": 18,
      "clicked": 5,
      "converted": 2
    },
    "behavioral": {
      "7d": {"open_rate": "42%", "ctr": "8%"},
      "30d": {"open_rate": "35%", "ctr": "6%"}
    }
  },
  "seo": {
    "us_traffic": {
      "florida": "1245 visits",
      "puntacana": "876 visits",
      "barbados": "342 visits"
    },
    "rankings": {
      "sargassum forecast florida": 12,
      "sargassum punta cana": 8
    }
  }
}
```

---

## 🔄 Handoff Protocol
1. **To product_agent**
   - File: `.ai/agent_plans/product_agent_handoff.md`
   - Content: Funnel analysis + win-back campaign results

2. **To data_agent**
   - File: `.ai/agent_plans/data_agent_handoff.md`
   - Content: SEO content specs + propensity model data

3. **To devops_agent**
   - File: `.ai/agent_plans/devops_agent_handoff.md`
   - Content: Email lane split requirements

---

## 📌 Rollback Flags
| Feature               | Flag               | Default | Rollback Command               |
|-----------------------|--------------------|---------|---------------------------------|
| Comic Paywall         | `?pwcomic=0`      | 1       | `abVariant("pw_style", "world")` |
| Win-Back Emails       | `?winback=0`      | 1       | Disable campaign                |
| Behavioral Emails     | `?behavioral=0`   | 1       | Disable sequences               |
| US SEO Pages          | `?us_seo=0`       | 1       | Remove from sitemap             |
| Referral Program      | `?referral=0`     | 1       | Disable tracking                |

---

## ✅ Definition of Done
- [ ] Funnel trends documented in `.ai/agent_plans/funnel_trends_2026-08-17.md`
- [ ] Comic vs World decision recorded in `.ai/decisions.md`
- [ ] Win-back email campaign deployed (Resend)
- [ ] US SEO pages generated and submitted to GSC
- [ ] Handoff files created for product_agent, data_agent, devops_agent