import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CostLedger } from './.ai/runtime/model-router/persistence.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-sigkill-'));
const ledgerFile = path.join(tmpDir, 'cost.jsonl');
const childScript = path.join(tmpDir, 'child.mjs');
const persistencePath = path.resolve('.ai/runtime/model-router/persistence.js');
fs.writeFileSync(childScript, `
  import { CostLedger } from ${JSON.stringify(persistencePath)};
  const l = new CostLedger({ ledgerFile: ${JSON.stringify(ledgerFile)}, dailyBudget: 50, hourlyBudget: 10 });
  l.record('nemotron', 1000, 500, 0.005);
  l.record('glm', 800, 200, 0.003);
  l.record('qwen-7b', 500, 100, 0.002);
  // NO flush — process will be SIGKILLed
  setTimeout(() => {}, 60000);
`);
console.log('spawning child...');
const child = spawn('node', [childScript], { cwd: process.cwd(), stdio: 'ignore' });
child.on('spawn', () => {
  console.log('child spawned, waiting 500ms then SIGKILL...');
  setTimeout(() => {
    try { process.kill(child.pid, 'SIGKILL'); } catch (e) { console.error('kill failed:', e.message); }
  }, 500);
});
child.on('exit', () => {
  console.log('child exited');
  const content = fs.existsSync(ledgerFile) ? fs.readFileSync(ledgerFile, 'utf8') : '';
  console.log('ledger content length:', content.length);
  console.log('PASS:', content === '');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});