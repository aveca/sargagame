#!/usr/bin/env node
'use strict';
/**
 * Factory V3 — Tableau de bord d'observabilité (failover / quotas).
 *
 * Affiche : modèle courant par agent, fournisseur, disponibilité, quota épuisé,
 * nombre de bascules, dernier changement de modèle, modèle de secours,
 * tâches reprises automatiquement, agents bloqués, dépense (toujours 0 sans
 * autorisation explicite).
 *
 * Usage : node scripts/factory-v3/dashboard.cjs [--state-dir <chemin>] [--json]
 */

const fs = require('fs');
const path = require('path');

const registryLib = require('./lib/model-registry.cjs');

const STATE_DIR_DEFAULT = path.resolve(__dirname, 'state');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function buildDashboard(stateDir) {
  const registry = registryLib.readRegistry(path.join(stateDir, 'model-registry.json'));
  const queue = readJson(path.join(stateDir, 'queue.json'), { jobs: [] });
  const inventory = readJson(path.join(stateDir, 'inventory.json'), null);
  const now = Date.now();

  const models = Object.values(registry.models || {}).map((m) => ({
    model: m.model,
    provider: m.provider,
    statut: m.cooldownUntil && Date.parse(m.cooldownUntil) > now ? 'cooldown' : (m.verifiedByUse ? 'validé' : (m.status || 'inconnu')),
    quotaEpuisé: !!m.quota,
    quotaType: m.quota ? m.quota.type : null,
    cooldownJusqua: m.cooldownUntil,
    echecsConsecutifs: m.consecutiveFailures,
    dernierResultat: m.lastResult,
    derniereTentative: m.lastAttemptAt,
    dernierSucces: m.lastSuccessAt,
    modeleObserve: m.observedModel,
    gratuit: m.free !== false,
  })).sort((a, b) => String(a.model).localeCompare(String(b.model)));

  const agents = (queue.jobs || []).map((j) => {
    const evidence = j.evidence || null;
    const agent = evidence && evidence.agent ? evidence.agent : null;
    const attempts = (agent && agent.attempts) || [];
    const last = attempts[attempts.length - 1] || null;
    return {
      jobId: j.jobId,
      repo: j.repo,
      statutJob: j.status,
      modeleCourant: last ? last.ref : null,
      fournisseur: last ? last.provider : null,
      modeleVerifie: last ? !!last.modelVerified : null,
      quotaEpuisé: last ? !!last.quotaType : false,
      bascules: agent ? agent.failovers || 0 : 0,
      reprises: agent ? agent.resumes || 0 : 0,
      dernierChangement: last ? last.durationMs != null ? last.ref : null : null,
      modeleSecours: attempts.length > 1 ? attempts[attempts.length - 1].ref : null,
      tentatives: attempts.length,
      dernierVerdict: evidence ? evidence.verdict : null,
      bloque: j.status === 'BLOCKED' || j.status === 'PARKED' || j.status === 'RUNNING',
    };
  });

  const blocked = agents.filter((a) => a.bloque && a.statutJob !== 'RUNNING');
  const running = agents.filter((a) => a.statutJob === 'RUNNING');

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      bascules: registry.stats.failovers || 0,
      reprisesAutomatiques: registry.stats.resumes || 0,
      evenementsQuota: registry.stats.quotaEvents || 0,
      tentatives: registry.stats.attempts || 0,
      succes: registry.stats.successes || 0,
      echecs: registry.stats.failures || 0,
      depense: Number(registry.stats.spend || 0),
      depenseAutorisee: false,
    },
    inventaire: inventory
      ? { maj: inventory.updatedAt, decouverts: inventory.counts.discovered, eligibles: inventory.counts.eligible, gratuits: inventory.counts.free, fournisseurs: inventory.authProviders }
      : null,
    modeles: models,
    agents,
    agentsEnCours: running.map((r) => r.jobId),
    agentsBloques: blocked.map((b) => ({ jobId: b.jobId, statut: b.statutJob, verdict: b.dernierVerdict })),
  };
}

function render(dash) {
  const lines = [];
  lines.push('=== FACTORY V3 — TABLEAU DE BORD MODÈLES / QUOTAS ===');
  lines.push(`Généré : ${dash.generatedAt}`);
  lines.push(`Dépense : ${dash.stats.depense} (autorisée : ${dash.stats.depenseAutorisee ? 'oui' : 'NON'})`);
  lines.push(`Bascules : ${dash.stats.bascules} · Reprises automatiques : ${dash.stats.reprisesAutomatiques} · Événements quota : ${dash.stats.evenementsQuota}`);
  lines.push(`Tentatives : ${dash.stats.tentatives} · Succès : ${dash.stats.succes} · Échecs : ${dash.stats.echecs}`);
  lines.push('');
  lines.push('--- MODÈLES ---');
  if (!dash.modeles.length) lines.push('  (aucun modèle enregistré)');
  for (const m of dash.modeles) {
    lines.push(
      `  ${m.model}\n` +
      `    fournisseur=${m.provider} statut=${m.statut} quota=${m.quotaEpuisé ? 'ÉPUISÉ (' + m.quotaType + ')' : 'ok'} cooldown=${m.cooldownJusqua || '-'}\n` +
      `    échecs consécutifs=${m.echecsConsecutifs} dernier=${m.dernierResultat || '-'} modèle observé=${m.modeleObserve || '-'}`
    );
  }
  lines.push('');
  lines.push('--- AGENTS ---');
  if (!dash.agents.length) lines.push('  (aucun job)');
  for (const a of dash.agents) {
    lines.push(
      `  ${a.jobId} [${a.repo}] job=${a.statutJob} modèle=${a.modeleCourant || '-'} (${a.fournisseur || '-'})` +
      ` vérifié=${a.modeleVerifie} quota=${a.quotaEpuisé ? 'OUI' : 'non'} bascules=${a.bascules} reprises=${a.reprises}` +
      ` secours=${a.modeleSecours || '-'} verdict=${a.dernierVerdict || '-'}`
    );
  }
  if (dash.agentsBloques.length) {
    lines.push('');
    lines.push('--- AGENTS BLOQUÉS ---');
    for (const b of dash.agentsBloques) lines.push(`  ${b.jobId} : ${b.statut} (${b.verdict || '-'})`);
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--state-dir');
  const stateDir = i >= 0 && args[i + 1] ? args[i + 1] : STATE_DIR_DEFAULT;
  const dash = buildDashboard(stateDir);
  if (args.includes('--json')) {
    console.log(JSON.stringify(dash, null, 2));
  } else {
    console.log(render(dash));
  }
}

if (require.main === module) main();

module.exports = { buildDashboard, render, STATE_DIR_DEFAULT };
