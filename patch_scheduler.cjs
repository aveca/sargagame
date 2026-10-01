const fs = require('fs');
const filePath = "C:\\Users\\user\\Documents\\Backup\\sargagame\\scripts\\autopilot\\lib\\scheduler.cjs";
let content = fs.readFileSync(filePath, 'utf8');

// We will replace the persistClaimed function and the isPrBlocking function.

// First, let's find the persistClaimed function.
// We'll look for the line: "/**\n * Claim idempotent : new → picked (persisté queue + scheduler).\n * Si déjà picked/in_progress/validation → {alreadyClaimed:true}, aucun doublon.\n * Nécessite mem.updateOpportunity injecté pour rester testable sans I/O caché.\n */\nfunction persistClaimed(selected, cycleId, updateFn) {"
// and replace until the closing brace of the function.

// We'll do a more robust replacement by finding the function and then replacing it with our new version.

// We'll split the content into lines and then find the function boundaries.

const lines = content.split('\n');

// Find the start of persistClaimed function
let persistClaimedStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('/**') && 
      lines[i+1].includes(' * Claim idempotent : new → picked (persisté queue + scheduler).') &&
      lines[i+2].includes(' * Si déjà picked/in_progress/validation → {alreadyClaimed:true}, aucun doublon.')) {
    persistClaimedStart = i;
    break;
  }
}

// Find the end of persistClaimed function (the closing brace of the function)
// We'll look for the line that has only a closing brace and is at the same indentation level as the function.
let persistClaimedEnd = -1;
if (persistClaimedStart !== -1) {
  // The function starts at persistClaimedStart, we need to find the matching closing brace.
  let braceCount = 0;
  for (let i = persistClaimedStart; i < lines.length; i++) {
    const line = lines[i];
    // Count opening and closing braces in the line
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '{') braceCount++;
      if (line[j] === '}') braceCount--;
    }
    if (braceCount === 0 && i > persistClaimedStart) {
      persistClaimedEnd = i;
      break;
    }
  }
}

// Find the start of isPrBlocking function
let isPrBlockingStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('/**') && 
      lines[i+1].includes(' * Décide si un PR ouvert bloque réellement le travail sélectionné.') &&
      lines[i+2].includes(' * Ne fait AUCUN I/O. Ne contourne aucun garde-fou : le doute → bloquant.')) {
    isPrBlockingStart = i;
    break;
  }
}

// Find the end of isPrBlocking function
let isPrBlockingEnd = -1;
if (isPrBlockingStart !== -1) {
  let braceCount = 0;
  for (let i = isPrBlockingStart; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '{') braceCount++;
      if (line[j] === '}') braceCount--;
    }
    if (braceCount === 0 && i > isPrBlockingStart) {
      isPrBlockingEnd = i;
      break;
    }
  }
}

if (persistClaimedStart === -1 || persistClaimedEnd === -1 || isPrBlockingStart === -1 || isPrBlockingEnd === -1) {
  console.error('Could not find functions to replace');
  process.exit(1);
}

// New persistClaimed function
const newPersistClaimed = `/**
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
    st.status = 'claimed';
    st.cycleId = cycleId;
    // Ajouter à claimedIds si pas déjà présent
    if (!st.claimedIds.includes(selected.id)) {
      st.claimedIds.push(selected.id);
    }
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
}`;

