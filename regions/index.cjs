/**
 * regions/index.cjs — Source de vérité unique des régions Sargasses.
 * Consommé par vite.config.js, scripts/prepare-ftp.cjs, scripts/manual-ftp-deploy.cjs.
 * Le runtime (Sargasses_PROD.jsx) reçoit UNE région via l'injection vite `define` __REGION__.
 *
 * Une région = un fichier regions/<id>.json = un domaine = un dossier FTP.
 * Ajout d'une région = déposer un JSON conforme à _schema.json. Zéro constante dupliquée ailleurs.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
let _cache = null;

// Régions REVENUE-CRITIQUES : un JSON cassé ici DOIT stopper le build (jamais de
// skip silencieux — on ne déploie pas un site cœur cassé). Les régions USD/
// expérimentales, elles, sont ISOLÉES (skip + warn) pour qu'une seule d'entre
// elles ne fasse pas tomber tout le deploy MQ/GP.
const CORE_REGIONS = new Set(['mq', 'gp']);

// Contrat minimal aligné sur regions/_schema.json. Gardé explicite pour que
// le workflow puisse refuser une configuration incomplète sans dépendance
// externe de validation JSON Schema.
const REQUIRED_REGION_FIELDS = Object.freeze([
  'id', 'name', 'country', 'domain', 'ftpDir', 'primaryLang',
  'currency', 'timezone', 'bbox', 'center', 'emails', 'beachFilter', 'routes',
]);
const VALID_PRIMARY_LANGS = new Set(['fr', 'en', 'es']);
const VALID_CURRENCIES = new Set(['EUR', 'USD']);

/** Valide une config région (throw si invalide). `seen` = map id→… pour détecter
 *  les doublons. Partagé par loadAll (résilient) et assertAllRegionsValid (strict). */
function validateRegion(cfg, f, seen) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || typeof cfg.id !== 'string' || !cfg.id.trim()) {
    throw new Error(`[regions] ${f} sans champ "id" valide`);
  }
  if (!/^[a-z]{2,12}$/.test(cfg.id)) {
    throw new Error(`[regions] ${f}: id invalide "${cfg.id}"`);
  }
  const fileId = path.basename(f, '.json');
  if (fileId !== cfg.id) {
    throw new Error(`[regions] ${f}: id "${cfg.id}" différent du nom de fichier "${fileId}"`);
  }
  if (seen && seen[cfg.id]) throw new Error(`[regions] id en double: ${cfg.id} (${f})`);

  // Le workflow de production appelle assertAllRegionsValid() avant de lancer
  // les déploiements. Une région avec des champs obligatoires absents ne doit
  // donc jamais passer la porte de validation.
  for (const key of REQUIRED_REGION_FIELDS) {
    const value = cfg[key];
    if (value == null || (typeof value === 'string' && !value.trim())) {
      throw new Error(`[regions] ${f}: champ obligatoire absent ou vide "${key}"`);
    }
  }
  if (!VALID_PRIMARY_LANGS.has(cfg.primaryLang)) {
    throw new Error(`[regions] ${f}: primaryLang invalide "${cfg.primaryLang}"`);
  }
  if (!VALID_CURRENCIES.has(cfg.currency)) {
    throw new Error(`[regions] ${f}: currency invalide "${cfg.currency}"`);
  }
  if (!/^[a-z0-9.-]+$/i.test(cfg.domain) || cfg.domain.includes('..')) {
    throw new Error(`[regions] ${f}: domain invalide "${cfg.domain}"`);
  }
  if (typeof cfg.ftpDir !== 'string' || path.isAbsolute(cfg.ftpDir) || cfg.ftpDir.split(/[\\/]+/).includes('..')) {
    throw new Error(`[regions] ${f}: ftpDir doit être un chemin relatif sûr`);
  }
  if (!Array.isArray(cfg.bbox) || cfg.bbox.length !== 4 || !cfg.bbox.every(Number.isFinite)) {
    throw new Error(`[regions] ${f}: bbox doit contenir 4 nombres finis`);
  }
  if (cfg.bbox[0] >= cfg.bbox[2] || cfg.bbox[1] >= cfg.bbox[3]) {
    throw new Error(`[regions] ${f}: bbox min/max incohérents`);
  }
  if (!cfg.center || !Number.isFinite(cfg.center.lat) || !Number.isFinite(cfg.center.lng)) {
    throw new Error(`[regions] ${f}: center doit contenir lat/lng numériques`);
  }
  if (!cfg.emails || ['alerts', 'support'].some(k => typeof cfg.emails[k] !== 'string' || !cfg.emails[k].trim())) {
    throw new Error(`[regions] ${f}: emails.alerts et emails.support sont obligatoires`);
  }
  if (!cfg.beachFilter || typeof cfg.beachFilter !== 'object' || Array.isArray(cfg.beachFilter)) {
    throw new Error(`[regions] ${f}: beachFilter doit être un objet`);
  }
  if (!cfg.routes || ['season', 'best', 'weekly'].some(k => typeof cfg.routes[k] !== 'string' || !cfg.routes[k].trim())) {
    throw new Error(`[regions] ${f}: routes.season, routes.best et routes.weekly sont obligatoires`);
  }
  // Invariants des plages inline (nouvelles régions). Le front filtre sur
  // b.island===REGION.id : un island différent = ZÉRO plage rendue sur le
  // site (bug Miami/Cancún 2026-06-10). La bbox doit couvrir chaque plage,
  // sinon geoDetect la rate et la marge data (+0.8°) est le seul filet.
  if (Array.isArray(cfg.beaches) && cfg.id !== 'mq' && cfg.id !== 'gp') {
    for (const b of cfg.beaches) {
      if (b.island !== cfg.id) {
        throw new Error(`[regions] ${f}: plage ${b.id} a island="${b.island}" ≠ id région "${cfg.id}" — le front n'affichera AUCUNE plage`);
      }
      if (Array.isArray(cfg.bbox) && cfg.bbox.length === 4) {
        const [lngMin, latMin, lngMax, latMax] = cfg.bbox;
        if (b.lng < lngMin || b.lng > lngMax || b.lat < latMin || b.lat > latMax) {
          throw new Error(`[regions] ${f}: plage ${b.id} (${b.lat},${b.lng}) hors bbox [${cfg.bbox}]`);
        }
      }
    }
    if (cfg.beachFilter && cfg.beachFilter.island && cfg.beachFilter.island !== cfg.id) {
      throw new Error(`[regions] ${f}: beachFilter.island="${cfg.beachFilter.island}" ≠ id "${cfg.id}"`);
    }
  }
}

