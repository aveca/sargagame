'use strict';
/**
 * Factory V3 — Inventaire dynamique des modèles OpenCode.
 *
 * Principe P0 : « Ne jamais supposer qu'un modèle est disponible : vérifier sa
 * disponibilité réelle. » L'inventaire n'est donc jamais écrit à la main dans
 * le code : il est découvert via les mécanismes NATIFS d'OpenCode :
 *
 *   opencode auth list               → fournisseurs réellement authentifiés
 *   opencode models <provider> --verbose → catalogue + coûts + capacités
 *   ollama list                      → modèles locaux réellement installés
 *
 * Le filtre « gratuit » est strict : coût entrée ET sortie = 0 (cache inclus).
 * Un modèle payant n'est JAMAIS sélectionné tant que `paidAllowed` est false.
 */

const fs = require('fs');
const path = require('path');
const { runProcess, resolveOpencodeBin } = require('./exec.cjs');

const INVENTORY_VERSION = 2;

// Priorité fournisseur (mission) : Nvidia gratuit > autres gratuits OpenCode >
// autres fournisseurs gratuits configurés > modèles locaux > autres installés.
const PROVIDER_TIER = {
  nvidia: 90,
  opencode: 80,
  ollama: 60,
  'ollama-cloud': 55,
  router: 50,
  openai: 40,
  mistral: 40,
  openrouter: 40,
  zenmux: 40,
  meta: 35,
  minimax: 35,
};

const FAMILY_BONUS = {
  nemotron: 12,
  coder: 10,
  code: 10,
  minimax: 8,
  step: 6,
  qwen: 8,
  deepseek: 6,
  gemma: 4,
  llama: 3,
};

function providerTier(provider) {
  return PROVIDER_TIER[provider] != null ? PROVIDER_TIER[provider] : 30;
}

/**
 * Parse la sortie de `opencode models <provider> --verbose`.
 * Format réel (observé le 2026-11-14) :
 *   nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b
 *   { "id": "...", "status": "active", "cost": {...}, "capabilities": {...} }
 *   ... (un bloc par modèle)
 */
function parseVerboseModels(text) {
  const out = [];
  if (!text) return out;
  const lines = String(text).split(/\r?\n/);
  let currentRef = null;
  let buf = null;
  let depth = 0;
  let inString = false;
  let escaped = false;

  const flush = () => {
    if (!buf) return;
    const raw = buf.join('\n');
    try {
      const obj = JSON.parse(raw);
      const ref = currentRef || `${obj.providerID}/${obj.id}`;
      out.push({
        ref,
        id: obj.id,
        provider: obj.providerID || providerOf(ref),
        name: obj.name || obj.id,
        status: obj.status || 'unknown',
        cost: obj.cost || null,
        capabilities: obj.capabilities || null,
        limit: obj.limit || null,
        family: obj.family || null,
        releaseDate: obj.release_date || null,
        variants: obj.variants || null,
      });
    } catch (_) {
      /* bloc illisible : ignoré (jamais de modèle supposé) */
    }
    buf = null;
    depth = 0;
    inString = false;
    escaped = false;
  };

  for (const line of lines) {
    if (buf === null) {
      const t = line.trim();
      // En-tête : référence de modèle seule sur sa ligne.
      if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./:-]+$/.test(t)) {
        currentRef = t;
        continue;
      }
      if (!t.startsWith('{')) continue;
      // Démarrage du bloc JSON (la ligne d'ouverture EST incluse dans le tampon).
      buf = [line];
      depth = 0;
      inString = false;
      escaped = false;
    } else {
      buf.push(line);
    }
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth <= 0) {
      flush();
      currentRef = null;
    }
  }
  flush();
  return out;
}

function providerOf(ref) {
  const i = String(ref || '').indexOf('/');
  return i > 0 ? ref.slice(0, i) : 'unknown';
}

