#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_DIR = path.resolve('.github/workflows');
const PINNED_ACTIONS = new Map([
  ['actions/checkout', {
    sha: '3d3c42e5aac5ba805825da76410c181273ba90b1',
    version: 'v7.0.1',
  }],
  ['actions/setup-node', {
    sha: '949feb2413d6458794dcd2491c4babbbce0c15c1',
    version: 'v7.1.0',
  }],
  ['actions/upload-artifact', {
    sha: 'cf430e030ddbb5b0abf93d22962f4752f3646cd9',
    version: 'v7.0.2',
  }],
  ['actions/download-artifact', {
    sha: '9000827ccba6bdab643e8b6fd33ac0654aef8333',
    version: 'v8.0.2',
  }],
  ['actions/cache', {
    sha: '55cc8345863c7cc4c66a329aec7e433d2d1c52a9',
    version: 'v6.1.0',
  }],
  ['supabase/setup-cli', {
    sha: '45a513f8c64c0bc8e0e3dfe572b5c95be85f6359',
    version: 'v3.0.1',
  }],
  ['lycheeverse/lychee-action', {
    sha: 'e7477775783ea5526144ba13e8db5eec57747ce8',
    version: 'v2.9.0',
  }],
  ['cloudflare/wrangler-action', {
    sha: '953926a2e2182532811c01a25e53647d93bf07c0',
    version: 'v4.1.3',
  }],
]);

function fail(message) {
  console.error('GITHUB_ACTIONS_POLICY_FAIL: ' + message);
  process.exitCode = 1;
}

if (!fs.existsSync(WORKFLOW_DIR)) {
  fail('missing .github/workflows directory');
  process.exit();
}

const files = fs.readdirSync(WORKFLOW_DIR)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

if (files.length === 0) {
  fail('no workflow files found');
  process.exit();
}

let checked = 0;
const seenActions = new Set();

for (const file of files) {
  const fullPath = path.join(WORKFLOW_DIR, file);
  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    if (/^\s*node-version:\s*['"]?20(?:\.x)?['"]?\s*(?:#.*)?$/.test(line)) {
      fail(`${file}:${index + 1} setup-node must target Node.js 24, not EOL Node.js 20`);
    }
    const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(v[^\s]+))?\s*$/);
    if (!match) return;

    const reference = match[1];
    const annotation = match[2] || '';
    const at = reference.lastIndexOf('@');
    if (at <= 0) {
      fail(`${file}:${index + 1} action reference has no @ref: ${reference}`);
      return;
    }

    const action = reference.slice(0, at);
    const ref = reference.slice(at + 1);
    checked += 1;
    seenActions.add(action);

    if (!/^[a-f0-9]{40}$/i.test(ref)) {
      fail(`${file}:${index + 1} action is not pinned to a full 40-character SHA: ${reference}`);
      return;
    }

    const expected = PINNED_ACTIONS.get(action);
    if (expected && ref.toLowerCase() !== expected.sha) {
      fail(`${file}:${index + 1} unexpected SHA for ${action}: ${ref}`);
    }
    if (expected && annotation !== expected.version) {
      fail(`${file}:${index + 1} expected version annotation ${expected.version} for ${action}, got ${annotation || '(missing)'}`);
    }
  });
}

if (process.exitCode) {
  console.error(`Checked ${files.length} workflow files and ${checked} action references; policy violations found.`);
} else {
  console.log(`GITHUB_ACTIONS_POLICY_OK workflows=${files.length} action_refs=${checked} unique_actions=${seenActions.size}`);
}
