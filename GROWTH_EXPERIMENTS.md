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

KPI global : REVENUE / QUALIFIED VISITOR → PAID CUSTOMERS → MRR.
