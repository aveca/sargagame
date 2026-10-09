// Certification Attestation Generator v2
// Generates attestations for commit SHA with 3 independent certification modes

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
let opts = {
  commit: null,
  modes: [],
  paymentId: null,
  periodFrom: null,
  periodTo: null,
  expiresDays: 31
};

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

// Build attestation path early
const attestPath = path.join(ROOT, '.ai', 'certification', 'attestations', `${opts.commit.toLowerCase()}.json`);

// EVIDENCE_TYPES defines what evidence paths to check for each mode
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
    { key: 'metrics', path: 'scripts/automation/daily-metrics.json', desc: 'Business metrics' },
  ],
  BUSINESS: [
    { key: 'metrics', path: 'scripts/automation/daily-metrics.json', desc: 'Business metrics' },
    { key: 'analytics', path: 'scripts/automation/data/ux-daily.json', desc: 'UX analytics' },
  ],
};

// Collect evidence for a list of keys
function collectEvidence(keys) {
  const evidence = [];
  for (const key of keys) {
    const typeEntry = Object.values(EVIDENCE_TYPES).flat().find(e => e.key === key);
    if (!typeEntry) continue;

    const abs = path.join(ROOT, typeEntry.path);
    if (fs.existsSync(abs)) {
      try {
        const st = fs.statSync(abs);
        if (st.isFile() && st.size > 0) {
          const sha = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
          evidence.push({
            key: typeEntry.key,
            path: typeEntry.path,
            desc: typeEntry.desc,
            sha256: sha,
            size: st.size,
            mtime: fs.statSync(abs).mtime.toISOString(),
          });
        }
      } catch (e) {
        console.warn(`Warning: failed to read evidence ${typeEntry.path}: ${e.message}`);
      }
    }
  }
  return evidence;
}

// Generate attestation for a mode (or all modes combined)
function generateAttestation(mode) {
  const modeTypes = {
    TECHNICAL: ['build', 'bundle', 'ci', 'security'],
    PRODUCTION: ['deploy', 'smoke', 'payment', 'metrics'],
    BUSINESS: ['metrics', 'analytics'],
  }[mode] || [];

  const evidence = collectEvidence(modeTypes);

  const attestation = {
    commit: opts.commit,
    mode: mode,
    evidence: evidence,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + opts.expiresDays * 86400000).toISOString(),
  };

  // Write attestation
  if (!fs.existsSync(path.join(ROOT, '.ai', 'certification', 'attestations'))) {
    fs.mkdirSync(path.join(ROOT, '.ai', 'certification', 'attestations'), { recursive: true });
  }
  if (!fs.existsSync(path.join(ROOT, '.ai', 'certification', 'evidence'))) {
    fs.mkdirSync(path.join(ROOT, '.ai', 'certification', 'evidence'), { recursive: true });
  }

  fs.writeFileSync(attestPath, JSON.stringify(attestation, null, 2));
  console.log(`Attestation written to ${attestPath}`);

  return attestation;
}

// Main
try {
  console.log('Generating certification attestation...');
  console.log('Commit:', opts.commit);
  console.log('Modes:', opts.modes.join(', '));

  const allModes = opts.modes.includes('all') || opts.modes.length === 0;
  const modesToGenerate = allModes ? ['TECHNICAL', 'PRODUCTION', 'BUSINESS'] : opts.modes;

  // When generating all modes, accumulate evidence from all modes into one attestation
  if (allModes) {
    const allEvidence = [];
    const seenKeys = new Set();

    for (const mode of modesToGenerate) {
      const modeTypes = {
        TECHNICAL: ['build', 'bundle', 'ci', 'security'],
        PRODUCTION: ['deploy', 'smoke', 'payment', 'metrics'],
        BUSINESS: ['metrics', 'analytics'],
      }[mode] || [];

      const evidence = collectEvidence(modeTypes);
      for (const ev of evidence) {
        if (!seenKeys.has(ev.key)) {
          allEvidence.push(ev);
          seenKeys.add(ev.key);
        }
      }
    }

    const attestation = {
      commit: opts.commit,
      mode: 'all',
      evidence: allEvidence,
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + opts.expiresDays * 86400000).toISOString(),
    };

    fs.writeFileSync(attestPath, JSON.stringify(attestation, null, 2));
    console.log(`Attestation written to ${attestPath}`);
    console.log('All modes attestation generated with combined evidence');
  } else {
    // Generate individual mode attestations (each overwrites the same file)
    for (const mode of modesToGenerate) {
      generateAttestation(mode);
    }
  }

  console.log('Attestation generated successfully');
  console.log('Commit:', opts.commit);
  console.log('Modes:', opts.modes.join(', '));
  if (opts.paymentId) console.log('Payment ID:', opts.paymentId);
  if (opts.periodFrom && opts.periodTo) console.log('Period:', opts.periodFrom, 'to', opts.periodTo);
  process.exit(0);
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}