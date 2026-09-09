# Screenshot matrix — Phase A (build prod v219, région MQ)

> Outils : `scripts/ui-rescue-capture.cjs` (matrice) + `scripts/ui-rescue-capture2.cjs`
> (list/scrolls-internes/cookie/focus/reduced-motion). Serveur statique embarqué sur `dist/`,
> consent seedé `denied` sauf capture cookie dédiée. Rejouable : `node scripts/ui-rescue-capture.cjs`.
> 35 fichiers dans `.ai/ui-audit/shots/` + `manifest.json` (boutons/headings/overflow par écran)
> + `audit2.json` (list, scrollers, cookie, focus, escape, reduced-motion).

## Matrice (✓ capturé)

| Écran | 390×844 | 768×1024 | 1440×900 | États |
|---|---|---|---|---|
| home-initial | ✓ | ✓ | ✓ | viewport initial |
| home-mid / home-lower | N/A (scrollH=viewport, app plein-écran fixe) | N/A | N/A | document non scrollable — constat, pas un manque |
| sheet-initial (via pin) | ✓ Plage des Salines | ✓ | ✓ | dialog `.lc-detail` ouvert |
| sheet-mid / sheet-lower | ✓ (scroll interne `.lc-detail` 2195px) | — | — | scroll interne, alternatives + repère saison |
| paywall-initial (`?paywall=1`) | ✓ | ✓ | ✓ | dialog ouvert, email + Pass 30j visibles |
| paywall-lower | ✓ (scroll interne : preuve 76/97 + Plus tard) | — | — | bas du modal |
| b2b-initial (`?pro=1`) | ✓ | ✓ | ✓ | `role=dialog` présent |
| list-view (onglet Plages) | ✓ **vide noir** + `390-list-verify(2).png` | — | — | Plages actif, contenu clippé (P0) |
| static-plages / static-previsions | ✓ (hydratent → carte) | ✓ | ✓ | H1 statique présent en DOM puis app |
| static-fiabilite | ✓ (reste statique, 4071px) | ✓ | ✓ | seul écran document-scroll |
| static-beach-anse-mitan | ✓ (hydrate → fiche legacy) | ✓ | ✓ | variante legacy, ≠ comic |
| cookie-banner (frais, sans seed) | ✓ `390-cookie-banner.png` | — | — | banner présent, 179×40, recouvre day-strip |

## GP / MQ

Build capturé = MQ (défaut). Aucune différence de composant attendue côté GP (même bundle,
`REGION` injecté) sauf copy/titres — la matrice MQ couvre la structure ; avant/après Phase C
inclura 1 passe GP (`VITE_REGION=gp npm run build`) sur home+sheet+paywall uniquement.

## Couverture restante (Phase C)

WEEK (`WeekHub`), BRIEF (`BriefMatin`), ACCOUNT (`AccountSheet`), CHAT (`SargaChat`),
ATTRACT/game-toast, états `showHero/showPrevLanding/showCleanList/showAlertHub/showConditions` —
portals nécessitant des interactions non triviales en headless ; à capturer avec sessions
état-forcé (`localStorage`/query) pendant l'implémentation de chaque fix les touchant.

## Limite de méthode (notée, pas contournée)

Le headless force polices/couleurs : les ratios de contraste du `manifest.json` calculés sur
`backgroundColor` sont **faux sur les fonds en gradient** (ex. CTA or `#FFC72C` mesuré 1.03 —
la capture montre noir-sur-or lisible). Règle appliquée : contraste jugé **dans le code**
(paires couleur/fond lues), jamais sur le PNG ni sur le ratio auto. Les métriques du manifest
restent valides pour : dimensions tactiles, positions (fold), headings, overflow, dialogs.
