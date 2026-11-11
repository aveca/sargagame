#!/usr/bin/env node
/**
 * agent-task-state.cjs — CONTRAT UNIQUE de l'état des tâches (`.ai/tasks.md`).
 *
 * Source de vérité unique du cycle pick → claim → release utilisé par
 * `.github/workflows/agent-handoff.yml` ET par les tests unitaires
 * (`tests/unit/agent-handoff.test.cjs`, `tests/unit/agent-handoff-claim-contract.test.cjs`).
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * Le workflow `agent-handoff.yml` contenait DEUX implémentations du même
 * contrat, divergentes :
 *
 *   1. l'étape « Pick next task » : repli « `[ ]` n'importe où dans la tâche »
 *      → une tâche SANS ligne de statut pouvait être sélectionnée ;
 *   2. l'étape « Claim task in tasks.md » : exigeait `(.+)` APRÈS le crochet
 *      → la même tâche était alors « Status line not found ».
 *
 * Les tests existants (`tests/unit/agent-handoff.test.cjs`) RÉIMPLÉMENTAIEENT
 * encore une troisième copie de la logique en JavaScript : ils ne testaient
 * donc jamais le code réellement exécuté par GitHub Actions — c'est pourquoi
 * le défaut a survécu. Ici, le test importe et exécute CE contrat.
 *
 * Règles du contrat (déterministes : aucune horloge, aucun réseau)
 * -----------------------------------------------------------------
 * R1. Une tâche = une section `### TASK-P<n>-<ddd>[...]` jusqu'à l'en-tête
 *     `### TASK-P` suivant (ou la fin du fichier).
 * R2. La ligne de statut est la PREMIÈRE ligne de la forme
 *     `- **Statut** : [x] texte`. Le motif est ANCRÉ À LA LIGNE (`[ \t]*`
 *     au lieu de `\s*`) : il ne peut PAS franchir un saut de ligne. C'est la
 *     correction du bug qui supprimait la ligne SUIVANTE du corps de la tâche
 *     lors d'un claim.
 * R3. Un statut `[ ]` SANS texte est valide (la ligne de statut peut être la
 *     dernière de la section). C'était la cause exacte du P1
 *     `AUTOPILOT_FACTORY_EVENT-agent-handoff-claim-status-line-not-found`.
 * R4. Une section contenant PLUSIEURS lignes de statut est AMBIGUË : elle n'est
 *     ni sélectionnable ni réclamable (fail-closed). On ne devine jamais quelle
 *     ligne fait foi.
 * R5. Le rôle est normalisé vers le vocabulaire du dispatch
 *     (`coding, qa, ui, security, devops, data, growth`) : minuscules, suffixe
 *     `_agent`/`-agent` retiré, alias `ux` → `ui`. Le vocabulaire est celui de
 *     la section `case` du workflow — le test `agent-handoff-claim-contract`
 *     vérifie que les deux ne peuvent plus diverger.
 * R6. `pick` ne sélectionne QUE des tâches réclamables : statut `[ ]`, rôle
 *     dispatchable, une seule ligne de statut. PLUS de repli « `[ ]` ailleurs ».
 * R7. `claim` réécrit UNIQUEMENT la ligne de statut et mémorise la ligne
 *     d'origine (état) pour permettre une restauration EXACTE.
 * R8. `release` ne restaure QUE si la ligne de statut est encore exactement
 *     celle de CE claim ; sinon no-op (on ne vole jamais le claim d'un autre
 *     agent). C'est ce qui débloque `TASK-P1-004`, restée `[~] in_progress`
 *     après l'échec « Unknown agent type: devops_agent » du 2026-11-10.
 *
 * Usage :
 *   node scripts/automation/agent-task-state.cjs pick   [--tasks F] [--task-id ID] [--agent-type T]
 *   node scripts/automation/agent-task-state.cjs claim  --task-id ID --agent-type T [--tasks F] [--out F] [--state-file F]
 *   node scripts/automation/agent-task-state.cjs release --state-file F [--tasks F] [--out F]
 *   node scripts/automation/agent-task-state.cjs vocabulary
 *
 * Codes de sortie : 0 = succès (ou no-op), 2 = violation du contrat (message
 * explicite sur stderr).
 */
'use strict'

const fs = require('fs')
const path = require('path')

// ── Vocabulaire (source de vérité du dispatch) ─────────────────────────────
const DISPATCHABLE_ROLES = ['coding', 'qa', 'ui', 'security', 'devops', 'data', 'growth']
const ROLE_ALIASES = { ux: 'ui' }
const DEFAULT_ROLE = 'coding'
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 }
const UNKNOWN_PRIORITY = 99

