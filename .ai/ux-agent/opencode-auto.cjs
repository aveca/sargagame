#!/usr/bin/env node
/**
 * opencode-auto — auto-routeur multi-modèles pour OpenCode.
 *
 * Health-check minimal de chaque backend (1 requête, max_tokens=1, timeout court),
 * puis lance `opencode -m <modèle> <args utilisateur>` avec le premier backend OK.
 *
 * Ordre : Kimi K3 → DeepSeek V4 flash-0731 → Nemotron 3 Super → Ollama local.
 * Indisponible = 401/402/403/408/410/429/5xx/timeout/connexion refusée.
 * Aucun credential affiché. Aucun contenu utilisateur envoyé pendant le check.
 *
 * Simulation de panne (test uniquement) : OC_AUTO_SKIP=kimi,deepseek,nemotron
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const http = require("http");

const BACKENDS = [
  { id: "kimi", model: "nvidia/moonshotai/kimi-k3", kind: "nvidia" },
  { id: "deepseek", model: "nvidia/deepseek-ai/deepseek-v4-flash-0731", kind: "nvidia" },
  { id: "nemotron", model: "nvidia/nvidia/nemotron-3-super-120b-a12b", kind: "nvidia" },
  { id: "ollama", model: "ollama/qwen2.5-coder:14b", kind: "ollama" },
];

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// NVIDIA cold-start observé jusqu'à ~120s (modèle chaud ≈ 3-5s). Timeout haut
// volontaire : une requête à 1 token coûte ~1 token même si elle attend.
const TIMEOUT_MS = 150000;

const skip = new Set(
  (process.env.OC_AUTO_SKIP || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
);

function getNvidiaKey() {
  const p = path.join(os.homedir(), ".local/share/opencode/auth.json");
  try {
    const auth = JSON.parse(fs.readFileSync(p, "utf8"));
    const k = auth && auth.nvidia && (auth.nvidia.key || auth.nvidia.apiKey);
    return typeof k === "string" && k.length > 8 ? k : null;
  } catch {
    return null;
  }
}

function checkNvidia(model, key) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: "user", content: "ok" }],
      max_tokens: 1,
      stream: false,
    });
    const req = https.request(
      NVIDIA_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        res.resume(); // jamais lire le corps : requête strictement minimale
        res.on("end", () =>
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode })
        );
      }
    );
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: "timeout" }); });
    req.on("error", (e) => resolve({ ok: false, status: e.code || "conn_fail" }));
    req.end(body);
  });
}

function checkOllama() {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:11434/api/tags", { timeout: 5000 }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try {
          const models = (JSON.parse(d).models || []).map((m) => m.name);
          resolve({ ok: models.includes("qwen2.5-coder:14b"), status: res.statusCode });
        } catch {
          resolve({ ok: false, status: "bad_json" });
        }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: "timeout" }); });
    req.on("error", (e) => resolve({ ok: false, status: e.code || "conn_fail" }));
  });
}

/**
 * Charge les métriques des modèles depuis .ai/autopilot/model-metrics.json
 * @returns {Array<{backendId:string, taskType:string, successRate:number, latencyMs:number, lastUpdated:string}>}
 */
function loadModelMetrics() {
  const metricsPath = require('path').join(__dirname, '..', '..', 'autopilot', 'model-metrics.json');
  try {
    const data = fs.readFileSync(metricsPath, 'utf8');
    const metrics = JSON.parse(data);
    // Assurez-vous que c'est un tableau
    return Array.isArray(metrics) ? metrics : [];
  } catch (err) {
    // Si le fichier n'existe pas ou est invalide, retournez un tableau vide
    return [];
  }
}

/**
 * Classe le type de tâche basé sur les arguments utilisateur
 * @param {string[]} userArgs - Les arguments passés à opencode
 * @returns {string} - Type de tâche (ex: 'coding', 'debugging', 'analysis', 'etc')
 */
