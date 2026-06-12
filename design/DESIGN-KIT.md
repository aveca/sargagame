# DESIGN KIT — Sargasses (multidimensionnel, intégré)

*Doctrine actée le 2026-06-12 (direction user : « pousser la qualité, rester sur le design
2/3D du site plutôt que créer des assets vidéo poor quality, kit intégré »).*

## Les 4 principes

1. **Les vraies photos sont la matière première de la marque.** Jamais d'images IA pour
   représenter les plages. Une photo terne se traite (étalonnage), ne se remplace pas par
   du synthétique. C'est ce que les visiteurs aiment et c'est notre crédibilité satellite.
2. **Deux contextes, une seule marque.**
   - *Surfaces cinématiques* (landing, fiabilité, about, mois, santé, jeu) : encre `#0A1714`,
     cards `#10231E`, or `#FFC72C`, teal `#3BA7A0`, Anton uppercase + Bricolage.
   - *Surfaces utilitaires* (carte, liste, fiche) : fond chaud `#FDFCF7`, encre `#0D0D0D`,
     or accent `#E8A800`, statuts verts/ambre/corail partagés.
   Le pont entre les deux : les statuts, l'or, la typo, les rayons (16-18), les icônes.
3. **Aucun emoji OS sur les surfaces de marque.** Un emoji rend différemment par device et
   casse le sur-mesure. → `scripts/lib/brand-icons.cjs` (+ miroir `BrandIcon` dans
   Sargasses_PROD.jsx — **garder les paths synchronisés**).
4. **La profondeur se gagne par couches, pas par génération.** L'échelle dimensionnelle :
   photo étalonnée → icône trait → scène SVG animée → WebGL (eau, parallaxe pointeur) →
   (plus tard) three.js. Chaque cran doit rester net à toute résolution (vectoriel ou
   rendu natif) — c'est l'« entre-deux » voulu entre le statique et la vidéo.

## L'inventaire du kit (ce qui existe, où)

| Couche | Pièces | Source |
|---|---|---|
| Tokens | palette ci-dessus, radius 16/18/999, ombres douces, grain .026 | `Sargasses_PROD.jsx` (objet C), statiques inline |
| Typo | Anton (titres, -.02em, uppercase) + Bricolage Grotesque (UI) + JetBrains Mono (jeu/heures) | global |
| Icônes | 14 icônes 24×24 trait 1.8 accents or : satellite, score, cal7, bell, brief, map, shield, lock, nocommit, ruler, wave, community, phone, bolt | `scripts/lib/brand-icons.cjs` + `BrandIcon` (JSX) |
| Illustrations animées | MethodScene (satellite/barque/ramasseur), AlertScene (06:00→alerte→itinéraire), scène golden-hour du jeu | JSX + `public/jeu/index.html` |
| Photo | étalonnage héros saturate(1.12) contrast(1.04) brightness(1.01) ; qualité par plage dans `beaches-images-quality.json` | JSX (3 couches média) |
| 2.5D | SceneCanvas WebGL (eau + parallaxe pointeur, natif-résolution, PRIORITAIRE sur les loops) ; loops DepthFlow (fallback no-WebGL, release `depthflow-heroes`) | JSX / release GitHub |
| Film | SatelliteFilm (section méthode, modèle SpaceX) : footage réel NASA/JPL Sentinel-6 (mission Copernicus, domaine public, crédit courtoisie) — 16 s, 1600×900 crf24, fade-noir en boucle, lazy IO + pause hors champ, jamais si reduced-motion/saveData/2G. Relié à MethodScene par le fil doré + écho radar teal sur le radeau (AFAI 0.42). Le footage spatial réel est OK (≠ plages : photos réelles only) tant que domaine public/licence libre + crédit. | JSX + `public/videos/sentinel6.mp4` |
| Motion | reveals IO (.18), sticky (.06), shine gbtn 4.5s, sheet 260ms cubic-bezier(.32,.72,.33,1) | JSX CSS |

## Phase 2 (backlog kit — dans l'ordre)

1. Icônes restantes : paywall (⚠️ smoke EUR : strings d'essai byte-identiques — toucher
   uniquement les emojis, jamais le texte), chips du chat/coach, fiche plage (🔔 alerte),
   LearnCards onboarding (~40 sites listés par `grep -c emoji`).
2. Harmoniser les deux ors (`#E8A800` app vs `#FFC72C` statiques) : décision à prendre —
   probable : #FFC72C pour les CTA partout, #E8A800 réservé aux liens sur fond clair.
3. La carte : pins/dots déjà systématisés ; reste les tuiles (teinte) et le bouton recenter.
4. Emails : palette claire actuelle assumée (clients mail) mais icônes → pictos inline.
5. three.js (scène 3D hero) : SEULEMENT quand 1-4 sont finis.

## Garde-fous

- Toute nouvelle surface DOIT consommer `brand-icons.cjs` (générateurs) ou `BrandIcon` (app).
- Tester sur dist MQ avant tout smoke EUR (`npx vite build` sans VITE_REGION — un dist
  région fait échouer le smoke à tort, vécu 2026-06-12).
- Les scènes SVG : style plat, 2-3 tons + or, jamais de dégradés criards, reduced-motion
  = frame statique.
