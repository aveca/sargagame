export interface MissionSeed {
  slug: string;
  ordre: number;
  title: string;
  tagline: string;
  prompt: string;
  stars: number;
}

export const MISSION_SEEDS: MissionSeed[] = [
  {
    slug: "paywall",
    ordre: 1,
    title: "Audit complet du paywall",
    tagline:
      "Le problème n'est plus le paiement, c'est la conversion. Carte → Fiche plage → PremiumModal → PassOffer → Checkout Mollie.",
    stars: 5,
    prompt: `Tu travailles sur le repo aveca/sargagame.

Mission : faire un audit UX + conversion complet du funnel :
Carte → Fiche plage → PremiumModal → PassOffer → Checkout Mollie.

Ne modifie rien.

Analyse :
- toutes les frictions
- nombre de clics
- ordre des informations
- hiérarchie visuelle
- copywriting
- points où l'utilisateur peut abandonner
- éléments qui inspirent confiance
- éléments inutiles
- comparaison avec les meilleurs SaaS mobile et apps de voyage

Puis propose les 20 améliorations classées : Impact business / Effort / Risque.

Ne fais aucune modification.`,
  },
  {
    slug: "backlog-roi",
    ordre: 2,
    title: "Backlog des 100 améliorations",
    tagline:
      "Lecture CTO : classer les 100 prochaines améliorations possibles par ROI décroissant, sans coder.",
    stars: 4,
    prompt: `Analyse tout le repo.

Tu es un CTO SaaS.

Classe les 100 prochaines améliorations possibles.

Colonnes : ROI, difficulté, risque, revenu attendu, dette technique, UX, SEO, performance, IA, automatisation.

Trie par ROI décroissant.

Ne code rien.`,
  },
  {
    slug: "dette-stripe",
    ordre: 3,
    title: "Traque de la dette Stripe",
    tagline:
      "Toutes les références Stripe : imports, API, webhooks, env, docs, dead code. Supprimable ? Risqué ?",
    stars: 4,
    prompt: `Recherche absolument toutes les références Stripe.

Inclus : imports, API, configs, webhooks, README, docs, comments, JSON, variables, routes, dead code.

Pour chaque référence : chemin, ligne, utilisée ?, peut être supprimée ?, risque.

Ne modifie rien.`,
  },
  {
    slug: "architecture",
    ordre: 4,
    title: "Audit architecture",
    tagline:
      "Regard Staff Engineer : fichiers trop gros, couplage, circular imports, duplication, code mort.",
    stars: 3,
    prompt: `Tu es Staff Engineer.

Analyse toute l'architecture.

Cherche : fichiers trop gros, couplage, circular imports, composants trop complexes, duplication, dette, code mort, architecture fragile.

Produis un rapport.

Ne modifie rien.`,
  },
  {
    slug: "quick-wins",
    ordre: 5,
    title: "Quick wins de conversion",
    tagline:
      "Uniquement ce qui peut augmenter les ventes : copy, CTA, pricing, preuves sociales, mobile, paywall, checkout.",
    stars: 4,
    prompt: `Analyse uniquement les éléments pouvant augmenter les ventes.

Ignore la dette technique.

Cherche : copy, CTA, preuves sociales, pricing, ordre des informations, animations, mobile, temps de chargement, emails, paywall, checkout.

Classe toutes les idées par gain estimé.`,
  },
  {
    slug: "audit-ia",
    ordre: 6,
    title: "Audit IA & avantage concurrentiel",
    tagline:
      "Où une IA crée un moat : personnalisation, assistant, vision, prévisions sargasses, notifications intelligentes.",
    stars: 3,
    prompt: `Tu es expert IA.

Analyse où une IA pourrait créer un avantage concurrentiel.

Cherche : personnalisation, résumés, assistant, vision, OCR, agents, prévisions, génération, notifications intelligentes.

Classe : Impact / Coût / Temps / Moat créé.`,
  },
  {
    slug: "hypercroissance",
    ordre: 7,
    title: "Audit hypercroissance",
    tagline:
      "Penser fondateur 100M€, pas développeur : acquisition, conversion, viralité, rétention, international.",
    stars: 4,
    prompt: `Tu es fondateur d'une startup à 100M€.

Analyse le repo. Ne pense pas développeur. Pense croissance.

Trouve : ce qui ralentit l'acquisition, la conversion, la viralité, la rétention, l'international.

Classe tout.`,
  },
  {
    slug: "master-audit",
    ordre: 8,
    title: "MASTER_AUDIT.md",
    tagline:
      "Le document de synthèse : architecture, dettes, opportunités, menaces, 100 améliorations, les 20 tâches 70 € → 10 000 €.",
    stars: 5,
    prompt: `Tu es le nouveau CTO de ce projet.

Lis entièrement le repo, tous les fichiers .md. Comprends l'architecture, le business, les workflows GitHub, le pipeline, le funnel, le modèle économique, les régions, le paiement, le SEO, le système B2B, l'automatisation.

Ensuite, écris un document nommé MASTER_AUDIT.md contenant :
- Architecture / Forces / Faiblesses
- Dette technique, business, UX, SEO, IA, sécurité, performance
- Opportunités / Menaces
- Les 100 prochaines améliorations classées par ROI
- Les 20 tâches qui peuvent faire passer le projet de 70 €/mois à 10 000 €/mois.

Ne modifie aucun fichier du projet.`,
  },
];
