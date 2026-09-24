#!/usr/bin/env node
/**
 * implement.cjs — IMPLEMENT phase. Deux voies :
 *
 * 1. RECETTE (`auto`) — transformation déterministe, revue à la main une fois,
 *    enregistrée dans recipes/<nom>.cjs. Zéro LLM, zéro surprise.
 * 2. AGENT (`agent`) — délégation à OpenCode (routeur multi-modèles
 *    .ai/ux-agent/opencode-auto.cjs) avec persona + frontières dures.
 *    Réparations ≤ cfg.loop.maxRepairAttempts, relancées avec le log d'échec.
 *
 * Après CHAQUE passage agent, le diff est re-filtré par la policy (l'agent peut
 * halluciner des chemins — la denylist a le dernier mot).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./lib/common.cjs');
const policy = require('./lib/policy.cjs');

const AGIT = (wt, f) => path.join(wt, f);

/** Voie 1 — recette déterministe. */
function applyRecipe(opp, wt, log) {
  const recipePath = path.join(__dirname, 'recipes', opp.recipe + '.cjs');
  if (!fs.existsSync(recipePath)) throw new Error(`recette inconnue : ${opp.recipe}`);
  const recipe = require(recipePath);
  log(`recette ${recipe.name} — ${recipe.description}`);
  const res = recipe.apply(wt, log);
  return { ok: true, files: res.files, summary: res.summary };
}

/** Voie 2 — délégation OpenCode avec persona-bornes. */
function runAgent(opp, wt, cfg, log, failureContext) {
  return new Promise((resolve) => {
    const personaPath = path.join(__dirname, 'personas', (opp.persona || 'ui-ux') + '.md');
    const persona = fs.existsSync(personaPath) ? fs.readFileSync(personaPath, 'utf8') : '';
    const scopeFiles = (opp.scope && opp.scope.files || []).join(', ');
    const prompt = [
      persona,
      '',
      '# MISSION AUTOPILOT (bornes DURES, toute sortie = annulation)',
      `Opportunité : ${opp.title}`,
      `Preuve : ${opp.evidence || 'n/a'}`,
      `Impact attendu : ${opp.expectedImpact || 'n/a'}`,
      `Fichiers AUTORISÉS (y rester strictement) : ${scopeFiles || 'aucun — propose seulement'}`,
      `Rollback OBLIGATOIRE si conversion/UI : flag query ?xxx=0 (pattern /[?&]xxx=0/.test(window.location.search)).`,
      'Interdictions : paiement/checkout/mollie/paypal/stripe, public/api, workers, regions,',
      'workflows, secrets, nouvelles dépendances, dist/, traductions absentes (i18n _t obligatoire).',
      'Style : patterns existants du repo, minimal, bundle eager ≤ 210 Ko gzip.',
      failureContext ? `\n# ÉCHEC PRÉCÉDENT À CORRIGER\n${failureContext.slice(0, 3000)}` : '',
      '\nApplique le fix MAINTENANT sur le working tree, puis arrête-toi (ne commit pas, ne push pas).',
    ].join('\n');

    const router = path.join(C.ROOT, '.ai', 'ux-agent', 'opencode-auto.cjs');
    log(`agent opencode lancé (persona ${opp.persona || 'ui-ux'}, max ${cfg.policy.agentMaxMinutes} min)…`);
    const child = spawn(process.execPath, [router, 'run', prompt], {
      cwd: wt, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, cfg.policy.agentMaxMinutes * 60000);
    child.on('exit', code => {
      clearTimeout(kill);
      resolve({ ok: code === 0, code, out: out.slice(-4000), err: err.slice(-2000) });
    });
    child.on('error', e => { clearTimeout(kill); resolve({ ok: false, code: -1, err: e.message }); });
  });
}

/**
 * Exécute l'implémentation sur le worktree.
 * Retourne {ok, summary, files, agentLog?} — ne commit jamais.
 */
async function implementOpportunity(opp, wt, cfg, log, failureContext) {
  if (opp.actionable === 'auto' && opp.recipe) {
    const res = applyRecipe(opp, wt, log);
    return { ...res, via: 'recipe' };
  }
  if (opp.actionable === 'agent') {
    if (!cfg.policy.agentsEnabled || !cfg.policy.allowAgentImplementation) {
      return { ok: false, via: 'agent', blocked: 'allowAgentImplementation=false (défaut v1 — fondateur active dans config)' };
    }
    const r = await runAgent(opp, wt, cfg, log, failureContext);
    if (!r.ok) return { ok: false, via: 'agent', agentLog: (r.err || r.out || '').slice(-3000), summary: `agent exit ${r.code}` };
    return { ok: true, via: 'agent', summary: 'agent opencode applied', agentLog: r.out };
  }
  return { ok: false, via: 'none', blocked: `actionable=${opp.actionable} non implémentable par l'autopilot` };
}

module.exports = { implementOpportunity, applyRecipe };
