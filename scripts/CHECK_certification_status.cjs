#!/usr/bin/env node
/**
 * CHECK_certification_status.cjs — Verrou fail-closed de la certification globale.
 *
 * Règle absolue : la promotion globale vaut PASS uniquement si les trois
 * certifications indépendantes (TECHNICAL, PRODUCTION, BUSINESS) valent PASS
 * ET si leurs preuves sont vérifiées pour le commit contrôlé.
 *
 * Un statut « PASS » écrit dans .ai/current_state.md ne suffit JAMAIS.
 * La source de vérité machine est .ai/certification/status.json + les preuves.
 *
 * Conditions de blocage (chacune => exit 1, verdict != PASS) :
 *   - TECHNICAL, PRODUCTION ou BUSINESS != PASS
 *   - statut absent, invalide ou ambigu (seules valeurs : PASS | FAIL | NOT_PROVEN)
 *   - preuve obligatoire absente, illisible, périmée ou non vérifiable
 *     (chemin sûr, fichier présent non vide, sha256 exact, contenu scellé au commit)
 *   - preuves rattachées à un autre commit que le commit contrôlé
 *   - PRODUCTION : preuve de paiement en mode TEST (« tr_test_ », paymentMode!=live)
 *   - BUSINESS : métriques historiques (période close > 31 j) ou non attribuables
 *     (attributedToCommit != commit contrôlé, ou marqueur historical:true)
 *   - preuve marquée simulated:true (un simulé n'est jamais une preuve réelle)
 *   - manifeste absent / JSON invalide / version inconnue / erreur de lecture
 *
 * Sortie : exit 0 si et seulement si GLOBAL = PASS ; exit 1 dans TOUT autre cas
 * (y compris erreur interne — le doute bloque toujours la promotion).
 *
 * Modes :
 *   --mode manifest  (défaut) Contrôle du manifeste roulant status.json
 *                    (comportement historique, utilisé pour l'état déclaré).
 *   --mode pr        CONTRÔLE A (CI des PR). Intégrité du mécanisme : vocabulaire
 *                    des statuts, structure des attestations, cohérence nom==cible.
 *                    TOLÈRE NOT_PROVEN (une réparation de gouvernance doit pouvoir
 *                    passer la CI) ; refuse toute valeur inconnue/ambiguë ou
 *                    attestation forgée. Ne vérifie PAS les preuves métier.
 *   --mode deploy    CONTRÔLE B (avant toute promotion/déploiement). Strict :
 *                    résout le COMMIT PRODUIT EFFECTIF de HEAD (en sautant les
 *                    commits touchant uniquement .ai/certification/ — c'est ce qui
 *                    lève l'autoréférence : l'attestation pour le commit produit P
 *                    est portée par un ou plusieurs commits ultérieurs sans code),
 *                    exige .ai/certification/attestations/<P>.json avec les trois
 *                    certifications PASS et leurs preuves vérifiées (sha256 +
 *                    contenu scellant P + non périmées + règles PRODUCTION/BUSINESS).
 *                    Aucune option ne change ce verdict : seul le code de HEAD et
  *                    ses preuves comptent. Exit 1 dans tout autre cas.
  *   --wait-ms N (deploy seul, défaut 0) : attente bornée anti-course
  *                    gate-vs-CI. La gate tourne dans la même vague que les
  *                    checks requis : sans attente, elle les voit `in_progress`
  *                    et refuse à jamais (aucun retry) — la livraison reste
  *                    bloquée alors que tout finit vert. Avec N>0 on attend que
  *                    chaque check requis ait CONCLU (échec => refus immédiat,
  *                    timeout => refus fail-closed). Le workflow production
  *                    passe --wait-ms 1200000 ; la lib et les scripts FTP
  *                    gardent le verdict instantané (N=0).
  *
  * Cartographie des stades (mission P0) :
  *   PREDEPLOY_ELIGIBLE  = technique prouvé sur le SHA exact (checks CI
  *                         test-frontend+perf verts — qui incluent build,
  *                         tests, smoke et budget — + builds régionaux et
  *                         artefacts validés par le job `build` requis en
  *                         amont) ; PRODUCTION/BUSINESS restent NOT_PROVEN
  *                         (aucune allégation commerciale anticipée).
  *   PRODUCTION_VERIFIED = attestation complète committée et valide (trois
  *                         PASS scellés au SHA) — équivaut aux critères
  *                         GLOBAL_CERTIFIED (technique + paiement live +
  *                         métriques attribuées) ; implique une vérification
  *                         post-déploiement réelle antérieure.
  * Sortie informative (jamais bloquante) : paymentSensitive + rollback.
 *
 * Usage :
 *   node scripts/CHECK_certification_status.cjs [--mode manifest|pr|deploy]
 *                                                [--root <dir>] [--commit <sha40>]
 *                                                [--manifest <rel>] [--now <iso>]
 *                                                [--json]
 * Sans --commit, le commit contrôlé = `git rev-parse HEAD` dans --root
 * (si git échoue et aucun --commit fourni => échec, fail-closed).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ALLOWED_STATUS = new Set(['PASS', 'FAIL', 'NOT_PROVEN']);
const CERT_KEYS = ['TECHNICAL', 'PRODUCTION', 'BUSINESS'];
const MAX_VALIDITY_MS = 31 * 24 * 3600 * 1000; // fenêtre max d'une preuve PASS
const FUTURE_SKEW_MS = 5 * 60 * 1000;          // tolérance d'horloge
const SHA40 = /^[0-9a-f]{40}$/i;
const MOLLIE_TEST_MARKER = /tr_test_/;

// ── Args ─────────────────────────────────────────────────────────────────────
const MODES = new Set(['manifest', 'pr', 'deploy']);
function parseArgs(argv) {
  const a = { root: path.resolve(__dirname, '..'), commit: null, manifest: path.join('.ai', 'certification', 'status.json'), now: null, json: false, mode: 'manifest', waitMs: 0 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') { a.json = true; continue; }
    if (k === '--mode') { a.mode = String(argv[++i] || ''); continue; }
    if (k === '--root') { a.root = path.resolve(argv[++i]); continue; }
    if (k === '--commit') { a.commit = String(argv[++i] || ''); continue; }
    if (k === '--manifest') { a.manifest = String(argv[++i] || ''); continue; }
    if (k === '--now') { a.now = String(argv[++i] || ''); continue; }
    // Attente bornée des checks CI en mode deploy (défaut 0 = verdict
    // instantané, comportement historique préservé pour tous les appelants
    // existants : lib certification-gate, scripts FTP, tests).
    if (k === '--wait-ms') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 0) return { error: `--wait-ms invalide : "${argv[i]}" (entier >= 0 attendu)` };
      a.waitMs = Math.floor(n);
      continue;
    }
    return { error: `argument inconnu: ${k}` };
  }
  if (!MODES.has(a.mode)) return { error: `--mode invalide : "${a.mode}" (attendu : manifest|pr|deploy)` };
  return { args: a };
}

// ── Résolution du commit contrôlé ────────────────────────────────────────────
function resolveCommit(args, reasons) {
  if (args.commit) {
    if (!SHA40.test(args.commit)) { reasons.push(`--commit invalide (sha40 attendu) : "${args.commit}"`); return null; }
    return args.commit.toLowerCase();
  }
  try {
    const sha = execFileSync('git', ['-C', args.root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (!SHA40.test(sha)) { reasons.push(`git rev-parse HEAD a renvoyé une valeur invalide : "${sha}"`); return null; }
    return sha.toLowerCase();
  } catch (e) {
    reasons.push(`commit contrôlé introuvable (git rev-parse HEAD a échoué, fournir --commit) : ${e.message.split('\n')[0]}`);
    return null;
  }
}

// ── Git helpers (mode deploy) ────────────────────────────────────────────────
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim();
}

// ── Check-runs GitHub (preuve CI authentique, liée au SHA) ──────────────────
// Rien n'est simulé : les conclusions de checks viennent de l'API GitHub pour
// le SHA EXACT. Indisponible (pas de réseau, gh absent, 404…) => null => refus.
const PREDEPLOY_REQUIRED_CHECKS = ['test-frontend', 'perf'];
function repoSlug(root) {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = git(root, ['remote', 'get-url', 'origin']);
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
    return m ? m[1] : null;
  } catch (_) { return null; }
}
function fetchCheckRuns(root, sha) {
  const slug = repoSlug(root);
  if (!slug) return null;
  try {
    const bin = process.platform === 'win32' ? 'gh.exe' : 'gh';
    const out = execFileSync(bin, ['api', `repos/${slug}/commits/${sha}/check-runs?per_page=100`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 45000,
      env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '' },
    }).trim();
    const j = JSON.parse(out);
    if (!j || !Array.isArray(j.check_runs)) return null;
    return j.check_runs;
  } catch (_) { return null; }
}
/**
 * Décision pure PREDEPLOY (testable avec payloads fixtures) :
 * les contextes requis existent sur P, sont tous terminés, et leur run le plus
 * récent par nom est `success`. Zéro pending toléré, zéro failure tolérée.
 */
