# SARGAGAME — PRODUCT BLUEPRINT (figé 2026-09-22)

## PRODUCT PROMISE

**Beach Decision Engine.**
> *Know which beach to choose before you go.*

Une seule promesse vendue partout : la décision plage du jour (et du séjour), mesurée — pas une carte, pas un dashboard, pas un site météo.

## PERSONAS (réels uniquement)

| Persona | Besoin immédiat |
|---|---|
| Touriste en séjour | « On va à quelle plage aujourd'hui ? » |
| Trip planner | « On reste 7 jours — quelles plages quels jours ? » |
| Local | « Ma plage a changé ? » |
| Hôtel / concierge | « Répondre au client avant 8h du matin » |
| Pro tourisme | « Ne plus répondre au hasard » |

## JOBS TO BE DONE

1. **beach today** — verdict immédiat, gratuit.
2. **beach tomorrow** — J+1 offert (live), J+2+ premium.
3. **trip planning** — plan de séjour jour par jour.
4. **backup beach** — alternative propre si changement.
5. **recommend to guests** — B2B : widget / brief.
6. **share decision** — WhatsApp natif.

## CORE PRODUCT (colonnes existantes réutilisées)

- **FIND** : carte + recherche + intent Jev.
- **SEE** : état du jour par plage (ERDDAP).
- **DECIDE** : verdict GO/CAUTION/AVOID + score.
- **FORECAST** : J+1→J+7 + fiabilité publique.
- **ALTERNATIVE** : plan B même bassin (règles déterministes).
- **TRUST** : `/fiabilite/`, fraîcheur visible.
- **SHARE** : rapport WhatsApp.
- **MONETIZE** : Pass 30 j on-site Mollie. B2B : trial 30 j + annuel.

## MVP — matrice figée

| MUST HAVE | SHOULD HAVE | LATER | DO NOT BUILD |
|---|---|---|---|
| Verdict du jour visible en < 3 s | Trip preview dans l'offre | Trip planner complet avec dates | Chatbot généraliste |
| Alternatives propres | Entrée « Plan my stay » homepage | Partage d'itinéraire | Réseau social / marketplace |
| Paywall « décision » unique | Iconographie verdict SVG | B2B dashboard multi-plages | OTA / réservation |
| Money-path intact | — | Jev = routing contenu | Météo généraliste / CRM |

## NON-GOALS (verrouillés)

Pas d'assistance voyage généraliste. Tout ce qui ne sert pas une décision plage est exclu du MVP.

## V1 (post-validation paiements réels)

Trip planner daté (dates réelles du séjour), briefing PDF WhatsApp, widgets hôtels.

## SCALE (après 1er client B2B payant)

Espace Pro multi-établissements, analytics hôtels, programme affiliate.

## Architecture pages (existant, consolidé — pas de nouvelle IA)

| Page | Job | CTA primaire |
|---|---|---|
| `/` | verdict immédiat + find | Choisir ma plage |
| `/aujourdhui/` | « où aujourd'hui » (cible social) | Voir la carte |
| `/plages/` + fiche | Objet Plage | Prévision 7 j |
| `/pro/` + `/sargasses-pour-hotels/` | B2B demo → trial | Essai 30 j |
| `/pricing` in-modal | offer | Payer |

## Funnels (canoniques — alignés analytics)

- B2C : session → beach → verdict → forecast → modal → `sg_pass_cta` → `sg_onsite_checkout_opened` → paiement Mollie → `sg_conversion`.
- Social : verdict_jour (UTM) → /aujourdhui/ → carte.
- B2B : prospect → email J0 → réponse → trial → Pro 79 €/mo ou 690 €/an.
