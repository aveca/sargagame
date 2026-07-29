import type { ImprovementSeed } from "./paywall";

// La ligne [titre, desc, catégorie, roi, effort, risque, €/mois, detteTech, ux, seo, perf, ia, auto, mission]
function s(
  t: string, d: string, cat: string, roi: number, eff: number,
  risk: "Faible" | "Moyen" | "Élevé", rev: number,
  dt: number, ux: number, seo: number, perf: number, ia: number, auto: number,
  m: string
): ImprovementSeed {
  return { t, d, cat, roi, eff, risk, rev, dt, ux, seo, perf, ia, auto, m };
}

export const BACKLOG_80: ImprovementSeed[] = [
  // ─── Mission : backlog-roi (CTO) — 40 items ───
  s("Pages SEO programmatiques une URL par plage", "Une page indexable par plage (état sargasse live, météo, signalements) : capte le long tail « sargasse + nom plage ».", "SEO", 95, 5, "Faible", 260, 10, 20, 100, 20, 40, 80, "backlog-roi"),
  s("Suppression de toute la dette Stripe résiduelle", "Code mort, webhooks, env vars et doc : réduit la surface de risque et les confusions au checkout Mollie.", "Dette tech", 93, 3, "Faible", 30, 100, 0, 0, 10, 0, 20, "backlog-roi"),
  s("Webhooks Mollie idempotents avec DLQ", "Un webhook perdu = un client payé sans accès = un remboursement. Idempotency key + dead-letter queue + replay manuel.", "Fiabilité", 92, 4, "Moyen", 90, 40, 0, 0, 0, 0, 80, "backlog-roi"),
  s("SLO + alertes sur le funnel de paiement", "Alerte Slack si conversion checkout < seuil ou si aucun paiement réussi en 24 h : un bug checkout ne coûte plus un week-end.", "Fiabilité", 90, 3, "Faible", 70, 20, 0, 0, 0, 20, 90, "backlog-roi"),
  s("Schema.org Beach + TouristAttraction sur les fiches", "Rich snippets dans Google (note, météo, vigilance) : CTR organique +20-40 % sur les requêtes plage.", "SEO", 88, 2, "Faible", 120, 0, 10, 95, 0, 50, 70, "backlog-roi"),
  s("ISR sur les fiches plage avec revalidation 60 s", "Fiches servies depuis le CDN, revalidées toutes les minutes : LCP < 1 s partout, y compris réseaux insulaires.", "Performance", 86, 3, "Faible", 45, 20, 10, 40, 95, 0, 70, "backlog-roi"),
  s("Images AVIF + srcset sur photos plages", "Photos = 60 % du poids des pages : AVIF et tailles adaptatives divisent le transfert par 3-4.", "Performance", 85, 2, "Faible", 35, 0, 20, 30, 100, 0, 60, "backlog-roi"),
  s("Consent Mode v2 + bandeau RGPD propre", "Prérequis pour mesurer l'acquisition payante en Europe et dormir tranquille côté RGPD / territorialités DOM.", "Conformité", 84, 3, "Moyen", 40, 20, 0, 20, 0, 0, 60, "backlog-roi"),
  s("Rate limiting + modération sur les signalements", "Les fausses alertes tuent la confiance : quota par device, scoring heuristique, file de modération.", "Confiance", 83, 4, "Moyen", 55, 20, 30, 0, 0, 30, 70, "backlog-roi"),
  s("Tests e2e du chemin d'achat complet", "Playwright : carte → fiche → paywall → Mollie (mode test) → post-paiement. Régression paywall détectée en CI.", "Qualité", 82, 4, "Faible", 60, 30, 0, 0, 0, 0, 90, "backlog-roi"),
  s("Feature flags sur le paywall et le pricing", "Pouvoir activer/désactiver un plan ou un wording sans déploiement : prérequis à toute itération de conversion.", "Outilage", 81, 3, "Faible", 50, 20, 0, 0, 0, 0, 80, "backlog-roi"),
  s("Sitemap dynamique plages + index.now", "Génération automatique à chaque nouvelle plage, ping moteurs : nouvelles plages indexées en heures, pas en semaines.", "SEO", 80, 2, "Faible", 70, 10, 0, 90, 0, 20, 90, "backlog-roi"),
  s("Emails transactionnels propres (reçu, bienvenue)", "Reçu clair + email bienvenue vendeur (active la vigilance en 1 clic). Réduit litiges + remboursements.", "Emails", 79, 3, "Faible", 45, 0, 50, 0, 0, 0, 90, "backlog-roi"),
  s("Budget Web Vitals en CI", "Échec de build si LCP > 2,5 s sur fiche mobile ou bundle > 220 ko gzip : la perf ne se dégrade plus en silence.", "Performance", 77, 2, "Faible", 25, 20, 0, 10, 90, 0, 80, "backlog-roi"),
  s("Pool de connexions DB partagé + limites explicites", "Évite l'épuisement de connexions en pic (week-end + météo) — incident classique des apps saisonnières.", "Fiabilité", 76, 2, "Faible", 30, 40, 0, 0, 40, 0, 30, "backlog-roi"),
  s("Mode hors-ligne PWA pour la carte", "Carte des plages consultables sans réseau (4G insulaire instable) : rétention et avis app vus positivement.", "Mobile", 75, 5, "Moyen", 60, 30, 70, 0, 30, 0, 40, "backlog-roi"),
  s("Design tokens + composants UI factorisés", "Sortir le style inline dispersé : vitesse d'exécution des quick wins ×2 et cohérence du paywall.", "Dette tech", 74, 4, "Faible", 20, 60, 40, 0, 0, 0, 30, "backlog-roi"),
  s("Skeleton screens sur fiche et paywall", "Perception de rapidité immédiate sur mobile 3G : -10-15 % d'abandon au chargement observé hors benchmark.", "UX", 73, 2, "Faible", 25, 0, 70, 0, 40, 0, 20, "backlog-roi"),
  s("Accessibilité AA sur fiches et checkout", "Contraste, focus clavier, aria-labels : élargit l'audience et prépare de bons signaux SEO.", "UX", 72, 3, "Faible", 20, 20, 60, 20, 10, 0, 10, "backlog-roi"),
  s("Infrastructure i18n (EN/ES/NL) hors contenu marketing", "Les rails linguistiques AVANT les traductions : évite le big-bang quand vient l'expansion Caraïbes.", "i18n", 71, 4, "Moyen", 50, 30, 30, 60, 0, 10, 40, "backlog-roi"),
  s("Edge cache des tuiles carte autour des zones denses", "Réduit latence carte et coûts de tuiles pendant les pics de recherches météo/sargasses.", "Performance", 70, 3, "Moyen", 25, 10, 10, 10, 80, 0, 60, "backlog-roi"),
  s("Enquête de churn à la résiliation", "1 question, 4 choix : alimente le backlog de rétention avec les causes réelles, pas des suppositions.", "Rétention", 69, 1, "Faible", 30, 0, 30, 0, 0, 20, 70, "backlog-roi"),
  s("Backups PITR quotidiens testés mensuellement", "Un restore testé par mois : la base signalements + abonnements est l'actif central du produit.", "Sécurité", 68, 2, "Faible", 15, 30, 0, 0, 0, 0, 90, "backlog-roi"),
  s("Journal d'audit des actions B2B", "Tracer qui a modifié quoi côté comptes hôtels/partenaires : préalable à la vente B2B sérieuse.", "Sécurité", 66, 3, "Faible", 20, 30, 0, 0, 0, 0, 80, "backlog-roi"),
  s("OG images dynamiques par plage", "Chaque partage de fiche affiche une image générée (photo + vigilance + date) : clics sociaux ×2-3.", "Viralité", 65, 3, "Faible", 40, 10, 30, 40, 10, 40, 80, "backlog-roi"),
  s("Sanctuarisation de l'env : scan de secrets en CI", "Bloque toute clé Mollie/DB commitée par accident ; rotation documentée.", "Sécurité", 64, 2, "Faible", 10, 50, 0, 0, 0, 0, 90, "backlog-roi"),
  s("Formulaire DSR RGPD self-service", "Export/suppression des données en un lien : obligation légale, 1 journée de dev, zéro maintenance.", "Conformité", 62, 2, "Faible", 5, 20, 0, 5, 0, 0, 80, "backlog-roi"),
  s("Revue des dépendances + lockfile sain", "Supprimer les paquets non utilisés, maj des majeures planifiées : réduit coût futur de toute maintenance.", "Dette tech", 60, 3, "Faible", 5, 70, 0, 0, 20, 0, 40, "backlog-roi"),
  s("Déduplication logique géocodage plages", "Deux implémentations distinctes (carte vs recherche) : unifier pour fiabiliser distances et filtres.", "Dette tech", 58, 3, "Faible", 10, 50, 20, 0, 20, 10, 20, "backlog-roi"),
  s("Tests de charge sur jours météo extrêmes", "Simuler le pic « dimanche chaud + alerte sargasse » : identifier le goulot avant qu'il ne casse un dimanche.", "Fiabilité", 56, 3, "Faible", 15, 20, 0, 0, 60, 0, 60, "backlog-roi"),
  s("Monitoring des coûts par requête carte", "Suivre coût tuiles + compute par session : les marges du pass week-end se jouent là.", "Ops", 54, 2, "Faible", 15, 10, 0, 0, 30, 0, 80, "backlog-roi"),
  s("Refonte du composant FichePlage (1300 lignes)", "Découper en sections autonomes : toute évolution paywall/paylater devient 3× moins risquée.", "Dette tech", 52, 5, "Moyen", 10, 80, 30, 0, 20, 0, 10, "backlog-roi"),
  s("Normalisation des statuts d'abonnement", "États Mollie vs états internes réconciliés en une machine d'état unique : fin des « payé mais pas actif ».", "Fiabilité", 50, 4, "Moyen", 40, 40, 10, 0, 0, 0, 70, "backlog-roi"),
  s("Élimination des imports circulaires carte ↔ fiche", "6 cycles détectés : fragilisent le tree-shaking et les cold starts des routes fiches.", "Dette tech", 48, 3, "Faible", 5, 60, 0, 0, 30, 0, 20, "backlog-roi"),
  s("Migration des routes API vers handlers typés", "Contrats de réponse explicites côté signalements/paiements : moins de régressions silencieuses.", "Qualité", 44, 4, "Faible", 10, 30, 0, 0, 20, 0, 40, "backlog-roi"),
  s("Runbook incidents paiement", "Que faire quand Mollie est down / webhook en retard / remboursement masse : décision en minutes, pas en heures.", "Ops", 42, 1, "Faible", 10, 10, 0, 0, 0, 0, 40, "backlog-roi"),
  s("Docs d'architecture à jour (ADR)", "ADR courts pour paywall, geodonnées, webhooks : tout futur agent/dev gagne des jours d'embarquement.", "Ops", 40, 2, "Faible", 10, 20, 0, 0, 0, 0, 60, "backlog-roi"),
  s("Télémétrie d'usage des filtres carte", "Quels filtres mènent à la fiche puis au paiement : concentre l'effort UX là où ça vend.", "Analytics", 38, 2, "Faible", 20, 10, 30, 10, 0, 30, 60, "backlog-roi"),
  s("Nettoyage des routes mortes identifiées", "9 routes non référencées dans l'app mais exposées : surface d'attaque et confusion SEO.", "Sécurité", 34, 1, "Faible", 5, 50, 0, 10, 10, 0, 30, "backlog-roi"),
  s("Convention de nommage B2B vs B2C dans le code", "Préfixer proprement : évite le couplage accidentel entre back-office hôtels et app publique.", "Dette tech", 30, 2, "Faible", 5, 40, 0, 0, 0, 0, 20, "backlog-roi"),

  // ─── Mission : quick-wins — 15 items ───
  s("CTA carte reformulé en bénéfice court", "« Vigilance sargasse » au lieu de « Premium » dans le header carte : le mot vendu = la valeur, pas la mécanique.", "Copywriting", 90, 1, "Faible", 55, 0, 70, 0, 0, 0, 0, "quick-wins"),
  s("Compteur global de membres en header", "« 4 812 baigneurs et kitesurfeurs alertés » : la preuve sociale la plus simple à implémenter de tout le repo.", "Confiance", 86, 1, "Faible", 45, 0, 50, 10, 0, 0, 60, "quick-wins"),
  s("Ordre des informations de la fiche plage inversé", "Vigilance sargasse d'abord, météo ensuite, description après : vendre avant d'informer gratuitement.", "UX", 84, 1, "Faible", 40, 0, 80, 0, 0, 0, 0, "quick-wins"),
  s("Un seul CTA principal par écran", "Aujourd'hui 3 boutons se concurrencent sur la fiche : hiérarchie visuelle 1 principal + 1 discret maximum.", "UX", 82, 1, "Faible", 35, 0, 85, 0, 0, 0, 0, "quick-wins"),
  s("Pré-remplissage email dans le checkout Mollie", "Email capté dès la fiche plage (avec consentement) → checkout pré-rempli : une friction saisie en moins.", "Checkout", 79, 2, "Faible", 30, 0, 40, 0, 0, 0, 60, "quick-wins"),
  s("Animation du compteur de signalements proches", "Le chiffre grandit au scroll avec pulse : attire l'œil vers l'urgence sans dark pattern.", "UX", 74, 1, "Faible", 20, 0, 60, 0, 0, 10, 40, "quick-wins"),
  s("Titres de page dynamiques « Sargasse à {plage} — état ce matin »", "Titres SERP vivants qui se mettent à jour : CTR organique et mémorisation marque.", "SEO", 72, 2, "Faible", 35, 0, 0, 70, 0, 60, 70, "quick-wins"),
  s("Bouton partage fiche plage en premier écran", "Partage WhatsApp natif : chaque baigneur qui partage vend le produit à son groupe.", "Viralité", 70, 1, "Faible", 30, 0, 40, 0, 0, 0, 40, "quick-wins"),
  s("Prix du plan annuel affiché « /mois » partout", "Rendre comparable avec le mensuel, y compris sur la carte et les emails : moins de surprise au checkout.", "Pricing", 68, 1, "Faible", 25, 0, 30, 0, 0, 0, 20, "quick-wins"),
  s("Lien média/presse vu en zone sargasse sur le paywall", "Si couverture presse locale : badge « vu sur France-Antilles / ABC » ancre la crédibilité géographique.", "Confiance", 64, 1, "Moyen", 20, 0, 30, 5, 0, 0, 0, "quick-wins"),
  s("Email bienvenue qui vend dès le J0 gratuit", "Même sans payer, l'email J0 montre la vigilance en action → création du désir premium naturel.", "Emails", 62, 1, "Faible", 20, 0, 30, 0, 0, 0, 80, "quick-wins"),
  s("LCP hero fiche plage préchargé", "Première photo plage en preload + fetchpriority : gain LCP immédiat mesurable sur mobile.", "Performance", 58, 1, "Faible", 15, 0, 20, 0, 80, 0, 30, "quick-wins"),
  s("Pastille « annulable à tout moment » partout où le prix apparaît", "Récurrent dans les audits conversion : la réassurance résiliation fait +5-10 % à elle seule.", "Confiance", 55, 1, "Faible", 20, 0, 30, 0, 0, 0, 0, "quick-wins"),
  s("Paywall affiché en langue du navigateur", "Avant même l'i18n complète : FR/EN bascule le copy du paywall uniquement, gain rapide expat/touristes.", "i18n", 50, 1, "Faible", 20, 0, 30, 20, 0, 20, 50, "quick-wins"),
  s("Cohérence de prix entre emails, paywall et checkout", "Un seul composant pricing source de vérité : élimine les écarts qui font fuir au dernier moment.", "Pricing", 46, 2, "Faible", 15, 10, 20, 0, 0, 0, 40, "quick-wins"),

  // ─── Mission : audit-ia — 12 items ───
  s("Prévision sargasse 7 j par plage (modèle vents + satellite)", "Le différenciateur majeur : « prévu propre ce week-end » paye l'abonnement annuel à lui seul. Moat données.", "IA", 89, 8, "Moyen", 320, 20, 30, 60, 10, 100, 60, "audit-ia"),
  s("Résumé IA quotidien de l'état sargasse par plage", "Synthèse en 2 phrases des signalements + météo : contenu vivant sans rédaction, boost retention + SEO.", "IA", 84, 3, "Faible", 120, 10, 40, 70, 0, 90, 90, "audit-ia"),
  s("Assistant « Où nager ce week-end ? »", "Réponse personnalisée par position/date/tolérance : l'outil de conversion premium le plus vendeur.", "IA", 82, 6, "Moyen", 180, 20, 60, 40, 0, 95, 50, "audit-ia"),
  s("Notifications intelligentes personnalisées", "Alerte uniquement quand la plage favorite d'un membre change d'état : ouvre la rétention sans spam.", "IA", 80, 4, "Faible", 110, 10, 50, 0, 0, 90, 95, "audit-ia"),
  s("Vision : détection sargasse sur photos communautaires", "Estimation automatique de couverture depuis les photos signalées : fiabilise et enrichit les données.", "IA", 74, 7, "Élevé", 100, 30, 20, 30, 0, 95, 80, "audit-ia"),
  s("Génération des descriptions SEO des pages plage", "Programmatic SEO assisté : chaque fiche avec texte unique de qualité, relu une fois par lot.", "IA", 72, 3, "Faible", 110, 10, 10, 80, 0, 90, 90, "audit-ia"),
  s("Scoring de propension premium", "Prédire quels comptes gratuits sont le plus susceptibles de payer → timing paywall + offres ciblées.", "IA", 68, 5, "Moyen", 90, 10, 30, 0, 0, 90, 80, "audit-ia"),
  s("Détection automatique des faux signalements", "Score de fiabilité par utilisateur/photo/heure : protège la promesse produit (données fiables).", "IA", 66, 4, "Moyen", 50, 20, 30, 10, 0, 85, 85, "audit-ia"),
  s("Traduction auto des signalements et avis", "Communauté multilingue Caraïbes : chaque signalement lisible en FR/EN/ES/NL.", "IA", 60, 3, "Faible", 40, 10, 40, 50, 0, 85, 85, "audit-ia"),
  s("Agent support FAQ paywall & remboursements", "Répond aux questions achat/résiliation en 30 s : sauve des ventes perdues à l'hésitation.", "IA", 56, 3, "Faible", 45, 10, 40, 0, 0, 85, 90, "audit-ia"),
  s("OCR des panneaux municipaux plage", "Extraire horaires/interdictions des photos de panneaux : contenu de confiance additionnel par plage.", "IA", 40, 5, "Moyen", 15, 10, 20, 30, 0, 80, 70, "audit-ia"),
  s("Réponses auto aux avis B2B hôtels (brouillon)", "Gain de temps partenaires → rétention B2B. L'humain valide, l'IA rédige.", "IA", 32, 2, "Faible", 25, 0, 10, 0, 0, 70, 80, "audit-ia"),

  // ─── Mission : hypercroissance — 13 items ───
  s("Offre B2B : dashboard sargasse pour hôtels", "Les hôtels paient 15× plus qu'un baigneur : carte pro, alertes multi-plages, exports. Canal qui change le MRR d'un cran.", "B2B", 94, 6, "Moyen", 450, 30, 30, 60, 0, 40, 60, "hypercroissance"),
  s("Programme de parrainage (1 mois offert par filleul)", "Croissance bouclée sur les cohortes week-end : la base communautaire existe déjà, rien à acheter en pub.", "Viralité", 88, 3, "Faible", 190, 20, 40, 20, 0, 30, 90, "hypercroissance"),
  s("Widget carte embarquable pour blogs et offices de tourisme", "Iframe live « état sargasse » avec attribution : acquisition gratuite + backlinks SEO massifs.", "Viralité", 85, 4, "Faible", 160, 10, 20, 80, 10, 20, 90, "hypercroissance"),
  s("Ouverture SEO multi-pays Caraïbes (EN/ES)", "Répliquer le playbook pages plages sur Martinique, Guadeloupe, Barbados, Bonaire : marché ×10.", "International", 83, 6, "Moyen", 280, 30, 20, 100, 0, 60, 80, "hypercroissance"),
  s("Partenariats offices de tourisme & fédérations kitesurf", "Diffusion co-brandée de la vigilance : crédibilité locale + volume de signalements entrant.", "Acquisition", 78, 4, "Moyen", 120, 10, 20, 50, 0, 10, 40, "hypercroissance"),
  s("App mobile en wrapper (Capacitor) sur les stores", "La présence store = canal d'acquisition + push natifs + paiement in-app à tester en parallèle.", "Mobile", 76, 6, "Moyen", 200, 30, 50, 30, 10, 20, 50, "hypercroissance"),
  s("Boucle presse saisonnière sargasse", "Données vivantes = articles récurrents : chaque saison sargasse devient un cycle d'acquisition gratuit.", "Acquisition", 72, 3, "Faible", 90, 0, 10, 60, 0, 40, 70, "hypercroissance"),
  s("API publique freemium des données sargasses", "Développeurs/médias construisent dessus : notoriété, backlinks, futur canal B2B premium.", "B2B", 70, 5, "Moyen", 110, 30, 10, 70, 20, 30, 90, "hypercroissance"),
  s("Annonces Google sur « sargasse + destination » en saison", "Intent chaud, CPC faible hors US : rentable dès que le paywall convertit > 2 %.", "Acquisition", 68, 2, "Moyen", 100, 0, 10, 40, 0, 10, 90, "hypercroissance"),
  s("Dashboard MRR/churn public façon Indie Hacker", "La transparence attire la communauté build-in-public qui partage et achète : momentum marketing gratuit.", "Acquisition", 58, 2, "Faible", 40, 0, 20, 20, 0, 0, 80, "hypercroissance"),
  s("Chaîne TikTok/Reels : timelapse plages propre/couverte", "Format addictif généré depuis les données : chaque vidéo tend vers la carte premium.", "Acquisition", 54, 3, "Moyen", 70, 0, 20, 30, 0, 60, 90, "hypercroissance"),
  s("Affiliation locations & excursions « plage propre garantie »", "Monétise le trafic gratuit qui ne paiera jamais le pass : revenu complémentaire par commission.", "Monétisation", 48, 4, "Moyen", 60, 10, 10, 20, 0, 20, 80, "hypercroissance"),
  s("Dossier de sponsoring météo locale", "La vigilance sargasse sponsorisée par une marque locale : revenu média hors paywall.", "Monétisation", 36, 3, "Moyen", 80, 0, 10, 10, 0, 10, 40, "hypercroissance"),
];

// Assemblage : 20 paywall + 80 = 100 améliorations.
import { PAYWALL_20 } from "./paywall";

export const SEED_IMPROVEMENTS: ImprovementSeed[] = [...PAYWALL_20, ...BACKLOG_80];
