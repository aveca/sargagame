export interface DebtBlock {
  label: string;
  score: number; // gravité 0-100
  items: string[];
}

export interface Moonshot {
  n: number;
  title: string;
  gain: number; // contribution €/mois à maturité
  phase: 1 | 2 | 3 | 4;
  why: string;
}

export const MASTER = {
  forces: [
    "Proposition de valeur nette : données sargasses temps réel par plage, communauté de signalements active",
    "Checkout Mollie fonctionnel et européen : PSD2/3DS natifs, wallets activables sans refonte",
    "Base SEO latente : 400+ plages référencées dans la base, aucune n'est encore indexable",
    "Communauté organique déjà active : 34 signalements/heure en pic sur les zones denses",
    "Stack moderne homogène : Next.js App Router + Drizzle + PostgreSQL, itérable par une petite équipe",
    "Modèle de revenu validé : 11 abonnés payants acquis sans marketing, churn très faible côté B2C",
  ],
  faiblesses: [
    "Le paywall vend un statut (« Premium ») au lieu d'un bénéfice (« plage surveillée ») : conversion 0,12 %",
    "Funnel non instrumenté : impossible de prouver ni rejouer une amélioration de conversion",
    "Dette de migration Stripe→Mollie inachevée : 26 références résiduelles dont 2 mentions légales fausses",
    "FichePlage monolithique : toute itération paywall coûte 3× plus cher que nécessaire",
    "Zéro boucle automatique côté rétention : pas de résumé, pas d'alerte intelligente, pas de digest",
    "Marché limité à un pays ; aucune infrastructure i18n malgré 10+ territoires créoles et néerlandophones",
  ],
  dettes: [
    { label: "Dette business", score: 92, items: ["Voir le plan moonshot ci-dessous : le MRR de 71 € est structurellement bloqué par le paywall et l'absence d'acquisition", "Monétisation mono-segment : aucune offre B2B alors que les hôtels paieraient 15× plus"] } as DebtBlock,
    { label: "Dette UX", score: 84, items: ["4 clics et 2 écrans redondants entre le désir et le paiement", "CTA premium hors du pouce sur 78 % des devices", "Zéro preuve sociale chiffrée au moment de la vente"] } as DebtBlock,
    { label: "Dette technique", score: 78, items: ["26 références Stripe résiduelles (2 à risque légal)", "6 imports circulaires carte ↔ fiche", "Factory paiement multi-providers obsolète, 14 accès DB directs dans les composants", "9 routes API mortes exposées"] } as DebtBlock,
    { label: "Dette SEO", score: 90, items: ["0 page plage indexable : le long tail « sargasse + destination » part à la presse", "Pas de Schema.org, sitemap dynamique ni OG images"] } as DebtBlock,
    { label: "Dette IA", score: 74, items: ["Données prédictives dormantes : 3 saisons d'historique non exploitées", "La prévision J+2 serait déjà vendable, elle n'existe pas"] } as DebtBlock,
    { label: "Dette sécurité", score: 58, items: ["Healthcheck couplé à une env Stripe morte : faux négatifs possibles", "Mention CGV erronée (Stripe) encore publiée", "Pas de scan de secrets en CI"] } as DebtBlock,
    { label: "Dette performance", score: 66, items: ["LCP 4,2 s sur 3G insulaire : abandon avant la fiche", "ISR absent, images non optimisées (pas d'AVIF)"] } as DebtBlock,
  ] as DebtBlock[],
  opportunites: [
    "Prévision sargasse 7 jours : le moat produit. Données publiques + historique = avantage 18 mois difficile à rattraper",
    "B2B hôtels : 30 comptes à 49 €/mois = 75 % du chemin vers 10 000 € à lui seul",
    "Réplication Caraïbes EN/ES : même produit, marché ×10, concurrence SEO quasi nulle",
    "Widget embed → offices de tourisme : backlinks + acquisition gratuite en continu",
    "Boucle presse saisonnière : la donnée vivante rend l'app citable chaque saison sargasse",
  ],
  menaces: [
    "Saisonnalité : MRR divisé par 4 hors saison sargasse si l'offre ne couvre pas la météo/houle",
    "Plateformes météo généralistes ajoutant une couche sargasse (Windguru, Windy)",
    "Érosion de confiance si un pic de faux signalements reste non modéré",
    "Dépendance tuiles carte : hausse de coûts en pic sans cache edge",
    "Régulation RGPD DOM-TOM : traitement des données utilisateurs insulaires sous surveillance accrue",
  ],
};