// New isPrBlocking function
const newIsPrBlocking = `/**
 * Décide si un PR ouvert bloque réellement le travail sélectionné.
 * Ne fait AUCUN I/O. Ne contourne aucun garde-fou : le doute → bloquant.
 * 
 * @param {object|null} pr — {number, headRefName, isDraft, mergeable, mergeStateStatus, files[]}
 * @param {object|null} selected — opportunité sélectionnée (ou non utilisée maintenant)
 * @param {object} queue — {opportunities:[]}
 * @returns {{blocking:boolean, reason:string, code:string}}
 */
function isPrBlocking(pr, selected, queue) {
  if (!pr) return { blocking: false, reason: 'no open autopilot PR', code: 'NO_PR' };
  if (pr.isDraft === true) {
    return { blocking: true, reason: \`PR #\${pr.number} draft (WIP) — observation only\`, code: 'PR_DRAFT' };
  }
  const mergeable = String(pr.mergeable || '').toUpperCase();
  if (mergeable === 'CONFLICTING') {
    // Conflit détecté : potentiellement réparable automatiquement (rebase)
    // L'orchestrateur tentera la réparation avant de bloquer.
    return { blocking: true, reason: \`PR #\${pr.number} en conflit (mergeable=CONFLICTING) — tentative de réparation auto\`, code: 'PR_CONFLICT_REPAIRABLE' };
  }
  const mss = String(pr.mergeStateStatus || '').toUpperCase();
  if (mss === 'DIRTY') {
    return { blocking: true, reason: \`PR #\${pr.number} mergeStateStatus=DIRTY — tentative de réparation auto\`, code: 'PR_CONFLICT_REPAIRABLE' };
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
      return { blocking: true, reason: \`PR #\${pr.number} liée à \${claimedOpp.id} déjà \${linked.status} — pas de doublon, reprise au prochain cycle\`, code: 'ALREADY_CLAIMED' };
    }
    if (ACTIVE.has(claimedOpp.status) && linked && linked.id !== claimedOpp.id) {
      // claimed déjà en cours mais PR liée à un AUTRE travail → collision de branche/worktree
      // On reste prudent : bloquant, avec état persistant.
      return { blocking: true, reason: `\${claimedOpp.id} déjà \${claimedOpp.status} + PR #\${pr.number} (\${pr.headRefName}) en vol — pas de travail concurrent`, code: 'ALREADY_CLAIMED' };
    }
    // Même branche → même travail en vol.
    if (linked && claimedOpp.branch && linked.branch === claimedOpp.branch) {
      return { blocking: true, reason: \`même branche \${claimedOpp.branch} que PR #\${pr.number} — observation only\`, code: 'SAME_BRANCH' };
    }
    if (pr.headRefName && claimedOpp.branch && pr.headRefName === claimedOpp.branch) {
      return { blocking: true, reason: \`même branche \${claimedOpp.branch} que PR #\${pr.number} — observation only\`, code: 'SAME_BRANCH' };
    }
    // 1 changement par surface : même surface que le travail porté par la PR → bloquant.
    const claimedSurface = surfaceOfOpp(claimedOpp);
    const linkedSurface = linked ? surfaceOfOpp(linked) : null;
    if (linkedSurface && linkedSurface === claimedSurface && claimedSurface !== 'misc') {
      return { blocking: true, reason: \`surface "\${claimedSurface}" occupée par PR #\${pr.number} (\${linked.id}) — 1 change per surface\`, code: 'SURFACE_BUSY' };
    }
    // Overlap fichiers PR vs scope sélectionné → bloquant (vrai conflit).
    const prFiles = pr.files || [];
    const claimedFiles = (claimedOpp.scope && claimedOpp.scope.files) || [];
    if (prFiles.length && claimedFiles.length && filesOverlap(prFiles, claimedFiles)) {
      return { blocking: true, reason: \`PR #\${pr.number} touche les mêmes fichiers (\${claimedFiles.slice(0, 3).join(', ')}) — observation only\`, code: 'FILES_OVERLAP' };
    }
  }
  // Sinon : PR simplement ouverte (ex: #777 factory-only vs OPP LCP produit) → NON bloquante.
  return {
    blocking: false,
    reason: `PR #\${pr.number} ouverte mais non bloquante pour les opportunités claimées (surfaces disjointes) — poursuite normale`,
    code: 'NON_BLOCKING',
  };
}`;

// Replace the functions in the lines array
// We'll replace the lines from persistClaimedStart to persistClaimedEnd with the newPersistClaimed lines
// and from isPrBlockingStart to isPrBlockingEnd with the newIsPrBlocking lines.

// We need to split the new functions into lines
const newPersistClaimedLines = newPersistClaimed.split('\n');
const newIsPrBlockingLines = newIsPrBlocking.split('\n');

// Create a new lines array
const newLines = [
  // Lines before persistClaimed
  ...lines.slice(0, persistClaimedStart),
  // New persistClaimed function
  ...newPersistClaimedLines,
  // Lines between persistClaimed and isPrBlocking
  ...lines.slice(persistClaimedEnd + 1, isPrBlockingStart),
  // New isPrBlocking function
  ...newIsPrBlockingLines,
  // Lines after isPrBlocking
  ...lines.slice(isPrBlockingEnd + 1)
];

// Join the lines back together
const newContent = newLines.join('\n');

// Write the file back
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Scheduler patched successfully');