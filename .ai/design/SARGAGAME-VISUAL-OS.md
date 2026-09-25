# SARGAGAME VISUAL OS 3.0 — langage visuel (2026-09-25J)

> Implémentation : `src/sg-travel-3.0.css` (tokens + traitements).
> Couche additive (`?sgcine=0` = off). Anti-slop : pas de glass partout,
> pas de gradients empilés, pas de bento auto, pas de look SaaS.

## Tokens
COLOR : `--t3-ocean #06222E` (fonds) · `--t3-sea #0E4A5A` · `--t3-tropical
#00B086` (clean) · `--t3-sand #F4E7C8` · `--t3-sunset #FF9E5E` ·
`--t3-ink #0d0b14` · `--t3-paper #FFFDF6` · `--t3-gold #FFC72C` (pont).
TYPE : display Anton clamp 34–54 · heading clamp 20–26 · body 14.5 ·
meta 11.5 · mono (chiffres). SPACE s1–s5 (6/10/14/20/28).
RADIUS : hero 22 / cards 18 / pills 999 / sheets 22.
SHADOW : 3 élévations douces (jamais de hard offset noir).
MOTION : voir grammaire SGM (180–500 ms, finies, GPU-only).
MEDIA : voir skill media-art-direction (slots hero/card/poster…).

## Traitements (où, combien)
- **Typography** : 1 display par écran max (hero OU fiche, jamais les
  deux) ; kickers 10–12px capitales espacées ; chiffres en mono.
- **Image** : bord-à-bord, `object-position center 42%`, shade bas
  78 % (lisibilité CTA), `fetchpriority` sur LCP seul, lazy + onError
  partout ailleurs. Jamais de photo faible en grand (gate HERO).
- **Card** : fond paper, 1px ink/12, radius 18, ombre douce. Dark :
  gradient océan 150°, 1px blanc/12. Jamais de double bordure.
- **Glass** : RÉSERVÉ aux overlays tactiles (hero ghost, chips sur
  image) — blur 8–10px + 1px blanc/18–35. Jamais sur carte texte.
- **Hero** : 52–58dvh, shade 3 stops, kicker EN DIRECT + fraîcheur,
  1 CTA primaire + 1 ghost max.
- **Sheet** : radius 22 top, rise 300 ms, grabber 44×5, ✕ ≥44px +
  backdrop + Échap + swipe-down.
- **CTA** : primaire or 52px/16px radius ; ghost verre 44px ; sticky
  = le même bouton (pas un sosie). Disabled = `payBusy` seul +
  `aria-disabled` (feedback guidé, jamais de tap mort).
- **Touch** : pressed = soulèvement réduit + assombri (pas de scale
  qui casse le layout) ; selected = ink/gold plein (jamais couleur
  seule : + glyphe/texte) ; min 44px.
- **Loading** : squelette inline de la forme finale (pas de spinner
  plein écran) ; photo = fondu au load, jamais de trou.
- **Empty** : phrase honnête + 1 action (« Aucune plage propre
  confirmée — voir les plages → »), jamais de vide ni de faux contenu.
