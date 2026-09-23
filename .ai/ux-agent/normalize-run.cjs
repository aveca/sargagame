#!/usr/bin/env node
/**
 * normalize-run — assemble un run standard du Continuous UX Explorer.
 *
 *   node normalize-run.cjs --run <runDir> --ws <webwrightWorkspace> --viewport <mobile|desktop> \
 *       --findings <findings.json> [--model <model>] [--task <taskId>]
 *
 * Effet : copie les screenshots du workspace webwright dans
 *   <runDir>/screenshots/<viewport>/ et écrit/merge <runDir>/run.json
 * (méta + stats), et copie findings.json si fourni (fusion par id).
 */
"use strict";
const fs = require("fs");
const path = require("path");

function arg(name, fallback = null) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const runDir = arg("run");
const ws = arg("ws");
const viewport = arg("viewport", "unknown");
const findingsPath = arg("findings");
const model = arg("model", "nvidia/moonshotai/kimi-k3");
const taskId = arg("task", "");

if (!runDir || !ws) {
  console.error("usage: normalize-run.cjs --run <dir> --ws <webwright workspace> [--viewport X] [--findings f.json]");
  process.exit(1);
}

const wsAbs = path.resolve(ws);
const shotsSrc = path.join(wsAbs, "screenshots");
const shotsDst = path.join(runDir, "screenshots", viewport);
fs.mkdirSync(shotsDst, { recursive: true });

let copied = 0;
if (fs.existsSync(shotsSrc)) {
  for (const f of fs.readdirSync(shotsSrc)) {
    if (!/\.(png|jpg|jpeg|webp)$/i.test(f)) continue;
    fs.copyFileSync(path.join(shotsSrc, f), path.join(shotsDst, f));
    copied++;
  }
}

// Étapes webwright conservées comme trace rejouable
const stepsSrc = path.join(wsAbs, "steps");
if (fs.existsSync(stepsSrc)) {
  const stepsDst = path.join(runDir, "webwright-steps", viewport);
  fs.mkdirSync(stepsDst, { recursive: true });
  for (const f of fs.readdirSync(stepsSrc)) {
    if (f.endsWith(".py")) fs.copyFileSync(path.join(stepsSrc, f), path.join(stepsDst, f));
  }
}

// Trajectoire (preuve d'exécution LLM)
const trajSrc = path.join(wsAbs, "trajectory.json");
let steps = 0;
if (fs.existsSync(trajSrc)) {
  const t = JSON.parse(fs.readFileSync(trajSrc, "utf8"));
  steps = (t.messages || []).filter((m) => m.role === "assistant").length;
}

// run.json (merge-incrémental par viewport)
const runJsonPath = path.join(runDir, "run.json");
const runJson = fs.existsSync(runJsonPath)
  ? JSON.parse(fs.readFileSync(runJsonPath, "utf8"))
  : {
      schema: "sargagame/ux-run@1",
      base_url: "https://sargasses-martinique.com",
      created_at: new Date().toISOString(),
      mode: "observe-only",
      viewports: {},
    };

runJson.viewports[viewport] = {
  engine: "webwright (local_browser, Chromium headless) — exploration LLM",
  model,
  task_id: taskId,
  workspace: path.relative(process.cwd(), wsAbs),
  llm_steps: steps,
  screenshots: copied,
  finished_at: new Date().toISOString(),
};
fs.writeFileSync(runJsonPath, JSON.stringify(runJson, null, 2));

// findings.json (fusion par id, viewport-taggé)
if (findingsPath) {
  const newFindings = JSON.parse(fs.readFileSync(findingsPath, "utf8"));
  const fPath = path.join(runDir, "findings.json");
  const existing = fs.existsSync(fPath) ? JSON.parse(fs.readFileSync(fPath, "utf8")) : { schema: "sargagame/ux-findings@1", findings: [] };
  const byId = new Map(existing.findings.map((f) => [f.id, f]));
  for (const f of newFindings) byId.set(f.id, f);
  existing.findings = [...byId.values()];
  fs.writeFileSync(fPath, JSON.stringify(existing, null, 2));
  console.log(`[normalize] findings: ${existing.findings.length} (dont ${newFindings.length} nouveaux)`);
}

console.log(`[normalize] ${viewport}: ${copied} screenshots, ${steps} steps LLM -> ${runDir}`);
