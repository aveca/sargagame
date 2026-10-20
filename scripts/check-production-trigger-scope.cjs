#!/usr/bin/env node
/**
 * CHECK_production_trigger_scope.cjs — garde-fou de non-régression du
 * déclencheur du parcours de production Cloudflare.
 *
 * CONTEXTE (cause racine des 10 échecs de certification, run 39383768675,
 * SHA 4eea0367, branche `agent/coding/TASK-P1-002`) :
 *   le workflow `Cloudflare Production` se déclenchait en `push` sur une
 *   branche de développement. Or la porte de certification exige les checks CI
 *   `test-frontend` et `perf` SUR LE SHA EXACT, et ces checks ne sont produits
 *   que sur `main` (ou PR vers `main`). Sur une autre ref ils n'existent
 *   JAMAIS pour ce SHA : la porte, fail-closed par conception, refusait
 *   systématiquement — 10 exécutions rouges identiques, sans bug de code.
 *
 * CE QUE CE GARDE-FOU VÉRIFIE (échec => exit 1, PR bloquée) :
 *   1. `on.push.branches` du workflow de production ne contient QUE `main`.
 *      Toute autre branche (ou une liste vide / absente, qui vaudrait
 *      « toutes les branches ») est réintroduite => blocage.
 *   2. Un job `scope` existe et expose la sortie `production` : c'est lui qui
 *      distingue un run de PRODUCTION d'un run de VALIDATION.
 *   3. Le job `certification-gate` dépend de `scope` ET est conditionné par
 *      `needs.scope.outputs.production` : sans cela, la porte tournerait hors
 *      périmètre et reproduirait l'échec systématique.
 *
 * CE QUE CE GARDE-FOU NE FAIT PAS : il ne weakens pas la porte de
 * certification (ni la liste des checks requis, ni son caractère fail-closed,
 * ni la vérification de déploiement). Il vérifie seulement l'ARCHITECTURE du
 * déclenchement.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WF_REL = path.join('.github', 'workflows', 'cloudflare-production.yml');
const WF = path.join(ROOT, WF_REL);
const DEPLOYABLE_BRANCHES = ['main'];

const errors = [];
const notes = [];

function fail(msg) { errors.push(msg); }

/* ── Lecture + découpage en lignes significatives ─────────────────────────── */
let raw;
try {
  raw = fs.readFileSync(WF, 'utf8');
} catch (e) {
  console.error(`FICHILLER INTROUVABLE : ${WF_REL} (${e.message})`);
  process.exit(1);
}
const lines = raw.split(/\r?\n/);

/** Retire les commentaires de fin de ligne (hors chaînes) — usage prudent. */
function stripInlineComment(s) {
  let out = '';
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(s[i - 1]))) break;
    out += c;
  }
  return out;
}

const rows = lines.map((l) => {
  const noComment = stripInlineComment(l);
  const m = noComment.match(/^(\s*)(.*)$/);
  const indent = m ? m[1].length : 0;
  const text = (m ? m[2] : '').trim();
  return { raw: l, indent, text, blank: text === '' };
});

/**
 * Bloc de clés à partir d'une ligne d'en-tête (indent donné) : renvoie la
 * liste des lignes daughters (indent strictement supérieur) et le contenu
 * textuel utile.
 */
function blockAfter(index, parentIndent) {
  const out = [];
  for (let i = index + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.blank) { out.push(r); continue; }
    if (r.indent <= parentIndent) break;
    out.push(r);
  }
  return out;
}

/** Trouve la ligne d'en-tête `key:` à l'indent donné (le plus proche possible). */
function findKey(key, indent, from = 0, to = rows.length) {
  const re = new RegExp(`^${' '.repeat(indent)}${key}\\s*:`);
  for (let i = from; i < to; i++) {
    if (rows[i].indent === indent && re.test(rows[i].raw)) return i;
  }
  return -1;
}

