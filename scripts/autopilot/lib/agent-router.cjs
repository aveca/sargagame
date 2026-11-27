#!/usr/bin/env node
/**
 * agent-router.cjs — routage RÉEL vers l'agent et le modèle disponibles.
 *
 * Le pont GitHub ne choisit pas « au hasard » un exécutable : il lit la
 * configuration de routage EXISTANTE de Factory V3 (`agent_routing.json`), la
 * trouve dans cet ordre :
 *
 *   1. $SARGA_AGENT_ROUTING              (chemin explicite)
 *   2. <repo>/scripts/autopilot/agent_routing.json   (versionné, portable)
 *   3. C:\factory-service\factory-live\agent_routing.json (installation réelle)
 *   4. profils par défaut ci-dessous (secours déterministe)
 *
 * Puis il VÉRIFIE ce qui est réellement installé sur la machine (binaire
 * d'agent présent, modèle Ollama présent) avant de renderer une décision.
 * Un agent annoncé mais absent n'est jamais selected : la décision porte
 * toujours la raison exacte du choix (traçabilité, pas de faux succès).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('./common.cjs');

/** Profils de secours (mêmes identifiants que la config Factory V3). */
const DEFAULT_ROUTING = {
  DEFAULT: { preferredAgent: 'opencode', fallbackAgents: ['ollama', 'aider'], preferredModel: '', fallbackModels: [], timeout: 1800000, maxRetries: 3 },
  SIMPLE_FIX: { preferredAgent: 'aider', fallbackAgents: ['ollama', 'opencode'], preferredModel: '', fallbackModels: [], timeout: 1800000, maxRetries: 2 },
  DEBUG_COMPLEX: { preferredAgent: 'hermes', fallbackAgents: ['opencode', 'ollama'], preferredModel: '', fallbackModels: [], timeout: 3600000, maxRetries: 3 },
  REPO_EXPLORATION: { preferredAgent: 'opencode', fallbackAgents: ['ollama'], preferredModel: '', fallbackModels: [], timeout: 1800000, maxRetries: 2 },
  TEST_WRITING: { preferredAgent: 'aider', fallbackAgents: ['opencode', 'ollama'], preferredModel: '', fallbackModels: [], timeout: 1800000, maxRetries: 3 },
  ARCHITECTURE: { preferredAgent: 'opencode', fallbackAgents: ['hermes', 'ollama'], preferredModel: '', fallbackModels: [], timeout: 3600000, maxRetries: 2 },
  PRODUCT_QUALITY_ENGINEER: { preferredAgent: 'opencode', fallbackAgents: ['ollama'], preferredModel: '', fallbackModels: [], timeout: 3600000, maxRetries: 2 },
};

/**
 * Mapping type de mission → profil de routage.
 * L'ordre compte : le premier profil qui correspond gagne.
 */
const TYPE_TO_PROFILE = [
  [/ux|ui|design|visual|avatar|a11y|accessib/i, 'PRODUCT_QUALITY_ENGINEER'],
  [/test|qa|coverage/i, 'TEST_WRITING'],
  [/explor|audit|recon|diagnos|investigat/i, 'REPO_EXPLORATION'],
  [/architect|design-system|migration-plan|structure/i, 'ARCHITECTURE'],
  [/debug|bug|crash|incident|regression/i, 'DEBUG_COMPLEX'],
  [/fix|patch|correct|typo|doc|readme|comment/i, 'SIMPLE_FIX'],
];

/** Candidats binaires par agent (Windows d'abord). */
const AGENT_BINARIES = {
  opencode: [
    'C:\\Users\\user\\AppData\\Roaming\\npm\\opencode.cmd',
    'C:\\Users\\user\\AppData\\Roaming\\npm\\opencode.exe',
    'opencode.cmd',
    'opencode',
  ],
  aider: [
    'C:\\Users\\user\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\aider.exe',
    'aider.exe',
    'aider',
  ],
  hermes: [
    'C:\\Users\\user\\AppData\\Local\\hermes\\bin\\hermes.exe',
    'hermes.exe',
    'hermes',
  ],
  ollama: [
    'C:\\Users\\user\\AppData\\Local\\Programs\\Ollama\\ollama.exe',
    'ollama.exe',
    'ollama',
  ],
};

