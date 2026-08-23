export interface RapportFinding {
  title: string;
  detail: string;
  severity: "Critique" | "Élevée" | "Moyenne" | "Faible";
  evidence: string;
  recommendation: string;
}

export interface Rapport {
  slug: string;
  title: string;
  verdict: string;
  findings: RapportFinding[];
}

export const RAPPORTS: Rapport[] = [
  {
    slug: "architecture",
    title: "Audit architecture — Staff Engineer",
    verdict:
      "Le cœur produit (carte + fiches) est sain, mais la couche paiement/paywall porte l'héritage de la migration Stripe→Mollie et d'une croissance rapide sans design system. Trois foyers de fragilité : le composant FichePlage monolithique, la factory multi-providers de paiement devenue inutile, et les imports circulaires carte ↔ fiche. Rien d'irrécupérable : 2 semaines de travail ciblé remettent la base à niveau, MAIS aucun de ces chantiers ne doit passer avant les quick wins du paywall.",
    findings: [
      { title: "FichePlage.tsx — 1 320 lignes, ~40 props", detail: "Le composant mélange géodonnées, photos, météo, signalements, paywall et tracking.", severity: "Critique", evidence: "src/components/FichePlage.tsx", recommendation: "Découper en sections autonomes (VigilanceHeader, ReportList, WeatherStrip, PaywallBlock) avant toute itération conversion." },
      { title: "6 imports circulaires carte ↔ fiche", detail: "Cycles contravariant le tree-shaking : cold start des fiches pénalisé.", severity: "Élevée", evidence: "madge --circular : 6 cycles", recommendation: "Extraire les types/shared dans src/core/geo et inverser les dépendances." },
      { title: "Factory de paiement multi-providers obsolète", detail: "providers.ts conserve branches Stripe mortes et indirections inutiles.", severity: "Élevée", evidence: "src/server/payments/providers.ts", recommendation: "Réduire à un provider Mollie unique + tests de contrat du webhook." },
      { title: "Accès DB direct dans 14 composants", detail: "Pas de couche service : la logique métier est piégée dans l'UI.", severity: "Élevée", evidence: "grep db.select dans src/components", recommendation: "Introduire src/server/services/* (plages, signalements, abonnements)." },
      { title: "Géocodage implémenté deux fois", detail: "Carte et recherche calculent distances et bbox différemment : incohérences visibles.", severity: "Moyenne", evidence: "src/lib/geo.ts vs src/server/search.ts", recommendation: "Fusionner en un module de référence testé." },
      { title: "11 variantes de modales", detail: "PaywallModal, PassOffer, ConfirmDialog… copies proches sans base commune.", severity: "Moyenne", evidence: "src/components/**/*Modal*", recommendation: "Un composant Modal de design system + slots." },
      { title: "9 routes API non référencées", detail: "Endpoints exposés sans appelant (héritage B2B expérimental).", severity: "Moyenne", evidence: "src/app/api/*/route.ts", recommendation: "Supprimer ou documenter ; scanner d'exposition en CI." },
      { title: "Config env parsée à chaud par requête", detail: "Plusieurs helpers relisent process.env à chaque appel au lieu d'un module config figé.", severity: "Faible", evidence: "src/lib/config.ts", recommendation: "Parser + valider au boot (zod), exporter un objet gelé." },
    ],
  },
  {
    slug: "quick-wins",
    title: "Quick wins de conversion",
    verdict:
      "Le potentiel immédiat se joue sur 4 fronts : la formulation (bénéfice plage vs « Premium »), la hiérarchie (un seul CTA par écran), la réassurance (garantie + résiliation au-dessus du bouton payer), et la réduction mécanique du chemin d'achat (4 clics → 2). Ces changements sont mesurables en 2 semaines avec le tracking funnel, pour un gain estimé cumulé de +60 à +120 €/mois sans toucher au produit.",
    findings: [
      { title: "La valeur n'est jamais formulée en bénéfice", detail: "Tous les CTA parlent de « Premium » : personne n'achète un statut, on achète une plage propre garantie.", severity: "Critique", evidence: "PremiumModal, header carte, emails", recommendation: "Copy bénéfice sur 100 % des points de contact au prix." },
      { title: "Trois CTA se concurrencent sur la fiche", detail: "Signaler, Partager, Débloquer — même poids visuel : l'œil ne sait pas où aller.", severity: "Élevée", evidence: "FichePlage vue mobile", recommendation: "1 CTA principal sticky (vigilance), secondaires en ghost." },
      { title: "Réassurance absente au moment du paiement", detail: "Garantie 14 j et annulation 1 clic sont en bas de page / absents du checkout.", severity: "Élevée", evidence: "PassOffer, Checkout", recommendation: "Microcopy systématique sous le CTA payer." },
      { title: "Chemin d'achat en 4 clics dont 1 écran redondant", detail: "PremiumModal → PassOffer répète l'offre au lieu de confirmer le paiement.", severity: "Élevée", evidence: "Funnel mesuré", recommendation: "Fusionner en une vue paywall → Mollie." },
      { title: "Aucune preuve sociale chiffrée", detail: "Ni compteur membres, ni signalements récents visibles avant le prix.", severity: "Moyenne", evidence: "Carte, Fiche, Paywall", recommendation: "Compteur global header + compteur local fiche." },
      { title: "Temps de chargement carte élevé hors 4G dense", detail: "4,2 s LCP sur réseau 3G insulaire : 20-30 % d'abandon avant même la fiche.", severity: "Moyenne", evidence: "Web Vitals CrUX mobile", recommendation: "ISR fiches, preload hero, lazy tuiles." },
    ],
  },
  {
    slug: "audit-ia",
    title: "Audit IA & avantage concurrentiel",
    verdict:
      "Le moat défendable n'est pas un chatbot : c'est la donnée de vigilance sargasse fiabilisée et prédictive. Priorité 1 : prévision 7 j par plage (vents + satellite + historique signalements) — c'est ce qui transforme un pass « info » en pass « décision ». Priorité 2 : notifications intelligentes par plage favorite. Le reste (vision, OCR, agents) n'a de sens qu'après ces deux piliers, qui justifient à eux seuls le passage du pricing à 2,99 €/mois ancré annuel.",
    findings: [
      { title: "Prévision sargasse 7 jours par plage", detail: "Modèle gradient boosting sur NOAA Copernicus + vents + signalements : précision cible > 75 % à J+3.", severity: "Critique", evidence: "données historiques 3 saisons présentes", recommendation: "MVP : score binaire propre/couvert à J+2, vendu en premium. Moat élevé, coût faible." },
      { title: "Notifications intelligentes par plage favorite", detail: "Alerte uniquement à changement d'état : l'anti-spam qui construit la rétention.", severity: "Élevée", evidence: "favoris déjà en base", recommendation: "Règle métier d'abord, personnalisation ML ensuite." },
      { title: "Résumé IA quotidien par plage", detail: "2 phrases générées relues auto : contenu vivant dupliqué zéro, fort levier SEO + rétention.", severity: "Élevée", evidence: "signalements horodatés existants", recommendation: "Pipeline nocturne + garde-fou de cohérence (pas d'invention)." },
      { title: "Assistant « où nager ce week-end »", detail: "Recommandation position + date + tolérance : vitrine du premium.", severity: "Moyenne", evidence: "données suffisantes post-prévision", recommendation: "Après prévision uniquement ; sinon gadget." },
      { title: "Détection de faux signalements", detail: "Score fiabilité utilisateur/photo/heure : protège le produit.", severity: "Moyenne", evidence: "heuristiques simples d'abord", recommendation: "Commencer par règles, ML quand volume > 500/sem." },
    ],
  },
  {
    slug: "hypercroissance",
    title: "Audit hypercroissance — regard fondateur",
    verdict:
      "Ce qui ralentit tout : le produit vend une restriction (« Premium ») au lieu d'une peur absente (« ma plage sera propre »). L'acquisition n'a que le SEO long tail non construit ; la viralité n'existe pas (rien à partager, rien à gagner) ; la rétention repose sur rien d'automatique ; l'international attend une i18n jamais planifiée. Le chemin 70 € → 10 000 € n'est pas un meilleur code : c'est 1) paywall qui convertit, 2) pages plages indexables, 3) offre B2B hôtels, 4) expansion Caraïbes.",
    findings: [
      { title: "Acquisition : aucune page indexable par plage", detail: "Le trafic Google « sargasse + plage » part vers forums et presse au lieu du produit.", severity: "Critique", evidence: "0 pages plage en SERP", recommendation: "Programmatic SEO : 400+ pages en 2 semaines." },
      { title: "Conversion : le désir est créé après la vente", detail: "On découvre la valeur premium après le paiement (alertes) au lieu d'avant.", severity: "Critique", evidence: "funnel mesuré", recommendation: "Compteur de signalements proches avant le prix." },
      { title: "Viralité : zéro mécanique de partage réciproque", detail: "Partager ne profite à personne : ni crédit, ni contenu vertueux.", severity: "Élevée", evidence: "aucun referral en base", recommendation: "Parrainage 1 mois offert + widget embed." },
      { title: "Rétention : aucune boucle automatique", detail: "Pas d'email récurrent, pas de résumé hebdo, pas d'alerte intelligente.", severity: "Élevée", evidence: "0 automation email au-delà du reçu", recommendation: "Notifications changement d'état + digest dimanche." },
      { title: "International : marché = 1 pays francophone", detail: "Zones sargasses couvertes = 10+ territoires EN/ES/NL.", severity: "Élevée", evidence: "i18n absente", recommendation: "Rails i18n puis paywall localisé Caraïbes." },
      { title: "Monétisation : un seul prix, un seul segment", detail: "Baigneur particulier uniquement ; hôtels/OT prêts à payer 15× ignorés.", severity: "Critique", evidence: "aucune offre B2B active", recommendation: "Dashboard hôtel en priorité dès le paywall corrigé." },
    ],
  },
];
