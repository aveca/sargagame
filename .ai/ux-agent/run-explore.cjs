#!/usr/bin/env node
/**
 * run-explore — RUN 1 du Continuous UX Explorer.
 *
 * Lance Webwright (mode local_browser, LLM = NVIDIA kimi-k3) sur le parcours
 * funnel de sargasses-martinique.com, pour un viewport donné.
 *
 * Usage:
 *   node .ai/ux-agent/run-explore.cjs --viewport mobile
 *   node .ai/ux-agent/run-explore.cjs --viewport desktop
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const AGENT_DIR = __dirname;
const VIEWPORTS = {
  mobile: { width: 390, height: 844, label: "mobile" },
  desktop: { width: 1440, height: 900, label: "desktop" },
};

const vpArg = (process.argv.find((a) => a.startsWith("--viewport=")) || "").split("=")[1]
  || (process.argv.includes("--viewport") ? process.argv[process.argv.indexOf("--viewport") + 1] : "mobile");
const vp = VIEWPORTS[vpArg];
if (!vp) {
  console.error(`[run-explore] viewport inconnu: ${vpArg} (mobile|desktop)`);
  process.exit(1);
}

const taskRaw = fs.readFileSync(path.join(AGENT_DIR, "task-observe.txt"), "utf8");
const task = taskRaw.split("__VIEWPORT_LABEL__").join(vp.label).split("__VIEWPORT__").join(`${vp.label} (${vp.width}x${vp.height})`);

const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const taskId = `sg-home-${vp.label}`;
const cfgDir = path.join(AGENT_DIR, "webwright-config");

const args = [
  path.join(AGENT_DIR, "webwright-run.cjs"),
  "main",
  "-c", "base.yaml",
  "-c", "local_browser.yaml",
  "-c", path.join(cfgDir, "model_nvidia_kimi.yaml"),
  "-c", path.join(cfgDir, "sargagame_local_browser.yaml"),
  "-c", `environment.browser_width=${vp.width}`,
  "-c", `environment.browser_height=${vp.height}`,
  "-t", task,
  "--start-url", "https://sargasses-martinique.com",
  "--task-id", taskId,
  "-o", path.join(AGENT_DIR, "ws"),
];

console.log(`[run-explore] viewport=${vp.label} task_id=${taskId}`);
const child = spawn(process.execPath, args, { stdio: "inherit" });
child.on("exit", (code) => {
  console.log(`[run-explore] exit=${code}`);
  process.exit(code || 0);
});
