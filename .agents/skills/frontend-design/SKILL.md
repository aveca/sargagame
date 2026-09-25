# Skill: frontend-design (Sargagame)

> Adapté au contexte Sargagame depuis des sources open source (voir
> `.ai/design/REFERENCES.md`). Ne copie aucun style ; retient les méthodes.

## Quand l'utiliser
Toute surface B2C/B2B : home, fiche plage, plan, trip, paywall, SEO.

## Règles Sargagame (non négociables)
1. **Donnée d'abord** : chaque bloc visuel porte une donnée réelle
   (statut satellite, flag, coords, forecast). Pas de placeholder luxe.
2. **Mobile 390px d'abord**, 768/1440 ensuite. Cibles ≥44px, `clamp()`.
3. **Couche additive** : nouveau visuel = nouvelles classes `.t3-*`,
   jamais de réécriture des skins existants (flags rollback intacts).
4. **Tokens, pas de valeurs** : couleurs/type/radius depuis
   `sg-travel-3.0.css` (`--t3-*`). Zéro hex en dur dans le JSX nouveau.
5. **Anti-slop** : pas de bento générique, pas de glass partout, pas de
   gradients empilés, pas d'emojis à la place des glyphes `sg-icons`.
6. **Accessibilité plancher** : `role=dialog` + Échap + focus, contraste
   AA, `prefers-reduced-motion` = version calme (jamais cassée).

## Check-list avant ship
- [ ] Rollback `?flag=0` pour tout ajout conversion/UI
- [ ] Screenshots 390/768/1440 lus (pas seulement E2E verts)
- [ ] Bundle eager ≤210 Ko (lazy pour tout ce qui n'est pas first-paint)
- [ ] Couleurs jugées en `getComputedStyle`, jamais sur capture headless

## Techniques reprises (détail : REFERENCES.md)
- Hiérarchie display/body/meta + rythme par alternance (Anthropic
  frontend-design : itération rapide, contraste fort, densité maîtrisée).
- États tactiles explicites pressed/selected/disabled/loading/empty.
