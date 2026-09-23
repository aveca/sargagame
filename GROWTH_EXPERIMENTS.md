# GROWTH EXPERIMENTS — max 3 simultanées (2026-09-22)

## Règle

Hypothèse → changement → métrique → seuil → durée → décision. Mort si pas de signal au seuil.

## Exp. 1 — Paiement fonctionnel en prod (préalable, pas un variant)

- HYPOTHESIS : la caisse est vivante si un vrai paiement traverse Mollie→webhook→entitlement.
- CHANGE : test fondateur ×5 domaines (protocole FOUNDER_ACTIONS §1).
- METRIC : 1 paiement `paid` + premium actif + ligne daily-metrics.
- THRESHOLD : 5/5 succès. Sinon stop → fix money-path unique chantier.
- DURATION : aujourd'hui (bloquant humain).

## Exp. 2 — Jev intent router (recherche vide)

- HYPOTHESIS : router les requêtes naturelles vers la fiche du meilleur spot convertit mieux que « aucun résultat ».
- CHANGE : JevAsk sur landing (flag ?jev=0), event sg_jev_intent*.
- METRIC : part sg_jev_intent/premium_modal_open source fiche vs baseline recherche-vide (non mesurable avant → baseline = création).
- THRESHOLD : à 4 semaines, si sg_jev_intent > 0 → analyser par classe ; si fallback > 40 % → clé/API ou down → diag.
- DURATION : 4 semaines.

## Exp. 3 — Distribution verdicts quotidiens

- HYPOTHESIS : publier chaque jour le verdict MQ+GP sur groupes locaux double le trafic qualifié en 14 j.
- CHANGE : rituel 10 min/j (aucun code — drafts existants).
- METRIC : sessions GA4 avec utm_campaign=verdict_jour ; baseline ≈ 0.
- THRESHOLD : ≥ 30 sessions cumul en 14 j → scale (GP, Punta Cana, Cancún) ; sinon pivot canal (partenariats hôtels réceptionnistes).
- DURATION : 14 jours.

## B2B (track séparé, pipeline véridique)

- Cohorte MQ-001 (15) contactée à la main → réponses log. Objectif : 3 réponses, 1 trial, 1 client en 30 j. Métrique pipeline : contacted→replied→trial→paid.

## File d'attente (NE PAS commencer)

- Copy paywall décision-first A/B (pw remis à plat).
- Landing « séjour » dédiée (Trip Pass).

## Exp. 4 — Cadrage offre « séjour » séquentiel (REVENUE 2026-09-23, REMPLACE Exp. 2 mise en pause — Jev sans route/clé, 0 event/7j)

- HYPOTHESIS : nommer le livrable « ton séjour planifié » (pas « forecast data ») remonte modal→CTA au-dessus de 2,0 %/7j. Trafic trop faible pour A/B (42 CTA/28j) → séquentiel avant/après, pas de split.
- CHANGE : aucun code prix (PASS_CENTS intouché) — le paywall WOW + hero « TA SEMAINE » + ligne séjour déjà live depuis ce jour = le bras « après ». Fenêtre avant : 16→23/09 (2,0 %). Fenêtre après : 23/09→07/10.
- METRIC : modal→CTA, CTA→checkout, checkout→paid, revenue/visiteur qualifié (revenue-report.cjs).
- THRESHOLD : modal→CTA ≥ 4 % sur ≥200 premium opens cumulés → garder + itérer copy ; sinon hypothèse suivante (file : rappel abandon checkout).
- DURATION : 14 jours. STOP si checkout→paid reste 0 % avec ≥10 checkouts → le chantier devient paiement (raisons sg_payment_failed via dashboard Mollie, action fondateur).

KPI global : REVENUE / QUALIFIED VISITOR → PAID CUSTOMERS → MRR.