/**
 * Agents RÉELLEMENT EXÉCUTABLES par la chaîne de production.
 *
 * La pipeline d'exécution du dépôt (`implement.cjs` -> `lib/agent-router.cjs`
 * -> `.ai/ux-agent/opencode-auto.cjs`) ne sait lancer qu'OpenCode en mode
 * non interactif, avec un modèle local Ollama. Aider et Hermes sont
 * *déclarés* par la configuration Factory V3, mais aucune voie d'exécution
 * non interactive n'est câblée pour eux dans ce dépôt.
 *
 * Sélectionner un agent non câblé produirait une PREUVE FAUSSE : le
 * commentaire publié sur l'issue annoncerait « agent lancé : hermes » alors
 * que c'est OpenCode qui a travaillé. On refuse donc de RETENIR un agent non
 * câblé : le profil Factory reste consulté (traçabilité de la décision), mais
 * l'agent retenu est celui qui exécute réellement.
 */
const EXECUTABLE_AGENTS = new Set(['opencode']);

/** Moteurs locaux : Ollama est le runtime de modèle, pas un agent de code. */
const MODEL_RUNTIMES = new Set(['ollama']);

let _routingCache = null;

/** Chemin du fichier de routage effectivement utilisé (ou null). */
function routingConfigPath() {
  const candidates = [];
  if (process.env.SARGA_AGENT_ROUTING) candidates.push(process.env.SARGA_AGENT_ROUTING);
  candidates.push(path.join(C.ROOT, 'scripts', 'autopilot', 'agent_routing.json'));
  if (process.platform === 'win32') {
    candidates.push('C:\\factory-service\\factory-live\\agent_routing.json');
  }
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch (_) {}
  }
  return null;
}

/** Charge la configuration de routage (cache en mémoire). */
function loadRouting(force = false) {
  if (_routingCache && !force) return _routingCache;
  const file = routingConfigPath();
  let parsed = null;
  if (file) {
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      parsed = null;
    }
  }
  const routing = (parsed && typeof parsed === 'object' && Object.keys(parsed).length)
    ? parsed
    : DEFAULT_ROUTING;
  _routingCache = { file, routing, source: file ? `config:${file}` : 'defaults' };
  return _routingCache;
}

/** Le binaire de l'agent est-il réellement présent ? */
function resolveAgentBinary(agent) {
  const candidates = AGENT_BINARIES[agent] || [agent];
  for (const c of candidates) {
    try {
      if (path.isAbsolute(c) || c.includes('\\') || c.includes('/')) {
        if (fs.existsSync(c)) return c;
        continue;
      }
      // Binaire dans le PATH : on vérifie par exécution (version/usage).
      execFileSync(c, ['--version'], { stdio: 'ignore', timeout: 8000, windowsHide: true });
      return c;
    } catch (_) {}
  }
  return null;
}