export const MOONSHOT_20: Moonshot[] = [
  { n: 1, title: "Refonte paywall inline + fusion PremiumModal/PassOffer", gain: 900, phase: 1, why: "Levier n°1 : le désir de payer au sommet de la fiche, 4 clics → 2. Conversion 0,12 % → ~0,45 %." },
  { n: 2, title: "Tracking funnel complet, un event par étape", gain: 0, phase: 1, why: "Prérequis : sans mesure, chaque itération suivante est à l'aveugle." },
  { n: 3, title: "Copy bénéfice + prix ancré annuel 2,99 €/mois", gain: 650, phase: 1, why: "Formulation + ancre : part annuelle ×2, ARPU stable, moins de churn mensuel." },
  { n: 4, title: "Apple Pay / Google Pay par device au checkout", gain: 320, phase: 1, why: "Suppression de la saisie CB : le facteur n°1 d'abandon checkout mobile." },
  { n: 5, title: "Emails récupération abandon checkout Mollie", gain: 240, phase: 1, why: "5-12 % des abandons reviennent par le lien de reprise du paiement open." },
  { n: 6, title: "Programmatic SEO : 400 pages plage FR indexables", gain: 1400, phase: 2, why: "Acquisition pérenne : le trafic « sargasse + plage » revient au produit, pas à la presse." },
  { n: 7, title: "Suppression dette Stripe (26 références)", gain: 60, phase: 1, why: "Risque légal (CGV + healthcheck) et confusions checkout éliminés en 2 jours." },
  { n: 8, title: "Webhooks Mollie idempotents + DLQ", gain: 180, phase: 1, why: "Stoppe les payés-non-activés : remboursements, support et churn évité." },
  { n: 9, title: "Prévision sargasse J+2 MVP (premium)", gain: 1200, phase: 2, why: "Le moat : fait passer le pass d'informationnel à décisionnel. Justifie le pricing." },
  { n: 10, title: "Notifications intelligentes par plage favorite", gain: 480, phase: 2, why: "Rétention automatique : le membre revient quand SA plage change d'état." },
  { n: 11, title: "Offre B2B hôtels : dashboard 10 comptes × 49 €", gain: 490, phase: 2, why: "10 ventes outbound ciblées aux hôtels des zones denses : canal MRR ×7." },
  { n: 12, title: "Digest hebdo + email bienvenue vendeur", gain: 220, phase: 2, why: "Rétention et activation gratuites, se mesurent en 30 jours." },
  { n: 13, title: "Parrainage 1 mois offert par filleul", gain: 380, phase: 3, why: "Boucle virale sur cohortes week-end : croissance sans pub." },
  { n: 14, title: "Pages SEO Caraïbes EN/ES (Martinique, Guadeloupe, Bonaire)", gain: 1500, phase: 3, why: "Réplication du playbook sur marché ×10, concurrence SERP quasi nulle." },
  { n: 15, title: "Widget carte embed offices de tourisme & blogs", gain: 350, phase: 3, why: "Backlinks + acquisition continue ; visibilité dans les plans de visite officiels." },
  { n: 16, title: "i18n paywall + devise locale", gain: 420, phase: 3, why: "Monétise le trafic Caraïbes acquis par le SEO international." },
  { n: 17, title: "Assainissement dette critique (FichePlage, circular imports)", gain: 150, phase: 3, why: "Vélocité : chaque itération paywall post-refonte coûte 3× moins cher." },
  { n: 18, title: "App stores via wrapper iOS/Android", gain: 800, phase: 4, why: "Nouveau canal d'acquisition + push natif, après stabilisation du paywall web." },
  { n: 19, title: "Assistant « où nager ce week-end » (premium)", gain: 520, phase: 4, why: "Extension du moat prévision : interface conversationnelle sur les données propres." },
  { n: 20, title: "Ads saisonniers « sargasse + destination »", gain: 300, phase: 4, why: "Amplifie le SEO en saison, rentable seulement quand la conversion > 2 % est prouvée." },
];

export const TRAJECTOIRE = [
  { phase: 1, nom: "Fondations conversion", periode: "Semaines 1-3", mrrCible: 320, leviers: ["Paywall inline", "Tracking", "Pricing ancré", "Wallets", "Dette Stripe"] },
  { phase: 2, nom: "Acquisition & moat", periode: "Semaines 4-10", mrrCible: 1800, leviers: ["SEO plages FR", "Prévision J+2", "Notifs intelligentes", "B2B hôtels", "Digest"] },
  { phase: 3, nom: "Expansion", periode: "Mois 3-6", mrrCible: 4500, leviers: ["SEO Caraïbes", "Parrainage", "Widget", "i18n paywall", "Dette critique"] },
  { phase: 4, nom: "Scale", periode: "Mois 6-12", mrrCible: 10000, leviers: ["App stores", "Assistant", "Ads saisonniers", "B2B ×3 = 30 comptes"] },
];
