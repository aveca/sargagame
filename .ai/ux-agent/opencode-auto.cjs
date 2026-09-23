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

main().catch((e) => {
  console.error("[auto] erreur launcher:", e && e.message ? e.message : e);
  process.exit(1);
});