/** Supprime les séquences ANSI (la sortie OpenCode est colorée). */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text || '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Normalise un nom de credential en identifiant de fournisseur utilisable
 * avec `opencode models <provider>`.
 *   "OpenCode Go"       → "opencode"
 *   "Ollama Cloud"      → "ollama"
 *   "MiniMax (minimax.io)" → "minimax"
 *   "openrouter-free"   → "openrouter"
 */
const PROVIDER_ALIASES = {
  'opencode-go': 'opencode',
  'opencode': 'opencode',
  'ollama-cloud': 'ollama',
  'ollama': 'ollama',
  'openrouter-free': 'openrouter',
  'openrouter': 'openrouter',
  'nvidia': 'nvidia',
  'meta': 'meta',
  'zenmux': 'zenmux',
  'minimax': 'minimax',
  'mistral': 'mistral',
  'openai': 'openai',
  'router': 'router',
};

function normalizeProviderId(displayName) {
  const base = String(displayName || '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return PROVIDER_ALIASES[base] || base;
}

/**
 * Parse `opencode auth list` → fournisseurs réellement authentifiés.
 *
 * FORMAT RÉEL (observé le 2026-11-14, sortie ANSI sur stdout) :
 *   ┌  Credentials ~\.local\share\opencode\auth.json
 *   │
 *   ●  Nvidia \x1b[90mapi
 *   │
 *   ●  MiniMax (minimax.io) \x1b[90mapi
 *   ...
 * Les codes ANSI sont donc SUPPRIMÉS avant l'analyse (bug corrigé : la sortie
 * brute ne matchait aucune regex → `authProviders: []`).
 *
 * Deux sections sont lues :
 *   - `Credentials` : type ∈ {api, oauth, wellknown, basic, jwt} ;
 *   - `Environment` : le dernier token est une VARIABLE D'ENVIRONNEMENT.
 */
function parseAuthProviders(text) {
  const clean = stripAnsi(text);
  const providers = new Set();
  const credentials = [];
  let section = null;
  for (const line of clean.split(/\r?\n/)) {
    if (/Credentials/i.test(line)) { section = 'credentials'; continue; }
    if (/Environment/i.test(line)) { section = 'environment'; continue; }
    if (/^\s*[└┘]\s*\d+\s+credentials/i.test(line)) { section = null; continue; }

    if (section === 'credentials') {
      // ● <Nom> <type>
      const m = line.match(/[●•]\s+(.+?)\s+(api|oauth|wellknown|basic|jwt)\s*$/i);
      if (!m) continue;
      const display = m[1].trim();
      if (!display) continue;
      const id = normalizeProviderId(display);
      if (!id) continue;
      providers.add(id);
      credentials.push({ name: display, provider: id, type: m[2].toLowerCase(), source: 'credential' });
      continue;
    }

    if (section === 'environment') {
      // ● <Nom> <VARIABLE_ENV>
      const m = line.match(/[●•]\s+(.+?)\s+([A-Z][A-Z0-9_]{3,})\s*$/);
      if (!m) continue;
      const display = m[1].trim();
      const id = normalizeProviderId(display);
      if (!id) continue;
      providers.add(id);
      credentials.push({ name: display, provider: id, type: 'env', envVar: m[2], source: 'environment' });
    }
  }
  return { providers: Array.from(providers), credentials };
}

/** Parse `ollama list` → modèles locaux réellement installés. */
function parseOllamaInstalled(text) {
  const models = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^NAME\s+ID\s+SIZE/i.test(t) || /^NAME\s+ID/i.test(t)) continue;
    const m = t.match(/^([^\s]+)\s+[0-9a-f]{8,}/i);
    if (m) models.add(m[1].replace(/^.*\//, ''));
  }
  return Array.from(models);
}

function isFree(model) {
  const c = model && model.cost;
  if (!c || typeof c !== 'object') return false; // coût inconnu → jamais présumé gratuit
  const finiteZero = (value) => value != null
    && Number.isFinite(Number(value))
    && Number(value) === 0;
  // Input/output sont obligatoires : un champ absent ne vaut pas 0. Les frais
  // de cache ne sont exigés que si le fournisseur les publie explicitement.
  if (!finiteZero(c.input) || !finiteZero(c.output)) return false;
  if (c.cache == null) return true;
  return finiteZero(c.cache.read) && finiteZero(c.cache.write);
}

function isChatCapable(model) {
  const cap = model.capabilities;
  if (!cap) return true; // métadonnées absentes : on ne peut pas exclure (filtrage coût/status reste)
  if (cap.output && cap.output.text === false) return false;
  return true;
}

function hasToolSupport(model) {
  const cap = model.capabilities;
  if (!cap) return true;
  return cap.toolcall !== false;
}

/** Score de priorité dynamique (disponibilité, gratuité, capacités, vitesse, outils). */
function scoreModel(model, opts = {}) {
  const { preferred = [], now = Date.now(), installedOllama = null, registryEntry = null } = opts;
  const reasons = [];
  let score = providerTier(model.provider);

  if (isFree(model)) {
    score += 25;
    reasons.push('gratuit (coût 0/0 vérifié)');
  } else {
    score -= 1000; // modèle payant : jamais éligible sans autorisation
    reasons.push('PAYANT — exclu');
  }

  const prefIndex = preferred.indexOf(model.ref);
  if (prefIndex >= 0) {
    // La liste de priorité de la mission fait autorité : bonus dégressif par rang.
    // L'échelle (100) reste supérieure à TOUS les bonus de capacité (≤ 50) : un
    // modèle simplement « validé par usage » ne peut jamais doubler un modèle
    // explicitement prioritaire par la mission.
    score += 10000 - prefIndex * 100;
    reasons.push(`priorité mission #${prefIndex + 1}`);
  }

  const cap = model.capabilities || {};
  if (cap.reasoning) {
    score += 8;
    reasons.push('raisonnement');
  }
  if (cap.toolcall) {
    score += 10;
    reasons.push('outils');
  }
  const ctx = Number((model.limit && model.limit.context) || 0);
  if (ctx >= 32768) {
    score += 5;
    reasons.push('contexte ≥32k');
  }
  const fam = String(model.family || '').toLowerCase();
  if (FAMILY_BONUS[fam]) {
    score += FAMILY_BONUS[fam];
    reasons.push(`famille ${fam}`);
  }
  if (model.provider === 'ollama') {
    if (installedOllama && installedOllama.includes(model.id)) {
      score += 12;
      reasons.push('installé localement (vérifié)');
    } else if (installedOllama) {
      score -= 40;
      reasons.push('non installé localement');
    }
  }
  if (registryEntry && registryEntry.verifiedByUse) {
    score += 15;
    reasons.push('validé par un usage réel');
  }
  if (registryEntry && registryEntry.cooldownUntil && Date.parse(registryEntry.cooldownUntil) > now) {
    score -= 500;
    reasons.push('en cooldown');
  }
  if (model.status !== 'active') {
    score -= 200;
    reasons.push(`statut ${model.status}`);
  }
  return { score, reasons };
}

/**
 * Découvre l'inventaire réel. Ne suppose jamais un modèle : tout ce qui n'est
 * pas vu par OpenCode n'est pas proposé.
 */
async function refreshInventory(opts = {}) {
  const opencodeBin = resolveOpencodeBin(opts.opencodeBin || 'opencode');
  const timeoutMs = opts.timeoutMs || 120000;
  const providers = (opts.providers && opts.providers.length)
    ? opts.providers
    : ['nvidia', 'opencode', 'ollama', 'router', 'openrouter', 'mistral', 'zenmux', 'meta', 'minimax'];

  const auth = await runProcess({
    file: opencodeBin,
    args: ['auth', 'list'],
    cwd: opts.cwd,
    timeoutMs: 30000,
  });
  const parsedAuth = parseAuthProviders(auth.stdout);
  const authProviders = parsedAuth.providers;
  const providerList = Array.from(new Set([...authProviders, ...providers]));

  const discovered = [];
  const errors = [];
  for (const provider of providerList) {
    const r = await runProcess({
      file: opencodeBin,
      args: ['models', provider, '--verbose'],
      cwd: opts.cwd,
      timeoutMs,
    });
    if (r.exitCode !== 0) {
      errors.push({ provider, exitCode: r.exitCode, stderr: String(r.stderr || '').slice(-300) });
      continue;
    }
    const models = parseVerboseModels(r.stdout);
    for (const m of models) discovered.push(m);
  }

  // Modèles locaux réellement installés (vérification, pas supposition).
  let installedOllama = null;
  if (providerList.includes('ollama')) {
    const o = await runProcess({ file: 'ollama', args: ['list'], cwd: opts.cwd, timeoutMs: 20000 });
    if (o.exitCode === 0) installedOllama = parseOllamaInstalled(o.stdout);
  }

  const paidAllowed = !!opts.paidAllowed;
  const eligible = [];
  for (const m of discovered) {
    const free = isFree(m);
    const record = Object.assign({}, m, {
      free,
      eligible: m.status === 'active' && isChatCapable(m) && hasToolSupport(m) && (free || paidAllowed),
      installed: m.provider === 'ollama' && installedOllama ? installedOllama.includes(m.id) : null,
    });
    eligible.push(record);
  }

  return {
    version: INVENTORY_VERSION,
    updatedAt: new Date().toISOString(),
    authProviders,
    authCredentials: parsedAuth.credentials,
    installedOllama,
    models: eligible,
    eligibleModels: eligible.filter((m) => m.eligible).map((m) => m.ref),
    errors,
    counts: {
      discovered: discovered.length,
      eligible: eligible.filter((m) => m.eligible).length,
      free: eligible.filter((m) => m.free).length,
    },
  };
}

function loadInventory(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || raw.version !== INVENTORY_VERSION) return null;
    return raw;
  } catch (_) {
    return null;
  }
}

