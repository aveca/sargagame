#!/usr/bin/env node
/**
 * run-smoke.cjs — Orchestrateur smoke test avec serveur preview managé
 * 
 * Utilise process-runner.cjs pour :
 * 1. Build production
 * 2. Démarrer Vite preview en arrière-plan (PID capturé)
 * 3. Exécuter ux-smoke.mjs avec timeout
 * 4. Arrêter proprement le serveur preview
 * 5. Retourner le contrôle à l'agent
 */

const { withPreviewServer, stopAllServers, VITE_BIN } = require('./lib/process-runner.cjs');
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SMOKE_SCRIPT = path.join(__dirname, 'ux-smoke.mjs');
const TIMEOUT_MS = 180000;

async function main() {
  console.log('[run-smoke] Starting smoke test orchestration...');
  
  // Nettoyer tout serveur résiduel au démarrage
  const cleaned = await stopAllServers();
  if (cleaned.length) console.log('[run-smoke] Cleaned up', cleaned.length, 'residual server(s)');
  
  try {
    const result = await withPreviewServer(
      async (baseUrl) => {
        console.log('[run-smoke] Preview server ready at', baseUrl);
        
        // Exécuter le smoke test avec timeout
        // execFileSync with encoding returns stdout as string, stderr is not captured
        const output = execFileSync(process.execPath, [SMOKE_SCRIPT], {
          cwd: ROOT,
          encoding: 'utf8',
          timeout: TIMEOUT_MS,
          env: { ...process.env, SMOKE_BASE: baseUrl },
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        console.log('[run-smoke] Smoke test completed');
        console.log(output);
        const requiredTokens = [
          'FUNNEL_REACHED=map+fiche+paywall',
          'ERRORS=[]',
          'WHITE_OR_TRANSPARENT_BUTTONS=[]',
          'RM_INFINITE=[]'
        ];
        
        const missing = requiredTokens.filter(t => !output.includes(t));
        if (missing.length) {
          throw new Error(`Missing required tokens: ${missing.join(', ')}`);
        }
        
        return { success: true, output };
      },
      {
        port: 4173,
        host: 'localhost',
        previewCmd: VITE_BIN,
        previewArgs: ['preview', '--port', '4173', '--host']
      }
    );
    
    console.log('[run-smoke] ✅ Smoke test PASSED');
    process.exitCode = 0;
    
  } catch (error) {
    console.error('[run-smoke] ❌ Smoke test FAILED:', error.message);
    if (error.stdout) console.error('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    process.exitCode = 1;
  } finally {
    // Nettoyage final garanti et attendu avant de rendre la main.
    const finalCleanup = await stopAllServers();
    if (finalCleanup.length) console.log('[run-smoke] Final cleanup:', finalCleanup.length, 'server(s) stopped');
  }
}

main().catch(async e => {
  console.error('[run-smoke] Fatal error:', e);
  try { await stopAllServers(); } catch (cleanupError) {
    console.error('[run-smoke] Cleanup failed:', cleanupError.message);
  }
  process.exitCode = 1;
});