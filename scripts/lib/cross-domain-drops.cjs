/**
 * Source UNIQUE des pages SEO « mono-domaine » à ne JAMAIS laisser sur l'autre
 * île — ni dans le build (prepare-ftp.cjs en supprime la copie dist/), ni sur
 * le serveur FTP distant (purge-cross-domain-residues.cjs les retire live).
 *
 * Chaque slug appartient à UN seul domaine. S'il atterrit sur l'autre domaine,
 * il y sert un éditorial swappé (contenu de l'autre île) avec un canonical
 * auto-référent → duplicate-content cross-domain indexable = le blocker #1
 * historique « Discovered, currently not indexed » (cf. memory
 * project_gsc_indexation_gap).
 *
 * Pourquoi un module dédié : ces deux listes étaient dupliquées dans
 * vite.config.js ET prepare-ftp.cjs ; le drop ne s'appliquait qu'au packaging
 * (dist/), pas au serveur — un slug retiré d'une île après avoir été déjà
 * déployé y restait orphelin (résidu 2026-06-19 : saison-sargasses-martinique
 * servi sur le domaine GP). Centraliser ici rend le garde-fou serveur
 * authoritatif et évite une 3e copie.
 *
 * ⚠️ vite.config.js garde encore sa propre copie inline (ESM, build) — garder
 * les trois en phase tant qu'elle n'est pas dédupliquée.
 */

// Pages 100% Martinique : interdites sur le domaine Guadeloupe.
const MQ_ONLY = [
  'saison-sargasses-martinique',
  'sargasses-martinique-cette-semaine',
  'meteo-sargasses-martinique',
  'meilleures-plages-martinique-sargasses',
  'en/best-beaches-martinique',
  'bulletin-sargasses-martinique',
  'sargasses-le-diamant',
  'sargasses-sainte-luce',
  'sargasses-sainte-anne-martinique',
  'sargasses-les-trois-ilets',
  'que-faire-sargasses-martinique',
  'en/what-to-do-sargassum-martinique',
]

// Pages 100% Guadeloupe : interdites sur le domaine Martinique.
const GP_ONLY = [
  'saison-sargasses-guadeloupe',
  'sargasses-guadeloupe-cette-semaine',
  'meteo-sargasses-guadeloupe',
  'meilleures-plages-guadeloupe-sargasses',
  'en/best-beaches-guadeloupe',
  'bulletin-sargasses-guadeloupe',
  'que-faire-sargasses-guadeloupe',
  'en/what-to-do-sargassum-guadeloupe',
  // Cluster communes GP (hub-and-spoke vers les fiches plage GP) — étaient déjà
  // dans prepare-ftp.cjs (drop du build) mais PAS ici → la purge serveur les
  // laissait orphelines sur MQ (résidu 200, canonical auto-référent). 2026-06-21.
  'sargasses-deshaies',
  'sargasses-sainte-anne-guadeloupe',
  'sargasses-gosier',
  'sargasses-saint-francois',
  'sargasses-bouillante',
]

// Slugs à supprimer pour une région donnée (= les pages de l'AUTRE île).
// gp → on retire les MQ_ONLY ; mq → on retire les GP_ONLY ; régions USD → rien
// (elles ne partagent pas ces pages SEO FR/EN MQ-GP).
function crossDomainDropsFor(regionId) {
  if (regionId === 'gp') return MQ_ONLY
  if (regionId === 'mq') return GP_ONLY
  return []
}

module.exports = { MQ_ONLY, GP_ONLY, crossDomainDropsFor }
