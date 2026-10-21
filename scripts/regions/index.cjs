/**
 * scripts/regions/index.cjs — Registre des régions du déploiement Factory.
 *
 * Source unique de vérité pour la configuration des six régions déployées
 * sur Cloudflare Pages. Chaque région définit son identifiant, son nom,
 * son domaine de production, son dossier de préparation FTP et son identifiant
 * OneSignal.
 *
 * Utilisé par :
 *   - scripts/prepare-ftp.cjs   (préparation des dossiers FTP par région)
 *   - .github/workflows/cloudflare-production.yml  (build, deploy, verify)
 *   - scripts/lib/coast-zones.cjs    (zones côtières par île)
 *   - scripts/lib/cross-domain-drops.cjs (pages à exclure par région)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Registre des six régions déployées sur Cloudflare Pages.
 * Chaque entrée contient :
 *   - id        : identifiant unique (serve de clé dans les matrices GitHub Actions)
 *   - name      : nom lisible de la région
 *   - domain    : nom de domaine public (sans protocole)
 *   - ftpDir    : dossier de préparation relatif à la racine du repo
 *   - onesignalAppId : identifiant OneSignal pour les notifications push
 *   - beachFilter : optionnel, { island } pour filtrer les plages par île
 *   - beaches   : optionnel, liste explicite de plages (sinon filtrée depuis beaches-list.json par island)
 */
const REGIONS = [
  {
    id: 'mq',
    name: 'Martinique',
    domain: 'sargasses-martinique.com',
    ftpDir: 'martinique-ftp/',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_MQ || '',
    beachFilter: { island: 'mq' },
  },
  {
    id: 'gp',
    name: 'Guadeloupe',
    domain: 'sargasses-guadeloupe.com',
    ftpDir: 'guadeloupe-ftp/',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_GP || '',
    beachFilter: { island: 'gp' },
  },
  {
    id: 'puntacana',
    name: 'Punta Cana',
    domain: 'sargassumpuntacana.com',
    ftpDir: 'puntacana-ftp/',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_PUNTACANA || '',
    beachFilter: { island: 'puntacana' },
  },
  {
    id: 'florida',
    name: 'Floride / Miami',
    domain: 'sargassummiami.com',
    ftpDir: 'florida-ftp/',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_FLORIDA || '',
    beachFilter: { island: 'florida' },
  },
  {
    id: 'rivieramaya',
    name: 'Riviera Maya / Cancún',
    domain: 'sargassumcancun.com',
    ftpDir: 'rivieramaya-ftp/',
    onesignalAppId: process.env.ONESIGNAL_APP_ID_RIVIERAMAYA || '',
    beachFilter: { island: 'rivieramaya' },
  },
  {
    id: 'tulum',
    name: 'Tulum',
    domain: 'sargazotulum.com',
    ftpDir: 'tulum-ftp/',
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
    throw new Error(`Région inconnue : "${id}". Régions disponibles : ${[...REGIONS_BY_ID.keys()].join(', ')}`);
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
 * Valide que toutes les régions ont les champs obligatoires.
 * Lance si une région manque un champ.
 *
 * Ne vérifie PAS l'existence des dossiers FTP : ils sont créés par
 * prepare-ftp.cjs APRÈS cette validation dans le pipeline CI.
 */
function assertAllRegionsValid() {
  const REQUIRED_FIELDS = ['id', 'name', 'domain', 'ftpDir'];
  const errors = [];

  for (const region of REGIONS) {
    for (const field of REQUIRED_FIELDS) {
      if (!region[field]) {
        errors.push(`Région "${region.id}" : champ manquant "${field}"`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Erreur de validation des régions :');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

module.exports = {
  getRegion,
  getAllRegions,
  getBuildRegion,
  assertAllRegionsValid,
  REGIONS,
};