const TASK_ID_RE = /^TASK-P\d-\d{3}$/

/** Erreur de contrat : message lisible, jamais de traceback illisible. */
class ContractError extends Error {
  constructor (message) {
    super(message)
    this.name = 'ContractError'
  }
}

// ── Motifs (recréés à chaque appel : pas d'état `lastIndex` partagé) ─────────
function taskHeaderRe () { return /^###[ \t]+(TASK-P\d-\d{3})(?![0-9])/gm }
function statusLineRe () { return /^([ \t]*)-[ \t]*\*\*Statut\*\*[ \t]*:[ \t]*\[([ x~])\]([^\r\n]*)/gm }
function roleLineRe () { return /^[ \t]*-[ \t]*\*\*R[oô]le\*\*[ \t]*:[ \t]*([A-Za-z0-9_-]+)/m }
function priorityLineRe () { return /^[ \t]*-[ \t]*\*\*Priorit[ée]\*\*[ \t]*:[ \t]*(P\d)/m }

// ── Helpers purs ────────────────────────────────────────────────────────────

/**
 * Normalise un rôle du backlog vers le vocabulaire du dispatch.
 * `devops_agent` → `devops`, `QA_agent` → `qa`, `UX_agent` → `ui`,
 * `coding-agent` → `coding`. Le suffixe `_agent` du backlog ne doit JAMAIS
 * atteindre la section `case` du workflow (incident « Unknown agent type »).
 */
function normalizeRole (raw) {
  if (!raw) return ''
  let role = String(raw).trim().toLowerCase().replace(/-/g, '_')
  if (role.endsWith('_agent')) role = role.slice(0, -'_agent'.length)
  return ROLE_ALIASES[role] || role
}

function isDispatchableRole (role) { return DISPATCHABLE_ROLES.indexOf(role) !== -1 }

/** Libellé écrit dans le backlog : `in_progress by <role>_agent`. */
function agentLabel (role) { return `${role}_agent` }

function priorityOfTaskId (taskId) {
  const m = /^TASK-P(\d)-/.exec(taskId)
  if (!m) return UNKNOWN_PRIORITY
  const key = `P${m[1]}`
  return Object.prototype.hasOwnProperty.call(PRIORITY_ORDER, key) ? PRIORITY_ORDER[key] : UNKNOWN_PRIORITY
}

function priorityLabel (priority) {
  const found = Object.keys(PRIORITY_ORDER).find(k => PRIORITY_ORDER[k] === priority)
  return found || '?'
}

/** Découpe le backlog en sections de tâches (R1). */
function listTaskSections (content) {
  const re = taskHeaderRe()
  const headers = []
  let m
  while ((m = re.exec(content)) !== null) {
    headers.push({ taskId: m[1], start: m.index })
  }
  return headers.map((h, i) => {
    const end = i + 1 < headers.length ? headers[i + 1].start : content.length
    return { taskId: h.taskId, start: h.start, end, text: content.slice(h.start, end) }
  })
}

/** Lignes de statut d'une section (R2/R3) — jamais au-delà de la ligne. */
function statusLinesOf (sectionText) {
  const re = statusLineRe()
  const out = []
  let m
  while ((m = re.exec(sectionText)) !== null) {
    out.push({
      index: m.index,
      length: m[0].length,
      indent: m[1],
      char: m[2],
      rest: m[3],
      line: m[0]
    })
  }
  return out
}

/** Analyse déterministe d'une section (état + raison du refus). */
function analyzeSection (section) {
  const statuses = statusLinesOf(section.text)
  const roleRaw = (roleLineRe().exec(section.text) || [])[1] || ''
  const role = normalizeRole(roleRaw) || DEFAULT_ROLE
  const priorityField = (priorityLineRe().exec(section.text) || [])[1] || null
  const info = {
    taskId: section.taskId,
    statusLineCount: statuses.length,
    statusChar: statuses.length ? statuses[0].char : null,
    statusText: statuses.length ? statuses[0].rest.trim() : '',
    roleRaw,
    role,
    priority: priorityOfTaskId(section.taskId),
    priorityLabel: priorityLabel(priorityOfTaskId(section.taskId)),
    priorityField,
    pickable: false,
    reason: ''
  }
  if (statuses.length === 0) info.reason = 'no_status_line'
  else if (statuses.length > 1) info.reason = 'ambiguous_status_lines'
  else if (statuses[0].char !== ' ') info.reason = 'not_free'
  else if (!isDispatchableRole(role)) info.reason = 'role_not_dispatchable'
  else { info.reason = 'pickable'; info.pickable = true }
  return info
}

// ── pick ────────────────────────────────────────────────────────────────────

/**
 * Sélectionne la prochaine tâche réclamable (R6).
 * - `opts.taskId` : tâche forcée (diagnostic) — doit être réclamable.
 * - `opts.agentType` : type d'agent forcé (vocabulaire dispatch).
 */
function pickTask (content, opts) {
  const options = opts || {}
  const sections = listTaskSections(content)
  const forcedTaskId = options.taskId || ''
  const forcedAgentType = options.agentType || ''

  if (forcedTaskId) {
    const section = sections.find(s => s.taskId === forcedTaskId)
    if (!section) throw new ContractError(`Task ${forcedTaskId} not found`)
    const info = analyzeSection(section)
    if (info.statusLineCount === 0) throw new ContractError(`Status line not found in task ${forcedTaskId}`)
    if (info.statusLineCount > 1) {
      throw new ContractError(`Ambiguous status lines in task ${forcedTaskId} (${info.statusLineCount} lines): refusing to guess which line is authoritative`)
    }
    if (info.statusChar !== ' ') throw new ContractError(`Task ${forcedTaskId} already claimed (status: ${info.statusChar})`)
    const role = forcedAgentType ? normalizeRole(forcedAgentType) : info.role
    if (!isDispatchableRole(role)) throw new ContractError(`Unknown agent type: ${forcedAgentType || info.roleRaw || info.role}`)
    return {
      taskId: forcedTaskId,
      agentType: role,
      priority: info.priority,
      priorityLabel: info.priorityLabel,
      forced: true,
      reason: 'forced',
      skipped: []
    }
  }

  const candidates = []
  const skipped = []
  for (const section of sections) {
    const info = analyzeSection(section)
    if (info.pickable) candidates.push(info)
    else skipped.push(info)
  }
  candidates.sort((a, b) => (a.priority - b.priority) || (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0))
  if (!candidates.length) {
    return { taskId: '', agentType: '', priority: null, priorityLabel: '', forced: false, reason: 'no_candidate', skipped }
  }
  const best = candidates[0]
  return {
    taskId: best.taskId,
    agentType: best.role,
    priority: best.priority,
    priorityLabel: best.priorityLabel,
    forced: false,
    reason: 'pickable',
    skipped
  }
}

// ── claim ───────────────────────────────────────────────────────────────────

/** Réclame une tâche : réécrit UNIQUEMENT sa ligne de statut (R7). */
function claimTask (content, taskId, agentType) {
  if (!TASK_ID_RE.test(taskId)) throw new ContractError(`Invalid task ID: ${taskId}`)
  const section = listTaskSections(content).find(s => s.taskId === taskId)
  if (!section) throw new ContractError(`Task ${taskId} not found`)
  const statuses = statusLinesOf(section.text)
  if (!statuses.length) throw new ContractError(`Status line not found in task ${taskId}`)
  if (statuses.length > 1) {
    throw new ContractError(`Ambiguous status lines in task ${taskId} (${statuses.length} lines): refusing to guess which line is authoritative`)
  }
  const st = statuses[0]
  if (st.char !== ' ') throw new ContractError(`Task ${taskId} already claimed (status: ${st.char})`)
  const role = normalizeRole(agentType)
  if (!role) throw new ContractError(`Missing agent type for task ${taskId}`)
  if (!isDispatchableRole(role)) throw new ContractError(`Unknown agent type: ${agentType}`)

  const label = agentLabel(role)
  const claimedLine = `${st.indent}- **Statut** : [~] ${taskId} — in_progress by ${label}`
  const absStart = section.start + st.index
  const absEnd = absStart + st.length
  return {
    content: content.slice(0, absStart) + claimedLine + content.slice(absEnd),
    taskId,
    agentType: role,
    agentLabel: label,
    previousLine: st.line,
    claimedLine,
    previousStatusText: st.rest.trim()
  }
}

// ── release ─────────────────────────────────────────────────────────────────

/**
 * Restaure la ligne de statut d'origine (R8).
 * No-op si la ligne de statut n'est plus exactement celle de CE claim.
 */
function releaseTask (content, state) {
  if (!state || !state.taskId) throw new ContractError('release: missing taskId in state')
  const section = listTaskSections(content).find(s => s.taskId === state.taskId)
  if (!section) return { content, released: false, reason: 'task_not_found', taskId: state.taskId }
  const statuses = statusLinesOf(section.text)
  if (!statuses.length) return { content, released: false, reason: 'status_line_missing', taskId: state.taskId }
  const st = statuses[0]
  if (st.line !== state.claimedLine) {
    return { content, released: false, reason: 'claim_not_ours', taskId: state.taskId, currentLine: st.line }
  }
  const absStart = section.start + st.index
  const absEnd = absStart + st.length
  return {
    content: content.slice(0, absStart) + state.previousLine + content.slice(absEnd),
    released: true,
    reason: 'restored',
    taskId: state.taskId
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs (argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) { out._.push(token); continue }
    const eq = token.indexOf('=')
    if (eq !== -1) { out[token.slice(2, eq)] = token.slice(eq + 1); continue }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) { out[key] = true; continue }
    out[key] = next
    i++
  }
  return out
}

