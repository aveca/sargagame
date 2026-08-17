# UNIVERS_MOTION_AGENT_PLAN.md — SVG & Video Content

> **Agent**: univers_motion_agent
> **Role**: `.ai/prompts/07-univers-motion-agent`
> **Priority**: P2-P3
> **Status**: [~] in_progress by univers_motion_agent
> **Handoff**: ui_ux_agent, coding_agent, data_agent

---

## 🌌 Mission
Create immersive SVG animations and video content that reinforce the "Le Veilleur" narrative while maintaining performance and reduced-motion compliance.

### KPIs
- **Primary**: Frame rate ≥50fps (SVG animations), video completion rate >70%
- **Secondary**: Bundle impact (<5 Ko per animation), reduced-motion compliance (100%)
- **Guardrails**: No fake data, no AI-generated imagery, golden-hour palette compliance

---

## 🎬 Phase 1: SVG Animation System (P2 - 4h)
**Agent**: univers_motion_agent + ui_ux_agent

### Tasks
1. **Veilleur Animation Library**
   - Task: Create reusable animation components
   - Tool: `sg-svg-scene` skill
   - Components:
     - `VeilleurIdleAnimation.jsx` (micro-respiration)
     - `VeilleurScanAnimation.jsx` (satellite scan)
     - `VeilleurSuccessAnimation.jsx` (payment success)
   - Output: `src/components/veilleur-animations/`

2. **Performance Optimization**
   - Technique: Single `requestAnimationFrame` loop
   - Tool: `scripts/svg-performance-audit.cjs`
   - Output: `.ai/agent_plans/svg_performance_report.md`

3. **Reduced-Motion Fallbacks**
   - Task: Static keyframe extraction
   - Tool: `scripts/reduced-motion-extractor.cjs`
   - Output: `src/components/veilleur-static/`

### Handoff
- **ui_ux_agent**: Animation specs
- **coding_agent**: Integration hooks

---

## 🖼️ Phase 2: Comic Variants (P2 - 6h)
**Agent**: univers_motion_agent

### Tasks
1. **Season Pass Comic**
   - Task: TASK-P2-005b (OG card) + E18 (season pass)
   - Source: `design/STORY/03-MOTIF-KIT.md`
   - Output: `src/assets/comic-season-pass.svg`

2. **Paywall Header Variants**
   - Variants: scene, constel, beat, watch, calm
   - Tool: `scripts/comic-variant-generator.cjs`
   - Output: `src/assets/paywall-headers/`

3. **Social Proof Badges**
   - Task: E2 (social proof on paywalls)
   - Components: `12k+ voyageurs`, `97% fiables`, `Satellite Copernicus`
   - Output: `src/components/SocialProofBadges.jsx`

### Handoff
- **ui_ux_agent**: Comic integration
- **coding_agent**: Paywall wiring

---

## 🎥 Phase 3: Video Content (P3 - 8h)
**Agent**: univers_motion_agent + data_agent

### Tasks
1. **Daily AI Briefs**
   - Task: F9 (AI-generated briefs)
   - Tool: `video-brief` skill
   - Output: `public/video-briefs/2026-08-17.mp4` (9:16, 1080×1920)
   - Distribution: TikTok, Instagram Reels, Facebook

2. **Remotion Clips**
   - Task: TASK-P2-005d ("Le jour qui bascule")
   - Tool: `video-remotion/`
   - Output: `public/video-clips/day-that-flips.mp4`

3. **Beach-Specific Videos**
   - Task: Generate videos for top 10 beaches
   - Tool: `scripts/beach-video-generator.cjs`
   - Output: `public/beach-videos/{beach-id}.mp4`

### Handoff
- **data_agent**: Video metadata
- **growth_agent**: Distribution plan

---

## 🏝️ Phase 4: Easter Eggs (P3 - 5h)
**Agent**: univers_motion_agent

### Tasks
1. **Yole Martinique**
   - Task: TASK-P2-005c (SVG animation)
   - Source: `design/STORY/03-MOTIF-KIT.md`
   - Output: `src/components/YoleEasterEgg.jsx`

2. **Hidden Forecasts**
   - Task: J+1 forecast Easter egg
   - Trigger: Long-press on beach pin
   - Output: `src/components/HiddenForecast.jsx`

3. **Veilleur Secrets**
   - Task: Hidden interactions with the mascot
   - Trigger: Tap sequence on Veilleur
   - Output: `src/components/VeilleurSecrets.jsx`

### Handoff
- **coding_agent**: Easter egg wiring
- **qa_agent**: Secret test cases

---

## 🎨 Golden-Hour Palette Compliance
```json
// design/STORY/palette.json
{
  "primary": {
    "golden-hour": "#FFC72C",
    "ink": "#0D0B14",
    "paper": "#FBF4DF"
  },
  "status": {
    "clean": "#22C55E",
    "moderate": "#F59E0B",
    "avoid": "#E8522A"
  },
  "gradients": {
    "solar": ["#2BC6E6", "#1487C4"],
    "iris": ["#9AF7D6", "#0C7D72"]
  }
}
```

---

## 🎬 Animation Principles
1. **Le Veilleur Rassure, Ne Surveille Pas**
   - Eye direction: Always looking at the sea (bottom-right), never at user
   - Micro-interactions: Gentle breathing (3s cycle, 1.5px amplitude)

2. **Calme-Doctrine**
   - No jank: All animations `ease-in-out`
   - Reduced-motion: Static keyframes only

3. **Performance**
   - Single `requestAnimationFrame` loop for all SVG animations
   - `will-change: transform` for animated elements

---

## 🔄 Handoff Protocol
1. **To ui_ux_agent**
   - File: `.ai/agent_plans/ui_ux_handoff.md`
   - Content: Animation specs + comic variants

2. **To coding_agent**
   - File: `.ai/agent_plans/coding_agent_handoff.md`
   - Content: SVG component integration

3. **To data_agent**
   - File: `.ai/agent_plans/data_agent_handoff.md`
   - Content: Video metadata schema

---

## 📌 Rollback Flags
| Feature               | Flag               | Default | Rollback Command               |
|-----------------------|--------------------|---------|---------------------------------|
| Veilleur Animations   | `?veilleur_anim=0` | 1       | Disable all SVG animations      |
| Comic Variants        | `?comic_variants=0`| 1       | Force default paywall           |
| Daily Briefs          | `?daily_brief=0`   | 1       | Disable video generation        |
| Easter Eggs           | `?easter_eggs=0`   | 1       | Disable all hidden interactions |

---

## ✅ Definition of Done
- [ ] Veilleur animation library created (`veilleur-animations/`)
- [ ] Season pass comic variant designed (`comic-season-pass.svg`)
- [ ] Daily AI brief generated (`2026-08-17.mp4`)
- [ ] Yole Martinique Easter egg implemented (`YoleEasterEgg.jsx`)
- [ ] Performance audit completed (`.ai/agent_plans/svg_performance_report.md`)
- [ ] Handoff files created for ui_ux_agent, coding_agent, data_agent