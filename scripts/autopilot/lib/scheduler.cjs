#!/usr/bin/env node
/**
 * scheduler.cjs — état persistant du scheduler + décision PR bloquant / non-bloquant.
 *
 * Problème résolu : l'orchestrateur traitait TOUT PR ouvert `agent/autopilot/*`
 * comme bloquant global (observation-only), tout en loggant SÉLECTIONNÉ après
 * discovery. Résultat : sélection jamais persistée, jamais claimée, redécouverte
 * aveugle à chaque cycle (boucle 555→557 sur PR #777).
 *
 * Contrat :
 *  - isPrBlocking(pr, selected, queue) est PURE et testable (aucun I/O).
 *  - la persistance scheduler.json survit aux cycles (pas de reset aveugle).
 *  - claim idempotent : tâche déjà claimée/en cours → pas de doublon.
 *  - garde-fous préservés : draft / conflit / même branche / même surface /
 *    overlap fichiers / rien à faire → bloquant explicite.
 *  - PR simplement ouverte (mergeable, autre catégorie) → NON bloquante.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { AP_DIR, readJSON, writeJSON, nowIso } = require('./common.cjs');
const policy = require('./policy.cjs');

const SCHEDULER_FILE = path.join(AP_DIR, 'scheduler.json');

function schedulerPath() { return SCHEDULER_FILE; }

function loadScheduler() {
  return readJSON(SCHEDULER_FILE, {
    version: 1, selectedId: null, claimedId: null, status: 'idle',
    cycleId: null, prNumber: null, prBlocking: null, blockReason: null, updatedAt: null,
  });
}

function saveScheduler(state) {
  const next = Object.assign({}, state, { version: 1, updatedAt: nowIso() });
  writeJSON(SCHEDULER_FILE, next);
  return next;
}

/** Même heuristique que orchestrator.surfaceOf — dupliquée ici pour rester pure/testable. */
function surfaceOfOpp(opp) {
  if (!opp) return 'misc';
  if (opp.surface) return opp.surface;
  const files = (opp.scope && opp.scope.files) || [];
  if (files.some(f => f.includes('PremiumModal') || /checkout/i.test(f))) return 'premium';
  if (files.some(f => f.includes('WorldMapView') || f.includes('ChasseHome') || f.includes('ExperienceReset'))) return 'home';
  if (files.some(f => f.includes('BeachExperience'))) return 'beach';
  if (files.some(f => f.includes('Sargasses_PROD'))) return 'checkout-entry';
  // LCP/perf home-like : index.html + Sargasses_PROD → home par défaut si route home
  if (opp.route === 'home' || /\/home\b/.test(opp.title || '')) return 'home';
  return 'misc';
}

/** Overlap PR files (concrets) vs scope opportunity (peut contenir globs / dirs). */
function filesOverlap(prFiles, oppFiles) {
  const prs = prFiles || [];
  const opps = oppFiles || [];
  if (!prs.length || !opps.length) return false;
  for (const prF of prs) {
    const p = String(prF).split(path.sep).join('/');
    for (const o of opps) {
      const q = String(o).split(path.sep).join('/');
      if (p === q) return true;
      // opp = dir préfixe du fichier PR (ex: 'src/' couvre 'src/x.jsx')
      if ((q.endsWith('/') && p.startsWith(q)) || p.startsWith(q.replace(/\/?$/, '/'))) {
        // éviter faux positif 'src' vs 'srcx' : exige séparateur
        if (p === q || p.startsWith(q.endsWith('/') ? q : q + '/')) return true;
      }
      // opp = glob → teste le fichier PR contre le glob
      if (q.includes('*') && policy.matchesAny(p, [q])) return true;
    }
  }
  return false;
}

function findLinkedOpp(pr, queue) {
  if (!pr) return null;
  const opps = (queue && queue.opportunities) || [];
  return opps.find(o => {
    if (o.prUrl && pr.number != null && String(o.prUrl).includes('/pull/' + pr.number)) return true;
    if (o.branch && pr.headRefName && o.branch === pr.headRefName) return true;
    return false;
  }) || null;
}

/**
 * Décide si un PR ouvert bloque réellement le travail sélectionné.
 * Ne fait AUCUN I/O. Ne contourne aucun garde-fou : le doute → bloquant.
 *
 * @param {object|null} pr — {number, headRefName, isDraft, mergeable, mergeStateStatus, files[]}
 * @param {object|null} selected — opportunité sélectionnée (ou null)
 * @param {object} queue — {opportunities:[]}
 * @returns {{blocking:boolean, reason:string, code:string}}
 */
