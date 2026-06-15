# UX_BUILD_BRIEF — la fondation de construction (maintenue par la session architecte)

> Source de vérité pour la méga-loop UX/UI. La loop (session monolithe) lit ce fichier à chaque
> cycle. La session architecte (SEO/landing + design-system) le maintient. Issu de l'audit
> `ux-build-foundation` (wwlfrrp2r, 2026-06-15) ancré sur la data first-party réelle.

## LE BAR — "un cran au-dessus" = mesurable
Ouvrir n'importe quel écran (et surtout une page SEO **sans JS**) doit donner la **même émotion que
la home**. Si c'est distinguable d'un brouillon HTML, c'est SOUS le bar. 4 tests OUI/OUI/OUI/OUI :
1. **BEAU sans JS** — hero SVG golden-hour inline (viewBox 0 0 800 600, horizon y≈335, ciel 4-stops,
   mer+glitter, Veilleur, plage Q-path+écume) + CSS inline scopé qui style `article/h1/h2/p/ul/a`
   (pas seulement les `--sg-*`), 2 fontes (Anton titres / Bricolage corps), mono pour les données.
2. **DATA TISSÉE** — l'eau vire brun (#6E5A1E) seulement si afai mesuré ; le statut pilote la scène
   (baigneurs=clean, filet+ramasseur=moderate, nappes=avoid) ; humeur Veilleur ← score
   (≥70 serein / ≥40 vigilant / <40 alerte) ; badge LIVE = heure ERDDAP `data.updatedAt`.
   Saison calme = état **Eau-Libre 1re classe** (la plus belle scène), jamais de faux-loup.
3. **UTILE en 1 écran** — verdict du jour (statut + score/100 + ligne forecast 7j) ancré sur LA
   plage de l'URL + maillage interne réel (nearby + hubs weekly/best/method + réseau inter-sites).
4. **CONVERTIT** — un seul CTA désirable, promesse POSITIVE ("le Veilleur garde ta côte"), preuve
   chiffrée, jamais "débloquez J+2-7".

## DESIGN-SYSTEM
**Tokens** — source unique = `SCENE_TOKENS` (Sargasses_PROD.jsx L109-138), émis aussi en `--sg-*`
sur `:root` (index.html L55). Golden-hour à 4 phases (horloge, pas couleur figée) :
- GOLDEN (défaut) sky `[#0B2230,#155A5A,#C97E3A,#F2B05E]` · sea `#1A5852→#08251F` · glit/rim `#FFD884`
- DAY `[#1A6FA8,#3E9BC4,#7BC8D8,#AEE0E6]` · DAWN `[#141B33,#3A4A6B,#B86E7E,#F2A968]` · NIGHT `[#040B16,#0A1B2E,#10303B,#16424A]`
- Système : fond `#0A1714`, card `#10231E`, mer profonde `#08251F`. CTA or `#FFC72C` (pâle `#FFE08A`,
  glit `#FFD884`, lien `#E8A800`). Teal Veilleur `#3BA7A0/#5FD3C9`.
- Statuts (emoji + couleur + forme) : clean `#22C55E` 😎 · moderate `#F59E0B` 😐 · avoid `#E8522A` 🚫. Sargasse `#7a5c14`.
- Type : **Anton** titres (uppercase, ls .01em, H1 clamp(34px,9vw,52px) lh.98) · **Bricolage Grotesque**
  corps (sous-texte rgba(255,255,255,.74) 14px lh1.5 maxW440) · **mono** données dures (AFAI, heures,
  J+1/J+2). Eyebrow mono 11px w700 ls.16-.24em uppercase. **RÈGLE : jamais de hex de scène hardcodé.**

