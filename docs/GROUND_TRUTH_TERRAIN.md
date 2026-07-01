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

## Les deux étages de la descente

- **Étage 1 — AUTO, confiance seule.** Un ramassage prouvé (quorum descente) baisse la
  **fiabilité affichée** (champ SÉPARÉ `groundReliabilityNote`, −25 pts max, plancher 15,
  demi-vie 1 j) et pose un flag `sat_recheck` (re-vérif satellite anticipée, **rate-limité
  serveur, jamais déclenchable par volume** de reports). **La couleur ne bouge pas.**
  ⚠️ Jamais surfacé à côté d'un `avoid` satellite frais <48 h (sinon notre label « vérifié »
  sert d'arme contre un vrai rouge). Invariant testable : `status` + seuil d'alerte
  **bit-identiques avec/sans reports** tant que la clé 2 n'est pas posée. `groundReliabilityNote`
  n'entre JAMAIS dans le `confidence` numérique qui gouverne `regimeCeiling`/`forecastConfidence`.
- **Étage 2 — MODÉRATEUR À 2 CLÉS (le seul qui bouge la couleur).** Clé 1 = approuver la
  photo (galerie). **Clé 2 = bouton distinct « Rétrograder le verdict »** après avoir vu
  photo + niveau satellite + carte `within_150m` + compte d'empreintes. 1 cran MAX
  (`avoid→moderate`, `moderate→clean` ; `avoid→clean` interdit). Bloqué si satellite frais
  <48 h ET conf ≥80 ; bloqué si conf <45 (trou de données) ; bloqué si `stale` >36 h.
  Cooldown **1 descente/plage/7 j**. TTL du calque **48 h** glissantes, ré-expiration si non
  re-confirmé. Écrasement satellite = immédiat dès que `erddapTimestamp` bouge.

## Barre de preuve (chiffrée)

| Facteur | MONTÉE (escalade, sûr) | DESCENTE (chemin adverse) |
|---|---|---|
| Empreintes `submitter_hash` distinctes | ≥2 / 48 h | ≥3 / 24 h, dont ≥1 hors réseau (ASN) de l'établissement |
| Photo modérée `approved` | non requise | OBLIGATOIRE sur ≥2 des 3 (consigne « panoramique ») |
| GPS `within_150m` (booléen serveur) | souhaitable | requis sur chaque empreinte (facteur de coût, jamais preuve seule) |
| Contre-signal | — | zéro `beaching` approuvé <24 h + satellite ne monte pas |
| Étage humain | clé 1 (approuver photo) | clé 1 + clé 2 (« Rétrograder ») |

`submitter_hash` = **calculé serveur** (Edge Function `submit-report`, hash de uid+salt+tranche
IP) ; le quorum est **calculé serveur** (RPC/vue), jamais client. GPS = spoofable → jamais
preuve dure à lui seul ; le vrai verrou est la **clé humaine n°2**.

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
