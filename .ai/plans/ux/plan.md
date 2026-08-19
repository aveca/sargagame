# UX Agent Plan — Mobile-First, Funnel, Accessibility, Animation

## Mission
Design system, responsive, accessibilité. Mobile-first (iPhone 12: 390×844, DPR 2, Safari). Conversion-first.

## Principes (sg-design-system)
- **Palette**: Ink `#0D0B14`, Paper `#FDF6E3`, Gold `#FFC72C`, DarkGold `#B87A00`, Green `#22C55E`
- **Typo**: Anton (headers), Bricolage Grotesque (UI), Inter (body)
- **Ombres dures**: `3px 3px 0 #0D0B14` (pas de blur)
- **Le Veilleur**: rassure ≠ surveille, regarde la mer, jamais corporate
- **Halftone**: texture newspaper, jamais flat
- **Reduced motion**: `prefers-reduced-motion: reduce` = floor (pas d'animation infinie)
- **Interdits**: images/vidéo IA, fausse fraîcheur, UI flottante non-ancree

## Priorités P0-P2

### P0 — Funnel critique (Gate de ship)
1. **Funnel tokens** (ux-smoke.mjs) — 4 tokens obligatoires:
   - `FUNNEL_REACHED=map+fiche+paywall`
   - `ERRORS=[]`
   - `WHITE_OR_TRANSPARENT_BUTTONS=[]`
   - `RM_INFINITE=[]`

2. **Paywall UX** (Comic vs World A/B)
   - Header variants: World (photo) vs Comic (BD)
   - CTA: "Commencer maintenant" (World) / "VOIR LES 7 PROCHAINS JOURS →" (Comic)
   - Scroll depth: email + pricing above fold (250px max)
   - Trust badges: 97% fiable, 12k+ voyageurs, Satellite temps réel

3. **BottomNav** (restaurée 2026-08-11)
   - 3 onglets: Carte / Plages / Premium
   - Rollback: `?sgnav=0`
   - États: active (gold underline), inactive (mid gray)

### P1 — Cohérence visuelle
4. **Thèmes** (golden-hour / comic / sticker)
   - `body.theme-golden` (control), `theme-comic`, `theme-soft`
   - CSS: `Themes.css` + `app-runtime.css` (scoped)
   - Toggle: `?theme=comic` / `?theme=soft` / A/B `ui_theme`

5. **Le Veilleur — Mascotte**
   - États: calme (defaut), vigilant (paywall), joyeux (success), inquiet (alert)
   - Animations: `viewFadeIn .35s cubic-bezier(.22,1,.36,1)`
   - Interactions: regard vers la mer, clics incidents, hover desktop

6. **FABs allégés** (2 seulement: SargaChat + Archipel)
   - Retirés: Discovery, Solutions, 10 Postes
   - Position: bottom-right, z-index 960/950
   - Rollback: `?fab=0`

### P2 — Animation & Adventure
7. **SVG Scenes** (sg-svg-scene skill)
   - ViewBox 800×600 slice, 1 seul rAF, `toVB` cover-math
   - Interactions: regard-vers-la-mer, clics incidents, scroll-driven
   - Easter eggs: Yole Martinique (caméra-tracked, 150s drift + micro-rotation)
   - Pièges évités: pivot transform expulsant perso, géométrie sticky/void, snap couleur humeur

8. **Video briefs** (video-brief skill)
   - 9:16, 100% local (ffmpeg + edge-tts + Playwright)
   - Pipeline: photos repo + data satellite live → MP4
   - Distribution: Reels/TikTok/FB via API ou manuel

9. **Scroll-driven storytelling**
   - `ScrollStory` component (lazy-loaded)
   - Golden-hour wave animation sync avec scroll
   - Reduced motion: frames statiques, pas d'animation

## Accessibilité (WCAG 2.1 AA)
- Contraste: 4.5:1 minimum (gold sur paper = 3.2:1 → fallback darkGold)
- Focus visible: outline 3px gold + offset 2px
- ARIA: labels FR/EN/ES sur tous boutons/liens
- Reduced motion: `prefers-reduced-motion: reduce` respecté partout
- Touch targets: min 44×44px (FABs 46×46, BottomNav 44min)

## Tests & Validation
- `scripts/ux-smoke.mjs` → 4 tokens (CI gate)
- Playwright: `tests/e2e/bottomnav-redesign.spec.ts` (8 tests)
- Playwright: `tests/e2e/responsive.spec.ts` (3 viewports)
- Playwright: `tests/e2e/funnel-payment.spec.ts` (15 tests)
- Lighthouse: Performance >90, Accessibility >95, Best Practices >90

## Artefacts
- `design/STORY/03-MOTIF-KIT.md` — motifs, easter eggs, animations
- `design/STORY/04-COMIC-PAYWALL.md` — variants, transitions, copy
- `Themes.css` + `app-runtime.css` — tokens, thèmes, reduced-motion
- `sg-design-system` skill — source de vérité visuelle

## SLA
| Métrique | Target |
|----------|--------|
| Funnel tokens | 4/4 green |
| Bundle size | ≤210 Ko gzip |
| Lighthouse Perf | >90 |
| Lighthouse A11y | >95 |
| Reduced motion | 0 animations infinies |
| Touch targets | 100% ≥44×44px |