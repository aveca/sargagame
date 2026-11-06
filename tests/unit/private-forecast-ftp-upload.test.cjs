'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ACTIVE_REGION_IDS,
  uploadPrivateForecasts
} = require('../../scripts/upload-private-forecasts-ftp.cjs');

let store;
let clients;
let failRenameRegion;

class FakeClient {
  constructor() {
    this.ftp = { verbose: false };
    this.dir = '/';
    this.host = '';
    clients.push(this);
  }
  async access(options) {
    this.host = options.host;
    this.options = options;
  }
  async ensureDir(dir) {
    this.dir = dir;
  }
  key(name) {
    return path.posix.join(this.dir, name);
  }
  async uploadFrom(localPath, remoteName) {
    store.set(this.key(remoteName), fs.readFileSync(localPath));
  }
  async size(name) {
    const value = store.get(this.key(name));
    if (!value) throw new Error('550 File not found');
    return value.length;
  }
  async rename(from, to) {
    const value = store.get(this.key(from));
    if (!value) throw new Error('550 File not found');
    if (failRenameRegion && this.host === 'ftp-' + failRenameRegion && from.startsWith('forecast-full.json.pending.')) {
      throw new Error('simulated activation failure');
    }
    store.set(this.key(to), value);
    store.delete(this.key(from));
  }
  async remove(name) {
    if (!store.has(this.key(name))) throw new Error('550 File not found');
    store.delete(this.key(name));
  }
  close() {}
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-private-ftp-'));
  const regions = ACTIVE_REGION_IDS.map((id) => ({ id, domain: id + '.example.test' }));
  const env = {};
  for (const id of ACTIVE_REGION_IDS) {
    const suffix = id.toUpperCase();
    env['FTP_HOST_' + suffix] = 'ftp-' + id;
    env['FTP_USER_' + suffix] = 'user-' + id;
    env['FTP_PASS_' + suffix] = 'secret-' + id;
    env['FTP_REMOTE_' + suffix] = '/sites/' + id;
    const dir = path.join(root, 'public', 'api', 'copernicus', id, '_private');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'forecast-full.json'), JSON.stringify({
      updatedAt: '2026-11-06T00:00:00.000Z',
      weekly: { beach001: [{ date: '2026-11-06', status: 'clean' }] }
    }));
    fs.writeFileSync(path.join(dir, '.htaccess'), 'Require all denied\n');
  }
  fs.mkdirSync(path.join(root, 'public', 'api', 'copernicus', '_private'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'api', 'copernicus', '_private', '.htaccess'), 'Require all denied\n');
  store = new Map();
  clients = [];
  failRenameRegion = null;
  return { root, env, regions };
}

function remoteDir(id) {
  return '/sites/' + id + '/api/copernicus/_private';
}