function decidePredeploy(product, runs, reasons) {
  const latest = new Map();
  for (const r of runs) {
    const cur = latest.get(r.name);
    if (!cur || String(r.completed_at || '') > String(cur.completed_at || '')) latest.set(r.name, r);
  }
  const proofs = [];
  for (const ctx of PREDEPLOY_REQUIRED_CHECKS) {
    const r = latest.get(ctx);
    if (!r) { reasons.push(`predeploy: check requis "${ctx}" ABSENT sur ${product.slice(0, 8)} — jamais exécuté pour ce SHA`); continue; }
    if (r.status !== 'completed') { reasons.push(`predeploy: check "${ctx}" ${r.status} sur ${product.slice(0, 8)} — CI pas terminée, pas d'autorisation`); continue; }
    if (r.conclusion !== 'success') { reasons.push(`predeploy: check "${ctx}" conclu "${r.conclusion}" sur ${product.slice(0, 8)} — refus`); continue; }
    proofs.push({ check: ctx, conclusion: r.conclusion, url: r.html_url || null, completedAt: r.completed_at || null });
  }
  if (reasons.length) return null;
  return proofs;
}
function evaluatePredeploy(root, product, reasons, fetchOverride) {
  let runs = null;
  try {
    runs = fetchOverride ? fetchOverride() : fetchCheckRuns(root, product);
  } catch (_) { runs = null; }
  if (!runs) {
    reasons.push('predeploy: check-runs CI (test-frontend, perf) non vérifiables via API GitHub — pas de réseau / gh indisponible / SHA non poussé — refus (fail-closed, le hors-ligne local ne vaut jamais autorisation)');
    return null;
  }
  return decidePredeploy(product, runs, reasons);
}

