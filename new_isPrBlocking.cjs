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