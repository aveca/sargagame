# Skill: mobile-app-ux (Sargagame)

> Le fondateur est 100 % mobile. Chaque écran est conçu pouce-d'abord.

## Lois (tout nouvel écran, sans qu'on le redemande)
1. **Fermeture swipe-down** via le hook canonique `useSwipeClose`
   (`guardInput:true` si champ). Ne jamais réécrire un geste maison.
2. **4 voies de sortie** : ✕ ≥44px · Échap · tap backdrop · swipe-down.
3. **Feuille hors couche carte** : `createPortal(…, document.body)` +
   `sg-onink-scope` si montée dans `WorldMapView` (pan capte les events).
4. **Une décision par écran**, lisible sans scroll obligatoire ; `clamp()`
   partout ; tester 360/390/430.
5. **Tactile physique** : états pressed/selected visibles, drag + snap +
   settle (Embla là où un carousel existe, natif scroll-snap sinon —
   UN seul système par surface).
6. **BottomNav 5 onglets** = routes existantes (ne pas restructurer).
7. **PWA/iOS** : ne pas régresser le crop standalone (`index.html`
   l.116-122 + `app-runtime.css`), `#sg-chin`, squelette inline anti-CLS.

## Gestes canoniques
- SeaRail : drag/snap nati + molette + clavier (déjà testé — ne pas
  remplacer sans preuve).
- Compare : swipe A↔B (Embla, lazy) — voir skill motion pour la recette.
- Sheets : rise 300 ms (sgm-sheet), jamais de fond qui bloque le CTA.

## Check-list
- [ ] 0 scroll horizontal accidentel à 390px
- [ ] 0 overlay sur CTA, 0 texte coupé
- [ ] `?sgcine=0` (et flags dédiés) restaurent l'état antérieur
