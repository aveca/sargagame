# Asset map — réel du repo (2026-09-08)

> Inventaire : `public/` = 727 PNG · 464 JPG · 200 MP4 · 36 GIF · 15 SVG.
> `design/` = ~70 protos HTML + `STORY/` (canon) + `scene-atlas/` + `cine-atlas/`.
> `docs/ASSET-MATRIX.md` (sprint hard-asset 2026-09-07) = contrat 5 formats sur BeachSheet
> (`mediaKit.js` + `BeachDayReport.jsx` lazy `?report=0` + drift-strip SVG + rapport PDF).
> Règle : chaque format = une fonction (SVG explication/data · IMAGE preuve/lieu ·
> GIF évolution · VIDEO immersion · PDF rapport). Pas de bloc média décoratif.

## Par écran

| Écran | CURRENT | MISSING | WRONG | REUSABLE | OPPORTUNITÉ (WHERE/WHY/WHEN/INTERACTION/AHA/CTA) |
|---|---|---|---|---|---|
| MAP | SVG carte + pins + Veilleur + yole + jour-strip | photo mer du jour | hero-cards qui masquent la carte (pas un asset, un layout) | `SCENE_TOKENS` golden-hour | — (carte déjà riche ; alléger, pas ajouter) |
| SHEET | cartes TCG SVG alternatives ; pastilles statut | **photo/vidéo plage (preuve)** ; drift-strip pas encore câblé ici | — | `mediaKit.js` + `BeachDayReport` + photos `public/` (464 JPG : quartz/visuels vérifiés ?) + GIF (36) | IMAGE preuve sous le score (WHERE sous score / WHY croire le verdict / WHEN au 1er écran / TAP plein écran / AHA « je vois l'eau » / CTA Partager). GIF drift-strip dans « Pourquoi ce verdict » (évolution 7 j). PDF « Rapport plage du jour » via `?report=0` déjà câblé — exposer le CTA dans le sheet (actuellement où ?) |
| FORECAST | 7 cellules data | courbe tendance SVG (confiance decay) | — | `confidence.cjs` data | SVG courbe J+2→J+7 dans WeekHub (explication decay, moat) |
| PAYWALL | Veilleur, badges, chips preuve | schéma « où va l'argent » (Mollie/onsite) | carte blanche illisible (contraste, pas asset) | `/fiabilite/` (lien manquant dans le modal) | SVG 3 étapes (email→Mollie→reçu) au-dessus du prix (évolution : réduit l'anxiété paiement) |
| B2B | — (texte seul) | rapport hôtel PDF (TASK-ASSET-003) | — | `BeachDayReport` (base rapport) | PDF « semaine de vos plages » = le CTA lui-même (take-away) |
| FIABILITE | courbes backtest (générées) | — | — | — | OK, seul écran data-complet |
| LIST | — (vide noir = layout, pas asset) | — | — | cartes TCG (lignes liste, déjà en DOM ?) | n/a avant fix LST-01 |

## Formats propriétaires

- GIF : 36 en `public/`, + strip SVG animé préféré (§8 contrat hard-asset) — raster quotidien = TASK-ASSET-004 optionnel seulement si prouvé.
- VIDEO : 200 MP4 en `public/` (pipeline local ffmpeg, skill `video-brief`) — aucune intégrée aux écrans audités → opportunité SHEET (immersion 6s, lazy, `prefers-reduced-motion` figé).
- PDF : `BeachDayreport` (objet PREVIEW→OPEN→DOWNLOAD→SHARE) — CTA d'exposition manquant dans le sheet.

## Décision câblage (Phase B, UI-only : placement/présentation, pas de nouveau pipeline)

1. SHEET : slot photo preuve + CTA rapport `?report=0` visible (P2).
2. PAYWALL : schéma 3 étapes SVG + lien `/fiabilite/` (P1 TRUST-01 avec copy).
3. Pas de nouveau format avant que 1-2 soient mesurés (ALTITUDE : orchestrer, pas accumuler).
