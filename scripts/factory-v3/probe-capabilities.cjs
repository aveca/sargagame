#!/usr/bin/env node
/**
 * Factory V3 — Sonde de capacités de connexion (lecture seule).
 *
 * Vérifie, SANS rien modifier, que la session d'agent dispose de :
 *   1. une authentification GitHub CLI exploitable ;
 *   2. des permissions suffisantes sur le dépôt `aveca/sargagame` ;
 *   3. un accès en lecture aux workflows, runs, jobs et logs GitHub Actions ;
 *   4. un accès en lecture à la variable Actions `CLOUDFLARE_DEPLOY_ENABLED` ;
 *   5. un accès en lecture à Cloudflare Pages pour les six projets de production.
 *
 * AUCUN déploiement, AUCUN POST, AUCUN checkout, AUCUN secret lu ou écrit,
 * AUCUN Worker touché. Les valeurs de secrets ne sont jamais lues (l'API GitHub
 * ne les retourne pas de toute façon) : seuls leurs NOMS sont comptés.
 *
 * Usage :
 *   node scripts/factory-v3/probe-capabilities.cjs            # rapport lisible
 *   node scripts/factory-v3/probe-capabilities.cjs --json     # rapport JSON
 *   node scripts/factory-v3/probe-capabilities.cjs --write-state  # + state/config.json
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = 'aveca/sargagame';
const ACCOUNT_ID = 'abf2b92cf718313567b4b38eb9dda17f';
const PAGES_PROJECTS = [
  'sargagame',
  'sargagame-gp',
  'sargagame-florida',
  'sargagame-puntacana',
  'sargagame-rivieramaya',
  'sargagame-tulum',
];
const GH_BIN = process.env.GH_BIN ||
  (fs.existsSync('C:\\Program Files\\GitHub CLI\\gh.exe')
    ? 'C:\\Program Files\\GitHub CLI\\gh.exe'
    : 'gh');
const WRANGLER_CFG = path.join(
  os.homedir(),
  'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml',
);
const STATE_DIR = path.resolve(__dirname, 'state');
const CONFIG_FILE = path.join(STATE_DIR, 'config.json');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const writeState = args.includes('--write-state');

const report = {
  checked_at: new Date().toISOString(),
  host: os.hostname(),
  platform: process.platform,
  node: process.version,
  github: {},
  actions: {},
  cloudflare: {},
  gates: {},
  problems: [],
  verdict: 'UNKNOWN',
};

function gh(argsList) {
  return execFileSync(GH_BIN, argsList, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: 120000,
  });
}

function ghJson(argsList) {
  return JSON.parse(gh(argsList));
}

function section(title) {
  if (!asJson) console.log(`\n=== ${title} ===`);
}

// ---------------------------------------------------------------- GitHub CLI
section('GitHub CLI');
try {
  const version = (gh(['--version']) || '').split('\n')[0].trim();
  const user = ghJson(['api', 'user']);
  report.github = {
    cli: GH_BIN,
    version,
    authenticated: true,
    login: user.login,
    id: user.id,
    account_type: user.type,
    token_storage: 'keyring (gh auth status)',
  };
  if (!asJson) console.log(`  ${version} | user=${user.login} (${user.type}, id=${user.id})`);
} catch (e) {
  report.github = { authenticated: false, error: String(e.message || e) };
  report.problems.push('gh CLI non authentifie ou introuvable');
  if (!asJson) console.log(`  ECHEC : ${report.github.error}`);
}

// ------------------------------------------------- Permissions sur le dépôt
section('Permissions dépôt');
try {
  const repo = ghJson(['api', `repos/${REPO}`]);
  report.github.permissions = repo.permissions;
  report.github.default_branch = repo.default_branch;
  report.github.visibility = repo.visibility;
  report.github.archived = repo.archived;
  const p = repo.permissions || {};
  const sufficient = !!p.admin || (!!p.push && !!p.pull);
  report.github.sufficient_for_actions = sufficient;
  if (!asJson) {
    console.log(`  ${repo.full_name} | ${repo.visibility} | branche par defaut=${repo.default_branch}`);
    console.log(`  permissions: ${JSON.stringify(p)}`);
    console.log(`  suffisant pour Actions (read+write) : ${sufficient ? 'OUI' : 'NON'}`);
  }
  if (!sufficient) report.problems.push('permissions depot insuffisantes pour piloter Actions');
} catch (e) {
  report.github.permissions = null;
  report.problems.push(`acces au depot ${REPO} refuse : ${String(e.message || e).slice(0, 120)}`);
  if (!asJson) console.log(`  ECHEC : ${report.problems[report.problems.length - 1]}`);
}

// ------------------------------------------------------- GitHub Actions
section('GitHub Actions');
try {
  const workflows = ghJson(['api', `repos/${REPO}/actions/workflows`]);
  const runs = ghJson(['api', `repos/${REPO}/actions/runs?per_page=5`]);
  const variables = ghJson(['api', `repos/${REPO}/actions/variables`]);
  const secrets = ghJson(['api', `repos/${REPO}/actions/secrets`]);

  const deployEnabled = variables.variables.find((v) => v.name === 'CLOUDFLARE_DEPLOY_ENABLED');
  let deployEnabledValue = null;
  if (deployEnabled) {
    try {
      deployEnabledValue = ghJson(['api', `repos/${REPO}/actions/variables/CLOUDFLARE_DEPLOY_ENABLED`]).value;
    } catch (_) { /* lecture non permise */ }
  }

  const target = workflows.workflows.find((w) => w.path === '.github/workflows/pages-code-only-release.yml');
  let targetRuns = null;
  if (target) {
    try {
      targetRuns = ghJson(['api', `repos/${REPO}/actions/workflows/${target.id}/runs?per_page=1`]).total_count;
    } catch (_) { targetRuns = null; }
  }

  // Lecture des logs d'un job (preuve que les artefacts de CI sont lisibles).
  let logsReadable = false;
  let logSample = null;
  try {
    const first = runs.workflow_runs.find((r) => r.id);
    if (first) {
      const jobs = ghJson(['api', `repos/${REPO}/actions/runs/${first.id}/jobs`]);
      const job = (jobs.jobs || [])[0];
      if (job) {
        // Sans `--include` : gh renvoie directement le corps (texte brut des logs).
        // `--allow-escape-sequences` : les logs CI contiennent des codes ANSI.
        const body = execFileSync(GH_BIN,
          ['api', `repos/${REPO}/actions/jobs/${job.id}/logs`, '--allow-escape-sequences'],
          { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
        logsReadable = typeof body === 'string' && body.length > 0;
        logSample = {
          run_id: first.id,
          job_id: job.id,
          job_name: job.name,
          bytes: Buffer.byteLength(String(body)),
        };
      }
    }
  } catch (_) { logsReadable = false; }

  report.actions = {
    workflows_visible: workflows.total_count,
    runs_readable: runs.total_count,
    recent_runs: runs.workflow_runs.map((r) => ({
      id: r.id, name: r.name, status: r.status, conclusion: r.conclusion,
      event: r.event, branch: r.head_branch, sha: (r.head_sha || '').slice(0, 9),
    })),
    variables_visible: variables.total_count,
    secrets_names_visible: secrets.total_count,
    cloudflare_deploy_enabled: deployEnabledValue,
    target_workflow: target
      ? { id: target.id, name: target.name, path: target.path, state: target.state, total_runs: targetRuns }
      : null,
    logs_readable: logsReadable,
    log_sample: logSample,
  };

  if (!asJson) {
    console.log(`  workflows visibles : ${workflows.total_count}`);
    console.log(`  runs lisibles      : ${runs.total_count} (total), ${runs.workflow_runs.length} affiches`);
    console.log(`  variables lisibles : ${variables.total_count}`);
    console.log(`  noms de secrets    : ${secrets.total_count} (VALEURS jamais lues)`);
    console.log(`  CLOUDFLARE_DEPLOY_ENABLED = ${deployEnabledValue === null ? '(non lisible)' : deployEnabledValue}`);
    console.log(`  workflow cible     : ${target ? `${target.path} (id=${target.id}, ${targetRuns} run(s))` : 'ABSENT'}`);
    console.log(`  logs de job        : ${logsReadable ? 'LISIBLES' : 'NON VERIFIES'}`);
  }
  if (deployEnabledValue === null) report.problems.push('CLOUDFLARE_DEPLOY_ENABLED non lisible');
  if (!target) report.problems.push('workflow pages-code-only-release.yml introuvable');
  if (!logsReadable) report.problems.push('lecture des logs de job non verifiee');
} catch (e) {
  report.actions = { error: String(e.message || e) };
  report.problems.push(`acces GitHub Actions refuse : ${String(e.message || e).slice(0, 120)}`);
  if (!asJson) console.log(`  ECHEC : ${report.actions.error}`);
}

// ------------------------------------------- Cloudflare Pages (lecture)
async function probeCloudflare() {
  section('Cloudflare Pages (lecture)');
  try {
    // Le token OAuth wrangler expire (~1 h). On force un rafraîchissement en
    // amont : sans cela l'API renvoie 401 alors que la session est valide.
    let refreshed = false;
    try {
      execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['wrangler', 'whoami'], { encoding: 'utf8', timeout: 180000, stdio: 'pipe' });
      refreshed = true;
    } catch (_) { /* on tente quand meme avec le token present */ }

    const raw = fs.readFileSync(WRANGLER_CFG, 'utf8');
    const token = (raw.match(/oauth_token\s*=\s*"([^"]+)"/) || [])[1];
    if (!token) throw new Error('oauth_token absent de la configuration wrangler');
    const expires = (raw.match(/expiration_time\s*=\s*"([^"]+)"/) || [])[1] || null;
    const h = { authorization: `Bearer ${token}` };
    const projects = {};
    for (const p of PAGES_PROJECTS) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${p}/deployments?env=production&per_page=1`;
      let res = null;
      for (let attempt = 1; attempt <= 3 && (!res || !res.ok); attempt++) {
        res = await fetch(url, { headers: h });
        if (res.status === 429 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
        break;
      }
      if (!res.ok) {
        projects[p] = { readable: false, http: res.status };
        report.problems.push(`Cloudflare Pages ${p} : HTTP ${res.status}`);
        continue;
      }
      const j = await res.json();
      const d = (j.result || [])[0];
      projects[p] = {
        readable: true,
        http: res.status,
        latest_production_deployment: d ? { id: d.id, created_on: d.created_on, stage: d.latest_stage && d.latest_stage.name } : null,
      };
      await new Promise((r) => setTimeout(r, 400));
    }
    report.cloudflare = {
      auth: 'wrangler OAuth (config/default.toml)',
      config_path: WRANGLER_CFG,
      account_id: ACCOUNT_ID,
      token_refreshed_before_probe: refreshed,
      token_expires_at: expires,
      pages_projects: projects,
      all_readable: PAGES_PROJECTS.every((p) => projects[p] && projects[p].readable),
    };
    if (!asJson) {
      for (const p of PAGES_PROJECTS) {
        const v = projects[p];
        console.log(`  ${p.padEnd(24)} ${v.readable ? 'LISIBLE' : 'ECHEC ' + v.http}` +
          (v.latest_production_deployment ? `  dernier=${v.latest_production_deployment.id.slice(0, 8)} ${v.latest_production_deployment.created_on}` : ''));
      }
    }
    if (!report.cloudflare.all_readable) report.problems.push('au moins un projet Pages n est pas lisible');
  } catch (e) {
    report.cloudflare = { error: String(e.message || e) };
    report.problems.push(`acces Cloudflare Pages refuse : ${String(e.message || e).slice(0, 120)}`);
    if (!asJson) console.log(`  ECHEC : ${report.cloudflare.error}`);
  }
}

// ------------------------------------------------------- Gardes de déploiement
section('Gardes de deploiement (statique)');
try {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const wfDir = path.join(repoRoot, '.github', 'workflows');
  const deployers = [];
  for (const f of fs.readdirSync(wfDir).filter((n) => n.endsWith('.yml'))) {
    const txt = fs.readFileSync(path.join(wfDir, f), 'utf8');
    const onPush = /on:\s*\n(?:[^\n]*\n)*?\s*push:\s*\n(?:[^\n]*\n)*?\s*branches:\s*\n\s*-\s*main/.test(txt);
    if (!onPush) continue;
    const ignores = txt.match(/paths-ignore:\s*\n((?:\s*-\s*[^\n]*\n)+)/);
    deployers.push({
      workflow: f,
      paths_ignore: ignores
        ? ignores[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
        : null,
    });
  }
  report.gates = {
    push_to_main_workflows: deployers,
    note: 'Un merge sur main declenche tout workflow push:branches:[main] dont paths-ignore ne couvre pas le chemin modifie.',
  };
  if (!asJson) {
    for (const d of deployers) {
      console.log(`  ${d.workflow.padEnd(30)} paths-ignore=${d.paths_ignore ? d.paths_ignore.join(', ') : '(aucun)'}`);
    }
    console.log('  => un merge sur main declenche un deploiement SAUF si le chemin modifie est dans paths-ignore.');
  }
} catch (e) {
  report.gates = { error: String(e.message || e) };
}

// ---------------------------------------------------------------- Verdict
/* Garde-fou : l'instantane d'etat ne doit JAMAIS contenir une valeur de secret.
 * On refuse d'ecrire plutot que d'ecrire un fichier douteux. */
const SECRET_VALUE_MARKERS = [
  'gh[op]_', 'github_pat_', 'Bearer ', 'refresh_token', 'oauth_token',
  'RESEND_API_KEY":', 'MOLLIE_API_KEY":', 'MOLLIE_WEBHOOK_SECRET":',
  'CLOUDFLARE_API_TOKEN":', 'CLOUDFLARE_ACCOUNT_ID":', 'CPANEL_PASSWORD":',
  'ANTHROPIC_API_KEY":', 'DEPLOY_TOKEN":', 'GA4_ACCOUNT":',
];

function assertNoSecretValues(payload) {
  const s = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hits = SECRET_VALUE_MARKERS.filter((m) => s.includes(m));
  if (hits.length) {
    throw new Error(`refus d ecrire l etat : marqueur(s) de valeur de secret detecte(s) -> ${hits.join(', ')}`);
  }
  return true;
}

async function finalize() {
  await probeCloudflare();

  const critical = report.problems.length === 0 &&
    report.github.authenticated &&
    report.github.sufficient_for_actions &&
    report.actions.logs_readable &&
    report.cloudflare.all_readable;
  report.verdict = critical ? 'CONNECTION_OK' : 'CONNECTION_PARTIAL';

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n=== VERDICT ===');
    console.log(`  ${report.verdict}`);
    if (report.problems.length) {
      console.log('  problemes :');
      for (const p of report.problems) console.log(`    - ${p}`);
    } else {
      console.log('  aucun probleme de connexion detecte.');
    }
  }

  if (writeState) {
    assertNoSecretValues(report);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const previous = fs.existsSync(CONFIG_FILE)
      ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      : {};
    const next = {
      ...previous,
      capabilities: report,
      updated_at: new Date().toISOString(),
    };
    assertNoSecretValues(next);
    fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    if (!asJson) console.log(`\n  etat Factory V3 ecrit : ${CONFIG_FILE}`);
  }

  process.exit(critical ? 0 : 1);
}

finalize();