/** Modèles Ollama réellement installés. */
function listOllamaModels() {
  try {
    const out = execFileSync('C:\\Users\\user\\AppData\\Local\\Programs\\Ollama\\ollama.exe', ['list'], {
      encoding: 'utf8', timeout: 10000, windowsHide: true,
    });
    return String(out)
      .split(/\r?\n/)
      .slice(1)
      .map(l => l.trim().split(/\s+/)[0])
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/** Choix du profil pour un type de mission donné. */
function profileFor(type, priority) {
  const { routing } = loadRouting();
  const t = String(type || '');
  for (const [re, profile] of TYPE_TO_PROFILE) {
    if (re.test(t) && routing[profile]) return profile;
  }
  if (priority === 'critical' && routing.DEBUG_COMPLEX) return 'DEBUG_COMPLEX';
  return routing.DEFAULT ? 'DEFAULT' : Object.keys(routing)[0];
}

/**
 * Décide de l'agent et du modèle.
 *
 * @param {object} opts {type, priority, requireModel}
 * @returns {{ok:boolean, agent:string, model:string|null, profile:string, binary:string|null,
 *            source:string, reason:string, candidates:Array, availableModels:Array}}
 */
function route(opts = {}) {
  const { routing, source, file } = loadRouting();
  const profile = profileFor(opts.type, opts.priority);
  const conf = routing[profile] || routing.DEFAULT || {};

  const agents = [conf.preferredAgent, ...(conf.fallbackAgents || [])].filter(Boolean);
  const availableModels = listOllamaModels();

  const preferredModels = [conf.preferredModel, ...(conf.fallbackModels || [])].filter(Boolean);
  let model = null;
  for (const m of preferredModels) {
    const exact = availableModels.find(x => x === m);
    if (exact) { model = exact; break; }
    const stem = String(m).split(':')[0];
    const hit = availableModels.find(x => String(x).split(':')[0] === stem);
    if (hit) { model = hit; break; }
  }
  if (!model && availableModels.length) {
    // Aucun modèle de la config n'est installé : on prend le premier modèle
    // réellement disponible (et on l'assume dans la raison).
    model = availableModels[0];
  }

  const candidates = [];
  let chosen = null;
  for (const agent of agents) {
    const binary = resolveAgentBinary(agent);
    const executable = EXECUTABLE_AGENTS.has(agent);
    candidates.push({ agent, available: !!binary, executable, binary });
    if (!chosen && binary && executable) chosen = { agent, binary };
  }

  if (!chosen) {
    // Dernier recours : n'importe quel agent câblé ET réellement installé.
    for (const agent of Object.keys(AGENT_BINARIES)) {
      if (!EXECUTABLE_AGENTS.has(agent)) continue;
      const binary = resolveAgentBinary(agent);
      if (binary) { chosen = { agent, binary }; candidates.push({ agent, available: true, executable: true, binary, fallback: true }); break; }
    }
  }

  if (!chosen) {
    return {
      ok: false,
      agent: null,
      model: null,
      profile,
      binary: null,
      source,
      routingFile: file,
      reason: 'Aucun agent exécutable installé (opencode absent ou introuvable)',
      candidates,
      availableModels,
    };
  }

  // L'agent retenu est celui qui va EXÉCUTER. On documente aussi l'écart
  // éventuel avec le profil Factory (ex. profil DEBUG_COMPLEX -> hermes
  // déclaré, mais non câblé : opencode est retenu).
  const declared = conf.preferredAgent || null;
  const declaredExecutable = declared ? EXECUTABLE_AGENTS.has(declared) : false;
  const declaredInstalled = declared ? !!resolveAgentBinary(declared) : false;
  const deviation = declared && declared !== chosen.agent
    ? ` (profil ${profile} déclarait « ${declared} »${declaredExecutable ? '' : ' : non câblé en non-interactif'}${declaredInstalled ? '' : ' : non installé'} → opencode retenu, seul moteur réellement exécuté)`
    : '';

  return {
    ok: true,
    agent: chosen.agent,
    model,
    profile,
    binary: chosen.binary,
    timeout: Number(conf.timeout) || 1800000,
    maxRetries: Number(conf.maxRetries) || 3,
    source,
    routingFile: file,
    declaredAgent: declared,
    engine: chosen.agent,
    modelRuntime: MODEL_RUNTIMES.has('ollama') ? 'ollama' : null,
    reason: `profil ${profile} → agent ${chosen.agent}${model ? ` · modèle ${model}` : ''}${deviation}`,
    candidates,
    availableModels,
  };
}

module.exports = {
  DEFAULT_ROUTING,
  TYPE_TO_PROFILE,
  AGENT_BINARIES,
  EXECUTABLE_AGENTS,
  MODEL_RUNTIMES,
  routingConfigPath,
  loadRouting,
  resolveAgentBinary,
  listOllamaModels,
  profileFor,
  route,
};

if (require.main === module) {
  try {
    console.log(JSON.stringify(route({ type: process.argv[2] || '' }), null, 2));
  } catch (e) {
    console.error('AGENT-ROUTER ERROR: ' + e.message);
    process.exit(1);
  }
}
