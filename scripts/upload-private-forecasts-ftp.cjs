'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('basic-ftp');
const { getAllRegions } = require('../regions/index.cjs');

const ACTIVE_REGION_IDS = Object.freeze([
  'mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum'
]);

function safeRemoteRoot(value) {
  const raw = String(value || '/').trim();
  if (!raw.startsWith('/') || raw.split('/').includes('..') || /[\r\n\0]/.test(raw)) {
    throw new Error('unsafe FTP remote root');
  }
  return path.posix.normalize(raw);
}

function resolveTargets(options = {}) {
  const root = options.root || process.cwd();
  const env = options.env || process.env;
  const regions = options.regions || getAllRegions();
  const byId = new Map(regions.map((region) => [region.id, region]));
  const missingRegions = ACTIVE_REGION_IDS.filter((id) => !byId.has(id));
  if (missingRegions.length) throw new Error('missing production region configs: ' + missingRegions.join(', '));

  return ACTIVE_REGION_IDS.map((id) => {
    const suffix = id.toUpperCase();
    const region = byId.get(id);
    const host = env['FTP_HOST_' + suffix] || env['FTP_SERVER_' + suffix] || env.FTP_HOST || env.FTP_SERVER;
    const user = env['FTP_USER_' + suffix] || env['FTP_USERNAME_' + suffix];
    const password = env['FTP_PASS_' + suffix] || env['FTP_PASSWORD_' + suffix];
    if (!host || !user || !password) throw new Error('missing FTPS credentials for region ' + id);

    const remoteRootValue = env['FTP_REMOTE_' + suffix];
    if (typeof remoteRootValue !== 'string' || !remoteRootValue.trim()) {
      throw new Error('missing FTPS remote root for region ' + id);
    }
    const remoteRoot = safeRemoteRoot(remoteRootValue);
    const remoteDir = path.posix.join(remoteRoot, 'api/copernicus/_private');
    const privateDir = path.join(root, 'public', 'api', 'copernicus', id, '_private');
    const forecastPath = path.join(privateDir, 'forecast-full.json');
    const regionalHtaccess = path.join(privateDir, '.htaccess');
    const rootHtaccess = path.join(root, 'public', 'api', 'copernicus', '_private', '.htaccess');
    const htaccessPath = fs.existsSync(regionalHtaccess) ? regionalHtaccess : rootHtaccess;

    if (!fs.existsSync(forecastPath)) throw new Error('private forecast missing for region ' + id);
    if (!fs.existsSync(htaccessPath)) throw new Error('private .htaccess missing for region ' + id);

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(forecastPath, 'utf8'));
    } catch (error) {
      throw new Error('invalid private forecast JSON for region ' + id + ': ' + error.message);
    }
    if (!payload || !Number.isFinite(Date.parse(payload.updatedAt || '')) ||
        !payload.weekly || typeof payload.weekly !== 'object' ||
        Array.isArray(payload.weekly) || Object.keys(payload.weekly).length === 0) {
      throw new Error('private forecast contract invalid for region ' + id);
    }

    const htaccess = fs.readFileSync(htaccessPath, 'utf8');
    if (!/^\s*Require\s+all\s+denied\s*$/mi.test(htaccess) || /Require\s+all\s+granted/i.test(htaccess)) {
      throw new Error('private directory deny rule missing for region ' + id);
    }

    return {
      id,
      domain: region.domain,
      host,
      user,
      password,
      remoteDir,
      forecastPath,
      htaccessPath,
      forecastSize: fs.statSync(forecastPath).size,
      htaccessSize: fs.statSync(htaccessPath).size
    };
  });
}

async function remoteSize(client, name) {
  try {
    const size = await client.size(name);
    return Number.isFinite(Number(size)) ? Number(size) : null;
  } catch (error) {
    if (/(?:550|not found|no such file|does not exist)/i.test(String(error && error.message || error))) return null;
    throw error;
  }
}

async function withClient(target, ClientClass, operation) {
  const client = new ClientClass(120000);
  if (client.ftp) client.ftp.verbose = false;
  try {
    await client.access({
      host: target.host,
      user: target.user,
      password: target.password,
      secure: true
    });
    await client.ensureDir(target.remoteDir);
    return await operation(client);
  } finally {
    try { client.close(); } catch {}
  }
}

function pendingName(runId) {
  return 'forecast-full.json.pending.' + runId;
}

function backupName(runId) {
  return 'forecast-full.json.previous.' + runId;
}

