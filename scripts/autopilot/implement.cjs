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
const { buildAgentPrompt } = require('./lib/agent-prompt.cjs');
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
    const wtRel = path.relative(C.ROOT, wt).replace(/\\/g, '/');
    const mission = opp.mission || {};
    // MOTEUR RÉELLEMENT EXÉCUTÉ. La chaîne d'exécution de ce dépôt passe
    // TOUJOURS par `.ai/ux-agent/opencode-auto.cjs` (OpenCode + modèle local
    // Ollama). On announce donc le moteur réel — jamais l'agent « préféré »
    // d'un profil Factory qui n'aurait pas de voie non interactive câblée
    // (une preuve d'agent qui n'a pas travaillé serait un faux succès).
    const ENGINE = 'opencode';
    // Le moteur RÉEL est toujours OpenCode dans ce dépôt (chaîne
    // `.ai/ux-agent/opencode-auto.cjs`). On n'annonce JAMAIS l'agent
    // « préféré » d'un profil Factory : la valeur figée dans l'opportunité
    // (importée avant un correctif de routage) pourrait nommer un agent
    // qui n'a pas travaillé — une preuve fausse.
    const routedAgent = ENGINE;
    const declaredAgent = (opp.agent && (opp.agent.declaredAgent || opp.agent.agent)) || null;
    const routedProfile = (opp.agent && opp.agent.profile) || 'n/a';
    const routedModel = (opp.agent && opp.agent.model) || '';
    const prompt = buildAgentPrompt({
      persona,
      scopeFiles,
      opp,
      mission,
      wt,
      wtRel,
      engine: ENGINE,
      routedModel,
      routedProfile,
      declaredAgent,
      failureContext,
    });

    const router = path.join(C.ROOT, '.ai', 'ux-agent', 'opencode-auto.cjs');
    const liveMode = process.env.SARGA_AUTOPILOT_LIVE === '1';
    
    if (liveMode) {
      log(`[LIVE] agent ${routedAgent} starting (persona ${opp.persona || 'ui-ux'}, max ${cfg.policy.agentMaxMinutes} min, profil ${routedProfile}).`);
      log(`[LIVE] prompt length: ${prompt.length} chars · mission text: ${(mission.text || '').length} chars`);
    } else {
      log(`agent ${routedAgent} lancé (persona ${opp.persona || 'ui-ux'}, max ${cfg.policy.agentMaxMinutes} min, profil ${routedProfile}).`);
    }
    
    const child = spawn(process.execPath, [router, 'run', prompt], {
      cwd: wt,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // L'agent DOIT tourner en local pur (contrat de `.ai/ux-agent/
      // opencode-auto.cjs`). Cet adaptateur refuse CLOUd credentials et
      // sort en code 3 — donc l'agent n'AVAIT AUCUNE chance de tourner :
      // le spawn heritait de l'env du runner, qui porte NVIDIA_API_KEY
      // (portee User). Le meme nettoyage est deja applique par
      // `local-agent-executor.cjs` : les deux chemins d'agent doivent
      // partager le meme contrat.
      env: {
        ...process.env,
        SARGA_LOCAL_ONLY: '1',
        // Modèle routé par l'Agent Router : l'adaptateur local le respecte
        // s'il est réellement installé sur la machine.
        ...(routedModel ? { SARGA_OLLAMA_MODEL: routedModel } : {}),
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
        GOOGLE_API_KEY: undefined,
        NVIDIA_API_KEY: undefined,
        COHERE_API_KEY: undefined,
        MISTRAL_API_KEY: undefined,
        OLLAMA_HOST: String(process.env.SARGA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
      },
    });
    
    let out = '', err = '';
    // En mode LIVE, stdio = inherit ⇒ child.stdout/stderr sont null :
    // ne jamais brancher de handlers sans vérifier (crash `.on` of null).
    if (child.stdout) {
      child.stdout.on('data', d => {
        out += d;
        if (liveMode && out.length > 10000) out = out.slice(-8000);
      });
    }
    if (child.stderr) {
      child.stderr.on('data', d => {
        err += d;
        if (liveMode && err.length > 5000) err = err.slice(-4000);
      });
    }
    
    const kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, cfg.policy.agentMaxMinutes * 60000);
    child.on('exit', code => {
      clearTimeout(kill);
      if (liveMode) {
        log(`[LIVE] agent exited with code ${code}`);
      }
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
    // La trace de l'agent doit contenir stdout ET stderr : le CLI OpenCode
    // ecrit les APPELS D OUTILS (Write/Edit/Bash) sur stderr, et la reponse
    // du modele sur stdout. Sans stderr, la trace ne contenait que les
    // lignes `[local-agent] ...` et le diagnostic du parcage restait vide.
    const agentLog = [r.out, r.err].filter(Boolean).join('\n').slice(-3000);
    return { ok: true, via: 'agent', summary: 'agent opencode applied', agentLog };
  }
  return { ok: false, via: 'none', blocked: `actionable=${opp.actionable} non implémentable par l'autopilot` };
}

module.exports = { implementOpportunity, applyRecipe };
