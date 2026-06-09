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

function loadAll() {
  if (_cache) return _cache;
  const out = {};
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue; // skip _schema.json
    let cfg;
    try {
      cfg = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    } catch (e) {
      throw new Error(`[regions] JSON invalide dans ${f}: ${e.message}`);
    }
    if (!cfg || !cfg.id) throw new Error(`[regions] ${f} sans champ "id"`);
    if (out[cfg.id]) throw new Error(`[regions] id en double: ${cfg.id} (${f})`);
    cfg._file = f;
    out[cfg.id] = cfg;
  }
  _cache = out;
  return out;
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

module.exports = { getAllRegions, getRegion, getRegionByDomain, getBuildRegion, loadAll };
