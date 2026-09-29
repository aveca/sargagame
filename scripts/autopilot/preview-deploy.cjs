#!/usr/bin/env node
/**
 * preview-deploy.cjs — PREVIEW DEPLOYMENT DETECTION & VALIDATION
 *
 * Après PR créée + CI GREEN :
 * 1. Détecter le mécanisme de preview (Cloudflare Pages PR preview)
 * 2. Attendre que le déploiement preview soit prêt
 * 3. Valider que le fingerprint correspond au HEAD de la PR
 * 4. Retourner l'URL preview prête pour ONLINE_QA
 *
 * Cloudflare Pages crée automatiquement un preview pour chaque PR :
 * https://<pr-number>.<project-name>.pages.dev
 * ou https://<branch-name>.<project-name>.pages.dev
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('./lib/common.cjs');
const { prodFingerprint } = require('./lib/gitops.cjs');

const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';

function log(msg) {
  if (LIVE) console.log(`[${new Date().toISOString().slice(11, 19)}] PREVIEW   ${msg}`);
  else console.log(`[PREVIEW] ${msg}`);
}

/** Mapping région -> projet Cloudflare Pages */
const REGION_PROJECTS = {
  mq: 'sargagame',
  gp: 'sargagame-gp',
  florida: 'sargagame-florida',
  puntacana: 'sargagame-puntacana',
  rivieramaya: 'sargagame-rivieramaya',
  tulum: 'sargagame-tulum',
};

/** Détecte l'URL preview Cloudflare Pages pour une PR */
async function detectPreviewUrl(prUrl, prNumber, branchName) {
  // Cloudflare Pages preview URLs pour PRs :
  // Format: https://<pr-number>.<project>.pages.dev
  // ou https://<branch-name>.<project>.pages.dev
  
  // Pour le domaine principal (MQ), le projet est 'sargagame'
  const project = REGION_PROJECTS.mq;
  
  // Essaie plusieurs patterns courants
  const candidates = [
    `https://${prNumber}.${project}.pages.dev`,
    `https://${branchName}.${project}.pages.dev`,
    `https://${branchName.replace(/[^a-z0-9-]/g, '-')}.${project}.pages.dev`,
  ];
  
  // Pour les autres régions, on pourrait aussi vérifier
  // Mais le preview principal est généralement sur le projet MQ
  
  log(`preview candidates: ${candidates.join(', ')}`);
  
  // Teste chaque candidat avec HEAD request
  for (const url of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok || r.status === 301 || r.status === 302 || r.status === 404) {
        // 404 peut signifier que le déploiement existe mais la page n'existe pas
        // On accepte si le déploiement répond (pas 5xx, pas timeout)
        if (r.status < 500) {
          log(`preview detected: ${url} (status ${r.status})`);
          return { url, status: r.status };
        }
      }
    } catch (e) {
      // Ignore, essaie le suivant
    }
  }
  
  return null;
}

/** Attend que le preview soit déployé et fingerprinté */
async function waitForPreviewDeploy(prUrl, prNumber, branchName, commitSha, cfg, options = {}) {
  const maxWaitMs = options.maxWaitMs || 15 * 60 * 1000; // 15 min default
  const pollIntervalMs = options.pollIntervalMs || 30000; // 30s
  const startTime = Date.now();
  
  log(`waiting for preview deploy (max ${maxWaitMs/60000} min)...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    // 1. Détecter l'URL preview
    const preview = await detectPreviewUrl(prUrl, prNumber, branchName);
    if (!preview) {
      log(`preview not yet available, waiting ${pollIntervalMs/1000}s...`);
      await sleep(pollIntervalMs);
      continue;
    }
    
    // 2. Vérifier le fingerprint
    const domain = new URL(preview.url).hostname;
    const fp = await prodFingerprint(domain, 15000);
    
    if (fp && fp.b) {
      const expectedShort = commitSha.slice(0, 8);
      if (fp.b.startsWith(expectedShort)) {
        log(`preview fingerprint MATCH: ${fp.b} = commit ${expectedShort}`);
        return { url: preview.url, domain, fingerprint: fp.b, matched: true };
      } else {
        log(`preview fingerprint MISMATCH: got ${fp.b}, expected ${expectedShort}...`);
      }
    } else {
      log(`preview fingerprint not available yet...`);
    }
    
    // 3. Si fingerprint pas match, attendre et réessayer
    // (le déploiement preview peut prendre quelques minutes après CI)
    log(`waiting for fingerprint match, retry in ${pollIntervalMs/1000}s...`);
    await sleep(pollIntervalMs);
  }
  
  throw new Error(`preview deploy timeout after ${maxWaitMs/60000} min`);
}

/** Vérifie que le CI de la PR est vert */
async function waitForCIGreen(prUrl, maxWaitMs = 20 * 60 * 1000) {
  const bin = process.platform === 'win32' ? 'gh.exe' : 'gh';
  const startTime = Date.now();
  const pollInterval = 30000;
  
  log(`waiting for CI green on ${prUrl}...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const out = execFileSync(bin, [
        'pr', 'view', prUrl, '--json', 'statusCheckRollup'
      ], { cwd: C.ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
      
      const pr = JSON.parse(out.trim());
      const checks = pr.statusCheckRollup || [];
      
      // Filtrer les checks requis
      const required = checks.filter(c => 
        c.name === 'CI Tests' || 
        c.name === 'Perf Budget + Lighthouse' ||
        c.name === 'Secret scan' ||
        c.name === 'branch-policy' ||
        c.name === 'Funnel Gate' ||
        c.name === 'Playwright E2E'
      );
      
      if (checks.length === 0) {
        log('no checks yet...');
      } else {
        const pending = checks.filter(c => c.status !== 'COMPLETED');
        const failed = checks.filter(c => c.conclusion === 'FAILURE' || c.conclusion === 'ERROR');
        
        if (failed.length > 0) {
          throw new Error(`CI failed: ${failed.map(f => f.name).join(', ')}`);
        }
        
        if (pending.length === 0 && required.length > 0) {
          log('all required CI checks GREEN');
          return true;
        }
        
        log(`CI: ${checks.filter(c => c.status === 'COMPLETED').length}/${checks.length} done, ${pending.length} pending...`);
      }
    } catch (e) {
      log(`CI check error: ${e.message}`);
    }
    
    await sleep(pollInterval);
  }
  
  throw new Error(`CI wait timeout after ${maxWaitMs/60000} min`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Phase complète : CI wait → preview deploy → fingerprint validation
 * Retourne { url, domain, fingerprint, matched }
 */
async function deployAndValidatePreview(prUrl, prNumber, branchName, commitSha, cfg) {
  // 1. Attendre CI green
  await waitForCIGreen(prUrl);
  
  // 2. Attendre preview deploy + fingerprint match
  const preview = await waitForPreviewDeploy(prUrl, prNumber, branchName, commitSha, cfg, {
    maxWaitMs: 20 * 60 * 1000, // 20 min
    pollIntervalMs: 30000,
  });
  
  // 3. Health check rapide
  const health = await quickHealthCheck(preview.url);
  if (!health.ok) {
    throw new Error(`preview health check failed: ${health.error}`);
  }
  
  log(`preview READY: ${preview.url}`);
  return preview;
}

async function quickHealthCheck(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, { signal: ctrl.signal, method: 'HEAD' });
    clearTimeout(t);
    return { ok: r.status < 500, status: r.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  detectPreviewUrl,
  waitForPreviewDeploy,
  waitForCIGreen,
  deployAndValidatePreview,
  quickHealthCheck,
  REGION_PROJECTS,
};