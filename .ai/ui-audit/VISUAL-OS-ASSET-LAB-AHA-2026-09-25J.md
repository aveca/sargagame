# VISUAL OS / ASSET LAB / AHA — rapport final 2026-09-25J

> Base = main @b6d96f993 (PR #750 live). Money-path : ZÉRO touché.
> Correction de traçabilité : le fix allowlist rail a été livré en I
> (#750) — ce cycle apporte la PREUVE live + les gardes (voir §13/14).

## 1. Installed skills (`.agents/skills/`, 5)
frontend-design · motion-design · media-art-direction · mobile-app-ux ·
visual-qa — rédigés pour Sargagame (méthodes adaptées, zéro copie de style).

## 2. Open-source references (`.ai/design/REFERENCES.md`)
Anthropic frontend-design (Apache-2.0) · Motion (MIT, étudié) ·
Embla (MIT, **installée 8.6.0 pinned**) · Rive (rejetée : ~100 Ko+ pour
du décoratif) · R3F (pas de nouveau usage) · MapLibre (non retenue :
carte SVG verrouillée). Licences à revérifier avant tout prélèvement.

## 3. Dependencies
- **Installée : `embla-carousel-react` uniquement** (~11 Ko gzip,
  chunk lazy compare — zéro eager, vérifié).
- Motion lib : NON (SGM + WAAPI natif = moteur, 0 octet).
- Rive/Three-nouveau/MapLibre : NON (raisons au §2). Three existant
  (`WorldView3D` lazy) inchangé ; micro-globe : NON (pas de WOW
  proportionné — décision documentée).

## 4. Visual OS (`.ai/design/SARGAGAME-VISUAL-OS.md` + tokens 3.0 étendus)
Typo/image/card/glass/hero/sheet/CTA/touch/loading/empty — règles
explicites, anti-slop (pas de glass/bento/gradients partout).

## 5. Media art direction (`src/lib/media-art-direction.js`)
Slots hero/hero_mobile/card/portrait/gallery/poster/**atmosphere**/reject ;
`slotFor()` (classe + lieu, jamais de générique) ; `missingSlots()` dit
portrait/gallery manquants ; `atmosphereSlot()` exige licence+label et
refuse tout usage lieu. Aucun asset atmosphérique stocké (proposition,
pas d'implémentation — honnêteté).

## 6. AHA (fullscreen best-pick, shot 390/1440 vérifié)
Hero 92dvh : FULLSCREEN MEDIA → LIVE + fraîcheur → nom + verdict →
**3 raisons evidenceFor + sources** → plan B journey → CTA spot +
« Voir le plan ↓ » (scroll ancré) + cue. <5 s : pourquoi CETTE plage.

## 7. Shared transition
Cine-open : WAAPI scale 1→1.07 + fade 220 ms PUIS ouverture fiche ;
garde-fou 400 ms (jamais de piège), reduced-motion/sgmOff = direct,
focus au dialog existant. Testée contrat + E2E stables.

## 8. Tactile interaction
Compare = **swipe A↔B Embla** (snap, peek 78 %, 1fr desktop, rollback
grille `?sgcine=0`). SeaRail natif conservé (testé, pas de rewrite).
**Fix réel** : dismiss non-destructif (✕ masque, « Effacer » vide) — le
multi-compare était inatteignable (vérifié probe : synthèse 2/3 live).

## 9. Motion
sgm-sheet/.3s (trip/compare) + sgm-zoom/.5s (hero) + sgm-fadeup/.32s ;
finies, GPU-only, gatées, RM off. Micro : settle hero, reveal verdict/
facteurs/plan, swap alternative (existants conservés).

## 10. SVG
18 glyphes (5 J : fish/boat/compass/route/satellite), 24px/2-traits.
Manquants utiles : aucun (wave/sun/sargassum/snorkel/compass/route
couverts par §11 du cycle).

## 11. 3D decision
NON — `WorldView3D` existant seul ; aucun nouveau canvas (perf 390,
saveData, budget). Documenté REFERENCES.md.

## 12. Premium
Non touché (trajectoire + preuve + free-vs-pass concrets existants ;
money intact = priorité). Présentation jugée suffisante ce cycle.

## 13. Analytics (allowlist)
Fix livré en I (#750). J = preuve + gardes (travel-30).

## 14. Supabase rail proof (PREMIÈRE démonstration live)
`probe-rail-prod.mjs` : geste clavier/molette → **4 POST
analytics_events `sg_home_rail_focus`** (beach_id, status, i,
`synthetic:true`, session) sur build local ET prod (prod = #750,
fix confirmé déployé). Consent accepté requis (gate RGPD vérifié).
ROW finale : aggregée par daily-stats (clé service, hors portée locale).

## 15. Screenshots (390/1440 lus, ERRORS=[])
AHA plein écran · compare 2/3 + synthèse · facteurs · trip · premium
stables. Réponses QA §15 : 6× oui.

## 16. Performance
Eager **38,2 Ko ≤ 210** (Embla lazy, CSS hors budget JS). Smoke 4/4.
LCP : hero fetchpriority + fade. Pas de vidéo auto en tête.

## 17. Tests
travel-30 **62/62** · npm test 64/64 · E2E 30/30 · regions OK · php N/A.

## 18. Production
À vérifier post-merge : version.json + 5/5 HTTP 200.

## 19. Remaining gaps
Rail rows en daily-stats (prochain tick) · validation paires duplicates
(contact sheet, fondateur) · migration photo New conforme (fondateur) ·
niche flags · responsive variants (post-source-conforme).

## 20. PR / merge / deploy
Branche `agent/coding/visual-os-aha` → PR → CI 7/7 → squash → deploy.
Rollback : `?sgcine=0` (couche) ou revert 1 commit.
