# BACKLOG « PLUS DE TOUT » — 2026-06-21

Fusion de 2 workflows multi-agents vérifiés adversarialement : `wpi4mtsnp` (8 dimensions surface) + `wm6dhq396` (substance : prévisions/produit/modèle éco). Classé par **levier de valeur durable / effort**. Owner = qui ship.

## ✅ Déjà shippé cette session
capture exit-intent (exitcap) · pivot calme modal (pw_calm) · Pass Saison (pw_season) · dunning past_due · OG 136 fiches · cerveau alerte UX 5 régions · noms plage GP canoniques · animations BD paywall · calibration workflows + cleanup (-2257 l.) · **revenue-watch.cjs** (8d790919).

## 🌊 SUBSTANCE (le fond = le vrai levier)
| # | Item | Owner | Effort | Statut |
|---|---|---|---|---|
| S1 | **Widget hôtel PRO self-serve** (29€/mo, no-human, +200% MRR potentiel) — gating token HMAC serveur `/api/widget-token.php` (l'iframe n'a AUCUN gating today), CTA payant sur /pro/hotels + /pro/widget | moi | M | ⏳ **décision founder (prix/go)** |
| S2 | **Récupération checkout abandonné** — fuite mesurée ~565€+1224$/30j (completionRate 0,5) ; capter email AVANT carte + relance J0/J1/J3 | moi/refonte | M | ⏳ |
| S3 | **Calibrer alertes saison-calme** — falseAlarm calme 24%→<15% (le moat à la racine, honnête, backtest) | moi | L | ⏳ |
| S4 | **Plan annuel ancré in-app** — repackaging (prices existent), LTV + anti-churn saisonnier | refonte-builder | S | ⏳ |
| S5 | **Brief quotidien email « tes plages »** — moteur d'habitude, re-touche les 98% non-convertis, socle B2B PRO | script-autonome | M | ⏳ |
| S6 | Affiliation hébergeurs (Booking/Expedia) sur fiches /plages/ + widget — monétise l'intention voyage | content-engine | M | ⏳ |

## 🔧 SURFACE (protéger + optimiser)
| # | Item | Owner | Effort | Statut |
|---|---|---|---|---|
| P2 | **Rate-limiting endpoints Stripe** (anti card-testing → gel compte = 100% MRR) | moi | S | 🔴 critique |
| P3 | **Intégrité pipeline** : échec ERDDAP mono-région → status 'unknown' (pas 'clean') + gate publish | moi/bug-hunter | S/M | 🔴 critique (moat/honnêteté) |
| P4 | Cohorte cid (visite-rang→conversion) dans stats.php | script-autonome | S | ⏳ |
| P5 | Attribution canal (ref) dans stats.php | script-autonome | S | ⏳ |
| P6 | Vraie géoloc « Près de moi » (placebo aujourd'hui) | moi | M | ⏳ |
| P7 | Recherche plage par nom dans la carte-monde | refonte-builder | M | ⏳ |
| P8 | Cluster communes GP (SEO, pendant des communes MQ) | content-engine | M | ⏳ |
| P9 | Toast « plage propre la plus proche » au close fiche (cohort world) | refonte-builder | S | ⏳ |
| P10 | Compteurs sur chips filtre liste | moi/refonte | S | ⏳ |

## Décisions founder en attente
1. **Widget PRO (S1)** : le construire ? prix (reco 29€/mo + 199€/an) ? — c'est le plus gros levier revenu, no-human.
2. **PassOffer.jsx** utilise encore des Payment Links hébergés (buy.stripe.com) vs le reste on-site → migrer (incohérent + abandon non-récupérable).

## Ordre d'exécution recommandé
Criticaux (P2 sécurité, P3 moat) d'abord → puis substance revenu (S2 cart-recovery, S4 annuel, S1 widget PRO si GO) → puis S3 moat-calibration (effort L, le plus durable) → surface UX au fil de l'eau via les agents.
