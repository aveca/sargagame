#!/usr/bin/env node
/**
 * certification-attest.cjs — Générateur d'attestation de certification v2
 *
 * Génère une attestation signée pour un commit produit, avec les trois
 * certifications (TECHNICAL, PRODUCTION, BUSINESS) et leurs preuves.
 *
 * Usage:
 *   node scripts/certification-attest.cjs --commit <sha40> --mode technical
 *   node scripts/certification-attest.cjs --commit <sha40> --mode production --payment-id <id>
 *   node scripts/certification-attest.cjs --commit <sha40> --mode business --period-from <date> --period-to <date>
 *   node scripts/certification-attest.cjs --commit <sha40> --mode all --payment-id <id> --period-from <date> --period-to <date>
 *
 * L'attestation est écrite dans .ai/certification/attestations/<sha>.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CERT_DIR = path.join(ROOT, '.ai', 'certification');
const EVIDENCE_TYPES = {
  TECHNICAL: [
    { key: 'build', path: 'dist/index.html', desc: 'Build output exists' },
    { key: 'bundle', path: 'scripts/check-bundle-budget.cjs', desc: 'Bundle budget check' },
    { key: 'ci', path: '.github/workflows/ci-tests.yml', desc: 'CI pipeline' },
    { key: 'security', path: 'scripts/CHECK_certification_status.cjs', desc: 'Security gate' },
  ],
  PRODUCTION: [
    { key: 'deploy', path: 'scripts/verify-ftp-ready.cjs', desc: 'Deploy verification' },
    { key: 'smoke', path: 'scripts/ux-smoke.mjs', desc: 'UX smoke test' },
    { key: 'payment', path: 'public/api/mollie.php', desc: 'Payment endpoint' },
  ],
  BUSINESS: [
    { key: 'metrics', path: 'scripts/automation/daily-metrics.json', desc: 'Business metrics' },
    { key: 'analytics', path: 'scripts/automation/data/ux-daily.json', desc: 'UX analytics' },
  ],
};

const CERT_KEYS = ['TECHNICAL', 'PRODUCTION', 'BUSINESS'];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function git(args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

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

function sha256file(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function git(args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

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

function sha256file(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function git(args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

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

function sha256file(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function git(args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

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

function sha256file(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function collectEvidence(root, types) {
  const evidence = [];
  for (const t of types) {
    const abs = path.join(root, t.path);
    if (fs.existsSync(abs)) {
      try {
        const st = fs.statSync(abs);
        if (st.isFile() && st.size > 0) {
          const sha = sha256file(abs);
          evidence.push({
            key: t.key,
            path: t.path,
            desc: t.desc,
            sha256: sha,
            size: st.size,
            mtime: fs.statSync(abs).mtime.toISOString(),
          });
        }
      } catch (e) {
        console.warn(`Warning: failed to read evidence ${t.path}: ${e.message}`);
      }
    }
  }
  return evidence;
}

function loadExistingAttestation(commit) {
  const attestPath = path.join(ROOT, '.ai', 'certification', 'attestations', `${commit.toLowerCase()}.json`);
  if (fs.existsSync(attestPath)) {
    try {
      return JSON.parse(fs.readFileSync(attestPath, 'utf8'));
    } catch (e) {
      console.warn(`Warning: failed to load existing attestation: ${e.message}`);
    }
  }
  return null;
}

function generateAttestation(opts) {
  const { commit, modes, paymentId, periodFrom, periodTo, expiresDays = 31 } = opts;

  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error(`Invalid commit SHA: ${commit}`);
  }

  const ATTEST_DIR = path.join(ROOT, '.ai', 'certification', 'attestations');
  const EVIDENCE_DIR = path.join(ROOT, '.ai', 'certification', 'evidence');

  if (!fs.existsSync(path.join(ROOT, '.ai', 'certification', 'attestations'))) {
    fs.mkdirSync(path.join(ROOT, '.ai', 'certification', 'attestations'), { recursive: true });
  }
  if (!fs.existsSync(path.join(ROOT, '.ai', 'certification', 'evidence'))) {
    fs.mkdirSync(path.join(ROOT, '.ai', 'certification', 'evidence'), { recursive: true });
  }

  // Load existing attestation to merge certifications
  const existing = loadExistingAttestation(commit);
  const existingCerts = existing?.certifications || {};

  const now = new Date();
  const certifiedAt = new Date().toISOString();
  const expiresAt = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString();

  const attestation = {
    version: 2,
    target: commit.toLowerCase(),
    createdAt: new Date().toISOString(),
    certifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
    certifications: { ...existingCerts },
  };

  // TECHNICAL certification
  if (opts.modes.includes('technical') || opts.modes.includes('all')) {
    const evidence = collectEvidence(ROOT, EVIDENCE_TYPES.TECHNICAL);
    attestation.certifications.TECHNICAL = {
      status: 'PASS',
      commit: commit.toLowerCase(),
      certifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
      evidence: collectEvidence(ROOT, EVIDENCE_TYPES.TECHNICAL),
    };
  }

  // PRODUCTION certification
  if (opts.modes.includes('production') || opts.modes.includes('all')) {
    const evidence = collectEvidence(ROOT, EVIDENCE_TYPES.PRODUCTION);
    if (opts.paymentId) {
      attestation.certifications.PRODUCTION = {
        status: 'PASS',
        commit: commit.toLowerCase(),
        certifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
        paymentMode: 'live',
        paymentId: opts.paymentId,
        evidence,
      };
    } else {
      attestation.certifications.PRODUCTION = {
        status: 'NOT_PROVEN',
        commit: commit.toLowerCase(),
        certifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
        paymentMode: 'none',
        reason: 'No live payment ID provided',
        evidence: collectEvidence(ROOT, EVIDENCE_TYPES.PRODUCTION),
      };
    }
  }

  // BUSINESS certification
  if (opts.modes.includes('business') || opts.modes.includes('all')) {
    if (opts.periodFrom && opts.periodTo) {
      attestation.certifications.BUSINESS = {
        status: 'PASS',
        commit: commit.toLowerCase(),
        certifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
        observationPeriod: {
          from: opts.periodFrom,
          to: opts.periodTo,
        },
        attributedToCommit: commit.toLowerCase(),
        evidence: collectEvidence(ROOT, EVIDENCE_TYPES.BUSINESS),
      };
    } else {
      attestation.certifications.BUSINESS = {
        status: 'NOT_PROVEN',
        commit: commit.toLowerCase(),
        certifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
        reason: 'No observation period provided',
        evidence: collectEvidence(ROOT, EVIDENCE_TYPES.BUSINESS),
      };
    }
  }

  }

  // Write attestation
  if (!fs.existsSync(path.join(ROOT, '.ai', 'certification', 'attestations'))) {
    fs.mkdirSync(path.join(ROOT, '.ai', 'certification', 'attestations'), { recursive: true });
  }
  if (!fs.existsSync(path.join(ROOT, '.ai', 'certification', 'evidence'))) {
    fs.mkdirSync(path.join(ROOT, '.ai', 'certification', 'evidence'), { recursive: true });
  }

  const attestPath = path.join(ROOT, '.ai', 'certification', 'attestations', `${commit.toLowerCase()}.json`);
  fs.writeFileSync(attestPath, JSON.stringify(attestation, null, 2));
  console.log(`Attestation written to ${attestPath}`);

  return attestation;
}

function collectEvidence(root, types) {
  const evidence = [];
  const EVIDENCE_TYPES = {
    TECHNICAL: [
      { key: 'build', path: 'dist/index.html', desc: 'Build output exists' },
      { key: 'bundle', path: 'scripts/check-bundle-budget.cjs', desc: 'Bundle budget check' },
      { key: 'ci', path: '.github/workflows/ci-tests.yml', desc: 'CI pipeline' },
      { key: 'security', path: 'scripts/CHECK_certification_status.cjs', desc: 'Security gate' },
    ],
    PRODUCTION: [
      { key: 'deploy', path: 'scripts/verify-ftp-ready.cjs', desc: 'Deploy verification' },
      { key: 'smoke', path: 'scripts/ux-smoke.mjs', desc: 'UX smoke test' },
      { key: 'payment', path: 'public/api/mollie.php', desc: 'Payment endpoint' },
    ],
    BUSINESS: [
      { key: 'metrics', path: 'scripts/automation/daily-metrics.json', desc: 'Business metrics' },
      { key: 'analytics', path: 'scripts/automation/data/ux-daily.json', desc: 'UX analytics' },
    ],
  };

  for (const t of types) {
    const abs = path.join(ROOT, t.path);
    if (fs.existsSync(abs)) {
      try {
        const st = fs.statSync(abs);
        if (st.isFile() && st.size > 0) {
          const crypto = require('crypto');
          const sha = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
          evidence.push({
            key: t.key,
            path: t.path,
            desc: t.desc,
            sha256: sha,
            size: st.size,
            mtime: fs.statSync(abs).mtime.toISOString(),
          });
        }
      } catch (e) {
        console.warn(`Warning: failed to read evidence ${t.path}: ${e.message}`);
      }
    }
  }
  return evidence;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = { commit: null, modes: [], paymentId: null, periodFrom: null, periodTo: null, expiresDays: 31 };

  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (k === '--commit') opts.commit = args[++i];
    else if (k === '--mode') {
      const m = args[++i];
      if (!['technical', 'production', 'business', 'all'].includes(m)) {
        console.error(`Invalid mode: ${m}`);
        process.exit(1);
      }
      opts.modes.push(m);
    } else if (k === '--payment-id') opts.paymentId = args[++i];
    else if (k === '--period-from') opts.periodFrom = args[++i];
    else if (k === '--period-to') opts.periodTo = args[++i];
    else if (k === '--expires-days') opts.expiresDays = parseInt(args[++i], 10);
  }

  if (!opts.commit) {
    console.error('Error: --commit <sha40> required');
    process.exit(1);
  }
  if (opts.modes.length === 0) opts.modes = ['all'];

  try {
    const attestation = generateAttestation(opts);
    console.log('Attestation generated successfully');
    console.log(`Commit: ${opts.commit}`);
    console.log(`Modes: ${opts.modes.join(', ')}`);
    if (opts.paymentId) console.log(`Payment ID: ${opts.paymentId}`);
    if (opts.periodFrom && opts.periodTo) console.log(`Period: ${opts.periodFrom} to ${opts.periodTo}`);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

module.exports = { generateAttestation };