async function cleanupPending(targets, runId, ClientClass, log) {
  for (const target of targets) {
    try {
      await withClient(target, ClientClass, async (client) => {
        const name = pendingName(runId);
        if (await remoteSize(client, name) !== null) await client.remove(name);
      });
    } catch {
      log('[' + target.id + '] pending cleanup requires review');
    }
  }
}

async function stageTargets(targets, runId, ClientClass, log) {
  const staged = [];
  try {
    for (const target of targets) {
      staged.push(target);
      await withClient(target, ClientClass, async (client) => {
        // Install the deny rule before placing any new private payload.
        await client.uploadFrom(target.htaccessPath, '.htaccess');
        if (await remoteSize(client, '.htaccess') !== target.htaccessSize) {
          throw new Error('remote .htaccess size mismatch');
        }
        await client.uploadFrom(target.forecastPath, pendingName(runId));
        if (await remoteSize(client, pendingName(runId)) !== target.forecastSize) {
          throw new Error('remote staged forecast size mismatch');
        }
      });
      log('[' + target.id + '] private forecast staged and size-verified');
    }
  } catch (error) {
    await cleanupPending(staged, runId, ClientClass, log);
    throw new Error('private forecast staging failed: ' + error.message);
  }
  return { mode: 'stage', uploaded: staged.map((target) => target.id) };
}

async function rollbackActivation(changed, targets, runId, ClientClass, log) {
  for (const item of [...changed].reverse()) {
    try {
      await withClient(item.target, ClientClass, async (client) => {
        const currentSize = await remoteSize(client, 'forecast-full.json');
        if (currentSize !== null) await client.remove('forecast-full.json');
        if (item.hadPrevious) await client.rename(backupName(runId), 'forecast-full.json');
      });
    } catch {
      log('[' + item.target.id + '] activation rollback requires manual review');
    }
  }
  await cleanupPending(targets, runId, ClientClass, log);
}

async function activateTargets(targets, runId, ClientClass, log) {
  const changed = [];
  try {
    for (const target of targets) {
      await withClient(target, ClientClass, async (client) => {
        const pending = pendingName(runId);
        if (await remoteSize(client, pending) !== target.forecastSize) {
          throw new Error('staged forecast missing or size mismatch');
        }

        const previousSize = await remoteSize(client, 'forecast-full.json');
        const hadPrevious = previousSize !== null;
        if (hadPrevious) await client.rename('forecast-full.json', backupName(runId));
        changed.push({ target, hadPrevious });

        await client.rename(pending, 'forecast-full.json');
        if (await remoteSize(client, 'forecast-full.json') !== target.forecastSize) {
          throw new Error('activated forecast size mismatch');
        }
      });
      log('[' + target.id + '] private forecast activated');
    }
  } catch (error) {
    await rollbackActivation(changed, targets, runId, ClientClass, log);
    throw new Error('private forecast activation failed; rollback attempted: ' + error.message);
  }

  for (const item of changed) {
    if (!item.hadPrevious) continue;
    try {
      await withClient(item.target, ClientClass, async (client) => {
        const backup = backupName(runId);
        if (await remoteSize(client, backup) !== null) await client.remove(backup);
      });
    } catch {
      log('[' + item.target.id + '] previous private forecast backup retained');
    }
  }
  return { mode: 'activate', uploaded: changed.map((item) => item.target.id) };
}

async function uploadPrivateForecasts(options = {}) {
  const env = options.env || process.env;
  const root = options.root || process.cwd();
  const ClientClass = options.ClientClass || Client;
  const log = options.log || console.log;
  const mode = options.mode || env.PRIVATE_FORECAST_FTP_MODE;
  const runId = String(options.runId || env.PRIVATE_FORECAST_RUN_ID || env.GITHUB_RUN_ID || '');

  if (mode !== 'stage' && mode !== 'activate') throw new Error('PRIVATE_FORECAST_FTP_MODE must be stage or activate');
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(runId)) throw new Error('PRIVATE_FORECAST_RUN_ID is missing or invalid');

  // Preflight all six production regions before opening the first FTP connection.
  const targets = resolveTargets({ root, env, regions: options.regions });
  if (mode === 'stage') return stageTargets(targets, runId, ClientClass, log);
  return activateTargets(targets, runId, ClientClass, log);
}

if (require.main === module) {
  const { loadProjectEnv } = require('./lib/load-project-env.cjs');
  loadProjectEnv();
  uploadPrivateForecasts().then((result) => {
    console.log('Private forecast FTPS ' + result.mode + ' complete: ' + result.uploaded.join(', '));
  }).catch((error) => {
    console.error('Private forecast FTPS failed: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { ACTIVE_REGION_IDS, resolveTargets, uploadPrivateForecasts };
