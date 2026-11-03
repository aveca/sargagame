#!/usr/bin/env node
/**
 * audit-workflow-outbound.cjs — Gouvernance des workflows GitHub Actions pour
 * les actions sortantes (mission P0.23 / #1157).
 *
 * Controle, au niveau JOB > STEP, que tout workflow declenche automatiquement
 * (`schedule`, `push`, `pull_request`, `workflow_run`) ne peut produire aucune
 * action sortante reelle :
 *   R1 (HIGH) flag `--send` / `--purge` / `--force` sur un trigger automatique
 *   R2 (HIGH) appel `curl` HTTP direct vers Apps Script (contourne le contrat Node)
 *   R3 (MED)  secret d'envoi (SMTP_PASS, SUPABASE_SERVICE_KEY, ONESIGNAL_*,
 *       APPS_SCRIPT_URL, MOLLIE_API_KEY) injecte sur une etape planifiee
 *       sans condition ni garde explicite
 *   R4 (INFO) script sortant appele sans flag : defaut simulation du contrat
 *       central `scripts/lib/outbound-authorization.cjs`
 *   R5 (HIGH) workflow illisible par le vrai parseur YAML (non silencieux)
 *   R6 (HIGH) script shell INLINE (`run: |` + curl) avec un secret d'envoi :
 *       invisible pour R1-R4 (aucun script Node). Seule entree tolerée : les
 *       exceptions documentees ci-dessous, ET UNIQUEMENT en declenchement manuel.
 *
 * EXCEPTIONS INLINE (R6) : rares, nommees, et verouilles. L'audit ne peut pas
 * suivre ce qu'un shell inline fait (pas d'AST), donc au lieu de pretendre les
 * couvrir, il les INTERDIT par defaut et tolère une liste fermée, vérifiée à
 * chaque audit : le workflow doit rester en `workflow_dispatch` seul. Lui ajouter
 * `schedule`/`push`/`workflow_run` casse l'exception -> HIGH, pas un warning.
 *
 * DES DEUX PARSEURS :
 *   1. `js-yaml` (devDependency, installe en CI et en dev) : VRAI parseur YAML —
 *      il attire les erreurs de syntaxe, les blocs `run:` multi-lignes, les listes
 *      de triggers en flow (`on: [push]`) et les mappings imbriques que le scan
 *      ligne-a-ligne laisse passer. C'est le parseur de reference.
 *   2. Scan structurel ligne-a-ligne : repli SANS dependance pour un audit sur
 *      une installation de production (devDependencies absentes). Le champ
 *      `parser` de chaque resultat indique lequel a servi.
 *
 * EXEMPTIONS (R1) : une exemption n'est JAMAIS une simple liste blanche de
 * workflow. Elle est VERIFIEE A CHAQUE AUDIT : la source du script exempte est
 * relue et scannee pour tout site d'ecriture externe (POST/PATCH/PUT/DELETE,
 * sendMail, FTP remove/upload, dispatch GitHub). Des qu'un seul apparait,
 * l'exemption est REFUSEE -> le finding HIGH revient (fail-closed). Ajouter un
 * appel mutant a un script exempte casse donc le test de gouvernance, pas
 * seulement la documentation.
 *
 * Lecture seule : aucun appel reseau, aucune ecriture.
 *
 * Usage : node scripts/audit-workflow-outbound.cjs [--json] [--strict]
 */
'use strict'

const fs = require('fs')
const path = require('path')

const WF_DIR = path.join(__dirname, '..', '.github', 'workflows')

/** js-yaml est optionnel : present en dev/CI, absent sur une install de prod. */
function tryRequireYaml() {
  try {
    const lib = require('js-yaml')
    return typeof lib.load === 'function' ? lib : null
  } catch (_) {
    return null
  }
}
const YAML = tryRequireYaml()

/**
 * Scripts dont l'execution peut produire une action sortante ou destructrice.
 * Liste de couverture de la MISSION P0.23/#1157 : tout script gat par le contrat
 * central `scripts/lib/outbound-authorization.cjs` et appele par un workflow.
 * Le test de gouvernance verrouille cette liste : un nouveau script sortant doit
 * y etre ajoute, sinon `R4` ne le voit pas et la couverture se degrade en silence.
 */