// ── Fichiers sensibles paiements (informatif : n'autorise ni ne bloque) ─────
// Toute release touchant ces chemins exige le contrôle adapté (Payment API
// smoke post-déploiement, déjà systématique dans le workflow) et une stratégie
// de retour arrière explicite (rollback joint). Le flag ne bloque JAMAIS :
// seul le verdict technique décide (fail-open informatif, jamais fail-closed).
const PAYMENT_PATH_RE = /mollie|paypal|stripe|payment|checkout|pass-price|PremiumModal/i;
function paymentSensitiveInfo(root, product) {
  let files = [];
  try {
    files = git(root, ['diff', '--name-only', `${product}~1`, product]).split('\n').filter(Boolean);
  } catch (_) {
    return { paymentSensitive: false, paymentFiles: [], note: 'diff git invérifiable (commit racine ou historique illisible)' };
  }
  const hits = files.map(f => String(f).replace(/\\/g, '/')).filter(f => PAYMENT_PATH_RE.test(f));
  return {
    paymentSensitive: hits.length > 0,
    paymentFiles: hits.slice(0, 20),
    rollback: hits.length > 0 ? `git revert ${product} --no-edit && git push origin main` : null,
  };
}

// ── Attente bornée des checks CI (résout la course gate-vs-CI) ───────────────
// La gate s'exécute dans la même vague que les checks requis : un verdict
// instantané voit `in_progress` et refuse à jamais (aucun retry) — la livraison
// reste bloquée alors que les checks finissent verts 3 minutes plus tard.
// On attend (poll borné) que chaque check requis ait CONCLU :
//   - tous success            => prêt (la décision suit)
//   - une conclusion non-success => REFUS immédiat (attente inutile)
//   - timeout ou API muette   => REFUS fail-closed (jamais d'autorisation)
// fetchFn/sleepFn injectables => testable sans réseau (voir tests W5/W6/W8).
const WAIT_POLL_MS = 15000;
function waitForChecks(fetchFn, product, opts, reasons) {
  const o = opts || {};
  const timeoutMs = o.timeoutMs > 0 ? o.timeoutMs : 0;
  const pollMs = o.pollMs > 0 ? o.pollMs : WAIT_POLL_MS;
  const sleepFn = o.sleepFn || ((ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {} });
  const startedAt = Date.now();
  const short = product.slice(0, 8);
  for (;;) {
    let runs = null;
    try { runs = fetchFn(); } catch (_) { runs = null; }
    if (runs) {
      const latest = new Map();
      for (const r of runs) {
        const cur = latest.get(r.name);
        if (!cur || String(r.completed_at || '') > String(cur.completed_at || '')) latest.set(r.name, r);
      }
      const pending = [];
      let failed = null;
      for (const ctx of PREDEPLOY_REQUIRED_CHECKS) {
        const r = latest.get(ctx);
        if (!r) { pending.push(ctx); continue; }
        if (r.status !== 'completed') { pending.push(ctx); continue; }
        if (r.conclusion !== 'success') { failed = ctx; break; }
      }
      if (!failed && pending.length === 0) return { ready: true, runs, waitedMs: Date.now() - startedAt };
      if (failed) {
        reasons.push(`predeploy: check "${failed}" conclu "${latest.get(failed).conclusion}" sur ${short} — refus immédiat (attente inutile)`);
        return { ready: false, runs, waitedMs: Date.now() - startedAt };
      }
    }
    if (Date.now() - startedAt >= timeoutMs) {
      reasons.push(`predeploy: attente des checks CI épuisée (${timeoutMs} ms) sur ${short} — CI pas terminée ou API muette, refus fail-closed (relancer une fois les checks verts)`);
      return { ready: false, runs, waitedMs: Date.now() - startedAt };
    }
    sleepFn(Math.min(pollMs, Math.max(0, timeoutMs - (Date.now() - startedAt))));
  }
}

/**
 * Résout le commit PRODUIT EFFECTIF de HEAD : remonte la chaîne first-parent
 * en sautant les commits « attestation-only » (ne touchent que .ai/certification/).
 * Résout l'autoréférence : l'attestation pour le commit produit P vit dans des
 * commits ultérieurs qui ne modifient aucun code — le produit déployé reste P.
 * Un commit attestation touchant aussi du code n'est PAS sauté (fail-closed) :
 * il devient le commit produit et doit être attesté lui-même.
 * Un merge (>1 parent) est traité comme commit produit (fail-closed).
 */
