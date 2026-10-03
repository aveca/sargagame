#!/usr/bin/env node
/**
 * autopilot-live-single-runner.test.cjs — Audit production Autonomous Product Factory.
 *
 * Couvre SANS lancer de runner (aucun process parallele, aucun lock mute) :
 *  1. START COMMAND : run.cjs --live --continuous pose les deux env (via --check-flags).
 *  2. SINGLE-RUNNER : wrapper live refuse un 2e runner (preflight lock, exit 3) ;
 *     le lock est un FICHIER repo-local (survit a fermeture/reouverture de session).
 *  3. WATCHDOG : relance bornee sur crash uniquement, jamais sur 0/2/3/4.
 *  4. BOOT/RESTART : wrappers bases sur leur propre dossier (repo canonique),
 *     jamais sargagame-tmp (vieux clone sans scripts/autopilot/).
 *  5. PERSISTENCE : .gitignore couvre runner.log/lock/STOP ; scheduler.json tracke.
 *  6. HUMAN GATES : denyGlobs paiement/pricing/checkout/Supabase/secrets intacts.
 *
 * Lancement : node tests/unit/autopilot-live-single-runner.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const RUN = path.join(ROOT, 'scripts', 'autopilot', 'run.cjs');
const LIVE_CMD = path.join(ROOT, 'scripts', 'autopilot', 'autopilot-live.cmd');
const LIVE_SH = path.join(ROOT, 'scripts', 'autopilot', 'autopilot-live-wsl.sh');
const C = require(path.join(ROOT, 'scripts', 'autopilot', 'lib', 'common.cjs'));
const lock = require(path.join(ROOT, 'scripts', 'autopilot', 'lib', 'lock.cjs'));

let passed = 0;
function check(name, cond, details = '') {
  assert.ok(cond, name + (details ? ' — ' + details : ''));
  passed++;
  console.log('  ✓ ' + name);
}

console.log('AUTOPILOT LIVE SINGLE-RUNNER — audit production (aucun runner lance)');

// ── 1. START COMMAND ──
console.log('— start command');
{
  const r = spawnSync(process.execPath, [RUN, '--live', '--continuous', '--check-flags'], {
    cwd: ROOT, encoding: 'utf8', timeout: 15000, env: Object.assign({}, process.env),
  });
  check('run.cjs --live --continuous pose SARGA_AUTOPILOT_LIVE=1', r.status === 0 && r.stdout.includes('SARGA_AUTOPILOT_LIVE=1'), 'exit=' + r.status);
  check('run.cjs --live --continuous pose SARGA_AUTOPILOT_CONTINUOUS=1', r.status === 0 && r.stdout.includes('SARGA_AUTOPILOT_CONTINUOUS=1'));
  const src = fs.readFileSync(RUN, 'utf8');
  check('run.cjs delegue au runner (pas de logique metier inline)', /runner\.cjs/.test(src));
}

// ── 2/4. Wrappers robustes ──
console.log('— wrappers live');
check('autopilot-live.cmd existe', fs.existsSync(LIVE_CMD));
check('autopilot-live-wsl.sh existe', fs.existsSync(LIVE_SH));
{
  const cmd = fs.readFileSync(LIVE_CMD, 'utf8');
  check('cmd passe par run.cjs --live --continuous (jamais runner.cjs direct)', /run\.cjs --live --continuous/.test(cmd) && !/node scripts\\autopilot\\runner\.cjs/.test(cmd));
  check('cmd exporte SARGA_AUTOPILOT_LIVE/CONTINUOUS', /SARGA_AUTOPILOT_LIVE=1/.test(cmd) && /SARGA_AUTOPILOT_CONTINUOUS=1/.test(cmd));
  check('cmd preflight lock single-runner (exit 3)', /orchestrator\.lock|lib\/lock|status\(\)/.test(cmd) && /exit \/b 3/.test(cmd));
  check('cmd watchdog borne crash-only (MAX_RESTARTS, pas de relance 0/2/3/4)', /MAX_RESTARTS/.test(cmd) && /if %EXITCODE%==3 exit \/b 3/.test(cmd) && /if %EXITCODE%==4 exit \/b 4/.test(cmd));
  check('cmd respecte STOP file', /\.ai\\autopilot\\STOP|autopilot.STOP/.test(cmd));
  check('cmd base sur son propre dossier (%~dp0), aucun chemin repo en dur', /%~dp0/.test(cmd) && !/mnt\/c\//.test(cmd) && !/C:\\\\Users/.test(cmd));
}
{
  const sh = fs.readFileSync(LIVE_SH, 'utf8');
  check('sh passe par run.cjs --live --continuous (jamais runner.cjs direct)', /run\.cjs --live --continuous/.test(sh) && !/node scripts\/autopilot\/runner\.cjs/.test(sh));
  check('sh exporte SARGA_AUTOPILOT_LIVE/CONTINUOUS', /SARGA_AUTOPILOT_LIVE=1/.test(sh) && /SARGA_AUTOPILOT_CONTINUOUS=1/.test(sh));
  check('sh preflight lock single-runner (exit 3)', /status\(\)/.test(sh) && /exit 3/.test(sh));
  check('sh watchdog borne crash-only (MAX_RESTARTS, 0/2/3/4 sortants)', /MAX_RESTARTS/.test(sh) && /0\|2\|3\|4\)/.test(sh));
  check('sh refuse explicitement sargagame-tmp', /sargagame-tmp/.test(sh) && /exit 2/.test(sh));
  check('sh defaut = repo canonique Backup/sargagame', /Documents\/Backup\/sargagame/.test(sh));
  check('sh respecte STOP file', /\.ai\/autopilot\/STOP/.test(sh));
  check('sh loggue vers runs/runner.log', /runs\/runner\.log/.test(sh));
}

// ── 2b. Lock repo-local (survit aux sessions) ──
console.log('— single-runner lock');
check('lock file est repo-local sous .ai/autopilot', C.paths.lockFile === path.join(C.AP_DIR, 'orchestrator.lock'));
{
  const s = lock.status();
  check('lock.status() lisible sans muter', s && typeof s.locked === 'boolean');
  const cur = lock.readLock();
  if (cur && lock.holderAlive(cur).alive) {
    // Runner vivant : acquire() DOIT refuser sans ecrire (2e runner impossible).
    const acq = lock.acquire();
    check('2e acquire() refuse quand un runner vivant detient le lock', acq.ok === false && acq.code === 'LOCKED', acq.reason || '');
  } else {
    console.log('  ○ SKIP 2e acquire() refuse (aucun runner vivant — mutant saute, cf. autopilot-concurrency.test.cjs)');
  }
}

// ── 5. Persistance ──
console.log('— persistance .ai/autopilot');
{
  const gi = fs.readFileSync(path.join(C.AP_DIR, '.gitignore'), 'utf8');
  check('.gitignore couvre runs/runner.log', /runs\/runner\.log/.test(gi));
  check('.gitignore couvre orchestrator.lock', /orchestrator\.lock/.test(gi));
  check('.gitignore couvre STOP', /^STOP$/m.test(gi));
  check('scheduler.json existe (etat persistant)', fs.existsSync(path.join(C.AP_DIR, 'scheduler.json')));
  check('latest.md existe (dernier cycle lisible)', fs.existsSync(path.join(C.AP_DIR, 'latest.md')));
  check('runs/ existe (rapports horodates)', fs.existsSync(path.join(C.AP_DIR, 'runs')));
}

// ── 6. Human gates intacts ──
console.log('— human gates (paiement/pricing/checkout/supabase/secrets)');
{
  const cfg = C.loadConfig();
  const deny = (cfg.policy && cfg.policy.denyGlobs) || [];
  for (const g of ['public/api/**', 'workers/**', 'supabase/**', '**/.env*', '**/*config.php', '**/*mollie*', '**/*stripe*', '**/*paypal*', 'src/PremiumModal/**', 'regions/**']) {
    check('denyGlobs contient ' + g, deny.includes(g));
  }
  check('autoMerge OFF par defaut', cfg.policy && cfg.policy.autoMergeEnabled === false);
}

// ── 7. FIX spawnSync git ENOENT : durcissement PATH minimal (Task Scheduler) ──
// Classe prouvee : repairPRConflict (gitops.cjs) appelle execFileSync('git',…)
// qui leve "spawnSync git ENOENT" quand git n'est pas resolvable dans le PATH
// reduit du scheduler. Le correctif est au niveau environnement (wrappers) :
// prepend des emplacements Git for Windows + diagnostic `where git` loggue.
// (gitops.cjs lui-meme est possede par une session concurrente : intouchable.)
console.log('— git PATH hardening (classe ENOENT)');
{
  const cmd = fs.readFileSync(LIVE_CMD, 'utf8');
  const sh = fs.readFileSync(LIVE_SH, 'utf8');
  check('cmd prepend Git for Windows au PATH (ProgramFiles/Git/cmd)', /ProgramFiles.*Git\\cmd/.test(cmd));
  check('cmd couvre aussi Git/bin + LocalAppData', /ProgramFiles.*Git\\bin/.test(cmd) && /LocalAppData.*Git\\cmd/.test(cmd));
  check('cmd ne prepend QUE si git.exe present (if exist, jamais d\'erreur)', /if exist "%%~G\\git\.exe"/.test(cmd));
  check('cmd diagnostique `where git` dans runner.log', /where git/.test(cmd));
  check('sh durcit PATH (+ diagnostic git)', /PATH=.*\$PATH/.test(sh) && /command -v git/.test(sh));
  check('wrappers appellent prune.cjs avant demarrage (non-fatal)', /prune\.cjs --quiet/.test(cmd) && /prune\.cjs --quiet/.test(sh));
}

// ── 8. Preuve runtime : PATH minimal scheduler reproduit ENOENT, durci le ferme ──
console.log('— preuve runtime PATH minimal (aucun runner lance, lecture seule)');
{
  const MIN_PATH = process.platform === 'win32'
    ? 'C:\\Windows\\System32;C:\\Windows'
    : '/usr/bin:/bin';
  const probe = "console.log(require('child_process').execFileSync('git',['--version'],{encoding:'utf8'}).trim())";
  const stripped = spawnSync(process.execPath, ['-e', probe], {
    encoding: 'utf8', timeout: 15000, env: Object.assign({}, process.env, { PATH: MIN_PATH }),
  });
  const fullEnv = spawnSync(process.execPath, ['-e', probe], {
    encoding: 'utf8', timeout: 15000, env: Object.assign({}, process.env),
  });
  if (fullEnv.status !== 0) {
    console.log('  ○ SKIP preuve PATH minimal (git absent meme en PATH complet — machine sans git)');
  } else if (stripped.status === 0) {
    // git resolvable meme en PATH minimal (ex. System32 ou symlink) : classe deja fermee ici.
    check('git resolvable meme en PATH minimal sur cette machine (classe ENOENT non applicable)', true);
  } else {
    check('PATH minimal scheduler REPRODUIT la classe ENOENT (' + (stripped.error && stripped.error.code || 'exit ' + stripped.status) + ')', /ENOENT/.test(stripped.stderr || '') || /ENOENT/.test(stripped.error && stripped.error.message || ''));
    // Applique le meme durcissement que les wrappers : prepend candidats existants.
    const cands = process.platform === 'win32'
      ? ['C:\\Program Files\\Git\\cmd', 'C:\\Program Files\\Git\\bin', (process.env.LOCALAPPDATA || '') + '\\Programs\\Git\\cmd']
      : ['/usr/local/bin', '/usr/bin', '/bin'];
    const existing = cands.filter(d => { try { return fs.existsSync(path.join(d, process.platform === 'win32' ? 'git.exe' : 'git')); } catch (_) { return false; } });
    const hardened = spawnSync(process.execPath, ['-e', probe], {
      encoding: 'utf8', timeout: 15000,
      env: Object.assign({}, process.env, { PATH: existing.join(process.platform === 'win32' ? ';' : ':') + (process.platform === 'win32' ? ';' : ':') + MIN_PATH }),
    });
    check('PATH durci (candidats wrappers) RESOUT git → ' + (hardened.stdout || '').trim().slice(0, 24), hardened.status === 0 && /git version/.test(hardened.stdout || ''));
  }
}

// ── 9. Scheduler reboot-proof : launcher = autopilot-live.cmd ──
console.log('— scheduler launcher');
{
  const ps1 = fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'install-scheduler.ps1'), 'utf8');
  check('install-scheduler.ps1 pointe autopilot-live.cmd', /autopilot-live\.cmd/.test(ps1));
  // L'ancien nom peut survivre en COMMENTAIRE (doc d'avertissement) mais plus
  // comme chemin de lancement : l'assignation Join-Path doit viser le live.
  check('le chemin de lancement = scripts\\autopilot\\autopilot-live.cmd', /Join-Path \$repo "scripts\\autopilot\\autopilot-live\.cmd"/.test(ps1));
  check('aucune assignation restante vers l\'ancien autopilot.cmd seul', !/Join-Path \$repo "scripts\\autopilot\\autopilot\.cmd"/.test(ps1));
  check('aucun LANCEMENT direct runner.cjs dans le scheduler (hors commentaires)', !/Join-Path[^#\n]*runner\.cjs/.test(ps1) && !/New-ScheduledTaskAction[^#\n]*runner\.cjs/.test(ps1));
  check('AtStartup + IgnoreNew (MultipleInstances) + StartWhenAvailable preservés', /AtStartup/.test(ps1) && /IgnoreNew/.test(ps1) && /StartWhenAvailable/.test(ps1));
}

// ── 10. Pruning borne : vieux rapports seulement, jamais le recent ni l'etat ──
console.log('— pruning sûr (repertoire temporaire, zero effet produit)');
{
  const prune = require(path.join(ROOT, 'scripts', 'autopilot', 'prune.cjs'));
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-test-'));
  const runs = path.join(tmp, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  // 3 vieux rapports (> grace), 1 recent (< grace), + fichiers proteges.
  const old = Date.now() - 30 * 24 * 3600 * 1000;
  for (const n of ['2026-09-01-120000000-paaa-1aaaa.md', '2026-09-02-120000000-pbbb-1bbbb.md', '2026-09-03-120000000-pccc-1cccc.md']) {
    const p = path.join(runs, n);
    fs.writeFileSync(p, '# vieux\n');
    fs.utimesSync(p, new Date(old), new Date(old));
  }
  const recent = path.join(runs, '2026-10-01-235900000-pnew-1nnnn.md');
  fs.writeFileSync(recent, '# recent\n');
  fs.writeFileSync(path.join(tmp, 'scheduler.json'), '{"v":1}');
  fs.writeFileSync(path.join(tmp, 'queue.json'), '{"opportunities":[]}');
  fs.writeFileSync(path.join(tmp, 'latest.md'), '# latest\n');
  fs.writeFileSync(path.join(runs, 'runner.log'), 'x'.repeat(100));
  const OLD_ENV = { k: process.env.SARGA_PRUNE_KEEP, g: process.env.SARGA_PRUNE_GRACE_MS };
  process.env.SARGA_PRUNE_KEEP = '1';
  process.env.SARGA_PRUNE_GRACE_MS = String(3600 * 1000);
  let rep;
  try {
    // Re-require avec seuils : les constantes sont lues a l'import → on appelle
    // les fonctions exportees mais les seuils sont figes ; on contourne en
    // surchargeant via delete require.cache.
    delete require.cache[require.resolve(path.join(ROOT, 'scripts', 'autopilot', 'prune.cjs'))];
    const pruneFresh = require(path.join(ROOT, 'scripts', 'autopilot', 'prune.cjs'));
    rep = pruneFresh.pruneReports(runs, () => {});
  } finally {
    if (OLD_ENV.k === undefined) delete process.env.SARGA_PRUNE_KEEP; else process.env.SARGA_PRUNE_KEEP = OLD_ENV.k;
    if (OLD_ENV.g === undefined) delete process.env.SARGA_PRUNE_GRACE_MS; else process.env.SARGA_PRUNE_GRACE_MS = OLD_ENV.g;
  }
  void prune;
  const remaining = fs.readdirSync(runs).filter(f => f.endsWith('.md'));
  check('prune supprime les vieux excedentaires (borne KEEP)', rep.deleted === 3, `deleted=${rep.deleted}`);
  check('prune PRESERVE le rapport recent (< grace, cycle actif)', remaining.includes('2026-10-01-235900000-pnew-1nnnn.md'));
  check('prune ne touche pas scheduler.json/queue.json/latest.md', fs.existsSync(path.join(tmp, 'scheduler.json')) && fs.existsSync(path.join(tmp, 'queue.json')) && fs.existsSync(path.join(tmp, 'latest.md')));
  check('prune ne touche pas runner.log sous le seuil', fs.existsSync(path.join(runs, 'runner.log')));
  // Rotation : log sur-seuil → queue conservee, head tronque.
  fs.writeFileSync(path.join(runs, 'runner.log'), 'x'.repeat(200));
  process.env.SARGA_PRUNE_LOG_MAX = '100';
  process.env.SARGA_PRUNE_LOG_KEEP = '60';
  delete require.cache[require.resolve(path.join(ROOT, 'scripts', 'autopilot', 'prune.cjs'))];
  const pruneFresh2 = require(path.join(ROOT, 'scripts', 'autopilot', 'prune.cjs'));
  const rot = pruneFresh2.rotateLogs(runs, () => {});
  delete process.env.SARGA_PRUNE_LOG_MAX;
  delete process.env.SARGA_PRUNE_LOG_KEEP;
  check('rotation runner.log sur-seuil (fichier preserve, taille reduite)', /rotated/.test(rot['runner.log'] || '') && fs.statSync(path.join(runs, 'runner.log')).size < 200);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\n' + passed + ' checks passed');