function saveInventory(file, inventory) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(inventory, null, 2));
  fs.renameSync(tmp, file);
}

/** Liste ordonnée des candidats (les modèles payants sont exclus). */
function rankModels(inventory, opts = {}) {
  const { preferred = [], registry = null, now = Date.now(), paidAllowed = false } = opts;
  const scored = [];
  for (const m of inventory.models || []) {
    // Le coût est RECALCULÉ à partir des métadonnées courantes : un cache
    // ancien qui prétend `free:true` ne peut pas contourner l'interdiction.
    const free = isFree(m);
    if (m.status !== 'active' || !isChatCapable(m) || !hasToolSupport(m)) continue;
    if (!free && !paidAllowed) continue;
    const entry = registry && registry.models ? registry.models[m.ref] : null;
    const { score, reasons } = scoreModel(m, { preferred, now, installedOllama: inventory.installedOllama, registryEntry: entry });
    scored.push({
      ref: m.ref,
      provider: m.provider,
      name: m.name,
      free,
      status: m.status,
      cost: m.cost,
      capabilities: m.capabilities,
      limit: m.limit,
      family: m.family,
      installed: m.installed,
      score,
      reasons,
    });
  }
  scored.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
  return scored;
}

module.exports = {
  INVENTORY_VERSION,
  PROVIDER_TIER,
  parseVerboseModels,
  parseAuthProviders,
  normalizeProviderId,
  stripAnsi,
  parseOllamaInstalled,
  providerOf,
  isFree,
  isChatCapable,
  hasToolSupport,
  scoreModel,
  refreshInventory,
  loadInventory,
  saveInventory,
  rankModels,
};
