Commande ECHO activ‚e.
const fs = require('fs'); 
const path = require('path'); 
const { AP_DIR, readJSON, writeJSON, nowIso } = require('./common.cjs'); 
const policy = require('./policy.cjs'); 
const SCHEDULER_FILE = path.join(AP_DIR, 'scheduler.json'); 
function schedulerPath() { return SCHEDULER_FILE; } 
function loadScheduler() { 
  return readJSON(SCHEDULER_FILE, { 
    version: 1, selectedId: null, claimedId: null, claimedIds: [], status: 'idle', cycleId: null, prNumber: null, prBlocking: null, blockReason: null, updatedAt: null 
  }); 
function saveScheduler(state) { 
  const next = Object.assign({}, state, { version: 1, updatedAt: nowIso() }); 
  writeJSON(SCHEDULER_FILE, next); 
  return next; 
} 
function surfaceOfOpp(opp) { 
  if (!opp) return 'misc'; 
  if (opp.surface) return opp.surface; 
