#!/usr/bin/env node
/**
 * webwright-run — launcher Webwright (venv locale) pour Sargagame.
 *
 * - Injecte la clé NVIDIA (lue depuis opencode auth.json) comme OPENROUTER_API_KEY
 *   pour le backend `openrouter` pointé sur NVIDIA NIM. Jamais affichée.
 * - Pointe Playwright (python) vers .ai/ux-agent/.cache/ms-playwright.
 * - Forward tous les args à webwright.exe.
 *
 * Usage:
 *   node .ai/ux-agent/webwright-run.cjs main -c base.yaml -c ... -t "..." --task-id x -o <dir>
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const AGENT_DIR = __dirname;
const VENV_SCRIPTS = path.join(AGENT_DIR, ".venv", "Scripts");
const WEBWRIGHT = path.join(VENV_SCRIPTS, "webwright.exe");
const BROWSERS = path.join(AGENT_DIR, ".cache", "ms-playwright");

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

const key = getNvidiaKey();
if (!key) {
  console.error("[webwright-run] Clé NVIDIA introuvable dans opencode auth.json. Abandon.");
  process.exit(1);
}
if (!fs.existsSync(WEBWRIGHT)) {
  console.error(`[webwright-run] webwright.exe introuvable: ${WEBWRIGHT}`);
  process.exit(1);
}

const env = {
  ...process.env,
  OPENROUTER_API_KEY: key,
  PLAYWRIGHT_BROWSERS_PATH: BROWSERS,
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
  PATH: VENV_SCRIPTS + path.delimiter + process.env.PATH,
};

const child = spawn(WEBWRIGHT, process.argv.slice(2), { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code || 0));
