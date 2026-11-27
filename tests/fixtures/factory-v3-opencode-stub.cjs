'use strict';
/**
 * Stub déterministe du CLI OpenCode — utilisé par les tests de non-régression
 * Factory V3 (failover / quota autopilot).
 *
 * Il reproduit fidèlement le protocole RÉEL observé le 2026-11-14 :
 *   - `opencode run --dir <repo> -m <model> --format json --print-logs
 *      --log-level INFO --title <t> [--session <id>] <prompt>`
 *   - stdout : événements JSONL (step_start / text / step_finish / error)
 *   - stderr : lignes de log `message=stream providerID=... modelID=... session.id=...`
 *   - exit 0 en cas de succès, 1 en cas d'erreur, event `error` avec
 *     {name, data:{message}} comme OpenCode le produit réellement.
 *
 * Le comportement de chaque modèle est piloté par un fichier de plan JSON
 * (env FACTORY_STUB_PLAN) ; chaque invocation est journalisée (env FACTORY_STUB_LOG)
 * pour permettre les assertions sur les prompts et les sessions.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VALUE_FLAGS = new Set([
  '--dir', '-m', '--model', '--session', '-s', '--title', '--log-level',
  '--variant', '--format', '--agent', '--file', '-f', '--attach', '--port',
]);

function parseArgs(argv) {
  const out = { dir: null, model: null, session: null, title: null, prompt: '' };
  const args = argv[0] === 'run' ? argv.slice(1) : argv; // le sous-commande "run" n'est pas le prompt
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE_FLAGS.has(a)) {
      const v = args[++i];
      if (a === '--dir') out.dir = v;
      else if (a === '-m' || a === '--model') out.model = v;
      else if (a === '--session' || a === '-s') out.session = v;
      else if (a === '--title') out.title = v;
      continue;
    }
    if (a.startsWith('-')) continue;
    if (!out.prompt) out.prompt = a;
  }
  return out;
}

function emit(obj) {
  try { process.stdout.write(JSON.stringify(obj) + '\n'); } catch (_) {}
}

function logLine(sid, provider, modelId) {
  try {
    process.stderr.write(
      `timestamp=${new Date().toISOString()} level=INFO message=stream providerID=${provider} modelID=${modelId} session.id=${sid}\n`
    );
  } catch (_) {}
}

function gitCommit(dir, message) {
  try {
    execFileSync('git', ['-C', dir, '-c', 'user.email=factory@test.local', '-c', 'user.name=Factory V3', 'add', '-A'], { stdio: 'ignore' });
    execFileSync('git', ['-C', dir, '-c', 'user.email=factory@test.local', '-c', 'user.name=Factory V3', 'commit', '-m', message], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'auth' || argv[0] === 'models' || argv[0] === 'session') {
    // Ces sous-commandes ne sont pas utilisées par les tests (inventaire pré-amorcé).
    process.stdout.write('');
    process.exit(0);
  }
  const parsed = parseArgs(argv);
  const model = parsed.model || 'stub/unknown';
  const dir = parsed.dir || process.cwd();
  const parts = model.split('/');
  const provider = parts[0];
  const modelId = parts.slice(1).join('/');

  let plan = {};
  const planPath = process.env.FACTORY_STUB_PLAN;
  if (planPath && fs.existsSync(planPath)) {
    try { plan = JSON.parse(fs.readFileSync(planPath, 'utf8')); } catch (_) { plan = {}; }
  }
  let entry = (plan.models && plan.models[model]) || plan.default || { behavior: 'success' };

  const logPath = process.env.FACTORY_STUB_LOG;
  // Séquence déterministe : chaque appel du même modèle consomme l'entrée
  // suivante (`sequence: [...]`). L'index est calculé depuis le journal réel.
  if (Array.isArray(entry.sequence) && entry.sequence.length) {
    let callIndex = 0;
    if (logPath && fs.existsSync(logPath)) {
      try {
        callIndex = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean)
          .map((line) => { try { return JSON.parse(line); } catch (_) { return null; } })
          .filter((call) => call && call.model === model).length;
      } catch (_) { callIndex = 0; }
    }
    entry = entry.sequence[Math.min(callIndex, entry.sequence.length - 1)];
  }
  const sid = entry.sessionId || parsed.session || `ses_stub_${Math.random().toString(16).slice(2, 12)}`;
  if (logPath) {
    try {
      fs.appendFileSync(logPath, JSON.stringify({
        ts: new Date().toISOString(),
        model,
        dir,
        session: sid,
        behavior: entry.behavior,
        prompt: parsed.prompt,
      }) + '\n');
    } catch (_) {}
  }

  const observedProvider = entry.observedProvider || provider;
  const observedModel = entry.observedModel || modelId;
  logLine(sid, observedProvider, observedModel);

  // Effets sur le dépôt (travail réellement visible dans l'arbre de travail).
  if (entry.writeFile) {
    try {
      fs.mkdirSync(path.dirname(path.join(dir, entry.writeFile)), { recursive: true });
      fs.writeFileSync(path.join(dir, entry.writeFile), entry.content || `written by ${model}\n`);
    } catch (_) {}
  }
  if (entry.commit) gitCommit(dir, entry.commitMessage || `chore(stub): ${model}`);

  const behavior = entry.behavior || 'success';

  if (behavior === 'assert_write_ahead') {
    // Le runner doit avoir persisté la tentative AVANT d'appeler le
    // fournisseur. Le stub vérifie cette preuve depuis le processus enfant.
    const contextPath = process.env.FACTORY_STUB_CONTEXT;
    let writeAheadOk = false;
    try {
      const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
      writeAheadOk = Array.isArray(context.attempts)
        && context.attempts.some((attempt) => attempt.ref === model && attempt.outcome === 'in_progress');
    } catch (_) {}
    if (!writeAheadOk) {
      try { process.stderr.write('FACTORY_WRITE_AHEAD_MISSING\n'); } catch (_) {}
      process.exit(2);
    }
  }

  if (behavior === 'timeout') {
    // Ne produit AUCUNE sortie : le moteur doit détecter le hang (timeout d'inactivité).
    const until = Date.now() + (entry.sleepMs || 120000);
    while (Date.now() < until) { /* attente active */ }
    process.exit(1);
  }

  if (behavior === 'code_error') {
    try { process.stderr.write((entry.stderr || 'SyntaxError: Unexpected token in test build output\n') + '\n'); } catch (_) {}
    process.exit(1);
  }

  if (behavior === 'quota_daily' || behavior === 'quota_daily_reset' || behavior === 'rate_limit'
    || behavior === 'provider_unavailable' || behavior === 'credit_error' || behavior === 'partial_then_quota'
    || behavior === 'content_safety' || behavior === 'auth_error' || behavior === 'model_invalid') {
    const messages = {
      quota_daily: entry.message || 'Daily free messages exhausted for this model. Upgrade or try again tomorrow.',
      quota_daily_reset: entry.message || 'Daily free messages exhausted for this model.',
      rate_limit: entry.message || 'Rate limit exceeded (HTTP 429). Too many requests.',
      provider_unavailable: entry.message || 'Provider temporarily unavailable (503). Please retry.',
      credit_error: entry.message || 'Payment required (HTTP 402): insufficient credit balance.',
      partial_then_quota: entry.message || 'Daily free messages exhausted for this model.',
      content_safety: entry.message || 'Content safety screening unavailable (temporarily).',
      auth_error: entry.message || 'Provider not authenticated: missing credentials (HTTP 401).',
      model_invalid: entry.message || 'Model not found: no such model on this provider.',
    };
    const defaultStatus = {
      quota_daily: null,
      quota_daily_reset: null,
      rate_limit: 429,
      provider_unavailable: /\b503\b/.test(String(entry.message || '')) ? 503 : null,
      credit_error: 402,
      partial_then_quota: null,
      content_safety: 503,
      auth_error: 401,
      model_invalid: 404,
    };
    const data = {
      message: messages[behavior],
      ref: 'err_stub_' + Math.random().toString(16).slice(2, 8),
    };
    if (entry.statusCode != null || defaultStatus[behavior] != null) {
      data.statusCode = entry.statusCode != null ? entry.statusCode : defaultStatus[behavior];
    }
    if (entry.headers) data.headers = entry.headers;
    if (entry.retryAfter != null) data.retryAfter = entry.retryAfter;
    if (entry.resetAt) data.resetAt = entry.resetAt;
    emit({
      type: 'error',
      timestamp: Date.now(),
      sessionID: sid,
      error: { name: 'ProviderError', data },
    });
    process.exit(1);
  }

  // Succès
  emit({ type: 'step_start', timestamp: Date.now(), sessionID: sid, part: { id: 'prt_stub', messageID: 'msg_stub', sessionID: sid, type: 'step-start' } });
  emit({ type: 'text', timestamp: Date.now(), sessionID: sid, part: { id: 'prt_stub_text', messageID: 'msg_stub', sessionID: sid, type: 'text', text: entry.text || 'FACTORY_DONE: stub ok', time: { start: Date.now(), end: Date.now() } } });
  emit({
    type: 'step_finish',
    timestamp: Date.now(),
    sessionID: sid,
    part: {
      id: 'prt_stub_finish', messageID: 'msg_stub', sessionID: sid, type: 'step-finish', reason: 'stop',
      tokens: { total: entry.tokens || 120, input: (entry.tokens || 120) - 10, output: 10, reasoning: 0, cache: { write: 0, read: 0 } },
      cost: entry.cost != null ? entry.cost : 0,
    },
  });
  process.exit(0);
}

main();