const CERT_DIR_PREFIX = '.ai/certification/';
function effectiveProductCommit(root, reasons) {
  let head;
  try { head = git(root, ['rev-parse', 'HEAD']); } catch (e) {
    reasons.push(`deploy: git indisponible ou HEAD introuvable (${e.message.split('\n')[0]}) — refus`);
    return null;
  }
  let chain;
  try { chain = git(root, ['rev-list', '--first-parent', '-n', '64', 'HEAD']).split('\n').filter(Boolean); }
  catch (e) { reasons.push(`deploy: historique illisible (${e.message.split('\n')[0]}) — refus`); return null; }
  for (const c of chain) {
    const parents = git(root, ['rev-list', '--parents', '-n', '1', c]).split(/\s+/).slice(1);
    if (parents.length > 1) return c; // merge => commit produit, doit être attesté
    let files;
    try {
      files = (parents.length === 0
        ? git(root, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', c])
        : git(root, ['diff', '--name-only', parents[0], c])
      ).split('\n').filter(Boolean);
    } catch (e) { reasons.push(`deploy: diff illisible pour ${c} (${e.message.split('\n')[0]}) — refus`); return null; }
    const attestationOnly = files.length > 0 && files.every(f => f.replace(/\\/g, '/').startsWith(CERT_DIR_PREFIX));
    if (!attestationOnly) return c;
  }
  reasons.push('deploy: aucun commit produit trouvé (>64 commits attestation-only ou historique vide) — refus');
  return null;
}

/** Charge .ai/certification/attestations/<sha>.json (fail-closed). */
function loadAttestation(root, sha, reasons) {
  const rel = path.join('.ai', 'certification', 'attestations', `${sha}.json`);
  const abs = safeResolve(root, rel);
  if (!abs) { reasons.push(`deploy: chemin d'attestation non sûr`); return null; }
  let j;
  try { j = JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) {
    reasons.push(`deploy: attestation pour ${sha} absente/illisible/invalide (${e.code === 'ENOENT' ? 'absente' : e.message.split('\n')[0]}) — aucune preuve vérifiable pour ce commit`);
    return null;
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) { reasons.push('deploy: attestation invalide (objet attendu)'); return null; }
  if (j.version !== 2) { reasons.push(`deploy: attestation version ${JSON.stringify(j.version)} inconnue (2 attendu)`); return null; }
  if (typeof j.target !== 'string' || j.target.toLowerCase() !== sha.toLowerCase()) {
    reasons.push(`deploy: attestation.target (${j.target}) != commit produit (${sha}) — preuve rattachée à un autre commit`);
    return null;
  }
  return j;
}

// ── Utilitaires ──────────────────────────────────────────────────────────────
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/** Chemin de preuve sûr : relatif, sans remontée, résolu SOUS root. */
function safeResolve(root, rel) {
  if (typeof rel !== 'string' || !rel.trim()) return null;
  if (path.isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel) || rel.startsWith('\\\\')) return null;
  const norm = rel.replace(/\\/g, '/');
  if (norm.split('/').some(seg => seg === '..')) return null;
  const rootResolved = path.resolve(root);
  const resolved = path.resolve(rootResolved, norm);
  const relOut = path.relative(rootResolved, resolved);
  if (relOut.startsWith('..') || path.isAbsolute(relOut)) return null;
  return resolved;
}

function parseDate(s) {
  if (typeof s !== 'string' || !s.trim()) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

// ── Vérification d'une preuve ────────────────────────────────────────────────
function checkEvidence(root, ev, commit, certKey, index, reasons) {
  const label = `${certKey}[${index}]`;
  const p = `${label}.evidence`;
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) { reasons.push(`${p} : entrée de preuve invalide (objet attendu)`); return; }
  if (ev.simulated === true) { reasons.push(`${p} : preuve marquée simulated:true — un résultat simulé n'est jamais une preuve réelle`); return; }
  if (typeof ev.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(ev.sha256)) { reasons.push(`${p}(${ev.path || '?'}) : sha256 absent ou invalide — preuve non vérifiable`); return; }
  const abs = safeResolve(root, ev.path);
  if (!abs) { reasons.push(`${p} : chemin non sûr ou absent : "${String(ev.path)}"`); return; }
  let content;
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) { reasons.push(`${p} : "${ev.path}" n'est pas un fichier`); return; }
    if (st.size === 0) { reasons.push(`${p} : "${ev.path}" est vide — preuve absente`); return; }
    content = fs.readFileSync(abs);
  } catch (e) {
    reasons.push(`${p} : erreur de lecture de "${ev.path}" (${e.code || e.message}) — preuve illisible`);
    return;
  }
  if (sha256(content) !== ev.sha256.toLowerCase()) { reasons.push(`${p} : sha256 mismatch sur "${ev.path}" — preuve altérée ou non vérifiable`); return; }
  const text = content.toString('utf8');
  if (!text.toLowerCase().includes(commit)) { reasons.push(`${p} : "${ev.path}" ne scelle pas le commit contrôlé ${commit} — preuve rattachée à un autre commit`); return; }
  if (certKey === 'PRODUCTION' && MOLLIE_TEST_MARKER.test(text)) {
    reasons.push(`${p} : "${ev.path}" contient un identifiant de paiement TEST (tr_test_) — une preuve TEST ne valide jamais PRODUCTION`);
  }
}