function isPrBlocking(pr, selected, queue) {
  if (!pr) return { blocking: false, reason: 'no open autopilot PR', code: 'NO_PR' };
  if (pr.isDraft === true) {
    return { blocking: true, reason: `PR #${pr.number} draft (WIP) — observation only`, code: 'PR_DRAFT' };
  }
  const mergeable = String(pr.mergeable || '').toUpperCase();
  if (mergeable === 'CONFLICTING') {
    // Conflit détecté : potentiellement réparable automatiquement (rebase)
    // L'orchestrateur tentera la réparation avant de bloquer.
    return { blocking: true, reason: `PR #${pr.number} en conflit (mergeable=CONFLICTING) — tentative de réparation auto`, code: 'PR_CONFLICT_REPAIRABLE' };
  }
  const mss = String(pr.mergeStateStatus || '').toUpperCase();
  if (mss === 'DIRTY') {
    return { blocking: true, reason: `PR #${pr.number} mergeStateStatus=DIRTY — tentative de réparation auto`, code: 'PR_CONFLICT_REPAIRABLE' };
  }
  const st = loadScheduler();
  const claimedIds = st.claimedIds || [];
  if (claimedIds.length === 0) {
    // Aucune opportunité claimée, pas de blocage
    return { blocking: false, reason: 'no claimed opportunities', code: 'NO_CLAIMED' };
  }
  const opportunities = queue && queue.opportunities || [];
  const claimedOpportunities = claimedIds.map(id => opportunities.find(o => o.id === id)).filter(Boolean);
  if (claimedOpportunities.length === 0) {
    // Aucune opportunité claimée trouvée dans la queue
    return { blocking: false, reason: 'claimed opportunities not found in queue', code: 'NO_CLAIMED_OPPORTUNITIES' };
  }
  // Vérifier si le PR bloque une quelconque des opportunités claimées
  for (const claimedOpp of claimedOpportunities) {
    const ACTIVE = new Set(['picked', 'in_progress', 'validation']);
    // Tâche déjà claimée/en cours → ne pas dupliquer : on considère bloqué sur doublon
    const linked = findLinkedOpp(pr, queue);
    if (linked && linked.id === claimedOpp.id && ACTIVE.has(linked.status)) {
      return { blocking: true, reason: `PR #${pr.number} liée à ${claimedOpp.id} déjà ${linked.status} — pas de doublon, reprise au prochain cycle`, code: 'ALREADY_CLAIMED' };
    }
    if (ACTIVE.has(claimedOpp.status) && linked && linked.id !== claimedOpp.id) {
      // claimed déjà en cours mais PR liée à un AUTRE travail → collision de branche/worktree
      // On reste prudent : bloquant, avec état persistant.
      return { blocking: true, reason: `${claimedOpp.id} déjà ${claimedOpp.status} + PR #${pr.number} (${pr.headRefName}) en vol — pas de travail concurrent`, code: 'ALREADY_CLAIMED' };
    }
    // Même branche → même travail en vol.
    if (linked && claimedOpp.branch && linked.branch === claimedOpp.branch) {
      return { blocking: true, reason: `même branche ${claimedOpp.branch} que PR #${pr.number} — observation only`, code: 'SAME_BRANCH' };
    }
    if (pr.headRefName && claimedOpp.branch && pr.headRefName === claimedOpp.branch) {
      return { blocking: true, reason: `même branche ${claimedOpp.branch} que PR #${pr.number} — observation only`, code: 'SAME_BRANCH' };
    }
    // 1 changement par surface : même surface que le travail porté par la PR → bloquant.
    const claimedSurface = surfaceOfOpp(claimedOpp);
    const linkedSurface = linked ? surfaceOfOpp(linked) : null;
    if (linkedSurface && linkedSurface === claimedSurface && claimedSurface !== 'misc') {
      return { blocking: true, reason: `surface "${claimedSurface}" occupée par PR #${pr.number} (${linked.id}) — 1 change per surface`, code: 'SURFACE_BUSY' };
    }
    // Overlap fichiers PR vs scope sélectionné → bloquant (vrai conflit).
    const prFiles = pr.files || [];
    const claimedFiles = (claimedOpp.scope && claimedOpp.scope.files) || [];
    if (prFiles.length && claimedFiles.length && filesOverlap(prFiles, claimedFiles)) {
      return { blocking: true, reason: `PR #${pr.number} touche les mêmes fichiers (${claimedFiles.slice(0, 3).join(', ')}) — observation only`, code: 'FILES_OVERLAP' };
    }
  }
  // Sinon : PR simplement ouverte (ex: #777 factory-only vs OPP LCP produit) → NON bloquante.
  return {
    blocking: false,
    reason: `PR #${pr.number} ouverte mais non bloquante pour les opportunités claimées (surfaces disjointes) — poursuite normale`,
    code: 'NON_BLOCKING',
  };
}