async function run() {
  let count = 0;
  const logs = [];
  const log = (message) => logs.push(String(message));

  // 1. Stage all six production regions with FTPS and the deny rule first.
  {
    const f = fixture();
    const result = await uploadPrivateForecasts({
      mode: 'stage', runId: 'run-100', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    });
    assert.deepEqual(result.uploaded, ACTIVE_REGION_IDS);
    assert.equal(clients.length, 6);
    for (const id of ACTIVE_REGION_IDS) {
      assert.equal(store.has(remoteDir(id) + '/.htaccess'), true);
      assert.equal(store.has(remoteDir(id) + '/forecast-full.json.pending.run-100'), true);
      assert.equal(store.has(remoteDir(id) + '/forecast-full.json'), false);
    }
    assert.ok(clients.every((client) => client.options.secure === true));
    assert.ok(!logs.join('\n').includes('secret-'));
    count++;
    fs.rmSync(f.root, { recursive: true, force: true });
  }

  // 2. Activate atomically, retain then remove the previous version.
  {
    const f = fixture();
    for (const id of ACTIVE_REGION_IDS) {
      store.set(remoteDir(id) + '/forecast-full.json', Buffer.from('old-private-payload'));
    }
    await uploadPrivateForecasts({
      mode: 'stage', runId: 'run-101', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    });
    const result = await uploadPrivateForecasts({
      mode: 'activate', runId: 'run-101', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    });
    assert.deepEqual(result.uploaded, ACTIVE_REGION_IDS);
    for (const id of ACTIVE_REGION_IDS) {
      const final = store.get(remoteDir(id) + '/forecast-full.json');
      assert.equal(final.toString(), fs.readFileSync(path.join(f.root, 'public', 'api', 'copernicus', id, '_private', 'forecast-full.json'), 'utf8'));
      assert.equal(store.has(remoteDir(id) + '/forecast-full.json.pending.run-101'), false);
      assert.equal(store.has(remoteDir(id) + '/forecast-full.json.previous.run-101'), false);
    }
    count++;
    fs.rmSync(f.root, { recursive: true, force: true });
  }

  // 3. Missing credentials fail before any FTP connection.
  {
    const f = fixture();
    delete f.env.FTP_PASS_TULUM;
    clients = [];
    await assert.rejects(() => uploadPrivateForecasts({
      mode: 'stage', runId: 'run-102', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    }), /missing FTPS credentials for region tulum/);
    assert.equal(clients.length, 0);
    count++;
    fs.rmSync(f.root, { recursive: true, force: true });
  }

  // 4. An absent remote document-root mapping fails before any FTP connection.
  {
    const f = fixture();
    delete f.env.FTP_REMOTE_TULUM;
    clients = [];
    await assert.rejects(() => uploadPrivateForecasts({
      mode: 'stage', runId: 'run-remote-missing', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    }), /missing FTPS remote root for region tulum/);
    assert.equal(clients.length, 0);
    count++;
    fs.rmSync(f.root, { recursive: true, force: true });
  }

  // 4. A permissive .htaccess fails before any FTP connection.
  {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'public', 'api', 'copernicus', 'mq', '_private', '.htaccess'), 'Require all granted\n');
    clients = [];
    await assert.rejects(() => uploadPrivateForecasts({
      mode: 'stage', runId: 'run-103', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    }), /private directory deny rule missing for region mq/);
    assert.equal(clients.length, 0);
    count++;
    fs.rmSync(f.root, { recursive: true, force: true });
  }

  // 5. A mid-rollout activation failure restores the previous payload on every region.
  {
    const f = fixture();
    for (const id of ACTIVE_REGION_IDS) {
      store.set(remoteDir(id) + '/forecast-full.json', Buffer.from('old-private-payload'));
    }
    await uploadPrivateForecasts({
      mode: 'stage', runId: 'run-104', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    });
    failRenameRegion = 'rivieramaya';
    await assert.rejects(() => uploadPrivateForecasts({
      mode: 'activate', runId: 'run-104', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    }), /activation failed; rollback attempted/);
    failRenameRegion = null;
    for (const id of ACTIVE_REGION_IDS) {
      assert.equal(store.get(remoteDir(id) + '/forecast-full.json').toString(), 'old-private-payload');
      assert.equal(store.has(remoteDir(id) + '/forecast-full.json.previous.run-104'), false);
      assert.equal(store.has(remoteDir(id) + '/forecast-full.json.pending.run-104'), false);
    }
    count++;
    fs.rmSync(f.root, { recursive: true, force: true });
  }

  // 6. FTP remote path traversal is rejected during preflight.
  {
    const f = fixture();
    f.env.FTP_REMOTE_TULUM = '/../outside';
    clients = [];
    await assert.rejects(() => uploadPrivateForecasts({
      mode: 'stage', runId: 'run-105', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    }), /unsafe FTP remote root/);
    assert.equal(clients.length, 0);
    count++;
    fs.rmSync(f.root, { recursive: true, force: true });
  }

  // 7. A missing regional payload fails before any FTP connection.
  {
    const f = fixture();
    fs.rmSync(path.join(f.root, 'public', 'api', 'copernicus', 'gp', '_private', 'forecast-full.json'));
    clients = [];
    await assert.rejects(() => uploadPrivateForecasts({
      mode: 'stage', runId: 'run-106', root: f.root, env: f.env,
      regions: f.regions, ClientClass: FakeClient, log
    }), /private forecast missing for region gp/);
    assert.equal(clients.length, 0);
    count++;
    fs.rmSync(f.root, { recursive: true, force: true });
  }

  console.log('PRIVATE_FORECAST_FTP_UPLOAD PASS (' + count + ' scenarios)');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