/** Chargement RÉSILIENT depuis un dossier (testable hors __dirname). Core invalide
 *  = throw ; non-core invalide = skip + warn. */
function _loadFromDir(dir) {
  const out = {};
  const skipped = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue; // skip _schema.json
    const isCore = CORE_REGIONS.has(f.replace(/\.json$/, '')); // id présumé d'après le nom de fichier
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      validateRegion(cfg, f, out); // out fait office de map "seen" (détection doublons)
      cfg._file = f;
      out[cfg.id] = cfg;
    } catch (e) {
      // CORE = fail-loud. Non-core = on l'isole pour préserver MQ/GP (revenue).
      // La CI (regions.test.cjs → assertAllRegionsValid) reste STRICTE : un JSON
      // cassé ne passe pas la PR ; ce filet ne couvre qu'une corruption en prod.
      if (isCore) throw new Error(`[regions] région CORE ${f} invalide (build avorté): ${e.message}`);
      console.warn(`[regions] ⚠️ ${f} ignorée (invalide, non-core): ${e.message}`);
      skipped.push(f);
    }
  }
  if (!out.mq && !out.gp) {
    throw new Error('[regions] aucune région core (mq/gp) chargée — build avorté');
  }
  if (skipped.length) {
    console.warn(`[regions] ${skipped.length} région(s) non-core ignorée(s): ${skipped.join(', ')} — MQ/GP préservées`);
  }
  return out;
}

function loadAll() {
  if (_cache) return _cache;
  _cache = _loadFromDir(DIR);
  return _cache;
}

/** Validation STRICTE (CI) : throw au moindre fichier région invalide (core OU
 *  non-core). Le runtime utilise loadAll() qui isole les régions non-core ; cette
 *  fonction garantit que le filet de résilience ne MASQUE pas une vraie régression.
 *  Retourne le nombre de fichiers région validés. Ne touche pas le cache. */
function assertAllRegionsValid(dir = DIR) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const seen = {};
  for (const f of files) {
    let cfg;
    try {
      cfg = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      throw new Error(`[regions] JSON invalide dans ${f}: ${e.message}`);
    }
    validateRegion(cfg, f, seen);
    seen[cfg.id] = f;
  }
  return files.length;
}

/** Toutes les régions, triées par id pour un ordre de build déterministe. */
function getAllRegions() {
  return Object.values(loadAll()).sort((a, b) => a.id.localeCompare(b.id));
}

/** Une région par id. Throw si inconnue (fail-fast au build). */
function getRegion(id) {
  const all = loadAll();
  if (!all[id]) {
    throw new Error(`[regions] région inconnue: "${id}". Dispo: ${Object.keys(all).join(', ')}`);
  }
  return all[id];
}

/** Région par hostname (runtime / detection). Tolère www. et sous-chaînes. */
function getRegionByDomain(host) {
  if (!host) return null;
  const h = String(host).replace(/^www\./, '').toLowerCase();
  return (
    getAllRegions().find((r) => {
      const d = (r.domain || '').replace(/^www\./, '').toLowerCase();
      return d && (h === d || h.includes(d));
    }) || null
  );
}

/** Région active pour un build (env VITE_REGION/REGION), défaut 'mq' = comportement historique. */
function getBuildRegion() {
  return getRegion(process.env.VITE_REGION || process.env.REGION || 'mq');
}

module.exports = { getAllRegions, getRegion, getRegionByDomain, getBuildRegion, loadAll, assertAllRegionsValid, _loadFromDir };