function readTasks (tasksPath) {
  const p = tasksPath || path.join('.ai', 'tasks.md')
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (e) {
    throw new ContractError(`Cannot read tasks file ${p}: ${e.message}`)
  }
}

function cmdPick (args) {
  const content = readTasks(args.tasks)
  const result = pickTask(content, { taskId: args['task-id'], agentType: args['agent-type'] })
  if (result.skipped && result.skipped.length) {
    for (const s of result.skipped) {
      console.error(`[agent-task-state] ignorée ${s.taskId} : ${s.reason}`)
    }
  }
  if (!result.taskId) console.error('[agent-task-state] aucune tâche réclamable')
  console.log(JSON.stringify(result))
  return 0
}

function cmdClaim (args) {
  const content = readTasks(args.tasks)
  const result = claimTask(content, args['task-id'], args['agent-type'])
  const outPath = args.out || args.tasks || path.join('.ai', 'tasks.md')
  fs.writeFileSync(outPath, result.content, 'utf8')
  const state = {
    taskId: result.taskId,
    agentType: result.agentType,
    agentLabel: result.agentLabel,
    previousLine: result.previousLine,
    claimedLine: result.claimedLine,
    previousStatusText: result.previousStatusText
  }
  if (args['state-file']) fs.writeFileSync(args['state-file'], JSON.stringify(state, null, 2), 'utf8')
  console.log(JSON.stringify({ ok: true, ...state, out: outPath }))
  return 0
}

