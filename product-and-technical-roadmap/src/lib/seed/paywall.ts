export interface FunnelStep {
  name: string;
  subtitle: string;
  sessions: number;
  rate: number; // % de la population précédente
  ofTotal: number; // % des 9 000 sessions totales
  clicks: number;
  drop: string; // pourquoi on perd des gens ici
  frictions: string[];
  trust: string[];
}

export const FUNNEL: FunnelStep[] = [
  {
    name: "Carte",
    subtitle: "Point d'entrée — carte des plages & sargasses",
    sessions: 9000,
    rate: 100,
    ofTotal: 100,
    clicks: 0,
    drop: "Le CTA premium est discret et parle de « Premium », pas de bénéfice.",
    frictions: [
      "CTA premium mélangé aux filtres, aucun ancrage contextuel (plage visitée)",
      "Légende chargée au premier chargement, valeur du produit pas encore perçue",
      "Aucune preuve sociale visible à l'ouverture (membres, alertes envoyées)",
      "Bouton « Premium » ≠ promesse : l'utilisateur ne sait pas ce qu'il débloque",
    ],
    trust: ["Carte live des signalements sargasses", "Signalements communautaires horodatés"],
  },
  {
    name: "Fiche plage",
    subtitle: "Détail plage — photos, vigilance, météo",
    sessions: 3420,
    rate: 38,
    ofTotal: 38,
    clicks: 1,
    drop: "Les infos utiles sont sous accordéon ; le CTA payant est en bas sur mobile.",
    frictions: [
      "CTA « Débloquer la vigilance sargasse » sous la ligne de flottaison sur 78 % des devices",
      "Aucune preuve sociale locale (« 214 membres surveillent cette plage »)",
      "Le retour carte fait perdre le contexte plage, hésitation à cliquer premium",
      "Contenu gratuit très complet → peu de curiosité sur ce que le pass ajoute",
    ],
    trust: ["Photos réelles des plages", "Météo et houle en direct", "Note communauté affichée"],
  },
  {
    name: "PremiumModal",
    subtitle: "Interstitiel plein écran — 3 plans affichés",
    sessions: 1040,
    rate: 30.4,
    ofTotal: 11.6,
    clicks: 2,
    drop: "Modal non contextualisée, 3 plans d'emblée (paradoxe du choix), copy orientée features.",
    frictions: [
      "Non skippable ~500 ms : les rage-clicks ferment au lieu de lire",
      "3 cartes de prix simultanées, aucune recommandation défaut",
      "Copy « Passez Premium / Débloquez tout » au lieu du bénéfice plage",
      "Prix affiché sans ancre ni réduction visible",
      "Croix de fermeture trop discrète → frustration + fermeture accidentelle de l'app",
    ],
    trust: ["Logo Mollie en pied de modal", "Mention « CB non conservée »"],
  },
  {
    name: "PassOffer",
    subtitle: "Récap offre — choix du moyen de paiement",
    sessions: 392,
    rate: 37.7,
    ofTotal: 4.4,
    clicks: 3,
    drop: "Double confirmation redondante avec la modal, garantie et remboursement invisibles.",
    frictions: [
      "Deux écrans qui se ressemblent : « Continuer » puis « J'active mon pass »",
      "Récap plan illisible sur mobile (tableau pensé desktop)",
      "Garantie 14 j et annulation 1 clic absentes au-dessus du CTA",
      "TVA mentionnée tardivement, sentiment de surprise au prix final",
      "Méthode de paiement par défaut iDEAL — peu adaptée hors Pays-Bas",
    ],
    trust: ["Récap du plan choisi", "Détail du montant avant paiement"],
  },
  {
    name: "Checkout Mollie",
    subtitle: "Redirection — saisie paiement hébergée",
    sessions: 11,
    rate: 2.8,
    ofTotal: 0.12,
    clicks: 4,
    drop: "Rupture de confiance à la sortie du produit + moyens de paiement wallet absents.",
    frictions: [
      "Redirection hors des couleurs du produit : perte de contexte de marque",
      "Pas d'Apple Pay / Google Pay proposé selon device (1 saisie CB de plus)",
      "Écran d'abandon non tracké : impossible de relancer proprement",
      "3DS parfois perçu comme une erreur, aucune préparation au step-up",
    ],
    trust: ["URL Mollie reconnue", "3-D Secure banque"],
  },
];

