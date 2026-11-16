/**
 * sectors.mjs — Résolution d'un secteur commercial vers la donnée satellite ERDDAP.
 *
 * CHAÎNE DE JOINTURE (sources partagées du repo, aucune donnée recopiée ici)
 *   libellé client ("Pointe Faula")
 *     → public/data/beaches-list.json   (id plage mq044, nom, commune, lat/lng)
 *     → scripts/lib/sarg-to-beach.cjs    (id plage → clé archive SARG "vauclin")
 *     → public/api/copernicus/sargassum.json (levels[].id === "vauclin")
 *
 * Si un maillon manque, on REFUSE (erreur explicite) : jamais de secteur
 * approximatif, jamais d'observation inventée.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);

const BEACHES_FILE = path.join(ROOT, 'public', 'data', 'beaches-list.json');
const SARG_MAP_FILE = path.join(ROOT, 'scripts', 'lib', 'sarg-to-beach.cjs');

export function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

let _beaches = null;
let _sargToBeach = null;
let _beachToSarg = null;

function loadBeaches() {
  if (_beaches) return _beaches;
  if (!fs.existsSync(BEACHES_FILE)) return [];
  const raw = JSON.parse(fs.readFileSync(BEACHES_FILE, 'utf8'));
  const list = Array.isArray(raw) ? raw : (raw.beaches || raw.data || []);
  _beaches = list.filter((b) => b && b.id);
  return _beaches;
}

function loadSargMap() {
  if (_sargToBeach) return _sargToBeach;
  if (!fs.existsSync(SARG_MAP_FILE)) return {};
  const mod = require(SARG_MAP_FILE);
  _sargToBeach = mod.SARG_TO_BEACH || {};
  _beachToSarg = {};
  for (const [sargId, beachId] of Object.entries(_sargToBeach)) _beachToSarg[beachId] = sargId;
  return _sargToBeach;
}

/**
 * Résout un libellé de secteur en identifiants exploitables.
 * @returns {{ok:boolean, error?:string, sector?:object}}
 */
export function resolveSector(input) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'missing_sector' };

  const key = normalizeLabel(raw);
  const beaches = loadBeaches();
  const sargToBeach = loadSargMap();
  if (!beaches.length) return { ok: false, error: 'beaches_list_unavailable' };

  const beach =
    beaches.find((b) => normalizeLabel(b.name) === key) ||
    beaches.find((b) => normalizeLabel(b.slug) === key) ||
    beaches.find((b) => normalizeLabel(b.id) === key) ||
    beaches.find((b) => normalizeLabel(b.commune) === key) ||
    null;

  if (!beach) return { ok: false, error: 'sector_not_found' };

  const levelId = sargToBeach && Object.keys(sargToBeach).find((s) => sargToBeach[s] === beach.id) || null;
  if (!levelId) {
    return {
      ok: false,
      error: 'sector_not_mapped_to_satellite',
      sector: { beachId: beach.id, name: beach.name, commune: beach.commune },
    };
  }

  return {
    ok: true,
    sector: {
      levelId,
      beachId: beach.id,
      name: beach.name,
      slug: beach.slug || null,
      commune: beach.commune || null,
      island: beach.island || null,
      lat: typeof beach.lat === 'number' ? beach.lat : null,
      lng: typeof beach.lng === 'number' ? beach.lng : null,
      requestedLabel: raw,
    },
  };
}

/** Identifiants de toutes les plages mappées satellite (diagnostic de couverture). */
export function listMappableSectors() {
  const sargToBeach = loadSargMap();
  const beaches = loadBeaches();
  return Object.keys(sargToBeach).map((levelId) => {
    const beach = beaches.find((b) => b.id === sargToBeach[levelId]);
    return {
      levelId,
      beachId: sargToBeach[levelId],
      name: beach ? beach.name : null,
      commune: beach ? beach.commune : null,
    };
  });
}
