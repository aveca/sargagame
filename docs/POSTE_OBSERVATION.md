# Le Poste d'Observation — manifeste créatif

> L'app n'est pas une dashboard météo. C'est une longue-vue sur la mer.
> Tu regardes, la mer te répond. Le Veilleur veille.

## Principes
- **Tout est SVG natif, zéro Three.js, zéro backend neuf.**
- **Golden-hour partout** : les tokens `SCENE_TOKENS` (ciel/mer/reflets/sable) unifient carte, fiches, mascotte.
- **Data-driven** : la couleur de l'eau, la posture du Veilleur, le pulse des marqueurs = données live ERDDAP. Jamais décoratif vide.
- **Premium = "voir le film en avance"** : l'animation/l'émotion existe gratis, le détail/le time-lapse/le partage est premium.
- **Zéro JS eager** : tout en lazy ou CSS natif. Budget 210 Ko gzip tenu.
- **`prefers-reduced-motion` = plancher dur** partout.

## 1. Carte Diorama Vivante — `src/WorldMapView.jsx`
WorldMapView (74 KB, composant vedette du funnel, 88% clics morts).

Ajouts :
- **Nuages lents** : 2-3 calques SVG opacité .15-.25, drift horizontal 80-150s, path aléatoire sur la bbox de la carte.
- **Soleil positionné** : angle basé sur l'heure réelle (dégradé `SCENE_TOKENS.sky`), rayon lumineux passant derrière les iles.
- **Yole/voilier** : 1 bateau qui traverse lentement la zone maritime (path `d="M..."`), animation 120s.
- **Marqueurs de plage animés** : pulse doux (scale 1↔1.08) sur les plages en alerte, fondu d'entrée au premier render, cercle de "portée" autour du marqueur survolé.
- **Couche météo subtile** : petite flèche vent (données réelles si dispo, sinon décorative).
- **Le Veilleur satellite** : en haut à droite, lent mouvement orbital (arc de cercle 60s), regard direction = `useMouse`/`usePointer` → transform rotate vers le pointeur.

**Contraintes** : pas de refacto de la logique de pan/zoom (touchAction:none, handlers existants). Additif seulement. Budget : ~3-5 KB gzip ajoutés max.

## 2. Le Veilleur Vivant — `src/VeilleurMascotte.jsx`
Composant SVG standalone, embarquable partout (carte, header, fiche plage, paywall, widget B2B).

Props :
- `score={0-100}` → posture (calme≥70 / scan 40-69 / alerte<40) + couleur (teal/or/corail)
- `cursorPos={{x,y}}` → rotate tête vers le curseur (optionnel, défaut vers la mer)
- `dataFreshness={hours}` → halo brille si <12h
- `size={number}` → taille en px (défaut 48)
- `mood="calm"|"scan"|"alert"` → override score

Rendu :
- Satellite vu de 3/4, antenne, panneau solaire, "œil" (lentille) rassurant (mi-clos, pas de fix)
- Animation idle = micro-respiration (scale 1↔1.02, 4s)
- Halo data freshness = cercle SVG derrière, opacity/scale basé sur l'âge

**Contrainte** : zéro dépendance externe. Props only. SVG inline. Pas de state interne (sauf anim idle). `prefers-reduced-motion` = figé.

## 3. Fiche Plage Cinéma — `src/BeachSheet.jsx` (ou nouveau `src/BeachCinema.jsx`)
La fiche plage devient une expérience scroll-driven.

Structure (scroll, pas de swipe sections) :
1. **Hero golden-hour** : scène SVG plein écran (`buildBeachScene`) avec le nom de la plage en Anton, letter-spacing, fondu.
2. **Score qui apparaît** : compteur animé (0→87 par exemple) avec cercle de progression SVG.
3. **Verdict qui se matérialise** : glissement latéral du statut (Propre/Médéré/Éviter) avec icône + couleur.
4. **Prévision 7j** : barres horizontales qui se remplissent au scroll (vert→ambre→corail selon confiance).
5. **Plan B** : la plage propre la plus proche s'affiche avec sa propre mini-scène.
6. **CTA premium** : "Voir le film complet" → openPremium() avec la scène qui se transforme.

Utilise `IntersectionObserver` pour les reveals. Chaque section = `min-height: 100svh` pour un scroll snap fluide.

**Prérequis** : `buildBeachScene` existe déjà dans `Sargasses_PROD.jsx` (exporté). `scene-svg.cjs` connaît les tokens. `BeachSheet` a déjà `useSwipeClose`.

## 4. Système de Transition Marée — `src/TideTransition.css` + hook `src/useTideTransition.js`
Pas de spinner blanc. Chaque navigation entre écrans = une vague/lumière qui porte.

- CSS : `.tide-enter { clip-path: circle(0%); } .tide-enter-active { clip-path: circle(100%); transition: clip-path .6s ease-out; }`
- Hook : wrapper useCallback qui enrobe le setState/route dans la transition.
- Couleur : gradient `#0B2230 → #155A5A` (ciel→mer) = fondu naturel.
- Option 2 : vague SVG qui traverse l'écran (path `d="M0,100 Q50,50 100,100 T200,100..."`).

## 5. Share Card Plage — `src/ShareBeachCard.jsx`
Génère une image SVG golden-hour partageable pour une plage donnée.

Props : `beach`, `sargData`, `lang`, `premium=false`
Rendu :
- Scène golden-hour avec le nom de la plage et le score
- Si premium : prédiction 7j + "Le Veilleur" branding
- Bouton "Partager" qui utilise `navigator.share` ou copie d'URL avec UTM
- Export PNG via `new Blob([svg])` + `createObjectURL` (pattern existant dans le codebase)

Intégration : dans la fiche plage, dans le paywall (après achat), dans le brief email.

## Ordre d'exécution
Les 5 sont indépendants (fichiers différents ou ajouts strictement additifs). Pas de conflit.
