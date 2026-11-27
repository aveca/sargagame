# Plan d'action — 30 jours (changements lourds)

## Objectif
Peaufiner le funnel, mesurer la rétention, et déployer des tests A/B significatifs.

## Actions

### 1. Funnel et rétention
- [ ] Implémenter le suivi des échecs et remboursements de paiement (webhook Stripe si possible)
- [ ] Calculer le taux de rétention (renouvellement Pro, multi-pass)
- [ ] Agglomérer les revenus via Stripe Dashboard ou GA4 (événements checkout_success / checkout_failure)

### 2. Tests A/B approfondis
- [ ] Tester sur page Offres : bouton CTA vs lien texte (mesurer cta_pass7, cta_pass30, cta_proM)
- [ ] Suivre rigoureusement la méthodologie : pas d'actions irréversibles sans tests fiables
- [ ] Si trafic trop faible : tests avant/après ou requalitatifs

### 3. SEO avancé
- [ ] Créer pages secondaires pour capter le trafic « sargasses Guadeloupe », « sargasses Martinique » si non optimisées
- [ ] Améliorer le maillage entre les sites du réseau Sargasses (Martinique ↔ Guadeloupe ↔ Punta Cana ↔ Cancún ↔ Miami)
- [ ] Vérifier hreflang et canonical sur toutes les pages multilingues

### 4. Analyse des résultats (J+30)
- [ ] Évaluer les KPI du funnel : CTR des CTA, visiteur→lead, lead→paiement, rétention post-achat
- [ ] Ajuster la stratégie selon les données (focus sur les 20% de pages générant 80% de l'activité)

## Livrables
- Dashboard de suivi des KPI (GA4, Tableau ou équivalent)
- Rapports de tests A/B avec recommandations
- Pages secondaires SEO créées et indexées
- Compte rendu d'analyse à J+30