// ── Vérification d'une certification ────────────────────────────────────────
function checkCertification(root, commit, nowMs, key, cert, reasons) {
  const label = key;
  if (!cert || typeof cert !== 'object' || Array.isArray(cert)) { reasons.push(`${label} : certification absente ou invalide`); return 'ABSENT'; }

  const rawStatus = cert.status;
  if (typeof rawStatus !== 'string' || !rawStatus.trim()) { reasons.push(`${label} : statut absent ou vide`); return 'INVALIDE'; }
  const status = rawStatus.trim();
  if (!ALLOWED_STATUS.has(status)) {
    reasons.push(`${label} : statut inconnu/ambigu "${rawStatus}" (seules valeurs autorisées : PASS, FAIL, NOT_PROVEN) — promotion bloquée`);
    return 'INVALIDE';
  }
  if (status !== 'PASS') { reasons.push(`${label} : statut ${status} != PASS — promotion globale bloquée`); return status; }

  // ── Règles communes à tout PASS ──
  if (typeof cert.commit !== 'string' || !SHA40.test(cert.commit)) { reasons.push(`${label} : PASS sans commit sha40 valide`); return status; }
  if (cert.commit.toLowerCase() !== commit) { reasons.push(`${label} : PASS rattaché au commit ${cert.commit} != commit contrôlé ${commit}`); return status; }
  const certifiedAt = parseDate(cert.certifiedAt);
  if (certifiedAt === null) { reasons.push(`${label} : certifiedAt absent ou invalide`); return status; }
  if (certifiedAt > nowMs + FUTURE_SKEW_MS) { reasons.push(`${label} : certifiedAt dans le futur (${cert.certifiedAt}) — horodatage invérifiable`); return status; }
  const expiresAt = parseDate(cert.expiresAt);
  if (expiresAt === null) { reasons.push(`${label} : expiresAt absent ou invalide — un PASS sans péremption définie est refusé`); return status; }
  if (expiresAt <= nowMs) { reasons.push(`${label} : preuve périmée (expiresAt ${cert.expiresAt} dépassé)`); return status; }
  if (expiresAt - certifiedAt > MAX_VALIDITY_MS) { reasons.push(`${label} : fenêtre de validité > 31 jours — une preuve « permanente » est refusée`); return status; }

  if (!Array.isArray(cert.evidence) || cert.evidence.length === 0) { reasons.push(`${label} : PASS sans aucune preuve (evidence[] vide) — promotion bloquée`); return status; }
  cert.evidence.forEach((ev, i) => checkEvidence(root, ev, commit, key, i, reasons));

  // ── Règles spécifiques PRODUCTION ──
  if (key === 'PRODUCTION') {
    if (cert.paymentMode !== 'live') {
      reasons.push(`PRODUCTION : paymentMode=${JSON.stringify(cert.paymentMode)} != "live" — une preuve de paiement en mode TEST ne valide jamais PRODUCTION`);
    }
  }

  // ── Règles spécifiques BUSINESS ──
  if (key === 'BUSINESS') {
    if (cert.historical === true) {
      reasons.push(`BUSINESS : historical:true — des métriques historiques ne valident jamais une certification BUSINESS`);
    }
    const op = cert.observationPeriod;
    if (!op || typeof op !== 'object') {
      reasons.push(`BUSINESS : observationPeriod absente — période d'observation indéfinie`);
    } else {
      const from = parseDate(op.from), to = parseDate(op.to);
      if (from === null || to === null) { reasons.push(`BUSINESS : observationPeriod invalide (from/to)`); }
      else {
        if (to < from) reasons.push(`BUSINESS : observationPeriod incohérente (to < from)`);
        if (to > nowMs + FUTURE_SKEW_MS) reasons.push(`BUSINESS : fin de période dans le futur — mesure non vérifiable`);
        if (nowMs - to > MAX_VALIDITY_MS) reasons.push(`BUSINESS : période close depuis plus de 31 jours — métriques historiques, non attribuables à une promotion récente`);
      }
    }
    if (typeof cert.attributedToCommit !== 'string' || cert.attributedToCommit.toLowerCase() !== commit) {
      reasons.push(`BUSINESS : attributedToCommit != commit contrôlé — métriques non attribuables à cette promotion`);
    }
  }

  return status;
}

