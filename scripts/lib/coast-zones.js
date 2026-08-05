/**
 * COAST_ZONES — Zones côtières par région pour le ciblage initial de la carte
 * Utilisé par WorldMapView, ArchipelView, Sargasses_PROD pour centrer la vue
 * sur la zone pertinente (ex: "sud-caraibe", "nord-atlantique", etc.)
 * Source : data OSM + connaissance locale (cf. build-region-outlines.cjs)
 */

export const COAST_ZONES = {
  mq: [
    { slug: "sud-caraibe", name: "Sud Caraïbe", communes: ["Sainte-Anne", "Le Marin", "Sainte-Luce", "Le Diamant", "Rivière-Salée", "Les Trois-Îlets"] },
    { slug: "nord-caraibe", name: "Nord Caraïbe", communes: ["Fort-de-France", "Schœlcher", "Case-Pilote", "Bellefontaine", "Le Carbet", "Saint-Pierre", "Le Prêcheur"] },
    { slug: "est-atlantique", name: "Est Atlantique", communes: ["La Trinité", "Le Robert", "Le François", "Le Vauclin", "Saint-Esprit", "Ducos"] },
    { slug: "sud-atlantique", name: "Sud Atlantique", communes: ["Rivière-Pilote", "Saint-Joseph", "Le Lamentin", "Ducos"] },
  ],
  gp: [
    { slug: "basse-terre-sous-le-vent", name: "Basse-Terre Sous-le-Vent", communes: ["Bouillante", "Pointe-Noire", "Deshaies", "Vieux-Habitants", "Gourbeyre", "Vieux-Fort"] },
    { slug: "basse-terre-au-vent", name: "Basse-Terre Au-Vent", communes: ["Capesterre-Belle-Eau", "Sainte-Rose", "Lamentin", "Baillif"] },
    { slug: "grande-terre-sud", name: "Grande-Terre Sud", communes: ["Le Gosier", "Sainte-Anne", "Saint-François", "La Désirade"] },
    { slug: "grande-terre-nord", name: "Grande-Terre Nord", communes: ["Le Moule", "Port-Louis", "Anse-Bertrand", "Morne-à-l'Eau", "Les Abymes"] },
    { slug: "marie-galante", name: "Marie-Galante", communes: ["Grand-Bourg", "Capesterre-de-Marie-Galante", "Saint-Louis"] },
    { slug: "les-saintes", name: "Les Saintes", communes: ["Terre-de-Haut", "Terre-de-Bas"] },
  ],
  florida: [
    { slug: "keys", name: "Florida Keys", communes: ["Key West", "Marathon", "Islamorada", "Key Largo"] },
    { slug: "southeast", name: "Southeast Florida", communes: ["Miami", "Fort Lauderdale", "West Palm Beach", "Boca Raton"] },
    { slug: "southwest", name: "Southwest Florida", communes: ["Naples", "Fort Myers", "Sanibel", "Captiva"] },
  ],
  puntacana: [
    { slug: "punta-cana", name: "Punta Cana", communes: ["Punta Cana", "Bávaro", "Cap Cana", "Uvero Alto"] },
    { slug: "la-romana", name: "La Romana", communes: ["La Romana", "Bayahibe", "Dominicus"] },
  ],
  rivieramaya: [
    { slug: "cancun", name: "Cancún", communes: ["Cancún", "Puerto Morelos", "Isla Mujeres"] },
    { slug: "playa-del-carmen", name: "Playa del Carmen", communes: ["Playa del Carmen", "Puerto Aventuras", "Akumal"] },
    { slug: "tulum", name: "Tulum", communes: ["Tulum", "Tankah", "Soliman Bay"] },
    { slug: "cozumel", name: "Cozumel", communes: ["Cozumel", "San Miguel"] },
  ],
  barbados: [
    { slug: "west-coast", name: "West Coast (Platinum Coast)", communes: ["Holetown", "Speightstown", "Paynes Bay", "Sandy Lane"] },
    { slug: "south-coast", name: "South Coast", communes: ["St. Lawrence Gap", "Oistins", "Dover", "Rockley"] },
    { slug: "east-coast", name: "East Coast", communes: ["Bathsheba", "Martin's Bay", "Cattlewash"] },
  ],
}