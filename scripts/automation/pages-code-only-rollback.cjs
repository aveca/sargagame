#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECTS = [
  'sargagame',
  'sargagame-gp',
  'sargagame-florida',
  'sargagame-puntacana',
  'sargagame-rivieramaya',
  'sargagame-tulum',
];

function credentials() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error('Cloudflare account/token environment is missing');
  return { account, token };
}

async function apiRequest(pathname, method = 'GET') {
  const { account, token } = credentials();
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + account + pathname, {
    method,
    headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    throw new Error('Cloudflare Pages API ' + method + ' failed (' + response.status + '): ' +
      JSON.stringify(body.errors || body.messages || []).slice(0, 1200));
  }
  return body.result;
}

async function capture(outputPath) {
  const targets = {};
  for (const project of PROJECTS) {
    const deployments = await apiRequest('/pages/projects/' + project + '/deployments?per_page=20&page=1');
    const previous = (deployments || [])
      .filter(item => item.environment === 'production' && item.latest_stage?.status === 'success' && item.deployment_trigger?.metadata?.branch === 'main')
      .sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)))[0];
    if (!previous?.id) throw new Error('no previous successful production deployment for ' + project);
    targets[project] = { deploymentId: previous.id, createdOn: previous.created_on, commit: previous.deployment_trigger?.metadata?.commit_hash || null };
  }
  const snapshot = { capturedAt: new Date().toISOString(), targets };
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify({ captured: Object.keys(targets).length, targets }));
}

async function rollback(inputPath) {
  const snapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!snapshot.targets || PROJECTS.some(project => !snapshot.targets[project]?.deploymentId)) {
    throw new Error('rollback target snapshot is incomplete');
  }
  const results = [];
  for (const project of PROJECTS) {
    const id = snapshot.targets[project].deploymentId;
    await apiRequest('/pages/projects/' + project + '/deployments/' + id + '/rollback', 'POST');
    results.push({ project, restoredDeploymentId: id });
  }
  console.log(JSON.stringify({ rollback: 'success', restored: results }));
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const fileFlag = args.indexOf('--file');
  const file = path.resolve(fileFlag >= 0 ? args[fileFlag + 1] : 'pages-code-only-rollback.json');
  if (mode === 'capture') return capture(file);
  if (mode === 'rollback') return rollback(file);
  throw new Error('Usage: node pages-code-only-rollback.cjs <capture|rollback> [--file path]');
}

if (require.main === module) {
  main().catch(error => {
    console.error('PAGES_CODE_ONLY_ROLLBACK_FAIL: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { PROJECTS, capture, rollback };