function cmdRelease (args) {
  if (!args['state-file']) throw new ContractError('release: --state-file is required')
  let state
  try {
    state = JSON.parse(fs.readFileSync(args['state-file'], 'utf8'))
  } catch (e) {
    throw new ContractError(`Cannot read state file ${args['state-file']}: ${e.message}`)
  }
  const content = readTasks(args.tasks)
  const result = releaseTask(content, state)
  const outPath = args.out || args.tasks || path.join('.ai', 'tasks.md')
  if (result.released) fs.writeFileSync(outPath, result.content, 'utf8')
  console.log(JSON.stringify({ ok: true, released: result.released, reason: result.reason, taskId: result.taskId || state.taskId }))
  return 0
}

function cmdVocabulary () {
  console.log(JSON.stringify({ roles: DISPATCHABLE_ROLES, aliases: ROLE_ALIASES, defaultRole: DEFAULT_ROLE }))
  return 0
}

function main (argv) {
  const args = parseArgs(argv)
  const command = args._[0]
  try {
    switch (command) {
      case 'pick': return cmdPick(args)
      case 'claim': return cmdClaim(args)
      case 'release': return cmdRelease(args)
      case 'vocabulary': return cmdVocabulary()
      default:
        console.error('agent-task-state: unknown command ' + (command || '(none)') + ' — expected pick|claim|release|vocabulary')
        return 2
    }
  } catch (e) {
    if (e instanceof ContractError) {
      console.error('agent-task-state: ' + e.message)
      return 2
    }
    console.error('agent-task-state: unexpected error: ' + (e && e.stack ? e.stack : e))
    return 2
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)))

module.exports = {
  DISPATCHABLE_ROLES,
  ROLE_ALIASES,
  DEFAULT_ROLE,
  PRIORITY_ORDER,
  ContractError,
  normalizeRole,
  isDispatchableRole,
  agentLabel,
  priorityOfTaskId,
  listTaskSections,
  statusLinesOf,
  analyzeSection,
  pickTask,
  claimTask,
  releaseTask
}
