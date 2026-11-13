#!/usr/bin/env node
/** status.cjs — état de l'autopilot en 10 lignes (npm run autopilot:status). */
'use strict';
const fs = require('fs');
const C = require('./lib/common.cjs');
const mem = require('./lib/memory.cjs');
const lock = require('./lib/lock.cjs');
const lifecycle = require('./lib/mission-lifecycle.cjs');

C.ensureDirs();
const cfg = C.loadConfig();
const q = mem.loadQueue();
const st = lock.status();
const byStatus = {};
for (const o of q.opportunities || []) byStatus[o.status] = (byStatus[o.status] || 0) + 1;

let missions = { total: 0, active: 0 };
try {
  const mstate = lifecycle.load();
  const all = Object.values(mstate.missions || {});
  missions = {
    total: all.length,
    active: all.filter(m => ['queued', 'imported', 'started', 'heartbeat', 'retrying'].includes(m.state)).length,
  };
} catch (_) {}

console.log('=== AUTOPILOT STATUS ===');
console.log(`lock        : ${st.locked ? `DÉTENU par PID ${st.lock.pid} (${st.lock.startedAt})` : 'libre'}`);
console.log(`stop file   : ${fs.existsSync(C.paths.stopFile) ? '⛔ PRÉSENT (autopilot arrêté)' : 'absent'}`);
console.log(`queue       : ${JSON.stringify(byStatus)}`);
console.log(`missions    : ${missions.active} active(s) / ${missions.total} suivie(s)`);
console.log(`relayés     : ${(q.relayed || []).length} · bloqués sécu : ${(q.blockedSafety || []).length}`);
console.log(`rejected    : ${(mem.loadRejected().rejected || []).length} fingerprint(s)`);
console.log(`runs        : ${mem.listRuns(3).join(', ') || 'aucun'}`);
console.log(`auto-merge  : ${cfg.policy.autoMergeEnabled ? 'ON (whitelist)' : 'OFF'} · agents impl : ${cfg.policy.allowAgentImplementation ? 'ON' : 'OFF (recettes only)'}`);
console.log(`latest.md   : ${fs.existsSync(C.paths.latestMd) ? 'oui — à lire' : 'pas encore de cycle'}`);
const next = (q.opportunities || []).filter(o => o.status === 'new');
if (next.length) console.log(`prochain    : ${next[0].id} — ${next[0].title.slice(0, 80)}`);
