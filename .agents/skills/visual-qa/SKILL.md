# Skill: visual-qa (Sargagame)

> Un visuel n'est FINI que si les screenshots le prouvent. Les tests verts
> ne suffisent pas (règle cycles visuels).

## Protocole obligatoire
1. **Surfaces** : Home, Best Pick, Beach, Compare, Perfect Day, Trip,
   Premium (+ rollback `?flag=0` de chaque ajout).
2. **Viewports** : 390×844 (prioritaire), 768, 1440.
3. **Probes** : `scripts/qa/probe-*.mjs` (Playwright, build preview —
   jamais le dev-server). Cookies refusés pour dégager la vue.
4. **Lecture** : densité, hiérarchie, qualité image, rythme vertical,
   espace, CTA, sensation premium. Comparer avant/après.
5. **Couleurs** : `getComputedStyle()` uniquement (capture headless ment :
   forced-colors/fonts système).
6. **Questions à trancher** (oui à tout, sinon continuer) :
   plus premium ? plus app-like ? plus tactile ? média dominant ?
   vrai AHA ? compréhensible sans lire 20 blocs ?

## Garde-fous
- Attendre le sélecteur de surface + 1–2 s (hydratation, images).
- `ERRORS=[]` console exigé sur chaque probe.
- Ne jamais présenter un probe comme trafic réel (`synthetic` tagué ;
  agrégations l'écartent).
- Reduced-motion + saveData : passe dédiée pour toute nouvelle motion.

## Sortie
Shots datés + verdict par surface dans le rapport de cycle
(`.ai/ui-audit/`), rollbacks listés.