export interface ImprovementSeed {
  t: string;
  d: string | null;
  cat: string;
  roi: number;
  eff: number;
  risk: "Faible" | "Moyen" | "Élevé";
  rev: number;
  dt: number;
  ux: number;
  seo: number;
  perf: number;
  ia: number;
  auto: number;
  m: string;
}

// Les 20 améliorations du paywall, triées par impact business décroissant.
export const PAYWALL_20: ImprovementSeed[] = [
  { t: "Paywall contextualisé inline sur la fiche plage", d: "Remplacer l'interstitiel PremiumModal par un bloc paywall dans la fiche : l'utilisateur paye au moment où le désir est maximal (vigilance sargasse de SA plage).", cat: "Paywall", roi: 100, eff: 4, risk: "Faible", rev: 140, dt: 30, ux: 100, seo: 0, perf: 10, ia: 0, auto: 20, m: "paywall" },
  { t: "Tracking funnel complet, un event par étape", d: "page_view → sheet_view → modal_open → offer_continue → checkout_start → payment_success + abandon checkout Mollie. Sans ça, aucune optimisation du funnel n'est mesurable.", cat: "Analytics", roi: 98, eff: 3, risk: "Faible", rev: 40, dt: 10, ux: 0, seo: 0, perf: 0, ia: 0, auto: 60, m: "paywall" },
  { t: "Un seul plan mis en avant + toggle mensuel/annuel", d: "Tuer le paradoxe du choix : 1 carte « recommandée » vivacité, annuel en recommandation, mensuel en second plan derrière un toggle.", cat: "Pricing", roi: 96, eff: 2, risk: "Faible", rev: 110, dt: 0, ux: 90, seo: 0, perf: 0, ia: 0, auto: 0, m: "paywall" },
  { t: "Copy bénéfice au lieu de copy feature", d: "« Sache que ta plage est propre avant de faire 40 min de route » remplace « Passez Premium ». Bénéfices concrets GPS, testés par device.", cat: "Copywriting", roi: 94, eff: 1, risk: "Faible", rev: 90, dt: 0, ux: 95, seo: 0, perf: 0, ia: 10, auto: 0, m: "paywall" },
  { t: "Apple Pay / Google Pay selon device au checkout", d: "Activer les wallets dans le profil Mollie et les afficher en premier sur mobile : saisie CB évitée, conversion checkout +15-30 % typique.", cat: "Checkout", roi: 92, eff: 2, risk: "Faible", rev: 85, dt: 0, ux: 80, seo: 0, perf: 0, ia: 0, auto: 0, m: "paywall" },
  { t: "Fusion PremiumModal + PassOffer en une seule vue", d: "Supprimer la double confirmation (« Continuer » puis « J'active ») : passage de 4 clics à 2 entre désir et paiement.", cat: "Paywall", roi: 91, eff: 3, risk: "Faible", rev: 80, dt: 20, ux: 100, seo: 0, perf: 5, ia: 0, auto: 0, m: "paywall" },
  { t: "Garantie 14 j + annulation 1 clic au-dessus du CTA", d: "Le levier de confiance n°1 des apps de voyage : visible au-dessus du bouton payer, pas en bas de page.", cat: "Confiance", roi: 89, eff: 1, risk: "Faible", rev: 70, dt: 0, ux: 70, seo: 0, perf: 0, ia: 0, auto: 0, m: "paywall" },
  { t: "Prix ancré annuel ramené au mois", d: "« 2,99 €/mois — facturé 35,88 €/an » avec mensuel 5,99 € barré à côté. Même offre, +30-50 % de part annuelle typique.", cat: "Pricing", roi: 88, eff: 2, risk: "Faible", rev: 75, dt: 0, ux: 30, seo: 0, perf: 0, ia: 0, auto: 0, m: "paywall" },
  { t: "CTA sticky plein écran en bas de fiche (mobile)", d: "78 % du trafic est mobile : le CTA de vigilance doit rester collé au pouce pendant le scroll de la fiche.", cat: "Mobile", roi: 87, eff: 1, risk: "Faible", rev: 65, dt: 0, ux: 90, seo: 0, perf: 0, ia: 0, auto: 0, m: "paywall" },
  { t: "Preuve sociale locale sur la fiche", d: "« 214 membres ont activé la vigilance sur cette plage » + 2 avis courts. Spécifique à la plage, pas générique.", cat: "Confiance", roi: 85, eff: 2, risk: "Faible", rev: 60, dt: 0, ux: 60, seo: 10, perf: 0, ia: 20, auto: 30, m: "paywall" },
  { t: "Email de récupération d'abandon checkout à +1 h", d: "Lien de reprise direct du paiement Mollie (status open). 5-12 % des abandons récupérés classiquement.", cat: "Emails", roi: 84, eff: 2, risk: "Faible", rev: 45, dt: 0, ux: 20, seo: 0, perf: 0, ia: 0, auto: 90, m: "paywall" },
  { t: "Méthode de paiement par défaut selon le pays", d: "CB en FR, iDEAL aux Pays-Bas, Bancontact en Belgique, wallets prioritaires sur mobile. Détecte pays + device.", cat: "Checkout", roi: 83, eff: 2, risk: "Faible", rev: 40, dt: 0, ux: 60, seo: 0, perf: 0, ia: 0, auto: 70, m: "paywall" },
  { t: "Microcopy rassurante sous le CTA de paiement", d: "« Paiement sécurisé par Mollie · CB non conservée · Résiliable en 1 clic » sur une ligne, sous le bouton.", cat: "Confiance", roi: 81, eff: 1, risk: "Faible", rev: 35, dt: 0, ux: 50, seo: 0, perf: 0, ia: 0, auto: 0, m: "paywall" },
  { t: "Compteur live des signalements proches", d: "« 34 signalements sargasses à moins de 3 km de cette plage cette semaine » sur la fiche : urgence légitime, pas fake.", cat: "Paywall", roi: 80, eff: 3, risk: "Moyen", rev: 50, dt: 10, ux: 70, seo: 0, perf: 5, ia: 30, auto: 80, m: "paywall" },
  { t: "Pass week-end 1,99 € pour primo-acheteurs", d: "Micro-prix vendredi-samedi pour habituer à payer, upsell vers l'annuel au retour d'expérience positive.", cat: "Pricing", roi: 78, eff: 3, risk: "Moyen", rev: 55, dt: 10, ux: 40, seo: 0, perf: 0, ia: 0, auto: 50, m: "paywall" },
  { t: "Paywall localisé langue + devise (Caraïbes)", d: "EN/ES/NL selon la zone, prix en USD/XCD selon territoire. Clé de l'expansion Martinique/Guadeloupe/Bonaire.", cat: "i18n", roi: 76, eff: 4, risk: "Moyen", rev: 60, dt: 20, ux: 50, seo: 40, perf: 0, ia: 20, auto: 40, m: "paywall" },
  { t: "Fermeture propre du paywall sans perte de contexte", d: "Croix visible + bouton « Retour à la plage » explicite. La fermeture ramène à la fiche, jamais à l'accueil.", cat: "UX", roi: 74, eff: 1, risk: "Faible", rev: 25, dt: 0, ux: 85, seo: 0, perf: 0, ia: 0, auto: 0, m: "paywall" },
  { t: "A/B test du point d'entrée de vente", d: "Bouton carte vs fiche plage vs après premier signalement reçu : mesurer où le désir de payer est le plus fort.", cat: "Analytics", roi: 72, eff: 2, risk: "Faible", rev: 30, dt: 10, ux: 20, seo: 0, perf: 0, ia: 10, auto: 60, m: "paywall" },
  { t: "Valeur immédiate post-paiement", d: "Confirmation + déclenchement d'une première alerte de test « c'est activé » dans les 60 secondes après achat.", cat: "Rétention", roi: 70, eff: 2, risk: "Faible", rev: 20, dt: 0, ux: 60, seo: 0, perf: 0, ia: 10, auto: 70, m: "paywall" },
  { t: "Écran de succès personnalisé sur la plage favorite", d: "Post-paiement : « Vigilance activée pour Plage des Salines » + partage. Ancre le produit et amorce l'effet bouche-à-oreille.", cat: "Rétention", roi: 68, eff: 2, risk: "Faible", rev: 20, dt: 0, ux: 50, seo: 0, perf: 0, ia: 10, auto: 40, m: "paywall" },
];

export const FUNNEL_TOTAL_SESSIONS = FUNNEL[0].sessions;
export const FUNNEL_BUYERS = FUNNEL[FUNNEL.length - 1].sessions;
export const CURRENT_MRR = 71; // 11 paiements × ~6,50 €
export const TARGET_MRR = 10000;