/** Restaure l'opportunité persistée si elle est toujours actionable (anti-redécouverte aveugle). */
function restoreSelected(queue) {
  const st = loadScheduler();
  const id = st.claimedId || st.selectedId;
  if (!id) return { restored: null, state: st };
  const opp = ((queue && queue.opportunities) || []).find(o => o.id === id);
  if (!opp) return { restored: null, state: st };
  if (['done', 'rejected', 'blocked', 'ready-to-merge'].includes(opp.status)) return { restored: null, state: st };
  return { restored: opp, state: st };
}

/**
 * Persiste discovered → selected. Ne change PAS le statut queue (sélection ≠ claim).
 * Le claim (new → picked) se fait dans persistClaimed, idempotent.
 */
function persistSelected(selected, cycleId, blockingInfo) {
  const st = loadScheduler();
  st.selectedId = selected ? selected.id : st.selectedId;
  st.cycleId = cycleId;
  st.prBlocking = blockingInfo ? blockingInfo.blocking : null;
  st.blockReason = blockingInfo ? blockingInfo.reason : null;
  if (blockingInfo && blockingInfo.blocking) {
    st.status = 'blocked-by-pr';
    st.prNumber = blockingInfo.prNumber != null ? blockingInfo.prNumber : st.prNumber;
  } else if (selected) {
    if (st.status !== 'claimed' || st.claimedId !== selected.id) st.status = 'selected';
  }
  return saveScheduler(st);
}

/**
 * Claim idempotent : new → picked (persisté queue + scheduler).
 * Si déjà picked/in_progress/validation → {alreadyClaimed:true}, aucun doublon.
 * Nécessite mem.updateOpportunity injecté pour rester testable sans I/O caché.
 * Met également à jour le tableau claimedIds pour suivre plusieurs opportunités claimées.
 */
function persistClaimed(selected, cycleId, updateFn) {
  const ACTIVE = new Set(['picked', 'in_progress', 'validation']);
  if (!selected) return { claimed: null, alreadyClaimed: false };
  if (ACTIVE.has(selected.status)) {
    const st = loadScheduler();
    st.claimedId = selected.id;
    st.selectedId = selected.id;
    // Ajouter à claimedIds si pas déjà présent
    if (!st.claimedIds.includes(selected.id)) {
      st.claimedIds.push(selected.id);
    }
    st.status = 'claimed';
    st.cycleId = cycleId;
    saveScheduler(st);
    return { claimed: selected, alreadyClaimed: true, state: loadScheduler() };
  }
  let updated = selected;
  if (typeof updateFn === 'function') {
    updated = updateFn(selected.id, { status: 'picked', pickedAt: nowIso(), cycleId }) || selected;
  }
  const st = loadScheduler();
  st.claimedId = selected.id;
  st.selectedId = selected.id;
  st.status = 'claimed';
  st.cycleId = cycleId;
  st.prBlocking = false;
    st.blockReason = null;
    // Ajouter à claimedIds
    if (!st.claimedIds.includes(selected.id)) {
      st.claimedIds.push(selected.id);
    }
  saveScheduler(st);
  return { claimed: updated, alreadyClaimed: false, state: loadScheduler() };
}

function persistDispatched(selected, cycleId, dispatchInfo) {
  const st = loadScheduler();
  st.selectedId = selected ? selected.id : st.selectedId;
  st.claimedId = selected ? selected.id : st.claimedId;
  st.status = 'dispatched';
  st.cycleId = cycleId;
  st.dispatch = dispatchInfo || null;
  return saveScheduler(st);
}

function stateLine(from, to, detail) {
  return `[AUTOPILOT STATE] ${from} → ${to}${detail ? ' — ' + detail : ''}`;
}

module.exports = {
  schedulerPath, loadScheduler, saveScheduler,
  surfaceOfOpp, filesOverlap, findLinkedOpp,
  isPrBlocking, restoreSelected, persistSelected, persistClaimed, persistDispatched,
  stateLine,
};
