'use strict';
/**
 * local-agent-executor.cjs — Execute coding tasks locally via OpenCode + Ollama
 * 
 * Replaces the GitHub issue creation with actual local agent execution.
 * 
 * Flow:
 * 1. Receive task (from queue or tasks.md)
 * 2. Create git worktree/branch
 * 3. Run BEFORE validation (smoke test + screenshots)
 * 4. Execute OpenCode agent with persona + constraints
 * 5. Run AFTER validation (smoke test + screenshots + visual diff)
 * 6. Verify no regressions (bundle budget, JS errors, funnel tokens)
 * 7. Commit, push, create PR
 * 8. Return result with evidence
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync, execSync } = require('child_process');
const C = require('./lib/common.cjs');
const gitops = require('./lib/gitops.cjs');
const policy = require('./lib/policy.cjs');
const { runVisualQA } = require('./visual-qa.cjs');

const ROOT = C.ROOT;
const OPENCODE_AUTO = path.join(ROOT, '.ai', 'ux-agent', 'opencode-auto.cjs');

/**
 * Build prompt for OpenCode agent based on task
 */
function buildAgentPrompt(task, isUxTask = false) {
  const personaPath = path.join(__dirname, 'personas', (task.persona || 'ui-ux') + '.md');
  const persona = fs.existsSync(personaPath) ? fs.readFileSync(personaPath, 'utf8') : '';
  
  const scopeFiles = (task.scope && task.scope.files || task.files || []).join(', ');
  const evidence = task.evidence || task.description || 'No specific evidence provided';
  
  const constraints = [
    'HARD CONSTRAINTS (violation = task failure):',
    '- ONLY modify files in scope: ' + (scopeFiles || 'NONE — propose only'),
    '- NO payment/checkout/mollie/paypal/stripe code',
    '- NO public/api, workers, regions, workflows, secrets',
    '- NO new dependencies without approval',
    '- NO dist/, translations without i18n _t()',
    '- Bundle eager JS ≤ 210 KB gzip (check-bundle-budget.cjs)',
    '- Rollback pattern REQUIRED for UI changes: flag ?xxx=0 disables feature',
    '- Follow existing repo patterns, minimal changes',
    '- All new text must use i18n _t() function',
  ];
  
  const acceptanceCriteria = [
    'ACCEPTANCE CRITERIA:',
    '- Gate de ship passes: build + smoke + bundle + PHP lint',
    '- FUNNEL_REACHED=map+fiche+paywall',
    '- WHITE_OR_TRANSPARENT_BUTTONS=[]',
    '- ERRORS=[] (excluding known CI noise)',
    '- RM_INFINITE=[]',
    '- Visual regression: no unintended changes on key routes',
    '- No new console errors or page errors',
  ];
  
  let taskContext = '';
  if (task.task) {
    taskContext = '\nSTRUCTURED TASK CONTEXT:\n' + JSON.stringify({
      filesToRead: task.task.filesToRead || [],
      implementation: task.task.implementation || '',
      tests: task.task.tests || [],
      acceptance: task.task.acceptance || [],
      constraints: task.task.constraints || [],
      stopCondition: task.task.stopCondition || '',
    }, null, 2);
  }
  
  const promptParts = [
    persona,
    '',
    '# MISSION AUTOPILOT (bornes DURES, toute sortie = annulation)',
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Description: ${task.description}`,
    `Evidence: ${evidence}`,
    `Expected Impact: ${task.expectedImpact || 'N/A'}`,
    `Files AUTHORIZED: ${scopeFiles || 'aucun — propose seulement'}`,
    taskContext,
    '',
    ...constraints,
    '',
    'ROLLBACK REQUIREMENT:',
    '- Any UI change MUST be disableable via query flag ?feature=0',
    '- Pattern: /[?&]feature=0/.test(window.location.search) → skip feature',
    '',
    ...acceptanceCriteria,
    '',
    'Applique le fix MAINTENANT sur le working tree, puis arrête-toi.',
    'Ne commit pas, ne push pas — le runner gère le reste.',
  ];
  
  return promptParts.join('\n');
}

/**
 * Execute OpenCode agent on worktree
 */
async function runOpenCodeAgent(worktreePath, prompt, cfg, log) {
  return new Promise((resolve) => {
    const liveMode = process.env.SARGA_AUTOPILOT_LIVE === '1';
    
    if (liveMode) {
      log(`[LIVE] OpenCode agent starting (max ${cfg.policy.agentMaxMinutes} min)...`);
    } else {
      log(`OpenCode agent starting (max ${cfg.policy.agentMaxMinutes} min)...`);
    }
    
    const child = spawn(process.execPath, [OPENCODE_AUTO, 'run', prompt], {
      cwd: worktreePath,
      stdio: liveMode ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SARGA_LOCAL_ONLY: '1',
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
      },
    });
    
    let out = '', err = '';
    if (child.stdout) {
      child.stdout.on('data', d => { out += d; if (liveMode && out.length > 20000) out = out.slice(-15000); });
    }
    if (child.stderr) {
      child.stderr.on('data', d => { err += d; if (liveMode && err.length > 10000) err = err.slice(-8000); });
    }
    
    const kill = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
    }, cfg.policy.agentMaxMinutes * 60000);
    
    child.on('exit', (code, signal) => {
      clearTimeout(kill);
      if (liveMode) log(`[LIVE] OpenCode exited with code ${code}`);
      if (signal) {
        resolve({ ok: false, code: -1, signal, out: out.slice(-5000), err: err.slice(-3000) });
      } else {
        resolve({ ok: code === 0, code, out: out.slice(-5000), err: err.slice(-3000) });
      }
    });
    
    child.on('error', e => {
      clearTimeout(kill);
      resolve({ ok: false, code: -1, err: e.message });
    });
  });
}

/**
 * Run before validation (smoke test + visual QA)
 */
async function runBeforeValidation(worktreePath, task, cfg, log) {
  log(`Running BEFORE validation for ${task.id}...`);
  
  // Build and start preview server
  const { withPreviewServer, stopAllServers, VITE_BIN } = require('../lib/process-runner.cjs');
  await stopAllServers();
  
  const validation = await withPreviewServer(
    async (baseUrl) => {
      const { execFileSync } = require('child_process');
      
      // Run ux-smoke.mjs
      const smokeScript = path.join(ROOT, 'scripts', 'ux-smoke.mjs');
      const output = execFileSync(process.execPath, [smokeScript], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 180000,
        env: { ...process.env, SMOKE_BASE: baseUrl },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Check required tokens
      const requiredTokens = [
        'FUNNEL_REACHED=map+fiche+paywall',
        'ERRORS=[]',
        'WHITE_OR_TRANSPARENT_BUTTONS=[]',
        'RM_INFINITE=[]'
      ];
      
      const missing = requiredTokens.filter(t => !output.includes(t));
      if (missing.length) {
        throw new Error(`BEFORE validation failed - missing tokens: ${missing.join(', ')}`);
      }
      
      // Run visual QA to establish baselines
      const visualResult = await runVisualQA(worktreePath, ['/', '/?paywall=1', '/carte-sargasses/'], ['mobile', 'desktop']);
      
      return {
        success: true,
        smokeOutput: output,
        visualBaselines: visualResult.results
      };
    },
    {
      port: 4173,
      host: 'localhost',
      previewCmd: VITE_BIN,
      previewArgs: ['preview', '--port', '4173', '--host']
    }
  );
  
  return validation;
}

/**
 * Run after validation (smoke test + visual QA + diff)
 */
async function runAfterValidation(worktreePath, task, beforeResult, cfg, log) {
  log(`Running AFTER validation for ${task.id}...`);
  
  const { withPreviewServer, stopAllServers, VITE_BIN } = require('../lib/process-runner.cjs');
  
  const validation = await withPreviewServer(
    async (baseUrl) => {
      const { execFileSync } = require('child_process');
      
      // Run ux-smoke.mjs
      const smokeScript = path.join(ROOT, 'scripts', 'ux-smoke.mjs');
      const output = execFileSync(process.execPath, [smokeScript], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 180000,
        env: { ...process.env, SMOKE_BASE: baseUrl },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Check required tokens
      const requiredTokens = [
        'FUNNEL_REACHED=map+fiche+paywall',
        'ERRORS=[]',
        'WHITE_OR_TRANSPARENT_BUTTONS=[]',
        'RM_INFINITE=[]'
      ];
      
      const missing = requiredTokens.filter(t => !output.includes(t));
      if (missing.length) {
        throw new Error(`AFTER validation failed - missing tokens: ${missing.join(', ')}`);
      }
      
      // Run visual QA for comparison
      const visualResult = await runVisualQA(worktreePath, ['/', '/?paywall=1', '/carte-sargasses/'], ['mobile', 'desktop']);
      
      // Check for visual regressions
      const regressions = visualResult.results.filter(r => !r.passed && !r.established);
      if (regressions.length > 0) {
        throw new Error(`Visual regression detected: ${regressions.map(r => `${r.route}@${r.viewport} (${(r.diffPercent*100).toFixed(2)}%)`).join(', ')}`);
      }
      
      // Check bundle budget
      try {
        execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check-bundle-budget.cjs')], {
          cwd: ROOT, encoding: 'utf8', timeout: 60000
        });
      } catch (e) {
        throw new Error(`Bundle budget exceeded: ${e.message}`);
      }
      
      return {
        success: true,
        smokeOutput: output,
        visualResults: visualResult.results,
        regressions: regressions.length
      };
    },
    {
      port: 4174, // Different port to avoid conflict
      host: 'localhost',
      previewCmd: VITE_BIN,
      previewArgs: ['preview', '--port', '4174', '--host']
    }
  );
  
  return validation;
}

/**
 * Main executor - runs the full local agent cycle
 */
async function executeLocalAgentTask(task, cfg, log) {
  const startTime = Date.now();
  
  // Create worktree
  const slug = task.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const branch = cfg.git.branchPrefix + 'ux-' + slug;
  
  log(`Creating worktree for ${task.id} on branch ${branch}...`);
  
  let wt;
  try {
    wt = gitops.prepareWorktree(cfg, branch, m => log('[worktree] ' + m));
  } catch (e) {
    const msg = String(e.message || e);
    if (/already exists|already in use|worktree|not a valid ref|unable to create|locked/i.test(msg)) {
      throw new Error(`Worktree collision: ${msg}`);
    }
    throw e;
  }
  
  try {
    // 1. BEFORE validation
    const beforeResult = await runBeforeValidation(wt, task, cfg, log);
    log(`BEFORE validation passed`);
    
    // 2. Build agent prompt
    let prompt = buildAgentPrompt(task, task.type === 'ux_task');
    
    // 3. Execute agent with repair attempts
    let agentResult = null;
    for (let attempt = 1; attempt <= cfg.loop.maxRepairAttempts; attempt++) {
      log(`Agent attempt ${attempt}/${cfg.loop.maxRepairAttempts}...`);
      
      agentResult = await runOpenCodeAgent(wt, prompt, cfg, log);
      
      if (agentResult.ok) {
        log(`Agent completed successfully`);
        break;
      }
      
      log(`Agent attempt ${attempt} failed: ${agentResult.err || agentResult.out}`);
      
      if (attempt < cfg.loop.maxRepairAttempts) {
        // Add failure context to prompt for next attempt
        const failureContext = agentResult.err || agentResult.out;
        prompt = prompt + '\n\n# PREVIOUS ATTEMPT FAILED\n' + failureContext.slice(-3000) + '\n\nFIX THE ABOVE AND TRY AGAIN.';
        await new Promise(r => setTimeout(r, 10000));
      }
    }
    
    if (!agentResult || !agentResult.ok) {
      throw new Error(`Agent failed after ${cfg.loop.maxRepairAttempts} attempts: ${agentResult?.err || 'unknown'}`);
    }
    
    // 4. Policy checks on diff
    const diff = gitops.diffStats(wt);
    const ev = policy.evaluateFiles(diff.files, cfg);
    if (!ev.allowed) {
      throw new Error(`Policy violation: ${ev.denied.join(', ')}`);
    }
    
    const budgetErrs = policy.evaluateBudget(diff, cfg);
    if (budgetErrs.length) {
      throw new Error(`Budget exceeded: ${budgetErrs.join(' ; ')}`);
    }
    
    const secrets = policy.scanSecrets(diff.diffText);
    if (secrets.length) {
      throw new Error(`Secrets detected: ${secrets.join(', ')}`);
    }
    
    // 5. Run gate (build + tests + bundle + PHP lint)
    log(`Running gate checks...`);
    const gate = await runGateInline(wt, diff.files, log);
    
    if (!gate.ok) {
      throw new Error(`Gate failed: ${gate.failedStep} - ${gate.detail}`);
    }
    
    // 6. AFTER validation
    const afterResult = await runAfterValidation(wt, task, beforeResult, cfg, log);
    log(`AFTER validation passed`);
    
    // 7. Commit and push
    const commitSha = gitops.commitAll(wt,
      `fix(ux): ${task.title.slice(0, 90)}\n\nTask: ${task.id}\nEvidence: ${(task.evidence || '').slice(0, 200)}\nRollback: ${task.rollback || 'revert'}\n\nAutopilot UX cycle`,
      diff.files
    );
    
    gitops.pushBranch(wt, branch, cfg);
    
    // 8. Create PR
    const body = [
      `## 🤖 Autonomous UX Improvement`,
      '',
      `**Task**: ${task.id} — ${task.title}`,
      `**Evidence**: ${task.evidence || 'N/A'}`,
      `**Expected Impact**: ${task.expectedImpact || 'N/A'}`,
      `**Score**: ${task.score}`,
      '',
      `### Validation Results`,
      `- ✅ BEFORE: All funnel tokens passed`,
      `- ✅ AFTER: All funnel tokens passed`,
      `- ✅ Visual QA: No regressions (${afterResult.visualResults?.filter(r => r.passed).length || 0}/${afterResult.visualResults?.length || 0})`,
      `- ✅ Gate: ${gate.steps.join(', ')}`,
      `- ✅ Bundle Budget: OK`,
      '',
      `### Rollback`,
      `${task.rollback || 'revert ' + commitSha}`,
      '',
      `### Files Changed`,
      diff.files.map(f => `- \`${f}\``).join('\n'),
      '',
      `### Stats`,
      `- ${diff.files.length} files, +${diff.insertions}/-${diff.deletions} lines`,
    ].join('\n');
    
    const pr = gitops.createPR(wt, { 
      title: `[ux] ${task.title.slice(0, 80)}`, 
      body, 
      base: cfg.git.baseBranch 
    });
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      taskId: task.id,
      prUrl: pr.url,
      prNumber: pr.number,
      branch,
      commitSha,
      duration,
      beforeValidation: beforeResult,
      afterValidation: afterResult,
      diff: { files: diff.files, insertions: diff.insertions, deletions: diff.deletions },
      gateSteps: gate.steps
    };
    
  } finally {
    // Cleanup worktree
    try { gitops.cleanupWorktree(wt); } catch (_) {}
  }
}

