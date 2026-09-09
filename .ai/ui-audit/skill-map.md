# Skill map — issue → skill → règle → composant → asset → test

> Skills présents : `.claude/skills/sg-design-system` (vérité visuelle),
> `sg-svg-scene` (moteur SVG + pièges), `sg-session-startup` (checks),
> `sg-ux-audit` (Playwright vidéo/screenshots), `video-brief` (MP4 local).
> Pas de `sg-accessibility` en repo : fallback = doctrine CLAUDE.md (plancher dur) + Gate smoke.

| ISSUE | REQUIRED SKILL | SKILL RULE | COMPONENT | ASSET | TEST |
|---|---|---|---|---|---|
| LST-01 liste vide noir | sg-svg-scene (piège `#root` effondré + portal) | feuille plein-viewport = `fixed` OU portal ; jamais `absolute` sous comic | vue `list` (`Sargasses_PROD`) | none | capture 390 list + `elementFromPoint` centre ≠ BODY |
| MAP-01 hero overlap | sg-design-system (1 décision/écran, grille 4px) + sg-svg-scene (géométrie sticky) | 1 surface or/écran ; pas d'UI flottante sur le monde | `WorldMapView` héros + `ChasseHome` | none | screenshots 390+1440, 0 chevauchement mesuré (`getBoundingClientRect` disjoints) |
| PAY-01 CTA competition | sg-design-system (conversion-first `openPremium`, OR=action premium rare) | 1 CTA pop-3/écran | `WorldPaywall`/`ComicPaywall`/`OnsiteCheckout` | SVG 3 étapes | 1 CTA primaire visible au 1er écran modal |
| PAY-02 carte blanche | sg-design-system (tokens `--sg-*` + scope `!important` vs skin comic) | texte sombre sur fond clair, paires lues en code | `PremiumModal` carte onsite | none | paires couleur/fond lues + screenshot |
| PAY-03 Plus tard sous fold | doctrine mobile LOIS (4 voies de sortie) | sortie toujours visible sans scroll | `PremiumModal` | none | Plus tard visible viewport modal initial 390 |
| SHEET-01 RegionNav par-dessus | sg-svg-scene (portal + `sg-onink-scope`) + self-review UI (skin `!important`) | dialog au-dessus du chrome global ; nav masquée ou sous dialog | `RegionNav` + `BeachSheetComic` | none | `elementFromPoint` haut du sheet = sheet, pas nav |
| SHEET-02 ✕ 32px/top-4 | sg-design-system (touch ≥44) + LOIS (4 sorties, swipe `useSwipeClose`) | ≥44px, jamais coupé | `BeachSheetComic` | none | 44×44 mesuré + swipe-down + Échap |
| TRUST-01 3 chiffres | storytelling `design/STORY` + claim hedgé (76 % plancher + /fiabilite/) | chiffre canonique + lien preuve | `PremiumModal` preuve | lien `/fiabilite/` | copy panel 2 sceptiques |
| COO-01 cookie 40px + recouvre | sg-design-system (touch ≥44, grille) | banner ne masque jamais nav primaire | banner `Sargasses_PROD` L14841 | none | 44px + day-strip cliquable banner présent |
| NAV-01 hit svg | sg-ux-audit (Playwright hit-test) | 1er label visible ET atteignable (pattern funnel-payment.spec.ts:82) | `BottomNav` | none | real-click 3/3 + elementFromPoint = bouton |
| A11Y-01/02 noms + focus | doctrine a11y plancher | tout focusable nommé ; focus visible | tous | none | `noAccessibleName=0`, focus contrasté en code |
| REG-01 /plages/→carte | sg-design-system (zéro cul-de-sac, plan B) | route liste → vue liste | routage `view` | none | `/plages/` = liste visible |
| SHEET-03 2 variantes | doctrine (cohérence inter-surfaces) | 1 fiche, 1 ordre | `BeachSheet` vs comic | none | pin == `/beach/*` contenu |
| BS-01 affordance scroll | sg-svg-scene (scroll-driven) | scroll interne signalé | `BeachSheetComic` | none | indicateur + mid/lower capturés |
| ASSETS (photo/PDF/vidéo) | video-brief (MP4) + contrat `docs/ASSET-MATRIX.md` | chaque format = fonction | `mediaKit`/`BeachDayReport` | JPG/GIF/MP4/PDF `public/` | lazy + reduced-motion figé |

## Design system mapping (source de vérité, réutiliser avant de créer)

- Tokens : `src/sg-brand-tokens.css` + `src/Themes.css` (`--sg-*` runtime) ; fonts Anton/Bricolage (index.html) ; or `#FFC72C` + encre ; statuts vert `#22C55E`/ambre `#B87A00`/corail `#E8522A` (R3 : jamais d'or sur statut).
- Composants : `src/sg-brand-components.css` (`.sg-btn-primary` + armor, `.sg-btn-pill`, `.sg-badge/.sg-card/.sg-chip/.sg-field/.sg-sheet`, focus armoré) — tout nouveau bouton = ces classes, jamais un 7e or.
- Lane `.lc-` (comic) vs `--sg-*` (runtime) vs `SCENE_TOKENS` (SEO only) : ne pas mélanger.
- Violations relevées : ✕/cookie/Recevoir hors grille 44 (tokens existent, non appliqués) ; émojis OS au lieu de SVG ink (bible) ; carte paywall hors token clair ; double CTA or (1 surface or/écran violée au paywall).
