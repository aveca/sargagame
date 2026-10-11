#!/usr/bin/env node
/**
 * regional-copernicus.cjs — Séparation régionale du sargassum.json partagé.
 *
 * Contexte (mission P0 MQ/GP) : le build partagé génère UN sargassum.json avec
 * les 21 clés MQ+GP ; le parcours historique MQ/GP de prepare-ftp.cjs le
 * copiait tel quel dans martinique-ftp/ ET guadeloupe-ftp/ — chaque domaine
 * servait les plages de l'autre île (post-deploy-verify FAILED côté MQ).
 *
 * Chaîne d'appartenance PRINCIPEE (ni préfixes seuls, ni copie aveugle) :
 *   clé data (ex. "gp-malendure") → SARG_TO_BEACH (scripts/lib/sarg-to-beach.cjs,
 *   source partagée aussi consommée par le build vite et l'app) → beach.id →
 *   public/data/beaches-list.json (champ island).
 *
 * Politique :
 *   - ÉTRANGÈRE (résout vers une autre île) → retirée au packaging.
 *   - INCONNUE (non résolue) → CONSERVÉE au packaging (jamais de suppression
 *     aveugle : une clé pipeline sans entrée map reste servie) mais SIGNALÉE,
 *     et REFUSÉE par les contrôles stricts (check + tests) pour forcer la mise
 *     à jour explicite de la map (anti-drift, cf. sarg-to-beach.cjs).
 *   - Le JSON global partagé (public/, dist/) n'est JAMAIS modifié ici :
 *     seul l'objet retourné (copie) est filtré. Schéma inchangé (mêmes clés
 *     top-level, sous-ensembles d'entrées) — compatible frontend existant
 *     (lectures gardées `?.`, clés absentes = repli existant).
 */
'use strict';
const path = require('path');
const { SARG_TO_BEACH } = require('./sarg-to-beach.cjs');
const BEACHES_LIST = require('../../public/data/beaches-list.json');

const ID_ISLAND = new Map(BEACHES_LIST.map((b) => [b.id, b.island]));

/** Île d'une clé data, ou null si non résolue (inconnue). */
function islandOfBeachKey(key) {
  const id = SARG_TO_BEACH[String(key)];
  if (!id) return null;
  return ID_ISLAND.get(id) || null;
}

/** Île attendue d'une région (beachFilter.island, sinon id). */
function ownIslandOf(region) {
  return (region && region.beachFilter && region.beachFilter.island) || (region && region.id) || null;
}

/** Énumère les entrées indexées par plage : [{ where, key }]. */
function beachEntries(json) {
  const out = [];
  if (json && Array.isArray(json.levels)) {
    for (const l of json.levels) out.push({ where: 'levels', key: String((l && l.id) || '') });
  }
  for (const where of ['weekly', 'scores']) {
    if (json && json[where] && typeof json[where] === 'object' && !Array.isArray(json[where])) {
      for (const key of Object.keys(json[where])) out.push({ where, key });
    }
  }
  return out;
}

/**
 * Contrôle strict : étranger (résolu vers une autre île) et inconnu (non
 * résolu) pour `island`. Utilisé par les tests et le garde CI.
 * Retourne { foreign: [{where,key,island}], unknown: [{where,key}] }.
 */
function checkCopernicusForIsland(json, island) {
  const foreign = [];
  const unknown = [];
  for (const e of beachEntries(json)) {
    const isl = islandOfBeachKey(e.key);
    if (isl === null) unknown.push(e);
    else if (isl !== island) foreign.push({ where: e.where, key: e.key, island: isl });
  }
  return { foreign, unknown };
}

/**
 * Filtre une COPIE du JSON pour `island` (l'entrée n'est jamais mutée).
 * Retourne { json, kept, total, dropped, unknown } avec compteurs par
 * structure ({ levels, weekly, scores }).
 */
function filterCopernicusForIsland(src, island) {
  const out = { ...src };
  const kept = { levels: 0, weekly: 0, scores: 0 };
  const total = { levels: 0, weekly: 0, scores: 0 };
  const dropped = { levels: 0, weekly: 0, scores: 0 };
  const unknownKeys = [];
  if (Array.isArray(src.levels)) {
    total.levels = src.levels.length;
    out.levels = src.levels.filter((l) => {
      const isl = islandOfBeachKey(l && l.id);
      if (isl === null) { unknownKeys.push(`levels:${l && l.id}`); kept.levels++; return true; }
      if (isl === island) { kept.levels++; return true; }
      dropped.levels++;
      return false;
    });
  }
  for (const where of ['weekly', 'scores']) {
    const m = src[where];
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      const keys = Object.keys(m);
      total[where] = keys.length;
      const next = {};
      for (const k of keys) {
        const isl = islandOfBeachKey(k);
        if (isl === null) { unknownKeys.push(`${where}:${k}`); next[k] = m[k]; kept[where]++; continue; }
        if (isl === island) { next[k] = m[k]; kept[where]++; continue; }
        dropped[where]++;
      }
      out[where] = next;
    }
  }
  const droppedTotal = dropped.levels + dropped.weekly + dropped.scores;
  return { json: out, kept, total, dropped, droppedTotal, unknown: unknownKeys, unknownTotal: unknownKeys.length };
}

module.exports = { islandOfBeachKey, ownIslandOf, beachEntries, checkCopernicusForIsland, filterCopernicusForIsland, checkRegionalArtifact, SARG_TO_BEACH };

/**
 * Contrôle strict d'un artefact PRÉPARÉ (<ftpDir>/api/copernicus/sargassum.json)
 * pour une région (garde CI/déploiement, avant tout envoi Cloudflare).
 *   - mq/gp (schéma slug partagé) : appartenance via SARG_TO_BEACH + island ;
 *     étranger OU inconnu => échec (force la mise à jour explicite de la map).
 *   - autres régions (schéma id régional) : chaque clé ∈ beach ids inline de
 *     la région, sinon échec.
 * Artefact absent/invalide/vide => échec (fail-closed, jamais de passe silencieux).
 * Retourne { ok, issues: [{where, key, problem, island?}] }.
 */
function checkRegionalArtifact(artifact, region) {
  const fail = (issues) => ({ ok: false, issues });
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return fail([{ where: '*', key: '*', problem: 'invalid-json' }]);
  }
  const entries = beachEntries(artifact);
  if (!entries.length) return fail([{ where: '*', key: '*', problem: 'empty' }]);
  const island = ownIslandOf(region);
  const inlineIds = Array.isArray(region.beaches) && region.beaches.length
    ? new Set(region.beaches.map((b) => b && b.id).filter(Boolean))
    : null;
  const issues = [];
  for (const e of entries) {
    if (inlineIds) {
      if (!inlineIds.has(e.key)) issues.push({ where: e.where, key: e.key, problem: 'unknown-or-foreign' });
    } else {
      const isl = islandOfBeachKey(e.key);
      if (isl === null) issues.push({ where: e.where, key: e.key, problem: 'unknown' });
      else if (isl !== island) issues.push({ where: e.where, key: e.key, problem: 'foreign', island: isl });
    }
  }
  return { ok: issues.length === 0, issues };
}
