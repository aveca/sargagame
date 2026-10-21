/**
 * scripts/regions/index.cjs — Registre des régions du déploiement Factory.
 *
 * Source unique de vérité pour la configuration des six régions déployées
 * sur Cloudflare Pages. Chaque région définit son identifiant, son nom,
 * son domaine de production, son dossier de préparation FTP et son
 * identifiant OneSignal.
 *
 * Utilisé par :
 *   - scripts/prepare-ftp.cjs   (préparation des dossiers FTP par région)
 *   - scripts/manual-ftp-deploy.cjs  (déploiement FTP par région)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Champs obligatoires pour chaque entrée du registre régional.
 */
const REQUIRED_FIELDS = ['id', 'name', 'domain', 'ftpDir'];

/**
 * Registre des six régions déployées sur Cloudflare Pages.
 *
 * Les valeurs ftpDir ne portent PAS de slash final, pour être cohérentes
 * avec le registre racine regions/<id>.json et avec l'usage de path.join()
 * dans les consommateurs (prepare-ftp.cjs, manual-ftp-deploy.cjs).
 */
const REGIONS = [
  {
    id: 'mq',
    name: 'Martinique',
    domain: 'sargasses-martinique.com',
    ftpDir: 'martinique-ftp',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_MQ || '',
    beachFilter: { island: 'mq' },
  },
  {
    id: 'gp',
    name: 'Guadeloupe',
    domain: 'sargasses-guadeloupe.com',
    ftpDir: 'guadeloupe-ftp',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_GP || '',
    beachFilter: { island: 'gp' },
  },
  {
    id: 'puntacana',
    name: 'Punta Cana',
    domain: 'sargassumpuntacana.com',
    ftpDir: 'puntacana-ftp',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_PUNTACANA || '',
    beachFilter: { island: 'puntacana' },
  },
  {
    id: 'florida',
    name: 'Floride / Miami',
    domain: 'sargassummiami.com',
    ftpDir: 'florida-ftp',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_FLORIDA || '',
    beachFilter: { island: 'florida' },
  },
  {
    id: 'rivieramaya',
    name: 'Riviera Maya / Cancún',
    domain: 'sargassumcancun.com',
    ftpDir: 'rivieramaya-ftp',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_RIVIERAMAYA || '',
    beachFilter: { island: 'rivieramaya' },
  },
  {
    id: 'tulum',
    name: 'Tulum',
    domain: 'sargazotulum.com',
    ftpDir: 'tulum-ftp',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_TULUM || '',
    beachFilter: { island: 'tulum' },
  },
];

// Index par id pour lookup en O(1)
const REGIONS_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

/**
 * Retourne la configuration d'une région par son identifiant.
 * Lance si la région n'existe pas.
 */
function getRegion(id) {
  const region = REGIONS_BY_ID.get(id);
  if (!region) {
    throw new Error(
      `Région inconnue : "${id}". Régions disponibles : ${[
        ...REGIONS_BY_ID.keys(),
      ].join(', ')}`,
    );
  }
  return region;
}

/**
 * Retourne toutes les régions configurées.
 */
function getAllRegions() {
  return [...REGIONS];
}

/**
 * Retourne la région de build courante.
 * Lit VITE_REGION puis REGION (variables d'environnement), défaut 'mq'.
 */
function getBuildRegion() {
  const id = process.env.VITE_REGION || process.env.REGION || 'mq';
  return getRegion(id);
}

/**
 * Valide qu'une configuration de région possède tous les champs obligatoires.
 * Fonction pure : ne lit pas le registre statique, ne sort pas du processus.
 * Lance une erreur dès qu'un champ requis est manquant ou vide.
 *
 * @param {Object} region - configuration de région à valider
 * @param {string[]} requiredFields - liste des champs obligatoires
 * @throws {Error} si un champ est manquant ou vide
 */
function validateRegion(region, requiredFields = REQUIRED_FIELDS) {
  if (!region || typeof region !== 'object') {
    throw new Error('Région invalide : configuration attendue, reçu ' + typeof region);
  }
  const errors = [];
  for (const field of requiredFields) {
    if (!region[field]) {
      errors.push(`Région "${region.id || '(inconnu)'}" : champ manquant "${field}"`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      'Erreur de validation des régions :\n  - ' + errors.join('\n  - ')
    );
  }
}

/**
 * Valide que toutes les régions du registre ont les champs obligatoires.
 * Lance si une région manque un champ.
 *
 * Ne vérifie PAS l'existence des dossiers FTP : ils sont créés par
 * prepare-ftp.cjs APRÈS cette validation dans le pipeline CI.
 */
function assertAllRegionsValid() {
  for (const region of REGIONS) {
    validateRegion(region);
  }
}

module.exports = {
  getRegion,
  getAllRegions,
  getBuildRegion,
  validateRegion,
  assertAllRegionsValid,
  REQUIRED_FIELDS,
  REGIONS,
};
