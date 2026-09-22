# FOUNDER ACTIONS — REVENUE RESCUE (2026-09-22)

3 actions humaines, par ordre d'impact. Total : ~45 min. Tout le reste est déjà fait ou automatisé.

---

## 1. PAIEMENT TEST RÉEL — 5 domaines (~75 € total, 20 min)

**La sonde E2E a déjà prouvé** (2026-09-22, mobile + desktop, 5/5 domaines) : paywall → CTA → overlay → 5 iframes Mollie montées → bouton Payer. **Aucun vrai paiement n'a encore validé la boucle complète depuis le 19/07** (65 jours).

Prix **vérifiés en prod** le 2026-09-22 (recap de commande, sonde read-only) — le CTA hero vend le **Pass 30 jours** :

| # | Domaine | Prix affiché attendu (exact) |
|---|---------|---|
| 1 | sargasses-martinique.com | **14,99 €** (Pass 30 jours) |
| 2 | sargasses-guadeloupe.com | **14,99 €** |
| 3 | sargassummiami.com | **$13.79** (= $11.99 + 15 % surcharge saison juin→nov) |
| 4 | sargassumcancun.com | **$13.79** |
| 5 | sargassumpuntacana.com | **$13.79** |

⚠️ Si le recap affiche un AUTRE montant (ex. 4,99 € ou $5.99), ne pas payer : me le signaler = bug pricing, pas le test.

**Parcours** : ouvrir le site → cliquer un jour de prévision verrouillé (ou `?paywall=1`) → CTA « Voir la prévision 7 jours » → email + 4 champs carte → Payer → 3DS éventuel → retour.

**À chaque paiement, noter** :
- [ ] paiement apparait `paid` dans le dashboard Mollie
- [ ] retour sur l'app = premium débloqué (prévision 7 j accessible)
- [ ] la veille (J+1) : la ligne apparaît dans `daily-metrics.json` bloc `mollie.paid`

**Si UN SEUL échoue** : me renvoyer domaine + heure + message affiché (ou « rien ne se passe ») + mobile/desktop. Je corrige ce domaine en priorité absolue, rien d'autre ne bouge entre-temps.

## 2. TOKEN SUPABASE — 2 min (débloque le B2B, bloqué depuis 19 jours)

1. https://supabase.com/dashboard/account/tokens → **Generate new token**
2. Repo GitHub → Settings → Secrets and variables → Actions → `SUPABASE_ACCESS_TOKEN` → **Update** (coller le token)
3. Ouvrir https://github.com/aveca/sargagame/actions/workflows/apply-supabase-schema.yml → **Run workflow** → confirmer vert.

**Alternative sans GitHub** : Supabase dashboard → SQL Editor → coller le bloc `B2B SALES ENGINE — PHASE 1` de `supabase/schema.sql` (à partir de la ligne 371) → Run.

Sans ça, les tables B2B (prospects/scoring) n'existent pas en prod et la Phase 2 ne peut rien écrire.
**En parallèle, possible SANS le token** : la prospection est humaine — protocole et critères déjà prêts dans `B2B_PROSPECT_HUNT.md`, log dans `scripts/automation/data/b2b-outreach-log.json`. 100 hôtels/conciergeries Martinique = la cible du mois.

## 3. DISTRIBUTION QUOTIDIENNE — 10 min/jour (le seul levier trafic immédiat)

Les drafts sont générés chaque nuit par région : `scripts/automation/data/verdict-du-jour/YYYY-MM-DD-<region>.md`.
Chaque fichier contient 5 blocs prêts à copier-coller : FACEBOOK / WHATSAPP / INSTAGRAM / REDDIT / EMAIL.

**Rituel quotidien (à partir d'aujourd'hui)** :
1. Ouvrir le draft MQ du jour + le draft GP du jour.
2. Poster le bloc FACEBOOK dans 1-2 groupes locaux (plages/tourisme Martinique, puis Guadeloupe) + bloc WHATSAPP dans 1 groupe.
3. 1×/semaine : REDDIT (r/martinique, r/guadeloupe — utile, pas spam : données réelles du jour).

**Mesure** : les liens portent `utm_source=social&utm_campaign=verdict_jour` → le trafic et les conversions seront visibles dans GA4 et le funnel (`session_start` avec utm). Critère de décision à 14 j : si ≥ 1,5× le trafic actuel → continuer/doubler ; sinon pivot canal.

## Ce qui est déjà fait côté code (cette session)

- Funnel Apps Script déployé **@44** : rates calculés sur `sg_pass_cta` (l'event réel) — avant, le dashboard affichait 0 % CTA à vie (jauge cassée). Vérifié live : `pass_cta=208 / 28 j`.
- Beacon front étendu (`sg_payment*`, `sg_onsite_checkout_opened`) → après le prochain déploiement, le funnel verra **ouverture checkout → paiement → échec** : le goulot money-path devient visible quotidiennement.
- Sonde prod rejouable à volonté : `PROBE_PROD=1 BASE=https://<domaine> npx playwright test tests/e2e/prod-money-path-probe.spec.ts` (ne pollue pas les analytics).
