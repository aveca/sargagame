# Beach-sheet audit — l'onglet plage (2026-09-08, build v219, MQ)

> Captures : `390-sheet-initial/mid/lower.png`, `768/1440-sheet-initial.png`,
> `390-static-beach-anse-mitan.png`. Composants : `BeachSheetComic` (pin) vs `BeachSheet` legacy (`/beach/*`).

## Anatomie relevée (variante comic, Plage des Salines, scroll interne `.lc-detail` 2195px)

1. Header sheet : titre + `MAINTENANT` + badge statut `À SURVEILLER` (or) + ✕ (32×46, top=-4)
2. Preuve fraîcheur : « Lecture satellite d'il y a 3 j — on te le dit plutôt que de faire semblant » (moat ✓)
3. `Pourquoi ce verdict ? +` (174×44)
4. Score `72/100` + barre + chips (`À surveiller`, `Familles`, `Sainte-Anne`)
5. CTA or `VOIR LES 7 PROCHAINS JOURS →` (354×54)
6. Bloc odeur `ODEUR POSSIBLE` + source ARS (santé, honnête ✓)
7. `Partager` / `Fiche complète →` (171×49)
8. Strip forecast AUJ 72 / L 60 % / M 47 % / M 37 % / J 28 % / V 22 % / S 17 % (données réelles ✓)
9. Feedback : `Oui, ça correspond` / `Non, différent` (143×54)
10. Terrain : `Propre` / `Modéré` / `Beaucoup` (103×98) + `Algues arrivées` / `Ramassé` + « 1 signalement » + « Signalements terrain divergents (0.84) » (honnêteté ✓)
11. Alternatives : `Plages propres les plus proches…` + 3 cartes TCG (ANSE MEUNIER 77, ANSE CARITAN 77, ANSE TRABAUD 72 ; attributs SNORKELING/FAMILLES/PARKING ; ~3-4 km)
12. `REPÈRE DE SAISON · pas une prévision` + `À quoi s'attendre pour cette période ?`

## Verdicts MISSING / MISORDERED / DUPLICATE / HIDDEN / UNREADABLE / NON-ACTIONABLE

| # | Classe | Constat testable | Sévérité |
|---|---|---|---|
| BS-01 | HIDDEN | Tout le bloc 8-12 est sous fold interne (2195px) : forecast, feedback, alternatives invisibles sans scroll interne ; aucun affordance de scroll (pas d'indicateur « défiler ») | P2 |
| BS-02 | UNREADABLE (contrôle) | ✕ 32px de large (<44) à top=-4 (coupé par le haut du viewport) | P1 |
| BS-03 | MISORDERED (concurrent) | RegionNav global (9 régions) peint par-dessus le sheet (z 2001 > dialog) : chrome de changement de région visible pendant la lecture d'une fiche | P1 |
| BS-04 | DUPLICATE (système) | Deux fiches pour le même objet : comic (pin) vs legacy (`/beach/*` : Fermer/Voir la distance/Débloquer les prévisions/Suivre/Oui-Non/Propre-Modéré-Beaucoup/Débloquer 7 jours/Voir la preuve) — contenus, ordres et CTA différents | P2 |
| BS-05 | MISSING | Aucune photo/vidéo de la plage (preuve visuelle) ; aucune distance/temps d'accès ; pas de lien retour carte explicite (seul le ✕ coupé) | P2 |
| BS-06 | NON-ACTIONABLE | `Fiche complète →` vs `VOIR LES 7 PROCHAINS JOURS →` : deux CTA « en savoir plus » au 1er écran sans distinction explicite | P2 |
| BS-07 | MISORDERED (mineur) | `Partager` avant le forecast : l'action de partage précède la valeur qu'on partagerait | P3 |
| BS-08 | POLISH | Émojis OS (🌊🧹📣🍂🐠🤿👶🅿️) dans feedback/alternatives au lieu de pictos SVG mono-trait ink (bible) | P3 |

## Hiérarchie recommandée (exacte, à appliquer Phase B)

1. Identité + statut + score + fraîcheur (1er écran, inchangé — bon)
2. CTA primaire unique : `Voir les 7 prochains jours →` (inchangé)
3. Strip forecast AUJ→+2j **débloqué en aperçu** (3 cellules), suite gated (réduit la profondeur du mur)
4. Alternatives compactes (3 cartes — déjà bon, remonter avant le feedback terrain)
5. Preuve : Pourquoi ce verdict + odeur + repère saison
6. Communauté : signalement + feedback (valeur après preuve)
7. Actions : Partager + Fiche complète (fusionner avec 2 : un seul « en savoir plus »)
8. Fermeture : ✕ 44px + swipe-down (`useSwipeClose`) + Échap + tap backdrop (4 voies, LOIS mobile)

## AHA

Actuel : « je comprends le verdict et je sais quoi faire » ✓ au 1er écran.
Cible : « je vois d'un coup d'œil si j'y vais, et mon plan B est déjà là » (forecast aperçu + alternatives remontées).