**Primitives SVG** (à packager SSR dans `scripts/lib/scene-svg.cjs`, déterministes, seedées beach.id) :
gabarit viewBox 0 0 800 600, `xMidYMid slice`, horizon y≈330-340, bande mobile-safe x∈[262,538].
sky4 · sun{set|high|moon} · clouds Shinkai (seul drift idle toléré 80-150s) · sea+glitter+colonne
lumière · `waterTint(seaT,afai)` (→ #6E5A1E si (afai-.15)/.63 > .03) · Veilleur satellite + 3 humeurs
`moodFromScore` · beach Q-path+écume · palmier seedé · reliefs archétypes (diamond/cliff/islet/marina/
morne via `archetypeOf`, PRNG FNV-1a+mulberry32 seedé beach.id) · acteurs statut · forecast bars 7j
(déjà dans le B2B brief L217-221) · badge LIVE.

**Archétypes de scène** : (A) HERO-PLAGE (page beach/playa, scène de CETTE plage) · (B) HERO-HUB
(panoramique région multi-plages) · (C) ÉTAT EAU-LIBRE (saison calme 1re classe, remplace l'état
vide) · (D) CARTE-FOG (voile sur plages non-consultées, first-party) · (E) WORST/BEST-STRIP (glow
sur le point chaud/propre du jour). Hiérarchie zoom-dependent (Watch-Duty : moins de couches de loin).

**Mouvement** — doctrine tableau calme NON négociable : au repos RIEN ne clignote (exception : drift
nuages 80-150s). Deux mécaniques SEULEMENT : (A) dolly-in/scrub par UNE var CSS écrite en rAF
throttlé (transforms/opacity only, scroll natif jamais hijacké ; **filet : valeur de repli pilotée
par l'état pour ne JAMAIS afficher un fond vide**) ; (B) ressorts CSS nommés (SPRING) sur interactions
ponctuelles. **Pages SEO statiques : le hero est beau sans JS ; tout mouvement est enhancement au scroll.**

## BACKLOG DE CONSTRUCTION (classé par data — douleur × conversion)
| # | Écran | Collision-safe | Pourquoi (data) |
|---|---|---|---|
| 1 | **Hero SVG inline du noscript beach/playa** (region-seo-pages.cjs L505-554) | ✅ session architecte | 100% du trafic Google atterrit ici et voit du Times-New-Roman nu. LA réponse à "j'aime presque rien". |
| 2 | **Hero SVG des hubs statiques** (today/forecast/map/season/best/weekly) | ✅ session architecte | Pages haute-intention poussées par weekly-seo + IndexNow, même cécité visuelle. |
| 3 | **Page resort/hotel INDEXÉE** (porter le craft du B2B brief noindex) | ✅ session architecte | Long-tail transactionnel ("sargassum at <resort> today"). Le visuel est sur les pages noindex. |
| 4 | **Bloc paywall in-scène** (forecast-lock, promesse positive) | ⚠️ snippet safe / intégration monolithe | RANG 1 data : 72 intentions chaudes → 0 paiement /14j, modal→CTA 0-2.6% = 100% du revenu perdu. |
| 5 | **Carte-Fog + streak de veille** (prototypes standalone) | ✅ proto / intégration monolithe | Levier rétention "payer = habitude" (réfs Zenly). Pas un mur data (engagement bon). |

**Hors scope / déjà AU bar** (NE PAS sur-investir) : BeachScene/fiche, GameFunnel, Archipel, Solutions
— la data dit world/beach bored 3-6%, personne ne s'ennuie. Le seul problème de BeachScene est EXTERNE
(deep-link SEO cassé /beaches/ /playas/ — routing FR-only L10038, fix monolithe).

## FLAGSHIP (template que la loop réplique)
**Hero SVG golden-hour inline de la page beach/playa**, construit d'abord pour **Le Diamant (MQ)**,
puis répliqué sur 136+ plages × 5 marchés (Bávaro, Cancún, Miami). Plan :
1. `scripts/lib/scene-svg.cjs` : string-builders SSR purs, déterministes (PRNG FNV-1a+mulberry32 seedé
   beach.id, **copie autonome — aucun import du monolithe**). `buildHeroSvg(beach, lv, data, {phase})`
   = sky4+sun+sea+glitter+Veilleur(moodFromScore)+relief(archetypeOf)+beach+acteurs, `waterTint(seaT,
   lv.afai)`, badge LIVE. Constantes de couleur recopiées de SCENE_TOKENS, zéro hex hardcodé.
2. `buildHeroCss()` : `<style>` scopé `article/h1/h2/p/ul/a` + `.hero` (Anton/Bricolage/mono),
   responsive bande mobile x∈[262,538].
3. region-seo-pages.cjs fonction beach (L533) : préfixer le noscript par le hero + verdict AVANT l'`<article>`.
4. Saison calme (status clean) → archétype Eau-Libre.
5. Vérifier : build vite MQ, ouvrir `dist/plages/le-diamant/index.html` **JS désactivé** → golden-hour,
   pas Times-New-Roman. curl le href (règle valider-les-hrefs).
6. La loop réplique : tout dérive de beach.id + data live → 1 template = 136+ plages × 5 marchés.

## RÈGLES DE COLLISION (deux sessions, un seul arbre git)
- **Session architecte** (ce fichier) possède : `scripts/lib/region-seo-pages.cjs`, `scripts/lib/scene-svg.cjs`,
  les pages SEO statiques, le design-system source, `UX_BUILD_BRIEF.md`, `design/`.
- **Session monolithe** possède : `Sargasses_PROD.jsx`, `src/`, `public/sw.js` (écrans in-app, home incluse).
- Commits : `git add` ciblé (jamais `-A`). Push fast-forward, sinon worktree isolé. Jamais toucher le
  fichier de l'autre session.
