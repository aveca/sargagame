#!/usr/bin/env node
/**
 * job-trace.cjs — End-to-end job_id traceability system
 * 
 * Propagates a single job_id from task creation through PR, CI, deploy, and verification.
 * Ensures every step is traceable to the original task.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const AI_DIR = path.join(ROOT, '.ai');
const TRACE_DIR = path.join(ROOT, 'traces');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim();
}

function runSafe(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim() };
  } catch (e) {
    var stdout = e.stdout ? e.stdout.toString() : '';
    var stderr = e.stderr ? e.stderr.toString() : '';
    return { ok: false, out: String(e.stdout || '') + '\n' + String(e.stderr || '') + e.message };
  }
}

function generateJobId(taskId) {
  var timestamp = Date.now().toString(36);
  var random = Math.random().toString(36).substring(2, 8);
  return taskId + '-' + timestamp + '-' + random;
}

function ensureTraceDir() {
  if (!fs.existsSync(TRACE_DIR)) {
    fs.mkdirSync(TRACE_DIR, { recursive: true });
  }
}

function createTrace(jobId, taskId, metadata) {
  ensureTraceDir();
  
  var trace = {
    jobId: jobId,
    taskId: taskId,
    createdAt: new Date().toISOString(),
    gitSha: runSafe('git rev-parse HEAD').ok ? run('git rev-parse HEAD') : null,
    branch: runSafe('git branch --show-current').out,
    metadata: metadata || {},
    steps: []
  };
  
  var traceFile = path.join(TRACE_DIR, jobId + '.json');
  fs.writeFileSync(path.join(TRACE_DIR, jobId + '.json'), JSON.stringify(trace, null, 2));
  
  return trace;
}

function addStep(jobId, stepName, status, details) {
  var traceFile = path.join(TRACE_DIR, jobId + '.json');
  if (!fs.existsSync(traceFile)) return false;
  
  var trace = JSON.parse(fs.readFileSync(traceFile, 'utf-8'));
  trace.steps.push({
    step: stepName,
    status: status, // 'started', 'completed', 'failed', 'skipped'
    timestamp: new Date().toISOString(),
    details: details || {}
  });
  
  fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2));
  return true;
}

function getTrace(jobId) {
  var traceFile = path.join(TRACE_DIR, jobId + '.json');
  if (!fs.existsSync(traceFile)) return null;
  return JSON.parse(fs.readFileSync(traceFile, 'utf-8'));
}

function listTraces() {
  if (!fs.existsSync(TRACE_DIR)) return [];
  return fs.readdirSync(TRACE_DIR)
    .filter(function(f) { return f.endsWith('.json'); })
    .map(function(f) { return f.replace('.json', ''); });
}

function getTraceSummary(jobId) {
  var trace = getTrace(jobId);
  if (!trace) return null;
  
  var steps = trace.steps || [];
  var completed = steps.filter(function(s) { return s.status === 'completed'; }).length;
  var failed = steps.filter(function(s) { return s.status === 'failed'; }).length;
  var inProgress = steps.filter(function(s) { return s.status === 'started' && s.status !== 'completed'; }).length;
  
  return {
    jobId: trace.jobId,
    taskId: trace.taskId,
    createdAt: trace.createdAt,
    gitSha: trace.gitSha,
    branch: trace.branch,
    totalSteps: steps.length,
    completed: completed,
    failed: failed,
    inProgress: inProgress,
    lastStep: steps[steps.length - 1] || null,
    overallStatus: failed > 0 ? 'FAILED' : (completed === steps.length && steps.length > 0 ? 'COMPLETED' : 'IN_PROGRESS')
  };
}

function linkPR(jobId, prNumber) {
  var traceFile = path.join(TRACE_DIR, jobId + '.json');
  if (!fs.existsSync(traceFile)) return false;
  
  var trace = JSON.parse(fs.readFileSync(traceFile, 'utf-8'));
  trace.prNumber = prNumber;
  trace.prUrl = 'https://github.com/aveca/sargagame/pull/' + prNumber;
  fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2));
  return true;
}

function linkDeployment(jobId, domain, fingerprint) {
  var traceFile = path.join(TRACE_DIR, jobId + '.json');
  if (!fs.existsSync(traceFile)) return false;
  
  var trace = JSON.parse(fs.readFileSync(traceFile, 'utf-8'));
  trace.deployments = trace.deployments || [];
  trace.deployments.push({
    domain: domain,
    fingerprint: fingerprint,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2));
  return true;
}

function linkVerification(jobId, domain, results) {
  var traceFile = path.join(TRACE_DIR, jobId + '.json');
  if (!fs.existsSync(traceFile)) return false;
  
  var trace = JSON.parse(fs.readFileSync(traceFile, 'utf-8'));
  trace.verifications = trace.verifications || [];
  trace.verifications.push({
    domain: domain,
    timestamp: new Date().toISOString(),
    results: results
  });
  fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2));
  return true;
}

function generateReport(jobId) {
  var trace = getTrace(jobId);
  if (!trace) return null;
  
  var summary = getTraceSummary(jobId);
  var lines = [];
  lines.push('# Job Trace Report: ' + trace.jobId);
  lines.push('');
  lines.push('## Overview');
  lines.push('- **Job ID**: ' + trace.jobId);
  lines.push('- **Task ID**: ' + trace.taskId);
  lines.push('- **Created**: ' + trace.createdAt);
  lines.push('- **Git SHA**: ' + (trace.gitSha || 'unknown'));
  lines.push('- **Branch**: ' + (trace.branch || 'unknown'));
  lines.push('- **Overall Status**: ' + summary.overallStatus);
  lines.push('');
  lines.push('## Steps');
  
  (trace.steps || []).forEach(function(step) {
    var icon = step.status === 'completed' ? 'OK' : (step.status === 'failed' ? 'FAIL' : step.status.toUpperCase());
    lines.push('- **' + step.step + '**: ' + icon + ' (' + step.timestamp + ')');
    if (step.details && Object.keys(step.details).length > 0) {
      lines.push('  - ' + JSON.stringify(step.details));
    }
  });
  
  return lines.join('\n');
}

function main() {
  var args = process.argv.slice(2);
  
  var action = args[0];
  var jobId = args.find(function(a) { return a.startsWith('--job='); })?.split('=')[1];
  var taskId = args.find(function(a) { return a.startsWith('--task='); })?.split('=')[1];
  var step = args.find(function(a) { return a.startsWith('--step='); })?.split('=')[1];
  var status = args.find(function(a) { return a.startsWith('--status='); })?.split('=')[1];
  var prNumber = args.find(function(a) { return a.startsWith('--pr='); })?.split('=')[1];
  var report = args.includes('--report');
  var list = args.includes('--list');
  
  if (action === 'create' && taskId) {
    var jobId = generateJobId(taskId);
    var trace = createTrace(jobId, taskId, {});
    console.log('Created job trace: ' + jobId);
    console.log(JSON.stringify(trace, null, 2));
    return;
  }
  
  if (action === 'start' && jobId && step) {
    var ok = addStep(jobId, step, 'started', {});
    console.log(ok ? 'Step started: ' + step : 'Failed to start step');
    return;
  }
  
  if (action === 'complete' && jobId && step) {
    var ok = addStep(jobId, step, 'completed', {});
    console.log(ok ? 'Step completed: ' + step : 'Failed to complete step');
    return;
  }
  
  if (action === 'fail' && jobId && step) {
    var ok = addStep(jobId, step, 'failed', {});
    console.log(ok ? 'Step failed: ' + step : 'Failed to mark step failed');
    return;
  }
  
  if (action === 'link-pr' && jobId && prNumber) {
    var ok = linkPR(jobId, parseInt(prNumber));
    console.log(ok ? 'Linked PR #' + prNumber : 'Failed to link PR');
    return;
  }
  
  if (action === 'link-deploy' && jobId && args.find(function(a) { return a.startsWith('--domain='); })) {
    var domain = args.find(function(a) { return a.startsWith('--domain='); }).split('=')[1];
    var fingerprint = args.find(function(a) { return a.startsWith('--fingerprint='); })?.split('=')[1] || '';
    var ok = linkDeployment(jobId, domain, fingerprint);
    console.log(ok ? 'Linked deployment for ' + domain : 'Failed to link deployment');
    return;
  }
  
  if (action === 'link-verify' && jobId && args.find(function(a) { return a.startsWith('--domain='); })) {
    var domain = args.find(function(a) { return a.startsWith('--domain='); }).split('=')[1];
    var results = {};
    try {
      var resultsStr = args.find(function(a) { return a.startsWith('--results='); })?.split('=')[1];
      if (resultsStr) results = JSON.parse(resultsStr);
    } catch (e) {}
    var ok = linkVerification(jobId, domain, results);
    console.log(ok ? 'Linked verification for ' + domain : 'Failed to link verification');
    return;
  }
  
  if (action === 'report' && jobId) {
    var reportText = generateReport(jobId);
    if (reportText) {
      console.log(reportText);
    } else {
      console.log('Trace not found: ' + jobId);
    }
    return;
  }
  
  if (list) {
    var traces = listTraces();
    console.log('Available traces:');
    traces.forEach(function(t) {
      var summary = getTraceSummary(t);
      console.log('  ' + t + ' - ' + summary.overallStatus + ' (' + summary.taskId + ')');
    });
    return;
  }
  
  // Help
  console.log('Job Traceability System');
  console.log('=======================');
  console.log('Usage:');
  console.log('  node scripts/autopilot/job-trace.cjs create --task TASK-P1-001');
  console.log('  node scripts/autopilot/job-trace.cjs start --job JOB_ID --step "create-branch"');
  console.log('  node scripts/autopilot/job-trace.cjs complete --job JOB_ID --step "create-branch"');
  console.log('  node scripts/autopilot/job-trace.cjs link-pr --job JOB_ID --pr 42');
  console.log('  node scripts/autopilot/job-trace.cjs link-deploy --job JOB_ID --domain example.com --fingerprint abc123');
  console.log('  node scripts/autopilot/job-trace.cjs link-verify --job JOB_ID --domain example.com --results "{\\"ok\\":true}"');
  console.log('  node scripts/autopilot/job-trace.cjs report --job JOB_ID');
  console.log('  node scripts/autopilot/job-trace.cjs --list');
}

if (require.main === module) {
  main();
}

module.exports = {
  generateJobId,
  createTrace,
  addStep,
  getTrace,
  listTraces,
  getTraceSummary,
  linkPR,
  linkDeployment,
  linkVerification,
  generateReport
};