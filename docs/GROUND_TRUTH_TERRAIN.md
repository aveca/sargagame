# Ground-Truth Terrain (GTT) — correction bidirectionnelle par signalements visiteurs

> Décision de panel adverse (2 panels, 2026-07-01). Fait autorité sur ce sujet.
> Le fondateur a tranché : les signalements terrain corrigent le niveau affiché **dans
> les deux sens** (monter ET descendre). Ce doc fige **comment** on le fait sans casser le
> moat honnêteté (« Mesuré au satellite, pas deviné · verdict 100 % data ERDDAP · 0 fabrication »).

## Principe non négociable

**La couleur du verdict ne descend JAMAIS en automatique.** Le terrain peut *monter* un
niveau en escalade (prudence, aucun bénéficiaire), mais *descendre* passe obligatoirement
par une clé humaine. L'AFAI (mesure) et la date restent des **faits satellite intouchables** —
le terrain ne les édite jamais (sinon un chiffre « satellite » n'en est plus un = fabrication).

## La descente = TEMPS RÉEL (avant le satellite), validée manuellement par le fondateur (décision 2026-07-01)

> **But n°1 = avoir l'info terrain AVANT le satellite.** Ceux qui sont sur place confirment en
> temps réel ; on n'attend PAS le prochain passage satellite (ce serait perdre toute la valeur).
> **Le verrou anti-forge = la validation manuelle du fondateur**, qui reçoit déjà l'email dès
> qu'une photo est ajoutée. Un clic humain sur une photo = ce qu'un hôtel malveillant ne peut pas
> fabriquer. C'est le design « moderator-two-key » du panel (0 fatal), retenu tel quel.

- **Trigger = la PHOTO.** Un signalement qui veut bouger la couleur DOIT porter une photo →
  déclenche l'email de modération 1-tap au fondateur (flux photos existant, réutilisé). Sans
  photo = simple badge « signalé, à confirmer », ne bouge pas la couleur.
- **Clé 1 — approuver la photo** (galerie, réflexe habituel).
- **Clé 2 — « Rétrograder le verdict »** (bouton distinct, uniquement sur `cleanup`) : le seul
  geste qui fait DESCENDRE la couleur. 1 cran MAX (`avoid→moderate`, `moderate→clean` ;
  `avoid→clean` interdit). Le fondateur voit photo + niveau satellite + contexte avant de taper.
  Appliqué **immédiatement** (temps réel), TTL **48 h** glissantes, cooldown 1 descente/plage/7 j.
- **Le satellite garde le dernier mot ENSUITE.** Dès que `erddapTimestamp` bouge, le composite
  frais **écrase le calque terrain** (« satellite > terrain quand le satellite reparle »). Le
  terrain donne l'avance temps-réel ; le satellite ré-ancre à chaque passage. Si le calque
  descente expire (48 h) sans re-confirmation → retour au satellite.
- **Fiabilité (auto, en plus).** Un cleanup validé baisse aussi la **fiabilité affichée**
  (`groundReliabilityNote`, −25 max, plancher 15, demi-vie 1 j) — n'entre JAMAIS dans le
  `confidence` numérique qui gouverne `regimeCeiling`/`forecastConfidence`.
- **Montée (beaching)** = reste la loi escalade-seule existante (quorum, auto, sans clé humaine —
  aucun bénéficiaire à salir une plage) ; libellé hedgé, photo souhaitée non obligatoire.

## Barre de preuve (chiffrée)

**Le verrou principal de la descente = la validation manuelle du fondateur (clé 2), en temps
réel.** Le quorum serveur automatique n'est donc PLUS un prérequis de la descente (il l'était
dans le design « auto » abandonné) : une seule photo de ramassage suffit à déclencher l'email,
et le fondateur juge. Empreinte/GPS/quorum restent utiles en **anti-spam** (dédup, tri de la
file de modération) et en **calibration**, pas comme gate de la couleur.

