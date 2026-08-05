/**
 * automation/run-all.mjs — Orchestrateur du pipeline d'audit complet.
 * 
 * Usage:
 *   node automation/run-all.mjs                    # Pipeline complet
 *   node automation/run-all.mjs --skip-build       # Skip npm run build
 *   node automation/run-all.mjs --skip-preview     # Skip vite preview (assume déjà lancé)
 *   node automation/run-all.mjs --only=screenshots # Une seule étape
 *   node automation/run-all.mjs --headed           # Mode visible (debug)
 * 
 * Étapes:
 *   1. npm run build
 *   2. vite preview (port 4173)
 *   3. screenshots.mjs (Desktop, Tablet, Mobile)
 *   4. audit-ui.mjs
 *   5. audit-network.mjs
 *   6. audit-accessibility.mjs
 *   7. audit-performance.mjs
 *   8. report-builder.mjs
 * 
 * Sortie: automation/output/
 *   - screenshots/{viewport}/{route}.png
 *   - report.json, report.html, report.md
 *   - console.json, network.json, accessibility.json, performance.json
 */

import { spawn, execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const args = process.argv.slice(2);
const flags = {
  skipBuild: args.includes('--skip-build'),
  skipPreview: args.includes('--skip-preview'),
  only: args.find(a => a.startsWith('--only='))?.split('=')[1],
  headed: args.includes('--headed'),
  baseUrl: args.find(a => a.startsWith('--base='))?.split('=')[1] || 'http://localhost:4173',
  outputDir: args.find(a => a.startsWith('--out='))?.split('=')[1] || 'automation/output',
  previewPort: parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '4173', 10),
};

const STEPS = [
  { id: 'build', name: 'Build production', cmd: 'npm run build' },
  { id: 'preview', name: 'Vite preview server', cmd: `npx vite preview --port ${flags.previewPort} --strictPort` },
  { id: 'screenshots', name: 'Captures d\'écran', script: 'screenshots.mjs' },
  { id: 'audit-ui', name: 'Audit UI', script: 'audit-ui.mjs' },
  { id: 'audit-network', name: 'Audit Réseau', script: 'audit-network.mjs' },
  { id: 'audit-accessibility', name: 'Audit Accessibilité', script: 'audit-accessibility.mjs' },
  { id: 'audit-performance', name: 'Audit Performance', script: 'audit-performance.mjs' },
  { id: 'report', name: 'Génération rapport', script: 'report-builder.mjs' },
];

let previewProcess = null;
let previewReady = false;

async function waitForPreview(url, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

function runCommand(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    const [command, ...cmdArgs] = cmd.split(' ');
    const child = spawn(command, cmdArgs, {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd(),
      env: { ...process.env, ...options.env },
      ...options,
    });
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}: ${cmd}`));
    });
    child.on('error', reject);
  });
}

function runScript(script, extraArgs = []) {
  const headedFlag = flags.headed ? '--headed' : '';
  const baseFlag = `--base=${flags.baseUrl}`;
  const outFlag = `--out=${flags.outputDir}`;
  const cmd = `node automation/${script} ${headedFlag} ${baseFlag} ${outFlag} ${extraArgs.join(' ')}`.trim();
  console.log(`\n▶ ${cmd}`);
  return runCommand(cmd);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PIPELINE D\'AUDIT AUTOMATISÉ SARGAME                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Output: ${flags.outputDir}`);
  console.log(`Base URL: ${flags.baseUrl}`);
  console.log(`Headed: ${flags.headed}`);
  if (flags.only) console.log(`Mode: ONLY ${flags.only}`);

  // Créer dossier output
  mkdirSync(join(flags.outputDir, 'screenshots'), { recursive: true });

  // Déterminer étapes à exécuter
  let stepsToRun = STEPS;
  if (flags.only) {
    stepsToRun = STEPS.filter(s => s.id === flags.only || s.script === `${flags.only}.mjs`);
    if (stepsToRun.length === 0) {
      console.error(`Étape inconnue: ${flags.only}`);
      console.error('Disponibles:', STEPS.map(s => s.id).join(', '));
      process.exit(1);
    }
  }
  if (flags.skipBuild) stepsToRun = stepsToRun.filter(s => s.id !== 'build');
  if (flags.skipPreview) stepsToRun = stepsToRun.filter(s => s.id !== 'preview');

  const startTime = Date.now();

  try {
    for (const step of stepsToRun) {
      const stepStart = Date.now();
      console.log(`\n═══ ${step.name} ═══`);

      try {
        if (step.id === 'build') {
          await runCommand(step.cmd);
        } else if (step.id === 'preview') {
          // Lancer preview en arrière-plan
          previewProcess = spawn('npx', ['vite', 'preview', '--port', String(flags.previewPort), '--strictPort'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
            cwd: process.cwd(),
          });
          
          previewProcess.stdout?.on('data', data => {
            const str = data.toString();
            console.log(`[preview] ${str.trim()}`);
            if (str.includes('ready') || str.includes('Local:')) previewReady = true;
          });
          previewProcess.stderr?.on('data', data => {
            console.error(`[preview] ${data.toString().trim()}`);
          });
          
          // Attendre que le serveur soit prêt
          console.log(`Attente de vite preview sur ${flags.baseUrl}...`);
          const ready = await waitForPreview(flags.baseUrl);
          if (!ready) throw new Error('vite preview n\'a pas démarré à temps');
          console.log('✓ Preview prêt');
        } else if (step.script) {
          await runScript(step.script);
        }
        
        console.log(`✓ ${step.name} terminé en ${((Date.now() - stepStart) / 1000).toFixed(1)}s`);
      } catch (err) {
        console.error(`✗ ${step.name} ÉCHOUÉ: ${err.message}`);
        throw err;
      }
    }

    console.log(`\n═══ PIPELINE TERMINÉ EN ${((Date.now() - startTime) / 1000).toFixed(1)}s ═══`);
    console.log(`📁 Résultats dans: ${resolve(flags.outputDir)}`);
    console.log(`   - screenshots/`);
    console.log(`   - report.json, report.html, report.md`);
    console.log(`   - console.json, network.json, accessibility.json, performance.json`);

  } finally {
    // Nettoyer preview
    if (previewProcess) {
      console.log('\nArrêt de vite preview...');
      previewProcess.kill();
    }
  }
}

main().catch(err => {
  console.error('\n❌ PIPELINE ÉCHOUÉ:', err.message);
  if (previewProcess) previewProcess.kill();
  process.exit(1);
});