/**
 * Execute a generic code task (from tasks.md) using local agent
 */
async function executeCodeTaskLocal(task, cfg, log) {
  const taskId = task.payload?.taskId || task.id.replace(/^task-/, '');
  
  // Load task details from tasks.md
  const tasksContent = fs.readFileSync(path.join(ROOT, '.ai', 'tasks.md'), 'utf8');
  const taskMatch = tasksContent.match(new RegExp(`### ${taskId}[\\s\\S]*?(?=###|$)`, 'm'));
  
  const fullTask = {
    id: taskId,
    type: 'code_task',
    title: taskMatch ? taskMatch[0].split('\n')[0].replace('### ', '') : taskId,
    description: taskMatch ? taskMatch[0].slice(taskMatch[0].indexOf('\n') + 1).trim() : '',
    evidence: 'From tasks.md backlog',
    files: [],
    persona: 'coding',
    rollback: 'revert',
    ...task.payload
  };
  
  return executeLocalAgentTask(fullTask, cfg, log);
}

/**
 * Run gate checks inline (build, bundle budget, PHP lint, smoke test)
 */
async function runGateInline(worktreePath, files, log) {
  const { withPreviewServer, stopAllServers, VITE_BIN, NPM_CMD } = require('../lib/process-runner.cjs');
  const steps = [];
  
  try {
    // 1. Build
    log('Gate: Building...');
    execFileSync(NPM_CMD, ['run', 'build'], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    steps.push('build');
    
    // 2. Bundle budget
    log('Gate: Checking bundle budget...');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check-bundle-budget.cjs')], { 
      cwd: ROOT, encoding: 'utf8', timeout: 60000 
    });
    steps.push('bundle-budget');
    
    // 3. PHP lint on modified PHP files
    const phpFiles = files.filter(f => f.endsWith('.php'));
    if (phpFiles.length > 0) {
      log('Gate: PHP lint...');
      for (const phpFile of phpFiles) {
        const fullPath = path.join(worktreePath, phpFile);
        if (fs.existsSync(fullPath)) {
          execFileSync('php', ['-l', fullPath], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
        }
      }
      steps.push('php-lint');
    }
    
    // 4. Smoke test (ux-smoke.mjs)
    log('Gate: Running smoke test...');
    await withPreviewServer(
      async (baseUrl) => {
        const smokeScript = path.join(ROOT, 'scripts', 'ux-smoke.mjs');
        const output = execFileSync(process.execPath, [smokeScript], {
          cwd: ROOT,
          encoding: 'utf8',
          timeout: 180000,
          env: { ...process.env, SMOKE_BASE: baseUrl },
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        const requiredTokens = [
          'FUNNEL_REACHED=map+fiche+paywall',
          'ERRORS=[]',
          'WHITE_OR_TRANSPARENT_BUTTONS=[]',
          'RM_INFINITE=[]'
        ];
        
        const missing = requiredTokens.filter(t => !output.includes(t));
        if (missing.length) {
          throw new Error(`Smoke test failed - missing tokens: ${missing.join(', ')}`);
        }
        
        steps.push('smoke-test');
      },
      {
        port: 4173,
        host: 'localhost',
        previewCmd: VITE_BIN,
        previewArgs: ['preview', '--port', '4173', '--host']
      }
    );
    
    return { ok: true, steps };
    
  } catch (e) {
    return { ok: false, failedStep: steps[steps.length - 1] || 'unknown', detail: e.message };
  }
}

module.exports = {
  executeLocalAgentTask,
  executeCodeTaskLocal,
  runBeforeValidation,
  runAfterValidation,
  runOpenCodeAgent,
  buildAgentPrompt,
  runGateInline
};