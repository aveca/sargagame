'use strict'
/**
 * outbound-authorization.cjs — Contrat central d'autorisation des actions sortantes.
 * Mission P0.23 / issue #1157. Corrige les 8 defauts de review de la PR #1200 :
 *
 *   A. require relatifs faux    -> module autonome (aucun require vers scripts/automation)
 *   B. push desactive DRY_RUN   -> seul workflow_dispatch peut autoriser la production
 *   C. triggers inconnus fail-open -> tout trigger non liste = REFUS
 *   D. ENVIRONMENT_NAME = preuve -> variable ignoree ; preuve = jeton d'Environment protege
 *   E. DRY_RUN agrege au workflow -> l'env est lu par process (job/step), jamais suppose
 *   F. curl clean_bounces bypass -> couvert par external_write + test de gouvernance
 *   G. secrets injectes en dry-run -> politique documentee + strips dans les workflows
 *   H. check a l'import du module -> fonctions pures, zero effet reseau a l'import
 *
 * REGLE : toute action sortante ou destructive est DRY-RUN par defaut.
 * Une action de production exige TOUTES ces preuves :
 *   1. declencheur = workflow_dispatch (jamais schedule/push/PR/workflow_run/inconnu)
 *   2. DRY_RUN absent (ou non vrai) dans l'environnement du JOB/STEP concerne
 *   3. un jeton d'approbation provenant d'un Environment GitHub PROTEGE (secret injecte
 *      seulement apres approbation humaine), present et bien forme
 *   4. cet Environment verifie via l'API GitHub en LECTURE SEULE : il existe ET porte
 *      au moins une regle de protection / un required reviewer
 * Si UNE seule preuve manque ou n'est pas verifiable -> l'operation reste DESACTIVEE.
 * Aucun environnement, secret ou protection n'est cree par ce module.
 */

/** Actions sortantes couvertes par le contrat. */
const OUTBOUND_ACTIONS = {
  email_send: { label: 'envoi email (SMTP/Resend)', destructive: false },
  push_send: { label: 'envoi push (OneSignal)', destructive: false },
  outreach: { label: 'email de prospection (cold outreach)', destructive: false },
  apps_script_cleanup: { label: 'mutation Apps Script (clean_bounces / compteurs)', destructive: true },
  analytics_delete: { label: 'DELETE Supabase analytics_events', destructive: true },
  external_write: { label: 'ecriture HTTP externe (POST/PATCH/DELETE)', destructive: true },
}

/** Declencheurs qui ne peuvent JAMAIS autoriser une action de production. */
const NEVER_PRODUCTION_TRIGGERS = new Set([
  'schedule',
  'push',
  'pull_request',
  'pull_request_target',
  'workflow_run',
  'issue_comment',
  'repository_dispatch',
  'release',
  'create',
  'delete',
  'fork',
  'watch',
  'page_build',
  'status',
  'unknown',
])

/** Seul declencheur manual, donc potentiellement approuvable. */
const MANUAL_TRIGGER = 'workflow_dispatch'

/** Jeton d'approbation : secret defini UNIQUEMENT sur l'Environment protege. */
const APPROVAL_TOKEN_VAR = 'OUTBOUND_APPROVAL_TOKEN'
const APPROVAL_TOKEN_PATTERN = /^sgappr_[A-Za-z0-9_-]{16,}$/

/** Nom de l'Environment attendu (informationnel : la preuve reste le jeton + l'API). */
const APPROVAL_ENVIRONMENT_VAR = 'OUTBOUND_APPROVAL_ENVIRONMENT'

const truthy = (v) => v === '1' || v === true || String(v).toLowerCase() === 'true'

/**
 * Declencheur courant. Defaut 'unknown' (fail-closed), jamais devine.
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function resolveTrigger(env) {
  const name = env && env.GITHUB_EVENT_NAME ? String(env.GITHUB_EVENT_NAME).trim() : ''
  return name === '' ? 'unknown' : name
}

/**
 * DRY_RUN demande explicitement ? Defaut faux : l'absence n'est PAS une autorisation,
 * c'est l'autorisation qui doit etre prouvee.
 * @param {NodeJS.ProcessEnv} env
 */
function isDryRunRequested(env) {
  return truthy(env && env.DRY_RUN)
}