const OUTBOUND_SCRIPTS = [
  // Emails / push
  'send-notifications.cjs',
  'push-winback.cjs',
  'drip-email.cjs',
  'email-weekend.cjs',
  'incident-apology.cjs',
  'notify-new-photos.cjs',
  'notify-new-reports.cjs',
  'notify-failure.cjs',
  'smtp-selftest.cjs',
  'support-reply.cjs',
  'welcome-email.cjs',
  // Prospection / relance
  'auto-outreach.cjs',
  'b2b-outreach.cjs',
  'seo-outreach-curated.cjs',
  'relance-gap-leads.cjs',
  'user-journey-notify.cjs',
  // Alertes metier
  'deliverability-watch.cjs',
  'factory-heartbeat-watch.cjs',
  'revenue-watch.cjs',
  'ux-watch.cjs',
  // Mutations Supabase
  'purge-analytics.cjs',
  'auto-moderate-photos.cjs',
  'auto-moderate-reports.cjs',
  'apply-supabase-schema.cjs',
  // Apps Script / ISO / infra
  'appscript-cleanup.cjs',
  'beached-calibrate.cjs',
  'register-ga4-dimensions.cjs',
  'trigger-production-deploy.cjs',
  'provision-barbados.cjs',
  'revoke-pass.cjs',
  // Metriques internes (exemption R1 verifiee, lecture seule)
  'mollie-mrr.cjs',
]

/** Variables secretes dont l'injection rend une etape capable d'agir. */
const SENSITIVE_SECRETS = [
  'SMTP_PASS',
  'SUPABASE_SERVICE_KEY',
  'ONESIGNAL_API_KEY',
  'APPS_SCRIPT_URL',
  'MOLLIE_API_KEY',
  'OUTBOUND_APPROVAL_TOKEN',
]

/** Flags qui demandent une action REELLE. */
const DANGEROUS_FLAGS = ['--send', '--purge', '--force']

/**
 * R6 — actions sortantes executees par du SHELL INLINE (bloc `run:` multi-ligne),
 * invisibles pour R1-R4 puisque aucun script Node n'est appele.
 *
 * Par defaut, l'audit ne peut NI suivre NI autoriser ces blocs : ils sont donc
 * REFUSES (HIGH) des qu'un secret d'envoi est present sans script Node gate.
 *
 * Les deux entrees ci-dessous sont des outils d'exploitation manuelle (le fondateur
 * draine SA boite / cree SES redirecteurs cPanel) : elles exigent un
 * `workflow_dispatch` explicite et n'envoient rien a un tiers. Elles sont
 * tolerees UNIQUEMENT en declenchement manuel — l'ajout d'un trigger automatique
 * fait revenir le HIGH (fail-closed), et la suppression du workflow rend
 * l'exemption perimee (HIGH aussi).
 */
const INLINE_RUN_EXCEPTIONS = [
  {
    file: 'check-mail-backlog.yml',
    reason:
      'Drainage manuel de la boite alerte@ (IMAP -> forward vers le Gmail du fondateur). ' +
      'workflow_dispatch seul, secret SMTP_PASS + FORWARD_TO explicites, aucun destinataire tiers.',
  },
  {
    file: 'setup-mail-forwarders.yml',
    reason:
      'Creation manuelle des redirecteurs cPanel vers le Gmail (workflow_dispatch seul).',
  },
]

/**
 * Exemptions R1 DOCUMENTEES et VERIFIEES (lecture seule + ecriture locale).
 * Chaque entree : le script, le(s) flag(s) concerne(s), et la justification.
 * La verification est mecanique (voir `verifyReadOnlyScript`) : la source du
 * script ne doit contenir AUCUN site d'ecriture externe. Toute nouvelle entree
 * doit etre ajoutee au test de gouvernance `tests/unit/workflow-outbound-governance.test.cjs`.
 */
const READ_ONLY_FLAG_EXEMPTIONS = [
  {
    script: 'mollie-mrr.cjs',
    flags: ['--send'],
    reason:
      "MRR tracker en LECTURE SEULE cote Mollie (mollieGet, aucune methode mutante) : " +
      '`--send` ecrit uniquement le rapport local scripts/automation/data/mollie-mrr.json ' +
      '(fichier de metriques interne, aucun destinataire, aucune transaction, aucun etat serveur).',
  },
]

