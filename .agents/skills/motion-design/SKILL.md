# Skill: motion-design (Sargagame)

> Grammaire SGM (`src/sg-motion.css`) + Web Animations API native.
> Le « moteur motion principal » de Sargagame est volontairement
> **sans dépendance** (voir décision bundle dans REFERENCES.md).

## Quand l'utiliser
Transitions home→fiche, reveals, swaps, sheets, settles. JAMAIS de
décoration permanente.

## Règles (lois, pas conseils)
1. **Finies** : 180–500 ms, `backwards`/`forwards`, jamais `infinite`
   sur CTA ou interactif (régression 2026-09-24A).
2. **GPU-only** : `transform` + `opacity` uniquement.
3. **Interruptibles** : pas de verrou, pas de rAF permanent.
4. **Canal statut** : `[data-sgm-status]` → `--sgm-c` (la couleur vient
   de la donnée réelle, jamais l'inverse).
5. **Gates** : `?sgmotion=0` (JS `sgmOff()`) + `prefers-reduced-motion`
   (CSS) + `saveData` (pas de vidéo/lourd).
6. **Shared-transition** : illusion d'élément partagé via WAAPI sur
   l'image source (scale/clip 200–240 ms) PUIS navigation — jamais
   l'inverse, jamais de blocage (timeout de sécurité + reduced-motion
   = navigation directe).

## Recette shared-transition (copiable)
```js
const go = () => onOpenBeach(beach);
try {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return go();
  const img = ref.current;
  const anim = img?.animate(
    [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.07)', opacity: .55 }],
    { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  if (!anim) return go();
  anim.onfinish = go; setTimeout(go, 400); // garde-fou : jamais de piège
} catch (_) { go(); }
```

## Check-list
- [ ] `RM_INFINITE=[]` sous emulateMedia reduce (smoke)
- [ ] CTA reste tappable pendant/après (test E2E stabilité)
- [ ] Nommage sgm-* + keyframes centralisées (pas d'anim ad hoc)
