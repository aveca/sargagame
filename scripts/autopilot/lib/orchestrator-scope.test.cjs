#!/usr/bin/env node
/**
 * orchestrator-scope.test.cjs — garde-fou STATIQUE contre les fuites de portée.
 *
 * Contexte (défauts réels observés le 2026-11-09, deux fois) :
 *
 *   12:59:19  ReferenceError: diff is not defined
 *             (le diff était recalculé puis supprimé entre la boucle et le commit)
 *   14:00:15  ReferenceError: allowedScope is not defined
 *             (`allowedScope` déclaré DANS la boucle, consommé APRÈS)
 *
 * Dans les deux cas : l'agent avait RÉELLEMENT travaillé, le gate de ship
 * était VERT, et la mission a été perdue au moment du commit. Aucun test
 * unitaire ne l'avait vu : le défaut est une question de PORTÉE, pas de
 * comportement.
 *
 * Ce test vérifie donc, par analyse statique du source :
 *   1. la phase de commit est une FONCTION distincte (plus de bloc de code
 *      après la boucle dans `phaseImplementLocal`) ;
 *   2. elle reçoit ses entrées par PARAMÈTRES EXPLICITES ;
 *   3. AUCUNE variable déclarée dans la boucle n'est consommée après la
 *      boucle (détection générique de la famille de bugs) ;
 *   4. `allowedScope` est déclaré AVANT la boucle.
 *
 * Hors-ligne, sans git, sans réseau.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  ok   ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + ' ' + detail);
  }
}

const SRC = path.join(__dirname, '..', 'orchestrator.cjs');
const src = fs.readFileSync(SRC, 'utf8');

/** Extrait le corps d'une fonction de premier niveau par son nom. */
function functionBody(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * Retire les commentaires (ligne `//` et bloc `/* *\/`) : sans cela, un
 * simple mot dans un commentaire (« `diff is not defined` ») ferait croire
 * à une fuite de portée. Un garde-fou bruité est un garde-fou ignoré.
 */
function stripComments(source) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const impl = functionBody(src, 'phaseImplementLocal');
const commit = functionBody(src, 'phaseCommitAndPublish');

// ── 1. Structure : la phase de commit est isolée ─────────────────────────────

console.log('=== 1. phase de commit isolée ===');
check('phaseImplementLocal est présente', !!impl);
check('phaseCommitAndPublish est présente', !!commit);
if (impl && commit) {
  check('la phase de commit est une fonction distincte', /return phaseCommitAndPublish\(/.test(impl));
  check(
    'la phase de commit reçoit des paramètres explicites',
    /async function phaseCommitAndPublish\(\{[^}]*allowedScope[^}]*gateFiles[^}]*gate[^}]*\}\)/.test(src),
    'signature inattendue'
  );
  check(
    'la phase de commit ne lit plus de variable implicite de la boucle',
    !/\bconst diff\b/.test(commit) && !/\bconst allowedScope\b/.test(commit),
    'la phase de commit redéclare une entrée'
  );
}

// ── 2. Détection générique des fuites de portée ─────────────────────────────
//
// Principe : toute variable déclarée par `const/let/var` DANS le corps de la
// boucle `while (attempt <= …)` et utilisée APRÈS la boucle est une fuite de
// portée → ReferenceError garanti au runtime.

console.log('=== 2. détection des fuites de portée ===');

if (impl) {
  const lines = stripComments(impl).split(/\r?\n/);
  const whileIdx = lines.findIndex(l => /while\s*\(attempt\s*<=/.test(l));
  check('la boucle de tentative est localisée', whileIdx >= 0);

  if (whileIdx >= 0) {
    // Fin de la boucle = première ligne `  }` (indent de 2) après la boucle.
    let endIdx = -1;
    for (let i = whileIdx; i < lines.length; i++) {
      if (lines[i] === '  }') { endIdx = i; break; }
    }
    check('la fin de la boucle est localisée', endIdx > whileIdx);

    if (endIdx > whileIdx) {
      const inside = lines.slice(whileIdx, endIdx).join('\n');
      const after = lines.slice(endIdx + 1).join('\n');

      const declared = new Set();
      const declRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
      let m;
      while ((m = declRe.exec(inside))) declared.add(m[1]);

      const usedAfter = new Set();
      const useRe = /([A-Za-z_$][\w$]*)/g;
      while ((m = useRe.exec(after))) usedAfter.add(m[1]);

      // Mots-clés et symboles globaux : pas des variables de portée.
      const NOT_VARS = new Set([
        'const', 'let', 'var', 'if', 'else', 'return', 'await', 'async', 'function',
        'of', 'in', 'new', 'true', 'false', 'null', 'undefined', 'this', 'try',
        'catch', 'finally', 'for', 'while', 'break', 'continue', 'typeof',
        'instanceof', 'delete', 'void', 'do', 'switch', 'case', 'default',
        'throw', 'class', 'extends', 'super', 'yield', 'import', 'export', 'from',
        'as', 'Object', 'Array', 'String', 'Number', 'Boolean', 'JSON', 'Math',
        'Date', 'Promise', 'Error', 'Set', 'Map', 'RegExp', 'parseInt',
        'parseFloat', 'isNaN', 'console', 'process', 'require', 'module',
        'exports', 'Buffer', 'phaseCommitAndPublish',
      ]);

      const leaks = [...declared].filter(v => usedAfter.has(v) && !NOT_VARS.has(v));
      check(
        'aucune variable déclarée dans la boucle n’est consommée après',
        leaks.length === 0,
        leaks.length ? 'fuites : ' + leaks.join(', ') : ''
      );

      // Contrôle ciblé sur la variable qui a cassé en production.
      check(
        'allowedScope est déclaré AVANT la boucle',
        /const\s+allowedScope\s*=/.test(lines.slice(0, whileIdx).join('\n')),
        'déclaration introuvable avant la boucle'
      );
      check(
        'allowedScope n’est PAS redéclaré dans la boucle',
        !/const\s+allowedScope\s*=/.test(inside),
        'déclaration dupliquée dans la boucle'
      );
      check(
        'gateFiles est déclaré hors de la boucle',
        /let\s+gateFiles\s*=/.test(lines.slice(0, whileIdx).join('\n')),
        'déclaration introuvable avant la boucle'
      );
    }
  }
}

// ── 3. Le pont ne crashe plus sur une exception interne ──────────────────────

console.log('=== 3. reprise bornée au lieu du crash ===');
{
  const dispatch = functionBody(src, 'dispatchOpportunity');
  check('dispatchOpportunity est présente', !!dispatch);
  if (dispatch) {
    check('la reprise est bornée', /MAX_BRIDGE_ERROR_RETRIES/.test(dispatch));
    check("l'échec est publié sur l'issue", /publishMissionStatus\(opp\.id, 'failed'/.test(dispatch));
    check('la reprise est annoncée', /publishMissionStatus\(opp\.id, 'retrying'/.test(dispatch));
    check('la mission finit par être parquée', /publishMissionStatus\(opp\.id, 'blocked'/.test(dispatch));
    check("l'orchestrateur ne relance pas l'exception", !/\bthrow e;/.test(dispatch.replace(/if \(!opp \|\| !opp\.id\) throw e;/, '')));
  }
}

console.log(failures === 0
  ? 'ORCHESTRATOR-SCOPE TESTS : OK (0 échec)'
  : `ORCHESTRATOR-SCOPE TESTS : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