/**
 * Le jeton d'approbation est-il present et bien forme ?
 * Volontairement strict : un jeton partiel ou recycle est refuse.
 * @param {NodeJS.ProcessEnv} env
 */
function hasApprovalProof(env) {
  const token = env && env[APPROVAL_TOKEN_VAR]
  if (typeof token !== 'string' || token.length === 0) return false
  return APPROVAL_TOKEN_PATTERN.test(token)
}

/**
 * Verification LECTURE SEULE d'un Environment GitHub protege.
 * Injecte `fetchImpl` dans les tests (aucun reseau reel).
 *
 * @param {{token?:string, owner?:string, repo?:string, environment?:string, fetchImpl?:Function}} options
 * @returns {Promise<{exists:boolean, reviewers:number, protectionRules:number, error?:string}>}
 */
async function verifyEnvironmentProtection(options = {}) {
  const empty = { exists: false, reviewers: 0, protectionRules: 0, error: 'unverified' }
  const env = process.env
  const owner = options.owner || env.GITHUB_REPOSITORY_OWNER || (env.GITHUB_REPOSITORY || '').split('/')[0]
  const repo = options.repo || (env.GITHUB_REPOSITORY || '').split('/')[1] || ''
  const environment = options.environment || env[APPROVAL_ENVIRONMENT_VAR] || ''
  const token = options.token || env.GITHUB_TOKEN || env.OUTBOUND_APPROVAL_TOKEN || ''
  const fetchImpl = options.fetchImpl || globalThis.fetch

  if (!owner || !repo || !environment) {
    return Object.assign({}, empty, { error: 'environment-not-named' })
  }
  if (!token || typeof fetchImpl !== 'function') {
    return Object.assign({}, empty, { error: 'no-read-only-verifier' })
  }

  const headers = {
    authorization: 'Bearer ' + token,
    accept: 'application/vnd.github+json',
    'user-agent': 'sargagame-outbound-authorization',
  }
  try {
    const detail = await fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/environments/${encodeURIComponent(environment)}`,
      { headers }
    )
    if (detail && detail.status === 404) return { exists: false, reviewers: 0, protectionRules: 0, error: 'environment-missing' }
    if (!detail || !detail.ok) {
      return { exists: false, reviewers: 0, protectionRules: 0, error: 'verification-failed' }
    }
    const body = await detail.json()
    const protectionRules = Array.isArray(body.protection_rules) ? body.protection_rules.length : 0
    const reviewers = Array.isArray(body.reviewers)
      ? body.reviewers.length
      : (Array.isArray(body.protection_rules)
          ? body.protection_rules.filter((r) => r && r.type === 'required_reviewers').length
          : 0)
    return { exists: true, reviewers, protectionRules, error: protectionRules > 0 || reviewers > 0 ? undefined : 'not-protected' }
  } catch (err) {
    return { exists: false, reviewers: 0, protectionRules: 0, error: 'verification-error:' + (err && err.message ? err.message : String(err)) }
  }
}

/**
 * Coeur SYNCHRONE de la decision. Sans effet reseau, testable, appele dans main().
 *
 * @param {keyof OUTBOUND_ACTIONS} action
 * @param {Object} [options]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {boolean} [options.requested] true si l'appelant a explicitement demande l'execution reelle (--send / --purge)
 * @param {{exists:boolean,reviewers:number,protectionRules:number,error?:string}} [options.environmentProtection]
 * @returns {{execute:boolean, mode:'dry-run'|'production'|'blocked', action:string, reason:string, evidence:Object}}
 */
function authorizeAction(action, options = {}) {
  const env = options.env || process.env
  const meta = OUTBOUND_ACTIONS[action]
  const requested = options.requested === true
  const evidence = {
    trigger: resolveTrigger(env),
    dryRunEnv: isDryRunRequested(env),
    approvalProof: hasApprovalProof(env),
    requested,
  }

  if (!meta) {
    return { execute: false, mode: 'blocked', action: String(action), reason: 'action-inconnue-hors-contrat', evidence }
  }

  // 1. Une demande DRY_RUN explicite gagne toujours.
  if (evidence.dryRunEnv) {
    return { execute: false, mode: 'dry-run', action, reason: 'DRY_RUN demande explicitement', evidence }
  }

  // 2. Seul un dispatch manuel peut esperer une production (couvre push, schedule, inconnu...).
  if (evidence.trigger !== MANUAL_TRIGGER) {
    return {
      execute: false,
      mode: 'dry-run',
      action,
      reason: `declencheur ${evidence.trigger} : jamais d'autorisation de production`,
      evidence,
    }
  }

  // 3. Sans demande explicite, on ne produit rien (defaut dry-run).
  if (!requested) {
    return {
      execute: false,
      mode: 'dry-run',
      action,
      reason: 'aucune demande explicite (--send/--purge) : simulation',
      evidence,
    }
  }

  // 4. Jeton d'approbation absent ou malforme -> bloque (pas de silencieux "succes").
  if (!evidence.approvalProof) {
    return {
      execute: false,
      mode: 'blocked',
      action,
      reason: `demande reelle refusee : ${APPROVAL_TOKEN_VAR} absent ou invalide (Environment protege non approuve)`,
      evidence,
    }
  }

  // 5. Protection de l'Environment non verifiable -> DESACTIVE, jamais de repli.
  const prot = options.environmentProtection
  if (!prot) {
    return {
      execute: false,
      mode: 'blocked',
      action,
      reason: "protection de l'Environment non verifiee (lecture API GitHub indisponible) : operation desactivee",
      evidence,
    }
  }
  if (!prot.exists || (!prot.protectionRules && !prot.reviewers)) {
    return {
      execute: false,
      mode: 'blocked',
      action,
      reason: 'Environment introuvable ou sans required reviewer : operation desactivee',
      evidence,
    }
  }

  return {
    execute: true,
    mode: 'production',
    action,
    reason: 'autorise : dispatch manuel + jeton approuve + Environment protege verifie',
    evidence,
  }
}

