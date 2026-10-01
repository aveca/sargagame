#!/usr/bin/env node
/**
 * opencode-auto — auto-routeur LOCAL ONLY pour OpenCode.
 *
 * Utilise UNIQUEMENT Ollama local (qwen2.5-coder:14b).
 * Aucun provider cloud (NVIDIA, etc.) — zéro dépendance externe.
 * Health-check minimal d'Ollama (1 requête, timeout court).
 * Puis lance `opencode -m <modèle> <args utilisateur>`.
 *
 * Simulation de panne (test uniquement) : OC_AUTO_SKIP=ollama
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const OLLAMA_MODEL = "qwen2.5-coder:14b";
const OLLAMA_URL = "http://localhost:11434/api/tags";
const TIMEOUT_MS = 10000;

const skip = new Set(
  (process.env.OC_AUTO_SKIP || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
);

function checkOllama() {
  return new Promise((resolve) => {
    const req = http.get(OLLAMA_URL, { timeout: 5000 }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try {
          const models = (JSON.parse(d).models || []).map((m) => m.name);
          const ok = models.includes(OLLAMA_MODEL);
          if (!ok) {
            console.log(`[auto] ollama → MODEL MISSING (${OLLAMA_MODEL} not in ${models.join(", ")})`);
          }
          resolve({ ok, status: res.statusCode, models });
        } catch {
          resolve({ ok: false, status: "bad_json" });
        }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: "timeout" }); });
    req.on("error", (e) => resolve({ ok: false, status: e.code || "conn_fail" }));
  });
}

function loadModelMetrics() {
  const metricsPath = require('path').join(__dirname, '..', '..', 'autopilot', 'model-metrics.json');
  try {
    const data = fs.readFileSync(metricsPath, 'utf8');
    const metrics = JSON.parse(data);
    return Array.isArray(metrics) ? metrics : [];
  } catch (err) {
    return [];
  }
}

function classifyTaskType(userArgs) {
  if (!userArgs || userArgs.length === 0) return 'etc';
  
  const argsString = userArgs.join(' ').toLowerCase();
  const firstWord = userArgs[0].toLowerCase();
  
  const taskPatterns = {
    coding: ['write', 'create', 'implement', 'add', 'build', 'make', 'function', 'class'],
    debugging: ['fix', 'debug', 'error', 'bug', 'issue', 'problem', 'fail', 'broken'],
    analysis: ['analyze', 'review', 'check', 'inspect', 'examine', 'audit', 'assess'],
    refactoring: ['refactor', 'restructure', 'reorganize', 'clean', 'simplify', 'optimize'],
    testing: ['test', 'spec', 'unit', 'integration', 'e2e', 'jest', 'mocha', 'vitest'],
    documentation: ['doc', 'document', 'readme', 'comment', 'explain', 'tutorial'],
    planning: ['plan', 'design', 'architecture', 'structure', 'outline', 'specify']
  };
  
  const firstWordPatterns = {
    coding: ['write', 'create', 'implement', 'add', 'build', 'make'],
    debugging: ['fix', 'debug'],
    analysis: ['analyze', 'review', 'check', 'inspect', 'examine', 'audit', 'assess'],
    refactoring: ['refactor', 'restructure', 'reorganize'],
    testing: ['test'],
    documentation: ['doc', 'document'],
    planning: ['plan', 'design']
  };
  
  for (const [type, patterns] of Object.entries(firstWordPatterns)) {
    if (patterns.includes(firstWord)) {
      return type;
    }
  }
  
  const scores = {};
  for (const [type, patterns] of Object.entries(taskPatterns)) {
    let score = 0;
    for (const pattern of patterns) {
      if (argsString.includes(pattern)) {
        score++;
      }
    }
    scores[type] = score;
  }
  
  let bestType = 'etc';
  let maxScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestType = type;
    }
  }
  
  return maxScore > 0 ? bestType : 'etc';
}

function calculateBackendScore(backendId, taskType, metrics) {
  const relevantMetrics = metrics.filter(
    m => m.backendId === backendId && m.taskType === taskType
  );
  
  if (relevantMetrics.length === 0) {
    return 0.5;
  }
  
  const avgSuccessRate = relevantMetrics.reduce((sum, m) => sum + (m.successRate || 0), 0) / relevantMetrics.length;
  const avgLatency = relevantMetrics.reduce((sum, m) => sum + (m.latencyMs || 0), 0) / relevantMetrics.length;
  
  const normalizedLatency = Math.max(0, Math.min(1, 1 - (avgLatency - 1000) / 4000));
  
  return 0.7 * avgSuccessRate + 0.3 * normalizedLatency;
}

function sortBackendsByTaskType(backends, taskType, metrics) {
  return [...backends].sort((a, b) => {
    const scoreA = calculateBackendScore(a.id, taskType, metrics);
    const scoreB = calculateBackendScore(b.id, taskType, metrics);
    return scoreB - scoreA;
  });
}

async function main() {
  const userArgs = process.argv.slice(2);
  
  if (skip.has("ollama")) { 
    console.log(`[auto] ollama → SKIP (simulation OC_AUTO_SKIP)`); 
    process.exit(1); 
  }

  const t0 = Date.now();
  const r = await checkOllama();
  const ms = Date.now() - t0;
  
  if (r.ok) {
    console.log(`[auto] ollama → OK (${ms} ms, status ${r.status}) → ${OLLAMA_MODEL}`);
  } else {
    console.error(`[auto] ollama → FAIL (${r.status}, ${ms} ms)`);
    console.error("[auto] AUCUN backend local disponible. Abandon (Ollama requis).");
    process.exit(1);
  }

  const child = spawn("cmd.exe", ["/c", "opencode", "-m", "ollama/" + OLLAMA_MODEL, ...userArgs], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code || 0));
}

if (require.main === module) {
  main().catch((e) => {
    console.error("[auto] erreur launcher:", e && e.message ? e.message : e);
    process.exit(1);
  });
}

if (process.env.TEST_MODE) {
  module.exports = {
    loadModelMetrics,
    classifyTaskType,
    calculateBackendScore,
    sortBackendsByTaskType
  };
}