// ── Évaluation principale (exportable pour tests) ────────────────────────────
function evaluate(opts) {
  const root = path.resolve(opts.root);
  const reasons = [];
  const perCert = {};

  const nowMs = opts.now !== undefined ? (parseDate(opts.now) ?? NaN) : Date.now();
  if (!Number.isFinite(nowMs)) {
    return { global: 'NOT_PROVEN', exit: 1, commit: null, reasons: [`--now invalide : "${opts.now}"`], certifications: {} };
  }

  const commit = resolveCommit({ root, commit: opts.commit || null }, reasons);

  // Manifeste : absent / illisible / invalide => échec (fail-closed)
  const manifestPath = safeResolve(root, opts.manifest || path.join('.ai', 'certification', 'status.json'));
  if (!manifestPath) {
    return { global: 'NOT_PROVEN', exit: 1, commit, reasons: reasons.concat(`chemin de manifeste non sûr : "${opts.manifest}"`), certifications: {} };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    const why = e.code === 'ENOENT'
      ? `manifeste absent : ${path.relative(root, manifestPath)} — aucune preuve vérifiable, certification NOT_PROVEN`
      : `manifeste illisible ou JSON invalide (${e.message.split('\n')[0]}) — certification NOT_PROVEN`;
    return { global: 'NOT_PROVEN', exit: 1, commit, reasons: reasons.concat(why), certifications: {} };
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { global: 'NOT_PROVEN', exit: 1, commit, reasons: reasons.concat('manifeste : structure invalide (objet attendu)'), certifications: {} };
  }
  if (manifest.version !== 1) reasons.push(`manifeste : version ${JSON.stringify(manifest.version)} inconnue (1 attendu)`);

  // Le manifeste doit sceller le commit contrôlé
  if (commit) {
    if (typeof manifest.controlledCommit !== 'string' || !SHA40.test(manifest.controlledCommit)) {
      reasons.push('manifeste : controlledCommit absent ou invalide (sha40 attendu)');
    } else if (manifest.controlledCommit.toLowerCase() !== commit) {
      reasons.push(`manifeste : controlledCommit ${manifest.controlledCommit} != commit contrôlé ${commit} — preuves rattachées à un autre commit`);
    }
  }

  // Certifications : exactement les trois clés, ni plus ni moins
  const certs = manifest.certifications;
  if (!certs || typeof certs !== 'object' || Array.isArray(certs)) {
    reasons.push('manifeste : certifications absentes ou invalides');
  } else {
    const keys = Object.keys(certs);
    for (const extra of keys.filter(k => !CERT_KEYS.includes(k))) {
      reasons.push(`manifeste : certification inconnue "${extra}" — ambiguïté, promotion bloquée`);
    }
    if (!commit) { for (const k of CERT_KEYS) perCert[k] = 'INVALIDE'; }
    else for (const k of CERT_KEYS) perCert[k] = checkCertification(root, commit, nowMs, k, certs[k], reasons);
  }

  const anyReason = reasons.length > 0;
  const allPass = CERT_KEYS.every(k => perCert[k] === 'PASS') && !anyReason;
  let global;
  if (allPass) global = 'PASS';
  else if (Object.values(perCert).includes('FAIL')) global = 'FAIL';
  else global = 'NOT_PROVEN';

  return { global, exit: global === 'PASS' ? 0 : 1, commit, reasons, certifications: perCert };
}

// ── CONTRÔLE A : intégrité (CI des PR) — tolère NOT_PROVEN ───────────────────
// Vérifie le vocabulaire des statuts et la structure/cohérence des attestations.
// Ne vérifie PAS les preuves métier (c'est le rôle du mode deploy). Refuse
// toute valeur inconnue/ambiguë et toute attestation forgée (nom != cible).
function evaluatePr(opts) {
  const root = path.resolve(opts.root);
  const reasons = [];
  let checked = { statusFile: 'absent', attestations: 0 };

  // status.json (déclaration roulante) : vocabulaire strict si présent
  const sp = safeResolve(root, path.join('.ai', 'certification', 'status.json'));
  if (sp && fs.existsSync(sp)) {
    let j = null;
    try { j = JSON.parse(fs.readFileSync(sp, 'utf8')); }
    catch (e) { reasons.push(`pr: status.json JSON invalide (${e.message.split('\n')[0]})`); }
    if (j) {
      if (j.version !== 1) reasons.push(`pr: status.json version ${JSON.stringify(j.version)} inconnue (1 attendu)`);
      const certs = j.certifications;
      if (!certs || typeof certs !== 'object' || Array.isArray(certs)) reasons.push('pr: status.json certificats absents/invalides');
      else {
        for (const k of Object.keys(certs)) {
          if (!CERT_KEYS.includes(k)) { reasons.push(`pr: certification inconnue "${k}" — ambiguïté bloquante`); continue; }
          const s = certs[k] && typeof certs[k].status === 'string' ? certs[k].status.trim() : '';
          if (!ALLOWED_STATUS.has(s)) reasons.push(`pr: ${k} statut inconnu/ambigu "${s || '(vide)'}" (PASS|FAIL|NOT_PROVEN attendus)`);
        }
      }
      checked.statusFile = 'lu';
    }
  }

  // attestations : nom sha40, version 2, target == nom, statuts vocabulaire
  const adir = path.join(root, '.ai', 'certification', 'attestations');
  if (fs.existsSync(adir)) {
    let files = [];
    try { files = fs.readdirSync(adir).filter(f => f.endsWith('.json')); }
    catch (e) { reasons.push(`pr: attestations illisibles (${e.message.split('\n')[0]})`); }
    for (const f of files) {
      const sha = f.slice(0, -5);
      if (!SHA40.test(sha)) { reasons.push(`pr: attestation "${f}" — nom de fichier != sha40 de la cible`); continue; }
      let j = null;
      try { j = JSON.parse(fs.readFileSync(path.join(adir, f), 'utf8')); }
      catch (e) { reasons.push(`pr: attestation "${f}" JSON invalide (${e.message.split('\n')[0]})`); continue; }
      if (!j || j.version !== 2) { reasons.push(`pr: attestation "${f}" version invalide (2 attendu)`); continue; }
      if (typeof j.target !== 'string' || j.target.toLowerCase() !== sha.toLowerCase()) {
        reasons.push(`pr: attestation "${f}" target=${j.target} != nom du fichier — attestation forgée ou corrompue`);
        continue;
      }
      const certs = j.certifications;
      if (!certs || typeof certs !== 'object' || Array.isArray(certs)) { reasons.push(`pr: attestation "${f}" sans certifications valides`); continue; }
      for (const k of CERT_KEYS) {
        const s = certs[k] && typeof certs[k].status === 'string' ? certs[k].status.trim() : '';
        if (!s) { reasons.push(`pr: attestation "${f}" : ${k} absent`); continue; }
        if (!ALLOWED_STATUS.has(s)) reasons.push(`pr: attestation "${f}" : ${k} statut inconnu/ambigu "${s}"`);
      }
      checked.attestations++;
    }
  }

  return { mode: 'pr', ok: reasons.length === 0, exit: reasons.length ? 1 : 0, reasons, checked };
}

