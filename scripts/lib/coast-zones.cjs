// Zones côtières MQ/GP — SOURCE UNIQUE partagée entre vite.config.js (génération
// des hubs /plages/<zone>/ + lien remontant des pages plages) et prepare-ftp.cjs
// (whitelist des sous-dossiers de plages/ : sans ça, la garde anti-duplicate
// SUPPRIME les hubs au packaging — bug du premier deploy 2026-06-12, les hubs MQ
// 404aient pendant que les GP survivaient via le miroir _gp/).
// Classification par COMMUNE (vérité géographique, jamais par lng brut).
// Garde-fou feedback_beach_geography : le Sud n'est PAS abrité — les gros
// épisodes contournent l'île par le sud ; seul l'ouest (Caraïbe) l'est.
const COAST_ZONES = {
  mq: [
    { slug: 'plages-sud-martinique', name: 'Sud de la Martinique', shortName: 'le Sud',
      communes: ['Sainte-Anne', 'Le Marin', 'Rivière-Pilote', 'Sainte-Luce', 'Le Diamant'],
      intro: `Les plages les plus célèbres de l'île — Salines, Pointe Marin, Diamant. Attention : le sud n'est pas abrité des sargasses, les arrivages contournent l'île par le sud lors des gros épisodes. Vérifiez l'état du jour.` },
    { slug: 'plages-cote-caraibe-martinique', name: 'Côte Caraïbe (ouest)', shortName: 'la côte Caraïbe',
      communes: ['Les Trois-Îlets', "Les Anses-d'Arlet", 'Fort-de-France', 'Schoelcher', 'Schœlcher', 'Case-Pilote', 'Le Carbet', 'Saint-Pierre', 'Le Prêcheur'],
      intro: `La façade ouest, mer des Caraïbes : la plus protégée des sargasses — les alizés ne contournent pas le relief. Anses-d'Arlet, Carbet, Saint-Pierre : le refuge fiable en cas d'épisode à l'est.` },
    { slug: 'plages-cote-atlantique-martinique', name: 'Côte Atlantique (est)', shortName: "la côte Atlantique",
      communes: ['La Trinité', 'Le Robert', 'Le Vauclin', 'Sainte-Marie', 'Grand’Rivière'],
      intro: `La façade est, face à l'Atlantique : première ligne des arrivages portés par les alizés. Tartane, la Caravelle, le Vauclin — vérifiez l'état du jour avant de prendre la route.` },
  ],
  gp: [
    { slug: 'plages-sud-grande-terre', name: 'Sud Grande-Terre', shortName: 'le sud Grande-Terre',
      communes: ['Le Gosier', 'Sainte-Anne', 'Saint-François', 'Pointe-à-Pitre'],
      intro: `La riviera de la Guadeloupe — Gosier, Sainte-Anne, Saint-François. Les plages les plus touristiques mais aussi les plus exposées aux arrivages portés par les alizés. À vérifier avant de partir.` },
    { slug: 'plages-nord-grande-terre', name: 'Nord et Est Grande-Terre', shortName: 'le nord Grande-Terre',
      communes: ['Le Moule', 'Anse-Bertrand', 'Port-Louis', 'Petit-Canal'],
      intro: `Du Moule à Anse-Bertrand : façade au vent au sud-est (Le Moule, première ligne), plages du nord-ouest plus épargnées (Souffleur, Anse Laborde).` },
    { slug: 'plages-basse-terre-cote-caraibe', name: 'Basse-Terre — côte sous-le-vent', shortName: 'la côte sous-le-vent',
      communes: ['Deshaies', 'Sainte-Rose', 'Pointe-Noire', 'Bouillante', 'Vieux-Habitants', 'Basse-Terre', 'Trois-Rivières', 'Capesterre-Belle-Eau', 'Petit-Bourg'],
      intro: `La côte ouest de Basse-Terre, protégée par le relief de la Soufrière : Malendure, Deshaies, Grande Anse — le refuge le plus fiable de l'archipel quand l'est est touché.` },
    { slug: 'plages-iles-guadeloupe', name: 'Les îles — Marie-Galante, Les Saintes, La Désirade', titleName: 'des îles de Guadeloupe', shortName: 'les îles',
      communes: ['La Désirade', 'Capesterre-de-Marie-Galante', 'Grand-Bourg', 'Saint-Louis', 'Terre-de-Haut (Les Saintes)', 'Terre-de-Bas (Les Saintes)'],
      intro: `Les dépendances : Marie-Galante et La Désirade, plein est, sont souvent en première ligne ; Les Saintes restent plus souvent épargnées. L'état varie d'une traversée à l'autre.` },
  ],
}

const zoneSlugsFor = island => new Set((COAST_ZONES[island] || []).map(z => z.slug))

module.exports = { COAST_ZONES, zoneSlugsFor }
