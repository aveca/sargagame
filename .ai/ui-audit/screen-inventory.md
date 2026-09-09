# Screen inventory — réel, vérifié sur le build prod (2026-09-08, dist v219)

> Source : `src/Sargasses_PROD.jsx` (~14,9k lignes), capture Playwright sur build prod servi en local.
> État UI = combinaison de `view` (map|list) + flags booléens (selectedBeach/comicBeach/showPremium/…).
> Les « routes » /plages/, /previsions/, /beach/*, /fiabilite/ existent en HTML statique
> mais l'app React monte par-dessus et affiche la carte (sauf /fiabilite/ qui reste statique).

| SCREEN | ROUTE / ACCÈS | COMPONENT | ENTRY POINT | PRIMARY CTA | SECONDARY CTA | SCROLLABLE | MEDIA | KNOWN ISSUES |
|---|---|---|---|---|---|---|---|---|
| HOME/MAP | `/` (vue `map`) | `WorldMapView` (SVG primaire) / `ArchipelView` (`?archipel=1`) | mount défaut | pin plage → fiche | day-strip Auj/+5j, recherche | non (viewport fixe 844/1024/900) | SVG carte + Veilleur + yole | P1 hero-cards overlap labels ; P2 badge retard chevauche recherche |
| LIST (Plages) | onglet `Plages` (`view=list`) | liste intégrée `Sargasses_PROD` | BottomNav → `onChangeView('list')` | ligne plage → fiche | tri MEILLEURES/PLUS PROCHES/A–Z | oui (interne) | cartes TCG alternatives | **P0 vide noir** (contenu clippé, voir ui-findings LST-01) |
| BEACH SHEET (comic) | pin carte → `selectedBeach`+`comicBeach` | `BeachSheetComic` (portal `document.body`, `.lc-detail`, h interne 2195px@390) | `onMapBeach` | VOIR LES 7 PROCHAINS JOURS → | Pourquoi ce verdict ? / Partager / Fiche complète | oui (interne `.lc-detail`) | cartes alternatives SVG | P1 RegionNav par-dessus le sheet ; P1 ✕ 32px top=-4 |
| BEACH SHEET (legacy) | `/beach/:slug/` deep-link → `selectedBeach` seul | `BeachSheet` (`.bsc-sheet` présumé) | `getPathname()/beach` | Débloquer 7 jours → | Fermer / Voir la distance / Suivre | oui | — | **P2 deux variantes coexistent** (comic vs legacy, contenus/boutons différents) |
| VERDICT | section haute du sheet (`MAINTENANT`, badge statut, score /100) | `BeachSheetComic` / `BeachPage` | pin ou `/beach/*` | Pourquoi ce verdict ? | — | non (1 écran) | pastille statut | OK lisible ; P3 triple chiffre fiabilité distinct du paywall |
| FORECAST 7J | section sheet (`VOIR LES 7 PROCHAINS JOURS`, strip AUJ→S) | `BeachSheetComic` + `WeekHub` (`src/WeekHub.jsx`) | CTA sheet | Débloquer (gated) | Suivre gratuitement | oui | strip 7 cellules | strip présent ; gate blur hors scope (métier) |
| ALTERNATIVE | bas du sheet (`Plages propres les plus proches`, cartes ANSE MEUNIER 77…) | `BeachSheetComic` (cartes TCG) | scroll sheet | carte alternative → sa fiche | — | oui | cartes SVG TCG | lisible ; dense mais structuré |
| PAYWALL | `?paywall=1`, onglet Premium, forecast-lock, CTA | `PremiumModal` → `WorldPaywall`/`ComicPaywall` (`pw_style`) | `openPremium(source)` | **compétition :** Payer 4,99€ (onsite) vs Débloquer 14,99€ vs Commencer maintenant | Plus tard (bas de scroll interne) | oui (interne) | Veilleur, badges 76%/97% | **P1 compétition CTA + 2 prix ; P1 Plus tard sous fold ; P0 texte blanc-sur-blanc à vérifier code** |
| CHECKOUT (onsite) | bas du paywall (form email/titulaire/carte/VISA/exp/CVC) | `OnsiteCheckout` (z 1300, iframes Mollie) | scroll paywall | Payer 4,99€ — activer maintenant | ← Retour | oui (interne modal) | iframes Mollie | logique métier hors scope ; placement sous fold constaté |
| WEEK | `WeekHub` (hub 7 jours) | `src/WeekHub.jsx` | CTA semaine (B2B/probe) | — | — | oui | — | non capturé cette session (portal) — à couvrir Phase C |
| BRIEF | `BriefMatin` (brief du matin) | `src/BriefMatin.jsx` | deep-link/notification | — | — | oui | — | non capturé — Phase C |
| ACCOUNT | `showAccount` (`Mon accès`, cloche) | `src/AccountSheet.jsx` | header 👤/🔔 | restaurer premium (`sgVerifySub`) | — | oui | — | non capturé — Phase C |
| B2B | `?pro=1` | `B2BModal` (`PremiumModal/B2BModal.jsx`, `role=dialog`) | deep-link outreach | Voir la semaine de vos plages → | ✕ / Échap | non (1 écran 390) | — | lisible, 1 CTA ; P2 BottomNav visible derrière le modal |
| ATTRACT | `showAttract` (toast/game easter egg) | toast inactivité | idle | — | — | non | — | non capturé — Phase C |
| COMMUNITY | sections sheet (`Sur place ? Signale…`, Propre/Modéré/Beaucoup, Algues arrivées/Ramassé) | `BeachSheetComic` | scroll sheet | Algues arrivées / Ramassé | Oui/Non (correspondance) | oui | pictos | lisible ; émojis 🌊🧹📣 (règle SVG mono-trait non appliquée ici — P3) |
| STATIC BEACH | `/beach/anse-mitan/` (HTML statique, 136 pages) | `BeachPage.jsx` + `dedicated-pages.cjs` | URL directe | — (hydrate → app) | — | hydrate vers fiche legacy | — | hydrate vers variante legacy (voir SHEET legacy) |
| REGIONAL | `/plages/`, `/previsions/`, `/conditions/`, hubs zones, pages mois | `vite.config.js` + `dedicated-pages.cjs` | URL directe | — (hydrate → carte) | — | hydrate vers carte | — | **P2 hydrate→carte** : intention « liste » → carte affichée |
| FIABILITE | `/fiabilite/` (générée, 4071px@390) | `reliability-page.cjs` | URL directe | Recevoir (103×39) | — | **oui document** | courbes backtest | P2 CTA <44px ; seule page qui reste statique (bien) |
| COOKIE | 1re visite (`.sg-cookie-banner`, `?cookiebanner=0` rollback) | `Sargasses_PROD` L14841 | mount si `!cookieConsent` | Accepter / Refuser (179×40) | En savoir plus | non | — | **P1 40px<44 + recouvre day-strip/Auj et CTA proximité** |
| CHAT | `Demander au Veilleur` (FAB 46×46) | `SargaChat` / `SargaChatB2B` | FAB | — | — | oui | — | non capturé — Phase C |

## Écrans demandés par la mission, statut

- HOME/MAP/BEACH/VERDICT/FORECAST/ALTERNATIVE/PAYWALL/CHECKOUT/B2B/STATIC/REGIONAL : capturés.
- WEEK/BRIEF/ACCOUNT/ATTRACT/COMMUNITY(dédié)/CHAT : existent, non ouverts cette session (portal/deep-link non triviaux en headless) → listed, à couvrir en Phase C (`?week=`, compte test, idle).
- Liste complète des overlays d'état dans `Sargasses_PROD` : `showHero/showMapIntro/showPrevLanding/showCleanList/showAlertHub/showConditions/showStation/showArchipel/showChat/showProB2B/showWelcome/showPushPrimer/showCaptureGate/showSplash/showArenaOnb/showGameToast/showGameFull/showExitVeilleur/showAttract` — 18 états ; chaque futur fix les re-teste (non-régression overlay).
