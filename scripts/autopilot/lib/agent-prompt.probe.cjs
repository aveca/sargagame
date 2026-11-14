#!/usr/bin/env node
/**
 * agent-prompt.probe.cjs — SONDE RÉELLE du prompt (hors ligne du runner).
 *
 * Pourquoi une sonde et pas un test unitaire :
 *   le défaut que nous corrigeons (le modèle narrait son intention au lieu
 *   d'appeler l'outil) n'est visible QUE face au vrai moteur. Un test
 *   unitaire qui vérifie « le prompt contient la phrase X » ne prouve rien
 *   sur le comportement réel de l'agent.
 *
 *   Cette sonde appelle EXACTEMENT le constructeur utilisé par le runner
 *   (`lib/agent-prompt.cjs`) et EXACTEMENT le même adaptateur
 *   (`.ai/ux-agent/opencode-auto.cjs`), dans un répertoire jetable, avec le
 *   MÊME texte de mission que la production. Si le fichier n'est pas
 *   modifié, le prompt est judged insuffisant — avant de brûler un cycle
 *   live de 5 minutes.
 *
 * Prérequis : Ollama local + modèle `qwen3.5:9b` (ou SARGA_OLLAMA_MODEL).
 *
 * Usage :
 *   node scripts/autopilot/lib/agent-prompt.probe.cjs [répertoire_jetable]
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildAgentPrompt } = require('./agent-prompt.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ADAPTER = process.env.SARGA_OPENCODE_ADAPTER
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'sargagame-runner', '.ai', 'ux-agent', 'opencode-auto.cjs');
const MODEL = process.env.SARGA_OLLAMA_MODEL || 'qwen3.5:9b';

const TARGET_REL = '.ai/autopilot/README.md';
const SECTION_TITLE = '## Statut des missions GitHub';
const COMMAND_LINE = 'node scripts/autopilot/status.cjs';
const OUTPUT_LINE = 'missions    : <N> active(s) / <M> suivie(s)';

// Mission réelle (texte long) : on mesure la robustesse du prompt dans les
// MÊMES conditions que la production (prompt ≈ 19 000 caractères).
const MISSION_TEXT = fs.existsSync(path.join(ROOT, 'tmp-e2e-issue-body-r4.md'))
  ? fs.readFileSync(path.join(ROOT, 'tmp-e2e-issue-body-r4.md'), 'utf8')
  : [
    'Mission E2E : documenter la commande de statut des missions GitHub.',
    '',
    '## Contexte',
    '',
    'Tentatives précédentes sur cette mission : #1372 parquée, #1373 parquée,',
    '#1375 parquée après 4 tentatives (Could not find oldString sur fichier CRLF),',
    '#1376 agent OK + gate vert mais crash du pont au commit (allowedScope is not defined).',
    '',
    '## Demande (non destructive, documentation uniquement)',
    '',
    'Dans `.ai/autopilot/README.md`, ajouter en fin de fichier une section intitulée :',
    '',
    '```',
    SECTION_TITLE,
    '```',
    '',
    '## Critères d\'acceptation',
    '',
    '1. Le fichier contient un titre de section exactement égal à `' + SECTION_TITLE + '`.',
    '2. Le fichier contient la chaîne exacte `' + COMMAND_LINE + '`.',
    '3. Le fichier contient la chaîne exacte `' + OUTPUT_LINE + '`.',
    '4. Aucun autre fichier n\'est modifié.',
    '5. Aucune dépendance ajoutée, aucun secret, aucun workflow.',
    '',
  ].join('\n');

const BASE_README = [
  '# Autopilot — Usine Factory V3',
  '',
  'Ce dépôt hosts the autonomous factory: the runner, the orchestrator, the',
  'GitHub bridge and the status command.',
  '',
  '## Démarrage',
  '',
  '```bash',
  'npm run autopilot:observe',
  'npm run autopilot:status',
  '```',
  '',
  'Pour une exécution continue, utiliser le runner 24/7 documenté dans',
  '`scripts/autopilot/runner.cjs`.',
  '',
].join('\r\n');

function buildOpp() {
  return {
    id: 'AUTOPILOT-PROBE-AGENT-PROMPT',
    title: 'Documenter la commande de statut des missions GitHub dans .ai/autopilot/README.md',
    repository_full_name: 'aveca/sargagame',
    issue_number: 9999,
    evidence: "Sonde locale du constructeur de prompt : vérifie que l'agent appelle réellement son outil d'écriture.",
    expectedImpact: 'Le README documente la commande de statut des missions.',
    scope: { files: [TARGET_REL] },
    task: { filesToRead: [TARGET_REL], filesToModify: [TARGET_REL] },
  };
}

function buildMission() {
  return {
    text: MISSION_TEXT,
    instructions: "Utilise l'outil read puis l'outil write (contenu complet relu + la section ajoutée en fin de fichier).",
    acceptance: `Le fichier contient '${SECTION_TITLE}', '${COMMAND_LINE}' et '${OUTPUT_LINE}'.`,
    constraints: [
      'Modifier uniquement .ai/autopilot/README.md',
      'Documentation uniquement, aucun changement de code applicatif',
      'Aucune dépendance, aucun secret, aucun workflow',
    ],
    previousAttempts: [],
  };
}

const workdir = process.argv[2]
  || fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-prompt-probe-'));

fs.mkdirSync(path.join(workdir, '.ai', 'autopilot'), { recursive: true });
const target = path.join(workdir, TARGET_REL);
// CRLF : condition réelle du dépôt (cause racine du « Could not find oldString »).
fs.writeFileSync(target, BASE_README, 'utf8');

const before = fs.readFileSync(target, 'utf8');

const prompt = buildAgentPrompt({
  persona: fs.existsSync(path.join(ROOT, 'scripts', 'autopilot', 'personas', 'ui-ux.md'))
    ? fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'personas', 'ui-ux.md'), 'utf8')
    : '',
  scopeFiles: TARGET_REL,
  opp: buildOpp(),
  mission: buildMission(),
  wt: workdir,
  wtRel: path.relative(ROOT, workdir).replace(/\\/g, '/'),
  engine: 'opencode',
  routedModel: MODEL,
  routedProfile: 'DEBUG_COMPLEX',
  declaredAgent: null,
  failureContext: '',
});

console.log('=== sonde du prompt agent ===');
console.log('  adaptateur  :', ADAPTER);
console.log('  modèle      :', MODEL);
console.log('  prompt      :', prompt.length, 'caractères');
console.log('  cible       :', target);
console.log('  CRLF        :', (before.match(/\r\n/g) || []).length, 'fins de ligne CRLF');

if (!fs.existsSync(ADAPTER)) {
  console.log('  SKIP : adaptateur introuvable (' + ADAPTER + ')');
  process.exit(2);
}

const res = spawnSync(process.execPath, [ADAPTER, 'run', prompt], {
  cwd: workdir,
  encoding: 'utf8',
  timeout: 20 * 60 * 1000,
  env: {
    ...process.env,
    SARGA_LOCAL_ONLY: '1',
    SARGA_OLLAMA_MODEL: MODEL,
    OPENAI_API_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    GOOGLE_API_KEY: undefined,
    NVIDIA_API_KEY: undefined,
    COHERE_API_KEY: undefined,
    MISTRAL_API_KEY: undefined,
    OLLAMA_HOST: String(process.env.SARGA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  },
});

console.log('  exit code   :', res.status);
console.log('  stdout      :', String(res.stdout || '').trim().slice(-400).replace(/\n/g, ' | '));
console.log('  stderr      :', String(res.stderr || '').trim().slice(-600).replace(/\n/g, ' | '));

const after = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
const checks = [
  ['fichier modifié', after !== before],
  ['titre de section présent', after.includes(SECTION_TITLE)],
  ['commande présente', after.includes(COMMAND_LINE)],
  ['ligne de sortie présente', after.includes(OUTPUT_LINE)],
  ['contenu d\'origine conservé', after.includes('# Autopilot — Usine Factory V3')],
];
let failures = 0;
for (const [name, ok] of checks) {
  if (!ok) failures += 1;
  console.log((ok ? '  ok   ' : '  FAIL ') + name);
}

if (!process.argv[2]) {
  try { fs.rmSync(workdir, { recursive: true, force: true }); } catch (_) {}
}

console.log(failures === 0
  ? 'PROBE AGENT-PROMPT : OK (l\'agent écrit réellement le fichier)'
  : `PROBE AGENT-PROMPT : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