/* ── 1. `on.push.branches` ⊆ { main } ─────────────────────────────────────── */
function checkPushTrigger() {
  // La clé peut s'écrire `on:` ou `"on":` (PyYAML/YAML 1.1 traite `on` comme
  // un booléen — d'où les deux formes possibles).
  let onIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].indent === 0 && /^(on|["']on["'])\s*:/.test(rows[i].text)) { onIdx = i; break; }
  }
  if (onIdx === -1) {
    fail(`${WF_REL} : bloc « on: » introuvable — le déclencheur ne peut pas être vérifié (refus).`);
    return;
  }
  const onBlock = blockAfter(onIdx, 0);
  const pushIdx = onBlock.findIndex((r) => r.indent === 2 && /^push\s*:/.test(r.text));
  if (pushIdx === -1) {
    fail(`${WF_REL} : aucun déclencheur « push » — un workflow de production sans « push » main n'est pas vérifiable (refus).`);
    return;
  }
  const pushBlock = blockAfter(onBlock[pushIdx].index ?? pushIdx, 2);

  // Recalcule les index réels (blockAfter travaille sur `rows`, pas `onBlock`).
  const pushAbsIdx = onIdx + 1 + pushIdx;
  const pushChildren = blockAfter(pushAbsIdx, 2);
  const brAbsIdx = pushChildren.findIndex((r) => r.indent === 4 && /^branches\s*:/.test(r.text));
  if (brAbsIdx === -1) {
    fail(`${WF_REL} : « on.push » sans « branches » — cela déclencherait la production sur TOUTES les branches (refus).`);
    return;
  }
  const brLine = pushChildren[brAbsIdx];
  const brAbs = pushAbsIdx + 1 + brAbsIdx;
  let branches = [];
  const flow = brLine.text.match(/^branches\s*:\s*\[(.*)\]\s*$/);
  if (flow) {
    branches = flow[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  } else {
    for (const r of blockAfter(brAbs, 4)) {
      const m = r.text.match(/^-\s*(.+)$/);
      if (r.indent === 6 && m) branches.push(m[1].replace(/^["']|["']$/g, '').trim());
      else if (!r.blank && r.indent <= 4) break;
    }
  }
  if (!branches.length) {
    fail(`${WF_REL} : « on.push.branches » vide — déclencheur indéfini (refus).`);
    return;
  }
  const forbidden = branches.filter((b) => !DEPLOYABLE_BRANCHES.includes(b));
  if (forbidden.length) {
    fail(
      `${WF_REL} : « on.push.branches » contient des branches non déployables ` +
      `[${forbidden.join(', ')}] — la porte de certification exige « test-frontend » ` +
      `et « perf » sur le SHA exact, or ces checks ne sont produits que sur ` +
      `[${DEPLOYABLE_BRANCHES.join(', ')}] : sur toute autre ref la porte refuse ` +
      `systématiquement (échec d'architecture, pas de bug de code).`
    );
    return;
  }
  notes.push(`on.push.branches = [${branches.join(', ')}] (conforme).`);
}

/* ── 2 & 3. job `scope` + `certification-gate` conditionné par `scope` ─────── */
function checkScopeGate() {
  const jobsIdx = findKey('jobs', 0);
  if (jobsIdx === -1) {
    fail(`${WF_REL} : bloc « jobs: » introuvable (refus).`);
    return;
  }
  const jobsBlock = blockAfter(jobsIdx, 0);

  // Index des jobs (indent 2) dans le bloc jobs.
  const jobStarts = [];
  for (let i = 0; i < jobsBlock.length; i++) {
    const r = jobsBlock[i];
    if (r.indent === 2 && /^[A-Za-z0-9_-]+\s*:/.test(r.text) && !r.text.startsWith('-')) {
      jobStarts.push({ name: r.text.replace(/\s*:.*$/, ''), start: i });
    }
  }
  if (!jobStarts.length) {
    fail(`${WF_REL} : aucun job détecté (refus).`);
    return;
  }
  const jobBody = (name) => {
    const j = jobStarts.find((x) => x.name === name);
    if (!j) return null;
    const end = jobStarts.find((x) => x.start > j.start) ? jobStarts.find((x) => x.start > j.start).start : jobsBlock.length;
    return jobsBlock.slice(j.start, end);
  };
  const jobNames = jobStarts.map((j) => j.name);

  // 2. job `scope` + sortie `production`
  const scope = jobBody('scope');
  if (!scope) {
    fail(
      `${WF_REL} : job « scope » absent — sans lui, un run hors « main » (dispatch manuel ` +
      `sur une branche de dev, workflow_run hors main) declenche le parcours de production ` +
      `et echoue systematiquement sur la porte de certification.`
    );
  } else {
    const hasProductionOutput = scope.some((r) => r.indent >= 4 && /^production\s*:/.test(r.text));
    if (!hasProductionOutput) {
      fail(`${WF_REL} : le job « scope » n'expose pas la sortie « production » (refus).`);
    } else {
      notes.push('job « scope » présent avec la sortie « production ».');
    }
  }

  // 3. certification-gate dépend de scope ET est conditionné par sa sortie
  const gate = jobBody('certification-gate');
  if (!gate) {
    fail(`${WF_REL} : job « certification-gate » introuvable (refus).`);
    return;
  }
  const needsLine = gate.find((r) => r.indent === 4 && /^needs\s*:/.test(r.text));
  const needsRaw = needsLine ? needsLine.text.replace(/^needs\s*:\s*/, '') : '';
  const needs = needsRaw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!needs.includes('scope')) {
    fail(`${WF_REL} : le job « certification-gate » ne depend pas de « scope » — la porte tournerait hors perimetre (refus).`);
  }
  const ifLine = gate.find((r) => r.indent === 4 && /^if\s*:/.test(r.text));
  const ifRaw = ifLine ? ifLine.text : '';
  if (!/needs\.scope\.outputs\.production\s*==\s*'true'/.test(ifRaw)) {
    fail(
      `${WF_REL} : le job « certification-gate » n'est pas conditionne par ` +
      `« needs.scope.outputs.production == 'true' » — il s'executerait sur des runs ` +
      `non deployables (refus).`
    );
  }
  notes.push(`jobs detectes : ${jobNames.join(', ')}.`);
}

/* ── Exécution ────────────────────────────────────────────────────────────── */
checkPushTrigger();
checkScopeGate();

if (errors.length) {
  console.error('GARDE-FOU DECLENCHEUR PRODUCTION : ECHEC');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('GARDE-FOU DECLENCHEUR PRODUCTION : OK');
for (const n of notes) console.log(`  - ${n}`);
