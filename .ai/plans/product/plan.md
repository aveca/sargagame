# Product Agent Plan — Roadmap, Pricing, Offers, B2B, Features

## Mission
Roadmap, priorisation, feedback users. Gérer le backlog `.ai/tasks.md` (source de vérité).

## Priorités P0-P2

### P0 — Offres & Pricing (Revenue)
1. **Offer matrix optimization**
   - Current: Trip7 €4.99/7j, Season €19.99/210j, P30 €14.99/30j
   - USD: Trip7 $5.99, Season $19.99, P30 $11.99
   - A/B: `pw_pass_seq` (séquence offres), `pw_copy` (CTA wording)
   - Target: ARPU > €12, conversion > 2%

2. **Season pass / Annual** (E18)
   - Nouveau: Annual €69-79 (vs Season €19.99/210j = €0.09/j)
   - Position: "Best value" badge, placement paywall + account
   - B2B: Pro Annual €690 (2 mois gratuits) — déjà câblé

3. **B2B pricing validation**
   - Pro: 79€/mo ou 690€/an (2 mois offerts)
   - Brief: 29€/mo (decoy)
   - Trial: 30j gratuit sans CB → token Pro auto
   - Metrics: trial→paid >15%, churn <5%/mois

### P1 — Activation & Onboarding
4. **Onboarding region selector** (SCREENS_V2 item 04)
   - Actualmente désactivé (`showArenaOnb=false` par défaut)
   - Si réactivé: 3 étapes → région → plages favorites → permissions
   - Rollback: `?onboarding=0`

5. **First-beach wizard**
   - Post-onboarding: "Choisis ta plage favorite" → auto-favorite + alertes
   - Pré-remplir: géolocalisation → plage la plus proche
   - CTA: "Activer ma première alerte" → paywall si non-premium

6. **Win-back / re-engagement**
   - Segment: expired passes (Supabase `payment_grants.expires_at < now()`)
   - Email sequence: J+1 (rappel), J+7 (offre -20%), J+30 (dernière chance)
   - Template: `.ai/prompts/07-univers-motion-agent.md` colonne vertébrale 6 temps

### P2 — Scale & Virality
7. **Referral program**
   - `sgMyReferralCode` + `claim_referral_credit` (déjà dans mollie-lib)
   - Récompense: 1 mois gratuit par referral converti
   - Partage: native share API + link copier/coller

8. **Seasonal urgency banner** (E3)
   - Juin-Nov: "Saison des sargasses active"
   - USD/EUR auto-détection
   - Placement: hero map + paywall header

9. **AI Briefs as lead magnet** (F9)
   - Gratuit: 1 brief/semaine via email
   - Payant: daily brief + alertes + historique
   - Génération: skill `video-brief` (Remotion 9:16 + edge-tts)

## Artefacts
- `pricing-matrix.md` — grille complète EUR/USD, tests A/B
- `b2b-pricing.md` — Pro/Brief, trial, annual, payment links
- `onboarding-flow.md` — étapes, conditions, rollback
- `win-back-sequence.md` — templates FR/EN/ES, timing
- `referral-program.md` — mécanique, tracking, fraud prevention

## KPIs
| Métrique | Baseline | Target |
|----------|----------|--------|
| ARPU (B2C) | €5.99 | €12+ |
| Conversion paywall | 0.27% | >2% |
| Trial→paid B2B | 0% | >15% |
| Churn mensuel | ? | <5% |
| Référal conversion | 0% | >3% |

## Décisions récentes (`.ai/decisions.md`)
- Pro 79€/mo / 690€/an, Brief 29€/mo (decoy)
- Essai 30j gratuit sans CB
- USD reference: 89/790$
- Rollback: tout ajout conversion → `?flag=0`