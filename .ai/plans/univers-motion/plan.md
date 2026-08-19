# Univers & Motion Agent Plan — Storytelling, Copy, SVG, Video, B2B Outreach

## Mission
Storytelling, copy, SVG additive, clips Remotion, B2B outreach. Respecter l'univers Le Veilleur.

## Univers Le Veilleur (Bible visuelle)
- **Personnage**: Satellite doré qui regarde la mer, jamais HAL, jamais corporate
- **Attitude**: Rassure ≠ surveille. Calme, bienveillant, expert
- **Palette**: Golden-hour (Ink `#0D0B14`, Paper `#FDF6E3`, Gold `#FFC72C`, DarkGold `#B87A00`, Teal `#1EC8B0`)
- **Règles**: 0 IP tierce, claims hedgés ("probable", "selon nos modèles"), replis accessibilité
- **Colonne vertébrale 6 temps** (copy conversion):
  1. Contexte → 2. Problème → 3. Révélation → 4. Solution → 5. Preuve → 6. Action

## Priorités P0-P2

### P0 — Copy conversion (Paywall / Onboarding / Email)
1. **Paywall copy** (World + Comic variants)
   - World: headline photo + "VOTRE PLAGE, VÉRIFIÉE AVANT DE PARTIR"
   - Comic: BD panels + "VOIR LES 7 PROCHAINS JOURS →"
   - A/B: `pw_copy` (3-way CTA), `pw_pass_seq` (sequencing)
   - Rollback: `?pwcopy=0`, `?pwcomic=0`

2. **Email sequences** (FR/EN/ES)
   - B2B trial: J1 (welcome), J7 (value), J14 (case study), J25 (upgrade)
   - Win-back: J+1 (rappel), J+7 (-20%), J+30 (last chance)
   - Newsletter: hebdo brief + alerte personnalisée

3. **B2B outreach templates**
   - Cold email: hôteliers / collectivités / nettoyeurs
   - LinkedIn DM: short, value-first, Calendly link
   - Follow-up: 3-5-7 jours, nouveau angle chaque fois

### P1 — SVG Additive & Easter Eggs
4. **Carte SVG — additive layers**
   - Base: `ArchipelView` (camera-tracked, viewBox 800×600)
   - Layers: bathymétrie, courants HYCOM, bancs ERDDAP, plages, Le Veilleur
   - Easter eggs par région: Yole Martinique (DONE), Raie Manta Guadeloupe, Manatee Florida, Tortue Cancun, Baleine Punta Cana
   - Interactions: regard-vers-la-mer (mouse follow), clics incidents (ripple), hover desktop

5. **Scroll-driven storytelling**
   - `ScrollStory` component (lazy-loaded chunk)
   - Golden-hour wave animation synced to scroll position
   - Sections: Contexte → Problème → Satellite → Modèle → Preuve → CTA
   - Reduced motion: frames statiques, `prefers-reduced-motion: reduce`

6. **Easter eggs régionaux** (additive, non-bloquant)
   - MQ: Yole (DONE, commit 920359a6)
   - GP: Raie Manta (prochain)
   - FL: Manatee
   - PC: Tortue
   - RM: Baleine
   - Spec: `design/STORY/03-MOTIF-KIT.md` (silhouette, 80-150s ambient, 12% viewBox)

### P2 — Video & Motion (Remotion)
7. **Daily brief video** (skill `video-brief`)
   - 9:16, 100% local (ffmpeg + edge-tts + Playwright)
   - Input: photos repo (plages) + data satellite live (ERDDAP)
   - Output: MP4 H.264, sous-titres FR/EN/ES brûlés
   - Distribution: Reels/TikTok/FB/YouTube Shorts (manuel ou API)

8. **Remotion clips** (paywall hero, onboarding, B2B)
   - `video-remotion/` workspace
   - Scenes: `PaywallHero`, `OnboardingFlow`, `B2BCaseStudy`
   - Duration: 15-30s, loop-ready, sound design minimal (ambient waves)
   - Export: MP4 + WebM, <5MB each

9. **Sound design**
   - Ambient: vague légère, vent, mouette (boucle 30s, <50KB)
   - UI: click (paper), success (gold chime), error (soft buzz)
   - Reduced motion: `prefers-reduced-motion` → mute all non-essential

## Workflow de production
```
1. Prompt → .ai/prompts/07-univers-motion-agent.md
2. Panel agents (product + ux_critic + adversarial) → verdict
3. Copy FR/EN/ES → colonne vertébrale 6 temps
4. SVG additive → design/STORY/ + code
5. Remotion → video-remotion/ → export MP4
6. QA → Playwright + Lighthouse + reduced-motion test
7. Deploy → feature flag (`?flag=0` rollback)
```

## Artefacts
- `design/STORY/01-UNIVERS.md` — bible complète
- `design/STORY/02-COLONNE-VERTEBRALE.md` — 6 temps + exemples
- `design/STORY/03-MOTIF-KIT.md` — motifs, easter eggs, specs animation
- `design/STORY/04-COMIC-PAYWALL.md` — variants, transitions, copy
- `B2C_NARRATIVE.md` — storytelling B2C
- `B2B_EMAIL_TEMPLATE.md` — templates outreach
- `video-remotion/` — workspace Remotion

## SLA
| Métrique | Target |
|----------|--------|
| Copy conversion (paywall) | >2% |
| Video brief daily | 100% (automatisé) |
| Easter eggs par région | 5/5 (toutes live) |
| Remotion clips | <5MB, 9:16 |
| Accessibilité copy | claims hedgés 100% |