| Facteur | MONTÉE (escalade, auto) | DESCENTE (temps réel, validée main) |
|---|---|---|
| Photo | souhaitée, non requise | **OBLIGATOIRE** (c'est le trigger de l'email + ce que le fondateur juge) |
| Gate de la couleur | quorum ≥2 empreintes / 48 h (auto, escalade-seule) | **clé 2 du fondateur** (« Rétrograder »), 1 cran max |
| GPS `within_150m` (booléen serveur) | souhaitable | affiché au fondateur pour l'aider à juger (facteur de confiance, jamais preuve seule) |
| Empreinte `submitter_hash` | dédup anti-flood | dédup anti-flood + tri file modération |
| Amplitude | multi-crans (escalade) | 1 cran, TTL 48 h, cooldown 7 j/plage |

`submitter_hash`/`within_150m` = **calculés serveur** (Edge Function `submit-report`), jamais
client. GPS = spoofable → jamais preuve dure ; le vrai verrou reste la **clé humaine n°2**.
La montée reste **auto** (escalade-seule, aucun bénéficiaire à salir une plage).

## Provenance nommée + libellé honnête

Dès qu'une valeur ne vient plus du satellite : retirer « satellite » de CETTE valeur, **nommer
la source humaine (« Terrain »)**, afficher la mesure satellite d'origine à côté, pastille
« contestée » (hachurée) — **jamais un vert franc** d'origine terrain. Deux voix distinctes.
Montée hedgée (« des visiteurs signalent… à confirmer »), jamais « algues arrivées » nu
(diffamation de lieu).

## RGPD

Coord GPS brute **jamais persistée** : l'Edge Function calcule `within_150m` puis la jette
(minimisation). Écran de consentement dédié avant le fix GPS ; refus = signalement simple
accepté, descente impossible. Purge `beach_reports` à 30 j.

## Calibration

`/fiabilite/` (le taux d'erreur publié) se calcule **uniquement sur le verdict satellite pur**
(status avant tout calque terrain). Le calque terrain n'y entre JAMAIS. Les events terrain
alimentent une calibration SÉPARÉE, backtest-gated, N≥30 hedgé.

## Flags rollback (loi : pas de flag = pas de merge)

- `?descente=0` — coupe toute la lane descente (couleur + confiance), retombe satellite pur.
- `?ramassage=0` — existe déjà (`Sargasses_PROD.jsx` L1632), coupe montée + descente terrain.

## Plan d'implémentation (phasé)

- **Phase 0 — fondations serveur** (direction-agnostique) :
  1. Modération `beach_reports` câblée : Edge Function `moderate` étendue (param `table`) +
     `notify-new-reports.cjs` (email 1-tap au fondateur) + step dans `notify-photos.yml`.
     **← cette PR.** Complète aussi le fix « Signalement indisponible » (#367) : sans modération,
     les reports approuvés ne s'affichent jamais et pourrissent en `pending`.
  2. Colonnes schéma additives : `submitter_hash`, `within_150m`, `downgrade_confirmed_at`.
  3. Edge Function `submit-report` (empreinte + throttle serveur + calcul `within_150m`).
  4. RPC/vue `beach_report_quorum` (quorum serveur : distinct hash, photos, within_150m, contre-signal).
- **Phase 1 — calibration offline** (0 risque moat) : `aggregate-beach-events.cjs` +
  `build-event-calibration.cjs` → `/fiabilite/` (sur satellite pur).
- **Phase 2 — correction live** : lane descente (étages 1+2) + montée (escalade existante
  durcie) dans `BeachReport` (~L2700) + overlay (~L11878, **lane séparée**, ne pas remplacer
  la loi escalade-seule de la montée) + `confidence.cjs` (`groundReliabilityDelta` isolé) +
  flags `?descente=0`/`?ramassage=0`. Consentement GPS dans `BeachReport`.

Fichiers clés : `src/Sargasses_PROD.jsx` · `src/supabasePhotos.js` · `scripts/lib/confidence.cjs`
· `supabase/functions/{submit-report,moderate}` · `supabase/schema.sql` · RPC `beach_report_quorum`.
