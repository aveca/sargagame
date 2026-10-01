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
  const st = readJSON(SCHEDULER_FILE, {
    version: 1, selectedId: null, claimedId: null, claimedIds: [], status: 'idle',
    cycleId: null, prNumber: null, prBlocking: null, blockReason: null, updatedAt: null,
    // ÉTAPE 5 : anti-monopole — compteur d'échecs de réparation par PR.
    // {<prNumber>: {attempts, lastAt, parkedAt}} — survit au restart (disque).
    prRepair: {},
  });
  // Compat ascendante : les états écrits avant l'ÉTAPE 5 n'ont pas prRepair.
  if (!st.prRepair || typeof st.prRepair !== 'object') st.prRepair = {};
  return st;
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
    return { blocking: true, reason: `PR #${pr.number} en conflit (mergeable=CONFLICTING) — tentative de réparation auto`, code: 'PR_CONFLICT_REPAIRABLE' };
  }
  const mss = String(pr.mergeStateStatus || '').toUpperCase();
  if (mss === 'DIRTY') {
    return { blocking: true, reason: `PR #${pr.number} mergeStateStatus=DIRTY — tentative de réparation auto`, code: 'PR_CONFLICT_REPAIRABLE' };
  }

  // Si selected est explicitement null → observation-only (bloquant)
  if (selected === null) {
    return { blocking: true, reason: 'nothing selected — observation only', code: 'NO_SELECTION' };
  }

  // Si selected est une opportunité, la vérifier
  // Si selected est undefined, vérifier les claimedIds
  const toCheck = selected ? [selected] : [];
  if (!selected) {
    const st = loadScheduler();
    const claimedIds = st.claimedIds || [];
    if (claimedIds.length > 0) {
      const opportunities = queue && queue.opportunities || [];
      const claimedOpportunities = claimedIds.map(id => opportunities.find(o => o.id === id)).filter(Boolean);
      toCheck.push(...claimedOpportunities);
    }
  }

  // Si rien à vérifier (ni selected ni claimed), PR non bloquant
  if (toCheck.length === 0) {
    return { blocking: false, reason: 'no opportunity to check', code: 'NO_OPP_TO_CHECK' };
  }

  // Vérifier si le PR bloque une quelconque des opportunités à vérifier
  for (const opp of toCheck) {
    if (!opp) continue;
    const ACTIVE = new Set(['picked', 'in_progress', 'validation']);
    const linked = findLinkedOpp(pr, queue);
    if (linked && linked.id === opp.id && ACTIVE.has(linked.status)) {
      return { blocking: true, reason: `PR #${pr.number} liée à ${opp.id} déjà ${linked.status} — pas de doublon, reprise au prochain cycle`, code: 'ALREADY_CLAIMED' };
    }
    if (ACTIVE.has(opp.status) && linked && linked.id !== opp.id) {
      return { blocking: true, reason: `${opp.id} déjà ${opp.status} + PR #${pr.number} (${pr.headRefName}) en vol — pas de travail concurrent`, code: 'ALREADY_CLAIMED' };
    }
    if (linked && opp.branch && linked.branch === opp.branch) {
      return { blocking: true, reason: `même branche ${opp.branch} que PR #${pr.number} — observation only`, code: 'SAME_BRANCH' };
    }
    if (pr.headRefName && opp.branch && pr.headRefName === opp.branch) {
      return { blocking: true, reason: `même branche ${opp.branch} que PR #${pr.number} — observation only`, code: 'SAME_BRANCH' };
    }
    const oppSurface = surfaceOfOpp(opp);
    const linkedSurface = linked ? surfaceOfOpp(linked) : null;
    if (linkedSurface && linkedSurface === oppSurface && oppSurface !== 'misc') {
      return { blocking: true, reason: `surface "${oppSurface}" occupée par PR #${pr.number} (${linked.id}) — 1 change per surface`, code: 'SURFACE_BUSY' };
    }
    const prFiles = pr.files || [];
    const oppFiles = (opp.scope && opp.scope.files) || [];
    if (prFiles.length && oppFiles.length && filesOverlap(prFiles, oppFiles)) {
      return { blocking: true, reason: `PR #${pr.number} touche les mêmes fichiers (${oppFiles.slice(0, 3).join(', ')}) — observation only`, code: 'FILES_OVERLAP' };
    }
  }
  return {
    blocking: false,
    reason: `PR #${pr.number} ouverte mais non bloquante (surfaces disjointes) — poursuite normale`,
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

/* ═══════════════════════════════════════════════════════════════════
 * ÉTAPE 5 — ANTI-MONOPOLE : une tâche bloquée ne bloque jamais l'usine.
 *
 *  - nextEligibleOpportunity(queue, excludeIds) : PURE — la prochaine
 *    opportunité actionnable en excluant celles déjà essayées/parkées
 *    dans le cycle (round-robin : jamais deux fois la même par cycle).
 *  - applyRepairAttempt(state, prNumber, ok, nowMs) : PURE — comptabilise
 *    un essai de réparation (aucun I/O ; le wrapper recordRepairAttempt
 *    persiste).
 *  - shouldParkPr(state, prNumber, max) : PURE — vrai après `max` échecs.
 *  - repairCooldownOver(state, prNumber, nowMs, cooldownMs) : PURE — une PR
 *    parkée redevient éligible à la réparation après `cooldownMs`
 *    (reprise plus tard, pas d'acharnement, pas d'oubli).
 *  - resumeParkedOpportunities(queue, isBlockerClearedFn) : PURE — rend leur
 *    chance aux tâches parkées dont le bloqueur a disparu.
 * ═══════════════════════════════════════════════════════════════════ */

const ELIGIBLE_STATUSES = new Set(['new']);
const RESUMABLE_STATUSES = new Set(['picked', 'in_progress', 'validation']);

/**
 * Prochaine opportunité actionnable, en excluant `excludeIds`
 * (tâches déjà essayées/parkées ce cycle). Tri : score décroissant
 * (à défaut : ordre d'insertion). PURE.
 */
function nextEligibleOpportunity(queue, excludeIds) {
  const excluded = new Set(excludeIds || []);
  const opps = ((queue && queue.opportunities) || []).filter(o =>
    o && ELIGIBLE_STATUSES.has(o.status) && !excluded.has(o.id));
  opps.sort((a, b) => {
    const sa = typeof a._score === 'number' ? a._score : -Infinity;
    const sb = typeof b._score === 'number' ? b._score : -Infinity;
    return sb - sa;
  });
  return opps[0] || null;
}

/** Une opportunité est-elle opposable à un double-claim ? PURE. */
function isAlreadyActive(opp) {
  return !!opp && RESUMABLE_STATUSES.has(opp.status);
}

/**
 * Comptabilise un essai de réparation de PR. PURE (retourne un nouvel état).
 * Succès → compteur remis à zéro (la PR réparée ne pénalise plus).
 */
function applyRepairAttempt(state, prNumber, ok, nowMs) {
  const now = nowMs || Date.now();
  const next = Object.assign({}, state, { prRepair: Object.assign({}, state.prRepair) });
  const key = String(prNumber);
  const prev = next.prRepair[key] || { attempts: 0, lastAt: null, parkedAt: null };
  if (ok) {
    next.prRepair[key] = { attempts: 0, lastAt: new Date(now).toISOString(), parkedAt: null };
  } else {
    next.prRepair[key] = {
      attempts: (prev.attempts || 0) + 1,
      lastAt: new Date(now).toISOString(),
      parkedAt: prev.parkedAt || null,
    };
  }
  return next;
}

/** Vrai quand la PR a épuisé ses essais → parker, passer à la suivante. PURE. */
function shouldParkPr(state, prNumber, max) {
  const limit = (typeof max === 'number' && max > 0) ? max : 3;
  const rec = (state.prRepair || {})[String(prNumber)];
  return !!rec && (rec.attempts || 0) >= limit;
}

/**
 * Marque la PR comme parkée (horodatage). PURE.
 * Une PR parkée sera réessayée après `cooldownMs` (reprise plus tard).
 */
function markPrParked(state, prNumber, nowMs) {
  const now = nowMs || Date.now();
  const next = Object.assign({}, state, { prRepair: Object.assign({}, state.prRepair) });
  const key = String(prNumber);
  const prev = next.prRepair[key] || { attempts: 0, lastAt: null, parkedAt: null };
  next.prRepair[key] = Object.assign({}, prev, { parkedAt: new Date(now).toISOString() });
  return next;
}

/**
 * Vrai si le cooldown de reprise est écoulé (ou si jamais parkée). PURE.
 * Au-delà du cooldown, la réparation est retentée UNE fois (compteur remis
 * à zéro au premier nouvel essai via applyRepairAttempt après succès, ou
 * réincrémenté en cas d'échec — jamais d'acharnement intra-cycle grâce à
 * shouldParkPr qui reste vrai jusqu'au prochain cycle avec cooldown écoulé).
 */
function repairCooldownOver(state, prNumber, nowMs, cooldownMs) {
  const rec = (state.prRepair || {})[String(prNumber)];
  if (!rec || !rec.parkedAt) return true;
  const cd = (typeof cooldownMs === 'number' && cooldownMs >= 0) ? cooldownMs : 24 * 3600000;
  return (nowMs || Date.now()) - new Date(rec.parkedAt).getTime() >= cd;
}

/**
 * Tâches parkées dont le bloqueur a disparu → à re-proposer.
 * `isBlockerClearedFn(opp)` : prédicat fourni par l'appelant (ex: PR mergée).
 * PURE. Ne change aucun statut (la reprise passe par le claim idempotent).
 */
function resumeParkedOpportunities(queue, isBlockerClearedFn) {
  const opps = (queue && queue.opportunities) || [];
  if (typeof isBlockerClearedFn !== 'function') return [];
  return opps.filter(o => o && o.status === 'blocked' && isBlockerClearedFn(o));
}

/**
 * Tâches parkées re-tentables : status 'blocked' avec mention `PR #N` dans
 * blockReason ET cooldown de reprise écoulé pour N. PURE.
 * Le scheduler les fait repasser à 'new' (une seule par cycle — l'appelant
 * flippe la première et laisse les autres pour les cycles suivants :
 * anti-acharnement).
 */
function blockedRetryCandidates(queue, state, nowMs, cooldownMs) {
  const opps = (queue && queue.opportunities) || [];
  return opps.filter(o => {
    if (!o || o.status !== 'blocked') return false;
    const m = String(o.blockReason || '').match(/PR #(\d+)/);
    if (!m) return false;
    return repairCooldownOver(state, m[1], nowMs, cooldownMs);
  });
}

/** Wrapper persistant : comptabilise + sauvegarde (survit au restart). */
function recordRepairAttempt(prNumber, ok) {
  const st = loadScheduler();
  return saveScheduler(applyRepairAttempt(st, prNumber, ok, Date.now()));
}

/** Wrapper persistant : marque parkée + sauvegarde. */
function parkPr(prNumber) {
  const st = loadScheduler();
  return saveScheduler(markPrParked(st, prNumber, Date.now()));
}

module.exports = {
  schedulerPath, loadScheduler, saveScheduler,
  surfaceOfOpp, filesOverlap, findLinkedOpp,
  isPrBlocking, restoreSelected, persistSelected, persistClaimed, persistDispatched,
  stateLine,
  nextEligibleOpportunity, isAlreadyActive,
  applyRepairAttempt, shouldParkPr, markPrParked, repairCooldownOver,
  resumeParkedOpportunities, blockedRetryCandidates,
  recordRepairAttempt, parkPr,
};
