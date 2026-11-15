'use strict';

/**
 * publish-observer-state.cjs — publie un instantané d'observateur local vers
 * un canal externe (GitHub privé `aveca/factory-control`).
 *
 * Usage :
 *   node scripts/factory-v3/publish-observer-state.cjs --state <dir> [--repo <owner/repo>]
 *                                                        [--issue <number>]
 *                                                        [--dry-run]
 *
 * Le contenu publié est expurgé : aucun token, aucun secret, aucune donnée
 * personnelle. Les diffs locaux sont limités en taille pour rester lisibles.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { readJson, readJsonl } = require('./lib/observer.cjs');

const DEFAULT_REPO = 'aveca/factory-control';
const MAX_DIFF_CHARS = 20_000;

const SECRET_PATTERNS = [
  { pattern: /(?:sk|ghp|gho|github_pat|ghs|ghu|xoxb|xoxp|xapp|AIza)[A-Za-z0-9_-]{8,}/g, replacement: '[REDACTED]' },
  { pattern: /(Bearer|Basic)\s+[A-Za-z0-9._\-+=/]{10,}/gi, replacement: '$1 [REDACTED]' },
  { pattern: /((?:authToken|token|secret|password|apiKey|api_key|access_token|refresh_token))\s*[:=]\s*"?[A-Za-z0-9._\-+=/]{6,}"?/gi, replacement: '$1: [REDACTED]' },
  { pattern: /(?:email|mail)\s*[:=]\s*"?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"?/gi, replacement: 'email: [REDACTED]' },
];

function redactText(value) {
  let text = String(value || '');
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function safeRelativePath(value, rootDir) {
  const absolute = path.resolve(rootDir, value || '.');
  return path.relative(rootDir, absolute).replace(/\\/g, '/') || '.';
}

function readBundle(stateDir, rootDir) {
  const stateRoot = path.resolve(stateDir);
  const state = readJson(path.join(stateRoot, 'state.json'), null);
  if (!state) {
    const error = new Error(`OBSERVER_STATE_MISSING: ${path.join(stateRoot, 'state.json')}`);
    error.code = 'OBSERVER_STATE_MISSING';
    throw error;
  }

  const worklog = readJsonl(path.join(stateRoot, 'WORKLOG.jsonl'));
  const testResults = readJson(path.join(stateRoot, 'TEST_RESULTS.json'), { results: [] });
  const blockers = readJson(path.join(stateRoot, 'BLOCKERS.json'), { blockers: [] });
  const nextActions = readJson(path.join(stateRoot, 'NEXT_ACTIONS.json'), { actions: [] });
  const localChanges = readJson(path.join(stateRoot, 'LOCAL_CHANGES.json'), { files: [] });

  // Le diff exact est calculé ici, puis expurgé. Il est borné en taille pour
  // rester lisible dans une issue GitHub.
  let diff = '';
  try {
    diff = execFileSync('git', ['diff', '--unified=0'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
      timeout: 10_000,
      windowsHide: true,
    });
  } catch (_) {
    diff = '';
  }

  const untrackedDiffs = localChanges.files
    .filter((file) => file.status === 'untracked')
    .map((file) => {
      try {
        return execFileSync('git', ['diff', '--no-index', '--unified=0', '--', 'NUL', file.path], {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 32 * 1024 * 1024,
          timeout: 10_000,
          windowsHide: true,
        });
      } catch (error) {
        // `git diff --no-index` renvoie 1 quand il y a une différence ; c'est
        // un succès pour notre usage.
        if (error && error.status === 1 && typeof error.stdout === 'string') return error.stdout;
        return null;
      }
    })
    .filter(Boolean)
    .join('\n');

  diff = [diff, untrackedDiffs].filter(Boolean).join('\n');
  if (diff.length > MAX_DIFF_CHARS) {
    diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n...[TRUNCATED]`;
  }
  const diffStats = execFileSyncSafe(rootDir, ['diff', '--stat', '--compact-summary']);

  return {
    version: 1,
    generatedAt: state.generatedAt,
    repository: state.repository,
    git: state.git,
    counts: state.counts,
    process: state.process,
    localChanges: {
      counts: localChanges.counts,
      clean: localChanges.clean,
      files: localChanges.files,
      diff,
      diffStats,
    },
    worklog,
    testResults,
    blockers,
    nextActions,
  };
}

function execFileSyncSafe(rootDir, args) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10_000,
      windowsHide: true,
    });
  } catch (_) {
    return null;
  }
}

function buildIssueBody(bundle) {
  const lines = [];
  lines.push('# Factory V3 local observer snapshot');
  lines.push('');
  lines.push(`- generatedAt: ${bundle.generatedAt}`);
  lines.push(`- repository: ${bundle.repository.rootDir}`);
  lines.push(`- branch: ${bundle.git.branch}`);
  lines.push(`- head: ${bundle.git.head}`);
  lines.push(`- remoteHead: ${bundle.git.remoteHead || 'inconnu'}`);
  lines.push(`- ahead/behind: ${bundle.git.ahead}/${bundle.git.behind}`);
  lines.push(`- localChanges: ${JSON.stringify(bundle.localChanges.counts)}`);
  lines.push(`- diffStats: ${bundle.localChanges.diffStats || 'non disponible'}`);
  lines.push(`- process: pid=${bundle.process.pid} rssMB=${bundle.process.rssMB} uptimeS=${bundle.process.uptimeS}`);
  lines.push('');
  lines.push('## Local changes');
  if (bundle.localChanges.files.length) {
    for (const file of bundle.localChanges.files) {
      lines.push(`- ${file.status}: ${file.path}`);
    }
  } else {
    lines.push('- clean');
  }
  lines.push('');
  lines.push('## Diff');
  lines.push('```diff');
  lines.push(redactText(bundle.localChanges.diff || '(aucun diff local)'));
  lines.push('```');
  lines.push('');
  lines.push('## Test results');
  if (bundle.testResults.results && bundle.testResults.results.length) {
    for (const result of bundle.testResults.results) {
      lines.push(`- ${result.ts} ${result.command} ok=${result.ok}`);
    }
  } else {
    lines.push('- aucun test enregistré');
  }
  lines.push('');
  lines.push('## Blockers');
  if (bundle.blockers.blockers && bundle.blockers.blockers.length) {
    for (const blocker of bundle.blockers.blockers) {
      lines.push(`- ${blocker.id}: ${blocker.reason} (${blocker.severity})`);
    }
  } else {
    lines.push('- aucun blocage enregistré');
  }
  lines.push('');
  lines.push('## Next actions');
  if (bundle.nextActions.actions && bundle.nextActions.actions.length) {
    for (const action of bundle.nextActions.actions) {
      lines.push(`- ${action.ts} ${action.task} (${action.priority})`);
    }
  } else {
    lines.push('- aucune action enregistrée');
  }
  lines.push('');
  lines.push('## Worklog');
  if (bundle.worklog.length) {
    for (const entry of bundle.worklog.slice(-50)) {
      lines.push(`- ${entry.ts} ${entry.action} ${entry.result}`);
    }
  } else {
    lines.push('- vide');
  }
  return redactText(lines.join('\n'));
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  }).trim();
}

function publishToGithub({ bundle, repo, issueNumber, title }) {
  const body = buildIssueBody(bundle);
  if (issueNumber) {
    gh([
      'issue', 'comment', String(issueNumber), '--repo', repo, '--body', body,
    ]);
    return { repo, issueNumber, mode: 'comment' };
  }

  const issueUrl = gh([
    'issue', 'create', '--repo', repo,
    '--title', title,
    '--body', body,
    '--label', 'mission',
    '--label', 'factory:review-required',
  ]);
  const match = String(issueUrl).match(/issues\/(\d+)/);
  const createdIssueNumber = match ? Number(match[1]) : null;
  return { repo, issueNumber: createdIssueNumber, issueUrl, mode: 'create', body };
}

function main() {
  const arg = (name, fallback = null) => {
    const index = process.argv.indexOf(name);
    if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
    return fallback;
  };

  const repo = arg('--repo', DEFAULT_REPO);
  const issueNumber = Number(arg('--issue', '0')) || null;
  const dryRun = process.argv.includes('--dry-run');
  const stateDir = path.resolve(arg('--state') || path.join(process.cwd(), 'state', 'observer'));
  const rootDir = path.resolve(arg('--root') || path.dirname(path.dirname(path.dirname(path.dirname(stateDir)))));
  const bundle = readBundle(stateDir, rootDir);

  if (dryRun) {
    console.log(buildIssueBody(bundle));
    return;
  }

  const title = `Factory V3 observer snapshot ${bundle.generatedAt}`;
  const result = publishToGithub({ bundle, repo, issueNumber, title });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();

module.exports = {
  readBundle,
  buildIssueBody,
  publishToGithub,
  redactText,
};