function classifyTaskType(userArgs) {
  if (!userArgs || userArgs.length === 0) return 'etc';
  
  // Joindre les arguments en une seule chaîne pour l'analyse
  const argsString = userArgs.join(' ').toLowerCase();
  const firstWord = userArgs[0].toLowerCase();
  
  // Mots-clés pour différents types de tâches
  const taskPatterns = {
    coding: ['write', 'create', 'implement', 'add', 'build', 'make', 'function', 'class'],
    debugging: ['fix', 'debug', 'error', 'bug', 'issue', 'problem', 'fail', 'broken'],
    analysis: ['analyze', 'review', 'check', 'inspect', 'examine', 'audit', 'assess'],
    refactoring: ['refactor', 'restructure', 'reorganize', 'clean', 'simplify', 'optimize'],
    testing: ['test', 'spec', 'unit', 'integration', 'e2e', 'jest', 'mocha', 'vitest'],
    documentation: ['doc', 'document', 'readme', 'comment', 'explain', 'tutorial'],
    planning: ['plan', 'design', 'architecture', 'structure', 'outline', 'specify']
  };
  
  // Priorité au premier mot (verbe principal)
  const firstWordPatterns = {
    coding: ['write', 'create', 'implement', 'add', 'build', 'make'],
    debugging: ['fix', 'debug'],
    analysis: ['analyze', 'review', 'check', 'inspect', 'examine', 'audit', 'assess'],
    refactoring: ['refactor', 'restructure', 'reorganize'],
    testing: ['test'],
    documentation: ['doc', 'document'],
    planning: ['plan', 'design']
  };
  
  // Vérifier le premier mot en priorité
  for (const [type, patterns] of Object.entries(firstWordPatterns)) {
    if (patterns.includes(firstWord)) {
      return type;
    }
  }
  
  // Sinon, compter les correspondances dans toute la chaîne
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
  
  // Trouver le type avec le score le plus élevé
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

/**
 * Calcule un score pour un backend donné basé sur les métriques pour un type de tâche
 * @param {string} backendId - L'identifiant du backend
 * @param {string} taskType - Le type de tâche
 * @param {Array} metrics - Le tableau de métriques chargé
 * @returns {number} - Score entre 0 et 1 (plus élevé est meilleur)
 */
function calculateBackendScore(backendId, taskType, metrics) {
  // Filtrer les métriques pour ce backend et ce type de tâche
  const relevantMetrics = metrics.filter(
    m => m.backendId === backendId && m.taskType === taskType
  );
  
  // Si aucune métrique spécifique, retourner un score neutre
  if (relevantMetrics.length === 0) {
    return 0.5; // Score neutre
  }
  
  // Calculer la moyenne des métriques
  const avgSuccessRate = relevantMetrics.reduce((sum, m) => sum + (m.successRate || 0), 0) / relevantMetrics.length;
  const avgLatency = relevantMetrics.reduce((sum, m) => sum + (m.latencyMs || 0), 0) / relevantMetrics.length;
  
  // Normaliser la latence : on suppose qu'une latence inférieure à 1000ms est bonne, au-delà de 5000ms est mauvaise
  const normalizedLatency = Math.max(0, Math.min(1, 1 - (avgLatency - 1000) / 4000));
  
  // Combiner le taux de succès et la latence (on peut ajuster les poids)
  // 70% taux de succès, 30% latence inverse
  return 0.7 * avgSuccessRate + 0.3 * normalizedLatency;
}

/**
 * Trie les backends par score pour un type de tâche donné
 * @param {Array} backends - Le tableau de backends
 * @param {string} taskType - Le type de tâche
 * @param {Array} metrics - Le tableau de métriques chargé
 * @returns {Array} - Nouvel tableau de backends trié par score décroissant
 */
function sortBackendsByTaskType(backends, taskType, metrics) {
  // Retourner une copie triée du tableau de backends
  return [...backends].sort((a, b) => {
    const scoreA = calculateBackendScore(a.id, taskType, metrics);
    const scoreB = calculateBackendScore(b.id, taskType, metrics);
    // Trier par ordre décroissant (meilleur score en premier)
    return scoreB - scoreA;
  });
}
async function main() {
  const userArgs = process.argv.slice(2);
  const nvidiaKey = getNvidiaKey();
  let chosen = null;

  for (const b of BACKENDS) {
    if (skip.has(b.id)) { console.log(`[auto] ${b.id} → SKIP (simulation OC_AUTO_SKIP)`); continue; }
    if (b.kind === "nvidia" && !nvidiaKey) {
      console.log(`[auto] ${b.id} → FAIL (clé NVIDIA absente)`);
      continue;
    }
    const t0 = Date.now();
    const r = b.kind === "nvidia" ? await checkNvidia(b.model.replace(/^nvidia\//, ""), nvidiaKey) : await checkOllama();
    const ms = Date.now() - t0;
    if (r.ok) {
      console.log(`[auto] ${b.id} → OK (${ms} ms, status ${r.status}) → ${b.model}`);
      chosen = b;
      break;
    }
    console.log(`[auto] ${b.id} → FAIL (${r.status}, ${ms} ms)`);
  }

  if (!chosen) {
    console.error("[auto] AUCUN backend disponible. Abandon (pas de lancement sans modèle vérifié).");
    process.exit(1);
  }

  const child = spawn("cmd.exe", ["/c", "opencode", "-m", chosen.model, ...userArgs], {
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
