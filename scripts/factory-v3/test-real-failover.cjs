#!/usr/bin/env node
'use strict';
/**
 * Factory V3 — Test RÉEL du failover avec OpenCode authentique.
 *
 * Ce script n'utilise AUCUN stub : il appelle le vrai CLI OpenCode, de vrais
 * fournisseurs et de vrais modèles gratuits, et conserve toutes les preuves
 * (sessions, modèle observé dans les logs OpenCode, coûts réels, commits).
 *
 * PHASE A — DISPONIBILITÉ RÉELLE (≥ 2 modèles gratuits) :
 *   chaque modèle gratuit est réellement appelé via OpenCode ; on conserve
 *   l'ID de session, le modèle OBSERVÉ dans les logs serveur, les tokens et
 *   le coût. Un modèle qui ne répond pas est un échec HONNÊTE (pas un succès
 *   simulé).
 *
 * PHASE B — BASCULE RÉELLE :
 *   tentative 1 → une SONDE (modèle volontairement inexistant chez un vrai
 *                 fournisseur) → OpenCode renvoie une VRAIE erreur →
 *                 le moteur la classe et bascule ;
 *   tentative 2 → un VRAI modèle gratuit → travail réellement vérifié dans
 *                 l'arbre de travail (fichier + commit).
 *
 * Note honnête : un quota journalier NE peut pas être épuisé artificiellement
 * sans consommer un quota réel. Le test prouve la MÊME mécanique de bascule
 * sur une erreur de fournisseur RÉELLE ; les classes « quota journalier » et
 * « HTTP 429 » sont couvertes par les tests déterministes
 * (tests/unit/factory-v3-failover.test.cjs, 16/16).
 *
 * Usage : node scripts/factory-v3/test-real-failover.cjs [--state-dir X]
 *                [--models "sonde,reel"] [--availability-models "a,b"]
 *                [--timeout-ms N]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const failover = require('./lib/failover.cjs');
const inventoryLib = require('./lib/inventory.cjs');
const registryLib = require('./lib/model-registry.cjs');
const { runProcess, resolveOpencodeBin } = require('./lib/exec.cjs');

const STATE_DIR_DEFAULT = path.resolve(__dirname, 'state');

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const git = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.email=factory@test.local', '-c', 'user.name=Factory V3', ...a], { stdio: 'ignore' });
  git('init');
  fs.writeFileSync(path.join(dir, 'README.md'), '# Preuve reelle Factory V3\n');
  git('add', '-A', '-f');
  git('commit', '--allow-empty', '-m', 'init');
  return dir;
}

/** Appelle un modèle réel via OpenCode et renvoie la preuve de la réponse. */
async function callRealModel(opencodeBin, modelRef, repoDir, prompt, timeoutMs) {
  const started = Date.now();
  const r = await runProcess({
    file: opencodeBin,
    args: [
      'run', '--dir', repoDir, '-m', modelRef,
      '--format', 'json', '--print-logs', '--log-level', 'INFO',
      '--title', `factory-avail-${Date.now()}`,
      prompt,
    ],
    cwd: repoDir,
    timeoutMs,
    idleTimeoutMs: Math.min(timeoutMs, 5 * 60 * 1000),
  });
  const events = failover.parseJsonl(r.stdout);
  const errors = events.filter((e) => e.type === 'error');
  const finish = events.filter((e) => e.type === 'step_finish');
  const texts = events.filter((e) => e.type === 'text' && e.part && e.part.text).map((e) => e.part.text);
  const sessionId = events.find((e) => e.sessionID) ? events.find((e) => e.sessionID).sessionID : null;
  const verify = failover.verifyModelUsed(r.stderr, modelRef, sessionId);
  const cost = finish.reduce((acc, e) => acc + Number((e.cost || 0)), 0);
  return {
    model: modelRef,
    ok: !errors.length && r.exitCode === 0 && (finish.length > 0 || texts.join('').trim().length > 0) && !r.timedOut && !r.idleTimedOut,
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    idleTimedOut: r.idleTimedOut,
    durationMs: Date.now() - started,
    sessionId,
    modelVerified: verify.verified,
    observedModel: verify.observedModel,
    observedProvider: verify.observedProvider,
    tokens: finish.reduce((acc, e) => acc + Number((e.tokens && e.tokens.total) || 0), 0),
    cost,
    reply: texts.join(' ').trim().slice(0, 300),
    errorText: errors.length ? JSON.stringify(errors[0]).slice(0, 600) : String(r.stderr || '').slice(-400),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const stateDir = path.resolve(get('--state-dir', STATE_DIR_DEFAULT));
  const timeoutMs = Number(get('--timeout-ms', 12 * 60 * 1000));
  const modelsArg = get('--models', 'nvidia/nvidia/model-quota-probe-introuvable,nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b');
  const [probeModel, realModel] = modelsArg.split(',').map((s) => s.trim()).filter(Boolean);
  const availabilityModels = get('--availability-models', 'ollama/qwen2.5-coder:7b,nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b')
    .split(',').map((s) => s.trim()).filter(Boolean);

  fs.mkdirSync(path.join(stateDir, 'evidence'), { recursive: true });
  // Dépôt de preuve hors du dépôt Factory (sinon .gitignore/state rend le commit vide)
  const repoDir = initRepo(fs.mkdtempSync(path.join(os.tmpdir(), 'factory-v3-real-')));
  const opencodeBin = resolveOpencodeBin('opencode');

  console.log(`[real] opencode: ${opencodeBin}`);
  console.log(`[real] sonde=${probeModel} modèle réel=${realModel}`);
  console.log(`[real] timeout par tentative: ${timeoutMs} ms`);

  // ---------------------------------------------------------------------
  // 1) INVENTAIRE RÉEL (mécanismes natifs OpenCode)
  // ---------------------------------------------------------------------
  const inventory = await inventoryLib.refreshInventory({
    opencodeBin,
    paidAllowed: false,
    cwd: repoDir,
  });
  inventoryLib.saveInventory(path.join(stateDir, 'inventory.json'), inventory);
  console.log(`[real] inventaire : ${inventory.counts.discovered} modèles découverts, ${inventory.counts.eligible} éligibles, ${inventory.counts.free} gratuits`);
  console.log(`[real] fournisseurs authentifiés : ${inventory.authProviders.join(', ') || '(aucun)'}`);
  console.log(`[real] credentials : ${(inventory.authCredentials || []).map((c) => `${c.name}→${c.provider}`).join(', ') || '(aucun)'}`);
  console.log(`[real] modèles Ollama installés : ${(inventory.installedOllama || []).join(', ') || 'aucun'}`);

  // ---------------------------------------------------------------------
  // 2) PHASE A — DISPONIBILITÉ RÉELLE de ≥2 modèles gratuits
  // ---------------------------------------------------------------------
  const availability = [];
  for (const m of availabilityModels) {
    console.log(`[real][A] appel réel de ${m} ...`);
    const res = await callRealModel(opencodeBin, m, repoDir, 'Réponds exactement: FACTORY_AVAIL_OK', timeoutMs);
    availability.push(res);
    console.log(`[real][A] ${m} → ok=${res.ok} vérifié=${res.modelVerified} observé=${res.observedModel} coût=${res.cost} session=${res.sessionId} (${Math.round(res.durationMs / 1000)}s)`);
  }
  const verifiedFree = availability.filter((a) => a.ok && a.modelVerified && a.cost === 0);
  console.log(`[real][A] ${verifiedFree.length}/${availability.length} modèle(s) gratuit(s) vérifié(s) par usage réel`);

  // ---------------------------------------------------------------------
  // 3) PHASE B — BASCULE RÉELLE (sonde → modèle gratuit réel)
  // ---------------------------------------------------------------------
  const events = [];
  const job = {
    jobId: `real-failover-${Date.now()}`,
    repo: 'sargagame',
    task: "Crée un fichier factory-real-proof.txt contenant exactement la ligne FACTORY_REAL_OK, puis fais un commit git avec le message 'test(factory-v3): preuve reelle de failover'. Ne fais rien d'autre.",
    severity: 2,
    branch: 'agent/devops/factory-v3-model-failover',
    attempts: 0,
    // Contrat de résultat : sans lui, un modèle qui RÉPOND mais n'EXÉCUTE pas
    // (appels d'outils émis en texte) serait compté comme un succès.
    verify: {
      requiredFiles: [{ path: 'factory-real-proof.txt', contains: 'FACTORY_REAL_OK' }],
      requireCommit: true,
    },
  };

  const cfg = {
    models: [probeModel, realModel],
    probeModels: [probeModel],
    opencodeBin,
    paidAllowed: false,
    failover: {
      maxModelSwitches: 3,
      agentTimeoutMs: timeoutMs,
      agentIdleTimeoutMs: 5 * 60 * 1000,
      inventoryMaxAgeMs: 30 * 60 * 1000,
      circuitThreshold: 3,
    },
  };

  const started = Date.now();
  const result = await failover.executeJobWithFailover({
    stateDir,
    cfg,
    job,
    repoCfg: { local: repoDir, gates: [] },
    log: (e, d) => { events.push({ e, d }); console.log(`[real][B][${e}] ${JSON.stringify(d).slice(0, 400)}`); },
  });
  const durationMs = Date.now() - started;

  const proofFile = path.join(repoDir, 'factory-real-proof.txt');
  const proofExists = fs.existsSync(proofFile);
  const proofContent = proofExists ? fs.readFileSync(proofFile, 'utf8').trim() : null;
  const logHead = execFileSync('git', ['-C', repoDir, 'log', '--oneline', '-3'], { encoding: 'utf8' });
  const status = execFileSync('git', ['-C', repoDir, 'status', '--porcelain', '-uall'], { encoding: 'utf8' });
  const registry = registryLib.readRegistry(path.join(stateDir, 'model-registry.json'));

  const evidence = {
    type: 'REAL_FAILOVER_TEST',
    ts: new Date().toISOString(),
    durationMs,
    job,
    models: { probe: probeModel, reel: realModel },
    inventory: {
      updatedAt: inventory.updatedAt,
      counts: inventory.counts,
      authProviders: inventory.authProviders,
      authCredentials: inventory.authCredentials,
      installedOllama: inventory.installedOllama,
      errors: inventory.errors,
    },
    phaseA_availability: {
      tested: availability.length,
      verified: verifiedFree.length,
      models: availability,
    },
    result: {
      ok: result.ok,
      model: result.model,
      failovers: result.failovers,
      resumes: result.resumes,
      sessionId: result.sessionId,
      committedSha: result.committedSha,
      spend: result.spend,
      error: result.error,
      errorCategory: result.errorCategory,
    },
    attempts: (result.attempts || []).map((a) => ({
      ref: a.ref,
      isProbe: a.isProbe,
      outcome: a.outcome,
      category: a.category,
      exitCode: a.exitCode,
      durationMs: a.durationMs,
      sessionId: a.sessionId,
      modelVerified: a.modelVerified,
      observedModel: a.observedModel,
      tokens: a.tokens,
      cost: a.cost,
      resultCheck: a.resultCheck || null,
      errorText: String(a.errorText || '').slice(0, 600),
      outputTail: String(a.outputTail || '').slice(0, 400),
    })),
    proof: {
      fileExists: proofExists,
      content: proofContent,
      gitLog: logHead.trim(),
      dirtyFiles: status.trim() ? status.trim().split(/\r?\n/).length : 0,
    },
    registry: {
      stats: registry.stats,
      models: Object.fromEntries(Object.entries(registry.models || {}).map(([k, v]) => [k, {
        status: v.status, cooldownUntil: v.cooldownUntil, lastResult: v.lastResult,
        lastFailureCategory: v.lastFailureCategory, verifiedByUse: v.verifiedByUse, observedModel: v.observedModel,
      }])),
    },
    events,
  };

  const outFile = path.join(stateDir, 'evidence', `real-failover-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(evidence, null, 2));
  console.log('\n=== PREUVE RÉELLE ===');
  console.log(`PHASE A : ${verifiedFree.length}/${availability.length} modèle(s) gratuit(s) vérifié(s) — coût ${availability.reduce((a, b) => a + b.cost, 0)}`);
  console.log(`PHASE B : ok=${result.ok} modèleFinal=${result.model} bascules=${result.failovers} reprises=${result.resumes}`);
  console.log(`coût réel=${result.spend} · session=${result.sessionId} · commit=${result.committedSha || 'AUCUN'}`);
  console.log(`fichier de preuve présent=${proofExists} contenu=${JSON.stringify(proofContent)}`);
  console.log(`git:\n${logHead.trim()}`);
  console.log(`preuve complète : ${outFile}`);
  const success = result.ok
    && result.failovers > 0
    && verifiedFree.length >= 2
    && result.spend === 0
    && proofExists
    && !!result.committedSha;
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('[real] FATAL', e);
  process.exit(2);
});