/**
 * Variante ASYNCHRONE : verifie d'abord l'Environment protege via l'API GitHub
 * (LECTURE SEULE) puis decide. Utilisee par les scripts en execution reelle.
 * Si la verification est impossible, l'operation reste DESACTIVEE (fail-closed).
 *
 * @param {keyof OUTBOUND_ACTIONS} action
 * @param {Object} [options] memes options que authorizeAction + `verify?` (false = sauter l'appel API)
 * @returns {Promise<{execute:boolean, mode:string, action:string, reason:string, evidence:Object}>}
 */
async function authorizeActionAsync(action, options = {}) {
  // Verification de l'Environment d'abord : sans elle, aucune production n'est possible.
  const protection = await verifyEnvironmentProtection(options.verificationOptions || {})
  const decision = authorizeAction(action, Object.assign({}, options, { environmentProtection: protection }))
  return Object.assign({}, decision, { evidence: Object.assign({}, decision.evidence, { environmentProtection: protection }) })
}

/** Fabrique les helpers nommes exiges par la mission. */
function namedAssert(action) {
  return function assert(options) {
    return authorizeAction(action, options)
  }
}

const assertEmailSendAllowed = namedAssert('email_send')
const assertPushSendAllowed = namedAssert('push_send')
const assertOutreachAllowed = namedAssert('outreach')
const assertAppsScriptCleanupAllowed = namedAssert('apps_script_cleanup')
const assertAnalyticsDeleteAllowed = namedAssert('analytics_delete')
const assertExternalWriteAllowed = namedAssert('external_write')

/** Ligne de log stable, utilisee par les scripts et les tests. */
function describeDecision(decision) {
  return `[outbound-authorization] action=${decision.action} mode=${decision.mode} execute=${decision.execute} reason=${decision.reason}`
}

module.exports = {
  OUTBOUND_ACTIONS,
  NEVER_PRODUCTION_TRIGGERS,
  MANUAL_TRIGGER,
  APPROVAL_TOKEN_VAR,
  APPROVAL_TOKEN_PATTERN,
  APPROVAL_ENVIRONMENT_VAR,
  resolveTrigger,
  isDryRunRequested,
  hasApprovalProof,
  verifyEnvironmentProtection,
  authorizeAction,
  authorizeActionAsync,
  assertEmailSendAllowed,
  assertPushSendAllowed,
  assertOutreachAllowed,
  assertAppsScriptCleanupAllowed,
  assertAnalyticsDeleteAllowed,
  assertExternalWriteAllowed,
  describeDecision,
}