/** Motifs d'ecriture EXTERNE utilisés pour verifier (ou refuser) une exemption. */
const EXTERNAL_WRITE_PATTERNS = [
  [/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i, 'requete HTTP mutante'],
  // Requete via `https.request` : la methode est une VARIABLE, donc invisible au
  // motif litteral ci-dessus. C'est pourtant un appel externe mutable
  // (`trigger-production-deploy.cjs` dispatch de workflows de cette facon).
  [/https\.request\s*\(/, 'requete HTTPS (methode dynamique)'],
  [/\.sendMail\s*\(/, 'envoi email'],
  [/transporter\.sendMail\s*\(/, 'envoi email'],
  [/(?:client|ftp)\.(?:remove|upload|rename|mkdir)\s*\(/, 'ecriture FTP'],
  // Dispatch GitHub : on cherche un APPEL, pas la simple mention d'un nom de
  // trigger. `repository_dispatch` suivi de ':' ou '(' (= objet de trigger YAML
  // ou appel) ; sinon une liste de noms comme celle du contrat central serait
  // comptee a tort comme site d'ecriture.
  [/createWorkflowDispatch\s*\(/, 'dispatch GitHub'],
  [/workflows\/[^'"`\s]+\/dispatches/, 'dispatch GitHub'],
  [/repository_dispatch\s*[:(]/, 'dispatch GitHub'],
  // Mutation Apps Script : l'URL est appelee en GET (`curl -sL "$URL?action=..."`),
  // donc la METHODE HTTP ne prouve rien. C'est l'ACTION demandee au serveur qui
  // mute (suppression de lignes dans la Sheet). Sans ce motif, un script Node
  // qui enveloppe `action=clean_bounces` passerait pour de la lecture seule.
  [/clean_bounces|action\s*[:=]\s*['"`]?(?:clean|delete|remove|purge)/i, 'mutation Apps Script (action de nettoyage)'],
  [/fastDeploy\s*\(/, 'deploiement'],
  [/git\s+push/, 'push git'],
]

/** Profondeur maximale de suivi des `require` relatifs lors d'une verification. */
const READ_ONLY_SCAN_DEPTH = 4

/**
 * Resout un `require('./x')` en fichier reel (extensions + index), ou null.
 */
function resolveRelativeRequire(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  const candidates = [base, base + '.js', base + '.cjs', base + '.mjs', base + '.json',
    path.join(base, 'index.js'), path.join(base, 'index.cjs'), path.join(base, 'index.mjs')]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
    } catch (_) { /*Ignore*/ }
  }
  return null
}

/**
 * Verifie qu'un script exempte est bien (encore) en lecture seule.
 * Retourne toujours un objet : {exists, clean, sites}. Un script manquant ou
 * modifie avec un site d'ecriture fait ECHOUER l'exemption (fail-closed).
 *
 * La verification est TRANSITIVE : un script peut deleguer son ecriture a une
 * lib partagee (`require('./lib/email-send.cjs')` -> `transporter.sendMail`).
 * Ne scanner que le fichier principal accorderait une exemption a un script qui
 * envoie par procuration. On suit donc les `require` relatifs, profondeur bornee
 * (`READ_ONLY_SCAN_DEPTH`) et avec memoization : un fichier deja vu n'est pas
 * relu, donc pas d'explosion sur les graphes densement relies (safety.cjs est
 * requis par presque tous les scripts).
 */
function verifyReadOnlyScript(script) {
  // __dirname == scripts/ ; les scripts d'automation vivent dans scripts/automation/.
  const entry = path.join(__dirname, 'automation', script)
  if (!fs.existsSync(entry)) return { exists: false, clean: false, sites: ['script-introuvable'] }

  const sites = []
  const visited = new Set()
  const queue = [{ file: entry, depth: 0 }]

  while (queue.length) {
    const item = queue.shift()
    if (visited.has(item.file) || item.depth > READ_ONLY_SCAN_DEPTH) continue
    visited.add(item.file)

    let src
    try { src = fs.readFileSync(item.file, 'utf8') } catch (_) { continue }

    const where = item.depth === 0 ? 'script' : path.basename(item.file)
    for (const [re, label] of EXTERNAL_WRITE_PATTERNS) {
      if (re.test(src)) sites.push(`${label}@${where}`)
    }

    if (item.depth >= READ_ONLY_SCAN_DEPTH) continue
    // Deux formes de require relatif sont suivies :
    //   1. litteral        : require('./lib/email-send.cjs')
    //   2. construit       : require(path.join(__dirname, 'lib', 'email-send.cjs'))
    //                        require(path.resolve(__dirname, 'lib', 'safety.cjs'))
    // La forme 2 etait invisible : un script qui deleguait son envoi email par
    // ce biais aurait ete declare lecture seule a tort (ex: support-reply.cjs).
    const specs = []
    for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) specs.push(m[1])
    for (const m of src.matchAll(/require\(\s*path\.(?:join|resolve)\(\s*__dirname\s*,([^)]*)\)\s*\)/g)) {
      const segs = [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2])
      if (segs.length) specs.push(segs.join('/'))
    }
    for (const spec of specs) {
      const resolved = resolveRelativeRequire(item.file, spec)
      if (resolved && /\.(js|cjs|mjs)$/.test(resolved)) queue.push({ file: resolved, depth: item.depth + 1 })
    }
  }

  return { exists: true, clean: sites.length === 0, sites: [...new Set(sites)], scannedFiles: visited.size }
}

/** Trigins qui ne peuvent jamais autoriser une production. */
const AUTOMATIC_TRIGGERS = ['schedule', 'push', 'pull_request', 'pull_request_target', 'workflow_run']

const MANUAL_TRIGGERS = ['workflow_dispatch', 'repository_dispatch']

/**
 * Scanner structurel minimal (REPLI sans dependance) : decoupe un workflow en
 * blocs `job` puis `step`. Suffisant pour la gouvernance interne quand js-yaml
 * n'est pas installe, mais il ignore les subtilites YAML (blocs multi-lignes,
 * flows, commentarites) — d'ou le vrai parseur en primaute.
 */
function parseWorkflowLines(raw) {
  const lines = raw.split(/\r?\n/)
  const triggers = []
  let inOn = false
  for (const line of lines) {
    if (/^on:\s*$/.test(line) || /^["']?on["']?:\s*$/.test(line)) { inOn = true; continue }
    if (inOn) {
      if (/^\S/.test(line)) { inOn = false; continue }
      const t = line.trim().replace(/:\s*$/, '')
      if (t && !t.startsWith('-')) triggers.push(t)
      else if (t.startsWith('-')) triggers.push(t.replace(/^-\s*/, ''))
    }
  }

  const jobs = []
  let curJob = null
  let curStep = null
  let stepIndent = null
  // Hors du bloc `jobs:`, AUCUNE cle a 2 espaces ne demarre un job : a 2 espaces
  // on trouve les enfants de `on:` (`schedule:`, `workflow_dispatch:`), de
  // `permissions:` ou d'un autre bloc racine. Sans cette garde, le repli sans
  // dependance INVENTAIT des jobs la ou il n'y en a pas — l'inverse de la verite
  // terrain js-yaml (les deux parseurs donnaient un nombre de jobs different).
  let inJobs = false
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; curJob = null; curStep = null; stepIndent = null; continue }
    // Toute nouvelle cle racine (colonne 0) ferme le bloc jobs.
    if (/^\S/.test(line)) { inJobs = false; curJob = null; curStep = null; stepIndent = null; continue }
    if (!inJobs) continue
    // Debut de job : 2 espaces + identifiant + ':'
    let m = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)
    if (m) {
      curJob = { id: m[1], if: '', env: {}, steps: [] }
      jobs.push(curJob)
      curStep = null
      stepIndent = null
      continue
    }
    // `if:` de JOB (garde couvrant toutes les etapes du job).
    if (curJob && !curStep) {
      const jif = line.match(/^ {4}if:\s*(.*)$/)
      if (jif) { curJob.if = jif[1].trim(); continue }
    }
    if (!curJob) continue
    // Debut de liste de steps
    if (/^ {4}steps:\s*$/.test(line)) { stepIndent = 6; continue }
    if (stepIndent !== null) {
      m = line.match(new RegExp('^ {' + stepIndent + '}- '))
      if (m) {
        curStep = { name: '', if: '', env: {}, run: [] }
        curJob.steps.push(curStep)
        const rest = line.slice(stepIndent + 2).trim()
        if (rest.startsWith('name:')) curStep.name = rest.slice(5).trim().replace(/^["']|["']$/g, '')
        continue
      }
      if (curStep) {
        const sm = line.match(/^ {6,}(\w+):\s*(.*)$/)
        if (sm) {
          const key = sm[1]
          const val = sm[2].trim()
          if (key === 'run') {
            if (val === '|' || val === '>' || val === '') curStep.runBlock = true
            else curStep.run.push(val)
            continue
          }
        }
        // Ligne de contenu d'un bloc run
        if (curStep.runBlock) {
          if (/^ {6,}\S/.test(line) || /^\s*$/.test(line)) {
            const content = line.trim()
            if (content && !content.startsWith('#')) curStep.run.push(content)
            continue
          }
          if (/^\s{0,5}\S/.test(line)) curStep.runBlock = false
        }
        // env de step
        const em = line.match(/^ {8}([A-Za-z0-9_]+):\s*(.*)$/)
        if (em && curStep.inEnv) { curStep.env[em[1]] = em[2].trim().replace(/^["']|["']$/g, ''); continue }
        if (/^ {6}env:\s*$/.test(line) || /^ {6}env:\s*\{/.test(line)) { curStep.inEnv = true; continue }
        if (/^\s{0,5}\S/.test(line) && curStep) curStep.inEnv = false
        const nm = line.match(/^ {6}name:\s*(.*)$/)
        if (nm && !curStep.name) curStep.name = nm[1].trim().replace(/^["']|["']$/g, '')
        const im = line.match(/^ {6}if:\s*(.*)$/)
        if (im) curStep.if = im[1].trim()
      }
      continue
    }
    // env de job
    if (/^ {4}env:\s*$/.test(line)) { curJob.inEnv = true; continue }
    if (curJob.inEnv) {
      const jm = line.match(/^ {6}([A-Za-z0-9_]+):\s*(.*)$/)
      if (jm) { curJob.env[jm[1]] = jm[2].trim().replace(/^["']|["']$/g, ''); continue }
      if (/^\s{0,3}\S/.test(line)) curJob.inEnv = false
    }
  }
  return { triggers, jobs }
}

/** Normalise les triggers `on:` (scalaire, liste flow, ou mapping) en tableau. */
function normalizeTriggers(on) {
  if (on === undefined || on === null || on === true) return []
  if (typeof on === 'string') return [on.trim()].filter(Boolean)
  if (Array.isArray(on)) {
    return on.map((t) => (typeof t === 'string' ? t.trim() : String(t))).filter(Boolean)
  }
  if (typeof on === 'object') return Object.keys(on).map((k) => k.trim()).filter(Boolean)
  return []
}

/**
 * VRAI parseur YAML (js-yaml). Produit exactement la meme forme que
 * `parseWorkflow` (triggers + jobs > steps) pour que le moteur de regles soit
 * identique quel que soit le parseur : `run` est decoupe en lignes, `if`/`env`
 * sont normalises.
 */
function parseWorkflowYaml(raw) {
  const doc = YAML.load(raw)
  // Certains outils ecrivent `on:` en mapping, d'autres en liste : on couvre tout.
  const on = doc && (doc.on !== undefined ? doc.on : doc[true])
  const triggers = normalizeTriggers(on)
  const jobs = []
  const jd = doc && doc.jobs && typeof doc.jobs === 'object' ? doc.jobs : {}
  for (const jobId of Object.keys(jd)) {
    const j = jd[jobId] || {}
    const steps = Array.isArray(j.steps) ? j.steps : []
    const job = {
      id: jobId,
      // Le `if` de JOB est une garde reelle (ex. `if: failure()` sur un job
      // notify-failure) : il doit couvrir les etapes, comme GitHub le fait.
      if: j.if === undefined || j.if === null ? '' : String(j.if),
      env: j.env && typeof j.env === 'object' && !Array.isArray(j.env) ? j.env : {},
      steps: [],
    }
    for (const s of steps) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) continue
      job.steps.push({
        name: typeof s.name === 'string' ? s.name : '',
        if: s.if === undefined || s.if === null ? '' : String(s.if),
        env: s.env && typeof s.env === 'object' && !Array.isArray(s.env) ? s.env : {},
        // Le moteur de regles join avec '\n' : on lui donne deja des lignes.
        run: s.run === undefined || s.run === null ? [] : String(s.run).split('\n'),
      })
    }
    jobs.push(job)
  }
  return { triggers, jobs }
}

/**
 * Dispatcher de parsing. Ordre : vrai parseur YAML si disponible, sinon scan
 * ligne-a-ligne. Une erreur du vrai parseur est REMONTEE (parserError) : un
 * workflow illisible est un defaut de gouvernance, pas un motif de repli
 * silencieux sur le scan approximatif.
 */
function parseWorkflow(raw) {
  if (YAML) {
    try {
      const parsed = parseWorkflowYaml(raw)
      return Object.assign({}, parsed, { parserUsed: 'js-yaml', parseError: null })
    } catch (err) {
      return {
        triggers: [], jobs: [], parserUsed: 'js-yaml',
        parseError: (err && err.message ? err.message : String(err)).slice(0, 300),
      }
    }
  }
  return Object.assign({}, parseWorkflowLines(raw), { parserUsed: 'line-scan', parseError: null })
}

/** Toutes les chaines `${{ ... }}` + `$VAR` d'une etape, secrets compris. */
function extractRefs(step) {
  const refs = new Set()
  const text = step.run.join('\n')
  for (const m of text.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)) refs.add(m[1].trim())
  for (const m of text.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) refs.add('$' + m[1])
  for (const k of Object.keys(step.env)) refs.add('env.' + k)
  return refs
}

function scanFile(file) {
  const raw = fs.readFileSync(file, 'utf8')
  const parsed = parseWorkflow(raw)
  const triggers = parsed.triggers
  const jobs = parsed.jobs
  const isAutomatic = triggers.some((t) => AUTOMATIC_TRIGGERS.includes(t))
  const isManualOnly = triggers.length > 0 && triggers.every((t) => MANUAL_TRIGGERS.includes(t))
  const workflowFindings = []
  if (parsed.parseError) {
    workflowFindings.push({
      severity: 'HIGH',
      code: 'INVALID_WORKFLOW_YAML',
      detail: `illisible par le vrai parseur YAML : ${parsed.parseError}`,
    })
  }
  if (!jobs.length && !parsed.parseError) {
    workflowFindings.push({
      severity: 'MEDIUM',
      code: 'NO_JOBS_PARSED',
      detail: 'aucun job/step extrait : verifier la structure du workflow',
    })
  }

  // R6 (niveau WORKFLOW) — une exception inline documentee n'a de valeur qu'en
  // declenchement MANUEL. Si le workflow concerne gagne un trigger automatique,
  // l'exception est perimee IMMEDIATEMENT, sans attendre qu'une etape soit
  // reconnue comme sensible : un bloc shell peut devenir mutant sans changer de
  // forme, et l'etape concernee ne portait parfois aucun secret sensible
  // (`setup-mail-forwarders.yml` ne référence que FORWARD_TO). La promesse
  // documentee « schedule/push => HIGH » est donc tenue au niveau workflow.
  const inlineExceptionForFile = INLINE_RUN_EXCEPTIONS.find((e) => e.file === path.basename(file)) || null
  if (inlineExceptionForFile && isAutomatic) {
    workflowFindings.push({
      severity: 'HIGH',
      code: 'INLINE_EXCEPTION_ESCALATED',
      detail: `${inlineExceptionForFile.file} est une exception inline documentee MANUELLE, mais ses triggers sont (${triggers.join(', ')}) : l'exemption est perimee, le bloc shell redevient non gouverne`,
    })
  }

  const stepRecords = []
  for (const job of jobs) {
    for (const step of job.steps) {
      // Garde effective = condition du step, a defaut condition du job.
      const guard = (step.if || job.if || '').trim()
      const runText = step.run.join('\n')
      const envMerged = Object.assign({}, job.env, step.env)
      const refs = extractRefs(step)
      const sensitiveRegions = [...new Set([
        ...SENSITIVE_SECRETS.filter((s) => refs.has('secrets.' + s)),
        ...SENSITIVE_SECRETS.filter((s) => envMerged[s] && /secrets\./.test(String(envMerged[s]))),
      ])]
      const plainSensitiveRegions = SENSITIVE_SECRETS.filter((s) => envMerged[s] && !/secrets\./.test(String(envMerged[s])))
      const outboundScripts = OUTBOUND_SCRIPTS.filter((s) => runText.includes(s))
      const dangerousFlags = DANGEROUS_FLAGS.filter((f) => runText.includes(f))
      const curlAppsScript = /curl[^\n]*(script\.google\.com|APPS_SCRIPT_URL)/i.test(runText)
      const curlCleanBounces = /clean_bounces/i.test(runText)
      // Actions Apps Script mutantes (le reste : stats/emails/funnel/... = lecture).
      const curlAction = (runText.match(/action=([a-z_]+)/) || [])[1] || ''
      const curlReadOnly = curlAppsScript && curlAction !== '' && curlAction !== 'clean_bounces'
      const envApproval = Object.keys(envMerged).filter((k) => k === 'OUTBOUND_APPROVAL_TOKEN' || k === 'OUTBOUND_APPROVAL_ENVIRONMENT')

      // R6 — bloc shell INLINE : aucun script Node gate, mais un appel reseau
      // (curl / imaps / smtps) et un secret d'envoi. Invisible pour R1-R4.
      //
      // Le secret doit etre employe PAR CETTE ETAPE : reference directe dans le
      // `run:` (`secrets.X` / `$X`) ou `env:` du step. Un secret pose au niveau
      // du JOB pour une AUTRE etape (ex. MOLLIE_API_KEY injecte au Worker par
      // `wrangler secret put`) ne rend pas un `curl GET` de smoke capable
      // d'ecrire — le compter aurait transforme 3 verifications de deploiement
      // en faux positifs HIGH.
      //
      // Les curls vers Apps Script sont exclus : R2 les classe deja (action
      // mutante = HIGH, action de lecture = INFO). Les compter ici en plus
      // reinjecterait un HIGH sur des lectures actees.
      const callsNodeScript = /node\s+scripts\//.test(runText)
      const inlineNetworkCall = /\bcurl\b|imaps?:\/\/|smtps?:\/\//i.test(runText)
      const stepSensitiveSecrets = [...new Set([
        ...SENSITIVE_SECRETS.filter((s) => refs.has('secrets.' + s)),
        ...SENSITIVE_SECRETS.filter((s) => refs.has('$' + s)),
        ...SENSITIVE_SECRETS.filter((s) => step.env[s] !== undefined),
      ])]
      const inlineException = INLINE_RUN_EXCEPTIONS.find((e) => e.file === path.basename(file)) || null
      const inlineOutbound = inlineNetworkCall && !callsNodeScript && !curlAppsScript
        && outboundScripts.length === 0 && stepSensitiveSecrets.length > 0


      // Exemptions R1 : resolus PAR ETAPE, et VERIFIEES sur la source du script.
      // Une exemption n'est accordee que si (a) elle est declaree pour ce script+flag,
      // (b) la source du script ne contient AUCUN site d'ecriture externe.
      const exemptionByFlag = new Map()
      for (const ex of READ_ONLY_FLAG_EXEMPTIONS) {
        if (!runText.includes(ex.script)) continue
        const check = verifyReadOnlyScript(ex.script)
        for (const f of ex.flags) {
          if (dangerousFlags.includes(f)) {
            exemptionByFlag.set(f, Object.assign({}, ex, { verified: check.clean, sites: check.sites }))
          }
        }
      }
      const exemptedFlags = [...exemptionByFlag.keys()]
      // Flag exempté dont la source a PERDU sa propriété lecture-seule -> repli HIGH.
      const brokenExemptions = exemptedFlags.filter((f) => exemptionByFlag.get(f).verified === false)
      const activeDangerousFlags = dangerousFlags.filter((f) => !exemptionByFlag.has(f) || brokenExemptions.includes(f))

      const rec = {
        file: path.basename(file),
        jobId: job.id,
        stepName: step.name || '(unnamed)',
        triggers,
        isAutomatic,
        isManualOnly,
        if: guard,
        jobIf: job.if || '',
        run: runText,
        envKeys: Object.keys(envMerged),
        outboundScripts,
        dangerousFlags,
        exemptedFlags,
        brokenExemptions,
        curlAppsScript,
        curlAction,
        curlReadOnly,
        curlCleanBounces,
        sensitiveSecrets: [...sensitiveRegions, ...plainSensitiveRegions],
        envApproval,
        inlineOutbound,
        inlineException,
        stepSensitiveSecrets,
        findings: [],
      }

      if (inlineOutbound) {
        if (inlineException) {
          if (!isManualOnly) {
            rec.findings.push({
              severity: 'HIGH',
              code: 'INLINE_EXCEPTION_ESCALATED',
              detail: `${inlineException.file} est une exception inline documentee MANUELLE, mais ses triggers sont (${triggers.join(', ')}) : l'exemption est perimee, le bloc shell redevient non gouverne`,
            })
          } else {
            rec.findings.push({
              severity: 'INFO',
              code: 'DOCUMENTED_INLINE_EXCEPTION',
              detail: `bloc shell inline manuel et documente : ${inlineException.reason}`,
            })
          }
        } else {
          rec.findings.push({
            severity: 'HIGH',
            code: 'INLINE_OUTBOUND_NOT_GATED',
            detail: 'etape shell inline (aucun script Node) portant un secret d envoi et un appel reseau : hors de portee du contrat central — a deplacer dans scripts/ ou a declarer dans INLINE_RUN_EXCEPTIONS',
          })
        }
      }

      if (activeDangerousFlags.length && isAutomatic) {
        rec.findings.push({
          severity: 'HIGH',
          code: 'DANGEROUS_FLAG_ON_AUTOMATIC_TRIGGER',
          detail: `flag(s) ${activeDangerousFlags.join(' ')} presents sur un declencheur automatique (${triggers.join(', ')})`,
        })
      }
      if (brokenExemptions.length) {
        const b = brokenExemptions.map((f) => exemptionByFlag.get(f))
        rec.findings.push({
          severity: 'HIGH',
          code: 'BROKEN_READ_ONLY_EXEMPTION',
          detail: `exemption R1 invalidee : ${b.map((x) => x.script).join(', ')} contient un site d'ecriture externe (${b.map((x) => x.sites.join('/')).join(', ')}) — l'exemption est refusee`,
        })
      }
      if (exemptedFlags.length && !brokenExemptions.length) {
        const reasons = [...new Set(exemptedFlags.map((f) => exemptionByFlag.get(f).reason))]
        rec.findings.push({
          severity: 'INFO',
          code: 'DOCUMENTED_READ_ONLY_EXEMPTION',
          detail: `flag(s) ${exemptedFlags.join(' ')} exempte(s) et VERIFIE(S) lecture seule sur la source du script : ${reasons.join(' | ')}`,
        })
      }
      if (curlAppsScript && !curlReadOnly) {
        rec.findings.push({
          severity: 'HIGH',
          code: 'DIRECT_APPS_SCRIPT_HTTP_WRITE',
          detail: curlCleanBounces
            ? 'appel Apps Script action=mutation (clean_bounces) hors contrat Node'
            : 'appel HTTP direct vers Apps Script hors contrat Node',
        })
      }
      if (curlReadOnly) {
        rec.findings.push({
          severity: 'INFO',
          code: 'APPS_SCRIPT_READ_ONLY_CURL',
          detail: `appel Apps Script action=${curlAction} (lecture seule, hors contrat Node mais non destructif)`,
        })
      }
      if (rec.sensitiveSecrets.length && isAutomatic && !guard && !envApproval.length) {
        rec.findings.push({
          severity: 'MEDIUM',
          code: 'SENSITIVE_SECRET_ON_SCHEDULED_JOB',
          detail: `${rec.sensitiveSecrets.join(', ')} injecte(s) sur une etape planifiee sans condition`,
        })
      }
      if (outboundScripts.length && !dangerousFlags.length && !curlAppsScript) {
        rec.findings.push({
          severity: 'INFO',
          code: 'OUTBOUND_SCRIPT_NO_FLAG',
          detail: `${outboundScripts.join(', ')} appele sans flag : defaut simulation du contrat central`,
        })
      }
      stepRecords.push(rec)
    }
  }
  return {
    file: path.basename(file),
    triggers,
    isAutomatic,
    isManualOnly,
    parserUsed: parsed.parserUsed,
    parseError: parsed.parseError,
    workflowFindings,
    jobs: stepRecords,
  }
}

function main() {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const strict = argv.includes('--strict')
  const files = fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort()
  const results = files.map((f) => scanFile(path.join(WF_DIR, f)))

  // Une exception inline dont le workflow a DISPARU est perimee : elle ne couvre
  // plus rien, et son maintien masquerait un futur bloc shell non gouverne.
  // Fail-closed : finding HIGH (le test de gouvernance le verrouille).
  const staleInline = INLINE_RUN_EXCEPTIONS.filter((e) => !files.includes(e.file))
  for (const e of staleInline) {
    results.push({
      file: e.file,
      jobs: [],
      parseError: null,
      workflowFindings: [{
        severity: 'HIGH',
        code: 'STALE_INLINE_EXCEPTION',
        detail: `exception inline documentee pour un workflow inexistant : ${e.reason} — l'entree est perimee et doit etre retiree de INLINE_RUN_EXCEPTIONS`,
      }],
    })
  }

  const all = []
  for (const r of results) {
    for (const f of r.workflowFindings) {
      all.push({ file: r.file, jobId: '(workflow)', stepName: '(parse)', ...f })
    }
    for (const job of r.jobs) {
      for (const f of job.findings) {
        all.push({ file: r.file, jobId: job.jobId, stepName: job.stepName, ...f })
      }
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ workflows: results.length, parser: YAML ? 'js-yaml' : 'line-scan', findings: all }, null, 2))
  } else {
    console.log(`Workflows analyses : ${results.length}`)
    console.log(`Parseur utilise     : ${YAML ? 'js-yaml (vrai parseur YAML)' : 'scan ligne-a-ligne (repli sans dependance)'}`)
    for (const r of results) {
      if (r.parseError) console.log(`\n${r.file}  !! YAML INVALIDE : ${r.parseError}`)
      const interesting = r.jobs.filter((j) => j.outboundScripts.length || j.curlAppsScript || j.sensitiveSecrets.length || j.exemptedFlags.length || j.brokenExemptions.length)
      if (!interesting.length) continue
      console.log(`\n${r.file}  triggers=[${r.triggers.join(', ')}]${r.isAutomatic ? '  [AUTOMATIQUE]' : '  [MANUEL]'}`)
      for (const s of interesting) {
        console.log(`  - ${s.jobId}/${s.stepName}${s.if ? '  if=' + s.if : ''}`)
        if (s.outboundScripts.length) console.log(`      scripts: ${s.outboundScripts.join(', ')}`)
        if (s.dangerousFlags.length) console.log(`      flags  : ${s.dangerousFlags.join(' ')}`)
        if (s.exemptedFlags.length) console.log(`      exempte: ${s.exemptedFlags.join(' ')} (verifie lecture seule)`)
        if (s.sensitiveSecrets.length) console.log(`      secrets: ${s.sensitiveSecrets.join(', ')}`)
        if (s.curlAppsScript) console.log(`      curl Apps Script: action=${s.curlAction || '?'}${s.curlReadOnly ? ' (lecture seule)' : ' (MUTATION)'}`)
        for (const f of s.findings) console.log(`      !! ${f.severity} ${f.code}: ${f.detail}`)
      }
    }
    const counts = {}
    for (const f of all) counts[f.severity] = (counts[f.severity] || 0) + 1
    console.log(`\nTotal findings: ${all.length}` + (Object.keys(counts).length ? '  ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ') : ''))
  }

  const highs = all.filter((f) => f.severity === 'HIGH').length
  if (strict && highs > 0) {
    console.error(`\nSTRICT: ${highs} finding(s) HIGH -> exit 1`)
    process.exit(1)
  }
}

if (require.main === module) main()

module.exports = {
  scanFile,
  parseWorkflow,
  parseWorkflowYaml,
  parseWorkflowLines,
  normalizeTriggers,
  verifyReadOnlyScript,
  OUTBOUND_SCRIPTS,
  SENSITIVE_SECRETS,
  DANGEROUS_FLAGS,
  AUTOMATIC_TRIGGERS,
  READ_ONLY_FLAG_EXEMPTIONS,
  INLINE_RUN_EXCEPTIONS,
}
