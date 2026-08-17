# UI_UX_AGENT_PLAN.md — Design System & Responsive UX

> **Agent**: ui_ux_agent
> **Role**: `.ai/roles/ui-ux-agent.md`
> **Priority**: P0-P1
> **Status**: [~] in_progress by ui_ux_agent
> **Handoff**: coding_agent, univers_motion_agent, qa_agent

---

## 🎨 Mission
Ensure pixel-perfect implementation of the Sargasses design system across all UI states while maintaining reduced-motion compliance and mobile-first responsiveness.

### KPIs
- **Primary**: Design system compliance (100% of screens)
- **Secondary**: Reduced-motion violations (0), horizontal scroll (0), contrast ratio (>4.5:1)
- **Guardrails**: Bundle ≤210 Ko, no fake data, PWA compliance

---

## 📱 Phase 1: Responsive Audit (P0 - 2h)
**Agent**: ui_ux_agent + qa_agent

### Tasks
1. **Viewport Coverage**
   - Viewports: 320×640, 375×667, 390×844, 430×932, 768×1024, 1280×800, 1440×900
   - Tool: Playwright + `scripts/responsive-audit.cjs`
   - Output: `.ai/agent_plans/responsive_audit.md`

2. **Horizontal Scroll Test**
   - Command: `npx playwright test tests/e2e/responsive.spec.ts`
   - Fix: Overflow issues in `app-runtime.css`
   - Output: PR `#fix-horizontal-scroll`

3. **Reduced-Motion Compliance**
   - Command: `npx playwright test --project=reduced-motion`
   - Tool: `scripts/reduced-motion-audit.cjs`
   - Output: `.ai/agent_plans/reduced_motion_violations.md`

### Handoff
- **coding_agent**: CSS fixes
- **qa_agent**: Regression tests

---

## 🎭 Phase 2: Paywall Friction Fixes (P1 - 3h)
**Agent**: ui_ux_agent + product_agent

### Tasks
1. **Comic Paywall Variants**
   - Task: Implement E1, E2, E4, E11
   - Components: `ComicPaywall.jsx`, `WorldPaywall.jsx`
   - Changes:
     - E1: CTA copy specificity
     - E2: Social proof badges
     - E4: Duration mention in subline
     - E11: Trust row (lock/calendar/no-sub)
   - Output: PR `#paywall-friction-fixes`

2. **Season Pass Design**
   - Task: E18 (season pass offer)
   - Source: `design/STORY/03-MOTIF-KIT.md`
   - Output: `src/assets/season-pass-comic.svg`

3. **Price Visibility**
   - Task: E15 (price above fold)
   - Tool: `scripts/price-visibility-audit.cjs`
   - Output: `.ai/agent_plans/price_visibility.md`

### Handoff
- **univers_motion_agent**: Comic variants
- **coding_agent**: Paywall implementation

---

## 🖼️ Phase 3: Design System Compliance (P1 - 4h)
**Agent**: ui_ux_agent

### Tasks
1. **Golden-Hour Palette Audit**
   - Colors: `#FFC72C` (primary), `#22C55E` (success), `#E8522A` (warning), `#0D0B14` (ink), `#FBF4DF` (paper)
   - Tool: `scripts/color-contrast-audit.cjs`
   - Output: `.ai/agent_plans/color_contrast_report.md`

2. **Typography Audit**
   - Fonts: Anton (headings), Bricolage Grotesque (body)
   - Tool: `scripts/typography-audit.cjs`
   - Output: `.ai/agent_plans/typography_report.md`

3. **Component Library**
   - Components: `PassOffer.jsx`, `VeilleurMark.jsx`, `BottomNav.jsx`
   - Tool: Storybook (`design/STORY/`)
   - Output: `.ai/agent_plans/component_library.md`

### Handoff
- **coding_agent**: Design system fixes
- **qa_agent**: Visual regression tests

---

## 🌊 Phase 4: SVG & Animation (P2 - 6h)
**Agent**: ui_ux_agent + univers_motion_agent

### Tasks
1. **Veilleur Mascot Animations**
   - Task: Micro-interactions for paywall, loading, success states
   - Tool: `sg-svg-scene` skill
   - Output: `src/components/VeilleurAnimations.jsx`

2. **Yole Martinique Easter Egg**
   - Task: TASK-P2-005c (SVG animation)
   - Source: `design/STORY/03-MOTIF-KIT.md`
   - Output: `src/components/YoleEasterEgg.jsx`

3. **Scroll-Driven Animations**
   - Task: Beach detail scroll effects
   - Tool: `scripts/scroll-animation-audit.cjs`
   - Output: `.ai/agent_plans/scroll_animations.md`

### Handoff
- **univers_motion_agent**: SVG assets
- **coding_agent**: Animation wiring

---

## 📱 Phase 5: Mobile UX (P2 - 5h)
**Agent**: ui_ux_agent

### Tasks
1. **Touch Target Audit**
   - Minimum: 48×48px
   - Tool: `scripts/touch-target-audit.cjs`
   - Output: `.ai/agent_plans/touch_target_report.md`

2. **Input Optimization**
   - Task: E16 (real-time card validation)
   - Components: `OnsiteCheckout.jsx`
   - Output: PR `#input-optimization`

3. **Offline Experience**
   - Task: 27 (offline queue)
   - Tool: `scripts/offline-audit.cjs`
   - Output: `.ai/agent_plans/offline_experience.md`

### Handoff
- **coding_agent**: Mobile UX fixes
- **qa_agent**: Offline tests

---

## 🎨 Design System Tokens
```css
/* app-runtime.css */
:root {
  --color-ink: #0D0B14;
  --color-paper: #FBF4DF;
  --color-primary: #FFC72C;
  --color-success: #22C55E;
  --color-warning: #E8522A;
  --color-error: #DC2626;
  --font-heading: 'Anton', system-ui, sans-serif;
  --font-body: 'Bricolage Grotesque', system-ui, sans-serif;
  --border-radius-sm: 8px;
  --border-radius-md: 12px;
  --border-radius-lg: 18px;
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.2);
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 🔄 Handoff Protocol
1. **To coding_agent**
   - File: `.ai/agent_plans/coding_agent_handoff.md`
   - Content: Design system fixes + responsive issues

2. **To univers_motion_agent**
   - File: `.ai/agent_plans/univers_motion_handoff.md`
   - Content: SVG animation specs + comic variants

3. **To qa_agent**
   - File: `.ai/agent_plans/qa_agent_handoff.md`
   - Content: Visual regression test cases

---

## 📌 Rollback Flags
| Feature               | Flag               | Default | Rollback Command               |
|-----------------------|--------------------|---------|---------------------------------|
| Comic Paywall         | `?pwcomic=0`      | 1       | `abVariant("pw_style", "world")` |
| Season Pass           | `?season_pass=0`  | 1       | Remove from `PassOffer.jsx`     |
| Reduced Motion        | `?rm=1`           | 0       | Force reduced-motion mode       |
| Scroll Animations     | `?scroll_anim=0`  | 1       | Disable scroll effects          |
| Touch Targets         | `?touch_fix=0`    | 1       | Revert input sizes              |

---

## ✅ Definition of Done
- [ ] Responsive audit completed (`.ai/agent_plans/responsive_audit.md`)
- [ ] Paywall friction fixes implemented (PR `#paywall-friction-fixes`)
- [ ] Design system compliance verified (100% of screens)
- [ ] SVG animations designed (Veilleur + Yole Easter Egg)
- [ ] Mobile UX audit completed (touch targets, inputs, offline)
- [ ] Handoff files created for coding_agent, univers_motion_agent, qa_agent