// ── CONTRÔLE B : certification stricte avant promotion/déploiement ───────────
// États séparés (contrat v3) :
//   PRODUCTION_VERIFIED  — attestation complète committée et valide pour le
//                          commit produit (trois PASS + preuves scellées au
//                          SHA, non périmées, règles PRODUCTION/BUSINESS).
//                          IMPLIQUE une vérification post-déploiement réelle
//                          antérieure (une preuve de production n'est jamais
//                          fabriquée depuis un build local ou des mocks).
//   PREDEPLOY_ELIGIBLE   — pas d'attestation complète, MAIS les checks CI
//                          requis (test-frontend, perf) sont VERTS sur GitHub
//                          pour le SHA exact : tests+build+smoke+budget et
//                          identité d'artefact validés pour CE commit.
//                          Autorise le déploiement ; la version déployée reste
//                          DEPLOYED_PENDING_VERIFICATION jusqu'au contrôle
//                          post-déploiement réel (post-deploy-verify).
//   NOT_PROVEN / FAIL    — preuve manquante, checks absents/rouges/encours,
//                          API indisponible, attestation corrompue => REFUS.
//
// Une attestation PRÉSENTE mais invalide (hash, scellement, péremption) REFUSE
// immédiatement : aucun repli sur la voie predeploy face à une preuve altérée.
// AUCUNE option ne court-circuite ce verdict : --now et --commit ignorés ici.
function evaluateDeploy(opts, overrides) {
  const root = path.resolve(opts.root);
  const deps = overrides || {};
  const reasons = [];
  const nowMs = Date.now();

  const product = effectiveProductCommit(root, reasons);
  if (!product) return { mode: 'deploy', global: 'NOT_PROVEN', decision: 'REFUSE', stage: 'NOT_PROVEN', exit: 1, productCommit: null, reasons, certifications: {} };

  // ── Voie 1 : attestation complète (PRÉSENTE ⇒ doit être pleinement valide) ──
  const attAbs = safeResolve(root, path.join('.ai', 'certification', 'attestations', `${product}.json`));
  const attExists = attAbs ? fs.existsSync(attAbs) : false;
  if (attExists) {
    const att = loadAttestation(root, product, reasons);
    if (att) {
      const certs = att.certifications;
      const perCert = {};
      if (!certs || typeof certs !== 'object' || Array.isArray(certs)) {
        reasons.push('deploy: attestation sans certifications valides');
      } else {
        for (const extra of Object.keys(certs).filter(k => !CERT_KEYS.includes(k))) {
          reasons.push(`deploy: certification inconnue "${extra}" — ambiguïté bloquante`);
        }
        for (const k of CERT_KEYS) perCert[k] = checkCertification(root, product, nowMs, k, certs[k], reasons);
      }
      if (CERT_KEYS.every(k => perCert[k] === 'PASS') && reasons.length === 0) {
        return {
          mode: 'deploy', global: 'PASS', decision: 'ALLOW', stage: 'PRODUCTION_VERIFIED', exit: 0,
          productCommit: product, attestedAt: att.createdAt || null, proofs: [{ check: 'attestation', target: product }],
          reasons, certifications: perCert,
        };
      }
      // Attestation présente mais invalide/incomplète => REFUS dur (intégrité).
      return {
        mode: 'deploy', global: 'NOT_PROVEN', decision: 'REFUSE', stage: 'NOT_PROVEN', exit: 1,
        productCommit: product, reasons: reasons.concat('deploy: attestation présente mais invalide/incomplète — aucun repli predeploy face à une preuve altérée'),
        certifications: perCert,
      };
    }
    return { mode: 'deploy', global: 'NOT_PROVEN', decision: 'REFUSE', stage: 'NOT_PROVEN', exit: 1, productCommit: product, reasons, certifications: {} };
  }

  // ── Voie 2 : PREDEPLOY_ELIGIBLE via les check-runs CI réels du SHA ─────────
  // waitMs > 0 (workflow) : attente bornée anti-course gate-vs-CI.
  // waitMs = 0 (défaut) : verdict instantané, comportement historique préservé
  // pour la lib certification-gate, les scripts FTP et les tests existants.
  const waitMs = Number.isFinite(deps.waitMs) ? deps.waitMs
    : (Number.isFinite(opts.waitMs) ? opts.waitMs : 0);
  const fetchFn = deps.fetchCheckRuns || (() => fetchCheckRuns(root, product));
  let proofs = null;
  let waitedMs = 0;
  if (waitMs > 0) {
    const w = waitForChecks(fetchFn, product, { timeoutMs: waitMs, pollMs: deps.pollMs, sleepFn: deps.sleepFn }, reasons);
    waitedMs = w.waitedMs;
    if (w.ready) proofs = decidePredeploy(product, w.runs, reasons);
    // sinon reasons contient déjà l'échec immédiat ou le timeout
  } else {
    proofs = evaluatePredeploy(root, product, reasons, deps.fetchCheckRuns);
  }
  // Sensibilité paiements : informative uniquement (ne bloque jamais).
  const pay = paymentSensitiveInfo(root, product);
  if (proofs) {
    return {
      mode: 'deploy', global: 'PREDEPLOY_ELIGIBLE', decision: 'ALLOW', stage: 'PREDEPLOY_ELIGIBLE', exit: 0,
      productCommit: product, proofs, waitedMs,
      paymentSensitive: pay.paymentSensitive, paymentFiles: pay.paymentFiles, rollback: pay.rollback,
      reasons: ['predeploy: éligible via checks CI verts — la version déployée restera DEPLOYED_PENDING_VERIFICATION jusqu\'au contrôle post-déploiement réel'],
      certifications: { TECHNICAL: 'PASS', PRODUCTION: 'NOT_PROVEN', BUSINESS: 'NOT_PROVEN' },
    };
  }
  return {
    mode: 'deploy', global: 'NOT_PROVEN', decision: 'REFUSE', stage: 'NOT_PROVEN', exit: 1,
    productCommit: product, reasons, waitedMs,
    paymentSensitive: pay.paymentSensitive, paymentFiles: pay.paymentFiles, rollback: pay.rollback, certifications: {},
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  let code = 1; // fail-closed par défaut : toute surprise => non nul
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.error) {
      console.error(`ARGUMENT INVALIDE : ${parsed.error}`);
      process.exit(1);
    }
    const a = parsed.args;
    let r;
    if (a.mode === 'pr') {
      r = evaluatePr({ root: a.root });
    } else if (a.mode === 'deploy') {
      r = evaluateDeploy({ root: a.root }, { waitMs: a.waitMs });
    } else {
      r = evaluate({ root: a.root, commit: a.commit, manifest: a.manifest, now: a.now === null ? undefined : a.now });
    }
    code = r.exit;

    if (a.json) {
      console.log(JSON.stringify(r, null, 2));
    } else if (a.mode === 'pr') {
      console.log('=== CHECK_certification_status [CONTRÔLE A — intégrité PR] ===');
      console.log(`  racine            : ${a.root}`);
      console.log(`  status.json       : ${r.checked.statusFile} · attestations lues : ${r.checked.attestations}`);
      if (r.reasons.length) { console.log('  violations :'); for (const m of r.reasons) console.log(`    - ${m}`); }
      console.log(r.ok
        ? '\nINTÉGRITÉ OK (le vocabulaire est strict ; NOT_PROVEN reste un état admis et honnête).'
        : '\nINTÉGRITÉ ROMPUE — valeur inconnue/ambiguë ou attestation forgée : PR bloquée.');
    } else {
      console.log(`=== CHECK_certification_status [mode ${a.mode}] ===`);
      console.log(`  racine            : ${a.root}`);
      if (a.mode === 'deploy') {
        console.log(`  commit produit    : ${r.productCommit || '(irrésolu)'}`);
        console.log(`  décision          : ${r.decision} · stade : ${r.stage}`);
        if (typeof r.waitedMs === 'number') console.log(`  attente CI        : ${r.waitedMs} ms`);
        if (r.paymentSensitive) {
          console.log(`  paiements         : release SENSIBLE (${(r.paymentFiles || []).join(', ')}) — contrôle Payment API smoke requis + rollback : ${r.rollback}`);
        }
        if (r.proofs) for (const p of r.proofs) console.log(`  preuve            : ${p.check}${p.conclusion ? ' = ' + p.conclusion : ''}${p.completedAt ? ' @ ' + p.completedAt : ''}${p.target ? ' target=' + p.target.slice(0, 8) : ''}`);
      }
      else console.log(`  commit contrôlé   : ${r.commit || '(introuvable)'}`);
      for (const k of CERT_KEYS) console.log(`  ${k.padEnd(11)} : ${r.certifications[k] || 'NON ÉVALUÉ'}`);
      if (r.reasons.length) {
        console.log('  motifs de blocage / relevés :');
        for (const m of r.reasons) console.log(`    - ${m}`);
      }
      console.log(`  GLOBAL : ${r.global}`);
      if (a.mode === 'deploy' && r.stage === 'PREDEPLOY_ELIGIBLE') {
        console.log('\nDéploiement AUTORISÉ (stade PREDEPLOY_ELIGIBLE) : checks CI verts sur le SHA exact.');
        console.log('La version déployée reste DEPLOYED_PENDING_VERIFICATION jusqu\'au contrôle post-déploiement réel.');
      } else if (r.global === 'PASS') {
        console.log('\nCertification globale AUTORISÉE : trois certifications PASS avec preuves vérifiées.'
          + (a.mode === 'deploy' ? ` Cible attestée : ${r.productCommit} (stade PRODUCTION_VERIFIED).` : ''));
      } else {
        console.log('\nCertification globale BLOQUÉE. En cas de doute : pas de promotion, pas de déploiement.');
      }
    }
  } catch (e) {
    // Jamais de crash muet : l'erreur de vérification est un échec explicite.
    console.error(`ERREUR DE VÉRIFICATION : ${(e && e.message) || e}`);
    code = 1;
  }
  process.exit(code);
}

module.exports = { evaluate, evaluatePr, evaluateDeploy, decidePredeploy, waitForChecks, paymentSensitiveInfo, PREDEPLOY_REQUIRED_CHECKS };
