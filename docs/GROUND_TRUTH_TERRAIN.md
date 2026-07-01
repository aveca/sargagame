# Ground-Truth Terrain (GTT) — correction bidirectionnelle par signalements visiteurs

> Décision de panel adverse (2 panels, 2026-07-01). Fait autorité sur ce sujet.
> Le fondateur a tranché : les signalements terrain corrigent le niveau affiché **dans
> les deux sens** (monter ET descendre). Ce doc fige **comment** on le fait sans casser le
> moat honnêteté (« Mesuré au satellite, pas deviné · verdict 100 % data ERDDAP · 0 fabrication »).

## Principe non négociable

L'AFAI (mesure) et la date restent des **faits satellite intouchables** — le terrain ne les
édite jamais (sinon un chiffre « satellite » n'en est plus un = fabrication). Dès qu'un niveau
AFFICHÉ ne vient plus du satellite, la **provenance est nommée** (« relevé/corrigé sur place ·
satellite : X ») et la mesure satellite reste montrée à côté. Le forecast J+1-7 reste 100 %
satellite. La calibration `/fiabilite/` se calcule sur le satellite pur.

## Modèle SIMPLE — Approuver applique le SENS du signalement (décision fondateur 2026-07-01, LIVE)

> Le système à 2 clés (« Approuver » + « Rétrograder ») était confus. **Un seul bouton de
> validation.** Le fondateur reçoit l'email de modération et tranche :
> - **✅ Approuver** = le signalement est réel → on **applique son sens** au niveau affiché.
> - **❌ Rejeter** = la photo ne correspond pas → ignoré.
>
> **L'approbation humaine EST le verrou anti-triche** (un hôtel ne peut pas la fabriquer).
> Approuver un `cleanup` = tu vouches qu'il est réel et large ; à éviter sur une plage en
> alerte satellite fraîche (jugement humain).

- **`beaching` approuvé (< 48 h) → MONTE d'1 cran** (`clean→moderate→avoid`, cap avoid).
- **`cleanup` approuvé (< 48 h) → BAISSE d'1 cran** (`avoid→moderate→clean`, floor clean).
- **Priorité sécurité** : si les deux existent frais sur une plage, `beaching` (mauvaise
  nouvelle) l'emporte.
- **1 cran max, fenêtre 48 h glissante.** Le satellite ré-ancre au passage suivant (le composite
  frais redevient la base ; l'effet terrain expire à 48 h sans nouveau signal approuvé).
- **Implémentation** : helper `terrainDisplayStatus(satStatus, approvedEvents)` (`Sargasses_PROD.jsx`)
  → utilisé par le calque `BeachReport` ET le reroute de la const `status` de `BeachSheetComic`
  (chokepoint unique du header : pastille + bandeau + verbe). Flag rollback `?descente=0`
  (sous-ensemble de `?ramassage=0`). Ne touche PAS la loi escalade-seule communautaire
  (`_communityOverride`, data Apps Script/FB — pipeline distinct).

**Empreinte serveur / GPS / throttle** (Phase 0.3, `submit-report`) restent en **anti-spam**
(dédup file de modération, `submitter_hash` = SHA256(uid+IP+salt), 1 report/empreinte/plage/12 h)
et en **calibration** — jamais un gate de la couleur (le gate = l'approbation humaine).

> **Note historique** : la colonne `downgrade_confirmed_at` et l'action `moderate?action=confirm_downgrade`
> (ancien modèle 2-clés) sont **abandonnées** — la colonne reste (additive, inoffensive), l'action
> a été retirée de l'Edge Function. Ne pas les réintroduire.

`submitter_hash`/`within_150m` = **calculés serveur** (Edge Function `submit-report`), jamais
client. GPS = spoofable → jamais preuve dure ; le vrai verrou reste **l'approbation humaine**.

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
- **Phase 2 — correction live du verdict (FAIT, #384 + #386)** : `terrainDisplayStatus`
  (`Sargasses_PROD.jsx`) → calque `BeachReport` + reroute de la const `status` de
  `BeachSheetComic` (chokepoint unique du header). Modèle simple : Approuver applique le sens.
  Flag `?descente=0`. Ne touche pas la loi escalade-seule communautaire (`_communityOverride`).
- **RESTE (faible priorité)** : Phase 1 calibration offline (`aggregate-beach-events.cjs` →
  `/fiabilite/` sur satellite pur, prématurée sans volume) ; consentement GPS front (`onSite`) ;
  recolorage pins carte (utilisent `scoreColor` météo, pas le statut sargasses → peu de valeur).

Fichiers clés : `src/Sargasses_PROD.jsx` (`terrainDisplayStatus`, `BeachReport`, `BeachSheetComic`)
· `src/supabasePhotos.js` · `supabase/functions/{submit-report,moderate}` · `supabase/schema.sql`.
