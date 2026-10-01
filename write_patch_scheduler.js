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
   const files = (opp.scope && opp.scope.files) || [];\n   if (files.some(f => f.includes("PremiumModal") || /checkout/i.test(f))) return "premium";\n   if (files.some(f => f.includes("WorldMapView") || f.includes("ChasseHome") || f.includes("ExperienceReset"))) return "home";\n   if (files.some(f => f.includes("BeachExperience"))) return "beach";\n   if (files.some(f => f.includes("Sargasses_PROD"))) return "checkout-entry";\n   // LCP/perf home-like : index.html + Sargasses_PROD → home par défaut si route home\n   if (opp.route === "home" || /\/home\b/.test(opp.title || "")) return "home";\n   return "misc";\n}\nfunction filesOverlap(prFiles, oppFiles) {\n   const prs = prFiles || [];\n   const opps = oppFiles || [];\n   if (!prs.length || !opps.length) return false;\n   for (const prF of prs) {\n     const p = String(prF).split(path.sep).join("/");\n     for (const o of opps) {\n       const q = String(o).split(path.sep).join("/");\n       if (p === q) return true;\n       // opp = dir préfixe du fichier PR (ex: 'src/' couvre 'src/x.jsx')\n       if ((q.endsWith("/") && p.startsWith(q)) || p.startsWith(q.replace(/\\\/?$/, "/"))) {\n         // éviter faux positif "src" vs "srcx" : exige séparateur\n         if (p === q || p.startsWith(q.endsWith("/") ? q : q + "/")) return true;\n       }\n       // opp = glob → teste le fichier PR contre le glob\n       if (q.includes("*") && policy.matchesAny(p, [q])) return true;\n     }\n     }\n   return false;\n}\nfunction findLinkedOpp(pr, queue) {\n   if (!pr) return null;\n   const opps = (queue && queue.opportunities) || [];\n   return opps.find(o => {\n     if (o.prUrl && pr.number != null && String(o.prUrl).includes("/pull/" + pr.number)) return true;\n     if (o.branch && pr.headRefName && o.branch === pr.headRefName) return true;\n     return false;\n   });\n}\n/**\n * Décide si un PR ouvert bloque réellement le travail sélectionné.\n * Ne fait AUCUN I/O. Ne contourne aucun garde-fou : le doute → bloquant.\n * @param {object|null} pr — {number, headRefName, isDraft, mergeable, mergeStateStatus, files[]}\n * @param {object|null} selected — opportunité sélectionnée (ou null)\n * @param {object} queue — {opportunities:[]}\n * @returns {{blocking:boolean, reason:string, code:string}}\n */\nfunction isPrBlocking(pr, selected, queue) {\n   if (!pr) return { blocking: false, reason: "no open autopilot PR", code: "NO_PR" };\n   if (pr.isDraft === true) {      return { blocking: true, reason: `PR #${pr.number} draft (WIP) — observation only`, code: "PR_DRAFT" };    }\n\n}\n\n