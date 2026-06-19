# ARENA v2 — KIT D'ART SVG (refonte totale, sur-mesure)

Objectif : passer les écrans ARENA de "CSS plat" à une vraie refonte illustrée **SVG comic/BD**.
Réutilise les briques SVG ci-dessous (copie-colle), puis ajoute du sur-mesure par écran.
CSS dispo : `/themes-lab/arena.css` (classes `.ph .sb .view .bg-sky .pad .h-xl .h-lg .eyebrow .txt .btn .panel .tcard .pill .row .nav .pow`).
Palette : ink #0d0b14, paper #fdf6e3, red #e8322a, yel #ffd23f, blu #27a9e3, grn #27c46b, org #ff8a3d, teal-sea #1c8a86.
Règle d'or : **gros contours encrés noirs (stroke #0d0b14, 3-4px)**, aplats saturés, halftone, ombres portées dures.

## 1) MASCOTTE — LE VEILLEUR (satellite-œil). Couleur d'iris = statut.
```html
<svg class="veil" viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">
  <g stroke="#0d0b14" stroke-width="3" stroke-linejoin="round">
    <rect x="1" y="47" width="27" height="22" rx="3" fill="#27a9e3"/>
    <rect x="92" y="47" width="27" height="22" rx="3" fill="#27a9e3"/>
    <line x1="10" y1="47" x2="10" y2="69"/><line x1="19" y1="47" x2="19" y2="69"/>
    <line x1="101" y1="47" x2="101" y2="69"/><line x1="110" y1="47" x2="110" y2="69"/>
    <line x1="28" y1="58" x2="40" y2="58"/><line x1="80" y1="58" x2="92" y2="58"/>
  </g>
  <line x1="60" y1="34" x2="60" y2="18" stroke="#0d0b14" stroke-width="3"/>
  <circle cx="60" cy="14" r="5" fill="#ffd23f" stroke="#0d0b14" stroke-width="3"/>
  <rect x="36" y="32" width="48" height="56" rx="15" fill="#fdf6e3" stroke="#0d0b14" stroke-width="3.5"/>
  <ellipse cx="60" cy="60" rx="21" ry="19" fill="#0d3a39" stroke="#0d0b14" stroke-width="3.5"/>
  <circle cx="60" cy="60" r="12" fill="var(--iris,#23c4b8)"/>
  <circle cx="64.5" cy="55.5" r="4.3" fill="#fff"/><circle cx="55" cy="64" r="2.2" fill="#bdfdff"/>
  <path d="M30 92 q30 14 60 0" fill="none" stroke="#0d0b14" stroke-width="3" stroke-linecap="round" opacity=".5"/>
</svg>
```
Iris : calme `--iris:#27c46b`, vigilance `--iris:#ffd23f`, alerte `--iris:#e8322a` (style="--iris:#e8322a").

## 2) SCÈNE DE PLAGE golden-hour (illustration de fiche/carte). 
`data-st` change la mer/sargasse : clean=propre, mod=modéré, bad=à éviter.
```html
<svg class="scene" viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><linearGradient id="ARsky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1f6f9e"/><stop offset=".5" stop-color="#5fb6d6"/>
    <stop offset=".78" stop-color="#ffb267"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>
  <rect width="320" height="170" fill="url(#ARsky)"/>
  <circle cx="244" cy="104" r="44" fill="#ffe08a" opacity=".55"/><circle cx="244" cy="104" r="28" fill="#fff2c4" stroke="#0d0b14" stroke-width="2"/>
  <g stroke="#fff" stroke-opacity=".32" stroke-width="2"><line x1="16" y1="34" x2="120" y2="30"/><line x1="8" y1="54" x2="96" y2="51"/></g>
  <path d="M0 112 H320 V170 H0Z" fill="#1c8a86"/>
  <path d="M0 112 q80 -10 160 0 t160 0 V126 H0Z" fill="#2bb6a6" opacity=".7"/>
  <path d="M0 150 Q160 140 320 152 V170 H0Z" fill="#f3d9a3"/>
  <path d="M0 150 Q160 140 320 152" fill="none" stroke="#0d0b14" stroke-width="2.5"/>
  <g stroke="#0d0b14" stroke-width="4" fill="none" stroke-linecap="round"><path d="M58 168 Q52 130 64 104"/></g>
  <g fill="#1c7a3a" stroke="#0d0b14" stroke-width="2.4">
    <path d="M64 104 Q40 95 30 100 Q52 98 64 108Z"/><path d="M64 104 Q92 94 102 99 Q78 98 64 108Z"/>
    <path d="M64 104 Q54 78 46 76 Q62 96 66 107Z"/><path d="M64 104 Q78 80 90 80 Q68 96 66 107Z"/></g>
</svg>
```
Pour `data-st="bad"` : ajoute des amas de sargasse `<ellipse cx="..." cy="150" rx="40" ry="9" fill="#6b4a12" stroke="#0d0b14" stroke-width="2"/>` sur le sable et teinte la mer plus brune (#3a5a2a).

## 3) DÉCORS COMIC (réutilisables)
- Speed-lines burst (fond derrière un héros) :
  `<svg class="speed" viewBox="0 0 320 320" style="position:absolute;inset:0;width:100%;height:100%;opacity:.4"><g stroke="#0d0b14" stroke-width="2">` + ~24 lignes rayonnant du centre (génère-les) `</g></svg>`
- Onomatopée : `<span class="pow"><b>PROPRE!</b></span>` (déjà stylé).
- Étoiles rareté : `★★★★☆`.
- Halftone : déjà dans `.bg-sky`. Tu peux ajouter `radial-gradient` de points en coin.
- Médaille/trophée : cercle `#ffd23f` stroke ink + ruban triangles `#e8322a`.

## CONSIGNES par écran
- Chaque écran a AU MOINS une illustration SVG (mascotte OU scène OU décor), pas juste du texte.
- Le Veilleur apparaît sur : splash, onboarding, home, paywall, succès, vide, erreur, post-achat (expressions/iris variés).
- Cartes plage = `.tcard` AVEC la scène SVG dedans (pas un aplat).
- Copywriting punchy, FR, registre "chasseur de plages / collection" (voir ARENA_SPEC.md pour data + parcours).
- Garde le template `.scr > .ph > .sb + .view(.bg-sky + .pad + .nav)`.
