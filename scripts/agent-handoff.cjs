#!/usr/bin/env node
/**
 * agent-handoff.cjs — Script de handoff automatisé entre agents
 * + Sérialisation RELEASE (2026-08-24)
 * 
 * Usage:
 *   node scripts/agent-handoff.cjs                    # Mode interactif
 *   node scripts/agent-handoff.cjs --auto             # Mode auto (pick + claim) — sérialisé
 *   node scripts/agent-handoff.cjs --task TASK-P1-001 # Forcer une tâche — sérialisé
 *   node scripts/agent-handoff.cjs --complete         # Marquer tâche courante done
 *   node scripts/agent-handoff.cjs --status           # Afficher état actuel
 *   node scripts/agent-handoff.cjs --release-check --task TASK-P1-001 --agent coding --scope money
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
let release = null;
try { release = require('./lib/release-serialize.cjs'); } catch (_) {}

const AI_DIR = '.ai';
const TASKS_FILE = path.join(AI_DIR, 'tasks.md');
const STATE_FILE = path.join(AI_DIR, 'current_state.md');
const CHANGELOG_FILE = path.join(AI_DIR, 'changelog.md');
const HANDOFF_TEMPLATE = path.join(AI_DIR, 'handoff-template.md');

const args = process.argv.slice(2);
const AUTO = args.includes('--auto');
const FORCE_TASK = args.find(a => a.startsWith('--task='))?.split('=')[1] || (args.includes('--task') ? args[args.indexOf('--task') + 1] : undefined);
const COMPLETE = args.includes('--complete');
const STATUS = args.includes('--status');
const SHIP = args.includes('--ship');
const RELEASE_CHECK = args.includes('--release-check');

function readFile(p) { return fs.readFileSync(p, 'utf-8'); }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); }
function run(cmd) { return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim(); }
function runSafe(cmd) { try { return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim(); } catch (_) { return ''; } }

function parseTasks(content) {
  const lines = content.split('\n');
  const tasks = [];
  let currentSection = '';
  
  for (const line of lines) {
    if (line.startsWith('## ')) currentSection = line.slice(3).trim();
    
    // Format 1: liste avec checkbox - [ ] TASK-PX-XXX
    let match = line.match(/^-\s*\[([ x~])\]\s*(TASK-P\d-\d{3})\s*(.*)/);
    
    // Format 2: header ### TASK-PX-XXX
    if (!match) {
      match = line.match(/^###\s+(TASK-P\d-\d{3})\s*(.*)/);
      if (match) {
        tasks.push({
          status: ' ',
          id: match[1],
          rest: match[2].trim(),
          section: currentSection
        });
        continue;
      }
    }
    
    // Update status from **Statut** : [x] line for header-format tasks
    const statutMatch = line.match(/\*\*Statut\*\*\s*:\s*\[([ x~])\]/);
    if (statutMatch && tasks.length) {
      tasks[tasks.length - 1].status = statutMatch[1];
    }
    
    if (match) {
      tasks.push({
        status: match[1],
        id: match[2],
        rest: match[3].trim(),
        section: currentSection
      });
    }
  }
  return tasks;
}

function findNextTask(tasks) {
  const priorityOrder = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3 };
  const pending = tasks.filter(t => t.status === ' ' && t.id);
  if (!pending.length) return null;
  
  pending.sort((a, b) => {
    const pa = priorityOrder[a.id.split('-')[1]?.[0]] || 99;
    const pb = priorityOrder[b.id.split('-')[1]?.[0]] || 99;
    return pa - pb;
  });
  
  return pending[0];
}

function getAgentTypeForTask(taskId) {
  const content = readFile(TASKS_FILE);
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.includes(taskId)) {
      const roleMatch = line.match(/Rôle\s*:\s*(\w+)_agent/);
      if (roleMatch) return roleMatch[1];
    }
  }
  const priority = taskId.split('-')[1]?.[0];
  if (priority === '0') return 'coding';
  return 'coding';
}

function getScopeForTask(taskId) {
  // Scope = partie après TASK-PX- (ex: money, docs, infra) déduit du titre ou du fichier
  // Fallback: agentType
  const content = readFile(TASKS_FILE);
  const idx = content.indexOf(taskId);
  if (idx !== -1) {
    const slice = content.slice(idx, idx + 800);
    if (/money|pay|mollie|stripe/i.test(slice)) return 'money';
    if (/infra|deploy|cloudflare|ftp|worker/i.test(slice)) return 'infra';
    if (/doc|handoff|changelog/i.test(slice)) return 'docs';
    if (/security|secret/i.test(slice)) return 'security';
    if (/data|pipeline|erddap|tulum/i.test(slice)) return 'data';
  }
  return getAgentTypeForTask(taskId);
}

function claimTask(taskId, agentType, baseSha) {
  let content = readFile(TASKS_FILE);
  const shaTag = baseSha ? ` @${baseSha.slice(0, 7)} (base:${baseSha.slice(0, 7)})` : '';
  // Format 1: checkbox — - [ ] TASK-PX-XXX
  const cbRegex = new RegExp(`^(- \\[ \\] ${taskId})`, 'm');
  if (cbRegex.test(content)) {
    content = content.replace(cbRegex, `$1 — in_progress by ${agentType}_agent${shaTag}`);
  } else {
    // Format 2: header — ### TASK-PX-XXX ... **Statut** : [ ] pending
    const lines = content.split('\n');
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(taskId)) {
        // Find the **Statut** line within the next 10 lines
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
          if (lines[j].match(/\*\*Statut\*\*\s*:/)) {
            lines[j] = lines[j].replace(
              /\*\*Statut\*\*\s*:\s*\[[ x~]\].*/,
              `**Statut** : [~] in_progress by ${agentType}_agent${shaTag}`
            );
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    content = lines.join('\n');
    if (!found) {
      console.log(`⚠️  Could not find Statut line for ${taskId}, appending after header`);
      content = content.replace(
        new RegExp(`(### ${taskId}[^\n]*\n)`),
        `$1- **Statut** : [~] in_progress by ${agentType}_agent${shaTag}\n`
      );
    }
  }
  writeFile(TASKS_FILE, content);
  run(`git add ${TASKS_FILE}`);
  run(`git commit -m "chore(tasks): claim ${taskId} by ${agentType}_agent @${baseSha ? baseSha.slice(0, 7) : 'unknown'}"`);
  console.log(`✅ Claimed ${taskId} for ${agentType}_agent @${baseSha ? baseSha.slice(0, 7) : '?'}`);
}

function completeTask(taskId, agentType) {
  let content = readFile(TASKS_FILE);
  const today = new Date().toISOString().split('T')[0];
  // Format 1: checkbox — - [~] TASK-PX-XXX ... in_progress by <agent>_agent
  const cbRegex = new RegExp(`^(- \\[~\\] ${taskId} .*in_progress by ${agentType}_agent[^\\n]*)( @[0-9a-f]{7})?( \\(base:[0-9a-f]{7}\\))?`, 'm');
  // Simpler: match the whole in_progress line
  const cbRegex2 = new RegExp(`^(- \\[~\\] ${taskId} .*in_progress by ${agentType}_agent[^\\n]*)`, 'm');
  if (cbRegex2.test(content)) {
    content = content.replace(cbRegex2, `$1 → [x] done by ${agentType}_agent (${today})`);
  } else {
    // Format 2: header — ### TASK-PX-XXX ... **Statut** : [~] in_progress by <agent>_agent
    const lines = content.split('\n');
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(taskId)) {
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
          if (lines[j].match(/\*\*Statut\*\*\s*:/) && lines[j].includes('in_progress')) {
            lines[j] = lines[j].replace(
              /\*\*Statut\*\*\s*:.*in_progress by \w+_agent.*/,
              `**Statut** : [x] done by ${agentType}_agent (${today})`
            );
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    content = lines.join('\n');
    if (!found) {
      console.log(`⚠️  Could not find in_progress Statut for ${taskId}`);
    }
  }
  writeFile(TASKS_FILE, content);
  run(`git add ${TASKS_FILE}`);
  run(`git commit -m "chore(tasks): complete ${taskId} by ${agentType}_agent"`);
  console.log(`✅ Completed ${taskId}`);
  // libérer le verrou workspace si c'était notre tâche
  if (release) {
    try { release.releaseWorkspaceLock(taskId); console.log('🔓 workspace lock libéré'); } catch (_) {}
  }
}

function createBranch(taskId, agentType, baseSha) {
  const branch = `agent/${agentType}/${taskId}`;
  // Toujours partir de origin/main frais (sérialisation)
  if (baseSha) {
    try { run(`git checkout -b ${branch} ${baseSha}`); } catch (_) { run(`git checkout -b ${branch}`); }
  } else {
    try { run(`git fetch origin`); run(`git checkout -b ${branch} origin/main`); } catch (_) { run(`git checkout -b ${branch}`); }
  }
  console.log(`✅ Created branch: ${branch} depuis ${baseSha ? baseSha.slice(0, 7) : 'origin/main'}`);
  return branch;
}

function generateHandoff(taskId, agentType, branch, summary, files, tests, issues, nextActions) {
  const template = readFile(HANDOFF_TEMPLATE);
  const now = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
  
  const handoff = `## ${now} · Agent: ${agentType.charAt(0).toUpperCase() + agentType.slice(1)} Agent (${agentType})

### Travail effectué
- **Résumé 1 ligne** : ${summary}
- **Détails** :
${summary.split('. ').map(s => `  - ${s.trim()}.`).join('\n')}

### Fichiers modifiés
${files.map(f => `- \`${f}\``).join('\n')}

### Tests réalisés
${tests.map(t => `- [x] ${t}`).join('\n')}

### Problèmes restants / Blockers
${issues.map(i => `- [ ] ${i}`).join('\n') || '- [ ] Aucun'}

### Prochaine action recommandée
${nextActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

### Branche / PR
- Branche : \`${branch}\`
- PR : #<à créer>
- Commit head : \`${run('git rev-parse --short HEAD')}\`

---

`;
  
  const stateContent = readFile(STATE_FILE);
  const newState = handoff + stateContent;
  writeFile(STATE_FILE, newState);
  console.log(`✅ Updated ${STATE_FILE}`);
}

function addChangelogEntry(taskId, agentType, summary, files) {
  const now = new Date().toISOString().split('T')[0];
  const entry = `## ${now} — ${agentType}_agent

**${taskId} : ${summary}**

${summary.split('. ').map(s => `- ${s.trim()}.`).join('\n')}

**Fichiers modifiés :**
${files.map(f => `- \`${f}\``).join('\n')}

---

`;
  const content = readFile(CHANGELOG_FILE);
  const newContent = content.replace(/^---$/m, `---\n\n${entry}`);
  writeFile(CHANGELOG_FILE, newContent);
  console.log(`✅ Updated ${CHANGELOG_FILE}`);
}

function showStatus() {
  console.log('\n=== AGENT HANDOFF STATUS (sérialisé) ===\n');
  
  const state = readFile(STATE_FILE);
  const firstEntry = state.split('---')[1]?.trim();
  if (firstEntry) {
    console.log('📋 Dernier handoff :');
    console.log(firstEntry.split('\n').slice(0, 10).join('\n'));
    console.log('...');
  }
  
  const tasks = parseTasks(readFile(TASKS_FILE));
  const pending = tasks.filter(t => t.status === ' ').length;
  const inProgress = tasks.filter(t => t.status === '~').length;
  const done = tasks.filter(t => t.status === 'x').length;
  
  console.log(`\n📊 Tasks: ${pending} pending, ${inProgress} in progress, ${done} done`);
  
  const next = findNextTask(tasks);
  if (next) {
    console.log(`\n🎯 Prochaine tâche: ${next.id} (${next.section})`);
  }
  
  try {
    const gitStatus = run('git status --short');
    if (gitStatus) {
      console.log('\n🔄 Git changes:');
      console.log(gitStatus);
    } else {
      console.log('\n🔄 Git: clean');
    }
    
    const branch = run('git branch --show-current');
    console.log(`\n🌿 Current branch: ${branch}`);
    console.log(`📌 origin/main: ${runSafe('git rev-parse --short origin/main')}`);
    if (release) {
      const wl = release.checkWorkspaceLock();
      console.log(`\n🔒 Workspace lock: ${wl.ok ? 'libre' : wl.reason}`);
      const wt = release.checkWorktreeClean();
      console.log(`🧹 Worktree: ${wt.ok ? 'clean' : wt.reason}`);
      const pr = release.hasActiveAgentPR();
      console.log(`🔀 PR active agent/*: ${pr.has ? `${pr.count} ouverte(s) ${pr.prs.map(p=>p.headRefName).join(', ')}` : 'aucune'}`);
    }
  } catch (e) {
    console.log('\n🔄 Git: not a repo or error');
  }
}

if (STATUS) {
  showStatus();
  process.exit(0);
}

if (RELEASE_CHECK) {
  const task = args.find(a => a.startsWith('--task='))?.split('=')[1] || (args.includes('--task') ? args[args.indexOf('--task') + 1] : undefined);
  const agent = args.find(a => a.startsWith('--agent='))?.split('=')[1] || (args.includes('--agent') ? args[args.indexOf('--agent') + 1] : 'coding');
  const scope = args.find(a => a.startsWith('--scope='))?.split('=')[1] || (args.includes('--scope') ? args[args.indexOf('--scope') + 1] : getScopeForTask(task || 'TASK-P0-001'));
  if (!task) { console.error('usage: --release-check --task TASK-P2-005d --agent coding --scope money'); process.exit(1); }
  if (!release) { console.error('release-serialize lib manquant'); process.exit(1); }
  const r = release.runReleaseGate({ taskId: task, agentType: agent, scope });
  console.log(r.ok ? '✅ RELEASE GATE OK' : `❌ RELEASE GATE BLOQUÉ: ${r.reason}`);
  console.log('Steps:', r.steps.join(' | '));
  process.exit(r.ok ? 0 : 1);
}

if (SHIP) {
  const branch = run('git branch --show-current');
  if (!branch || branch === 'main') {
    console.log('❌ Must be on an agent branch to ship');
    process.exit(1);
  }
  const status = run('git status --short');
  if (status) {
    console.log('❌ Uncommitted changes — commit or stash first');
    process.exit(1);
  }
  // Vérifier que main n'a pas avancé de manière incompatible avant push
  if (release) {
    const baseSha = runSafe('git merge-base HEAD origin/main') || runSafe('git rev-parse origin/main');
    const inc = release.checkIncompatibleAdvance(baseSha);
    if (!inc.ok) {
      console.log(`❌ ${inc.reason}`);
      console.log('👉 Rebase requis: git fetch origin && git rebase origin/main');
      process.exit(1);
    }
  }
  console.log(`🚀 Shipping ${branch}...`);
  try {
    run('git push origin ' + branch);
    console.log(`✅ Pushed to origin/${branch}`);
    // libérer le lock workspace après push
    if (release) {
      const taskFromBranch = branch.split('/').pop();
      try { release.releaseWorkspaceLock(taskFromBranch); } catch (_) {}
    }
    try {
      const pr = run(`gh pr create --title "${branch}" --body "Auto-generated PR from agent handoff" --base main 2>&1`);
      console.log(`✅ PR created: ${pr.match(/https:\/\/[^\s]+/)?.[0] || pr}`);
    } catch (e) {
      console.log(`ℹ️  PR creation: ${e.message.includes('already exists') ? 'PR already exists' : e.message}`);
    }
  } catch (e) {
    console.log(`❌ Push failed: ${e.message}`);
    process.exit(1);
  }
  process.exit(0);
}

if (COMPLETE) {
  const tasks = parseTasks(readFile(TASKS_FILE));
  const inProg = tasks.find(t => t.status === '~');
  if (!inProg) {
    console.log('❌ No task in progress');
    process.exit(1);
  }
  
  const agentType = getAgentTypeForTask(inProg.id);
  completeTask(inProg.id, agentType);
  console.log('✅ Task marked complete. Remember to:');
  console.log('  1. Update .ai/changelog.md');
  console.log('  2. Update .ai/current_state.md with handoff template');
  console.log('  3. Push branch and create PR');
  process.exit(0);
}

if (FORCE_TASK) {
  if (!release) {
    // fallback sans sérialisation
    const agentType = getAgentTypeForTask(FORCE_TASK);
    claimTask(FORCE_TASK, agentType, null);
    createBranch(FORCE_TASK, agentType, null);
    console.log(`\n🚀 Ready to work on ${FORCE_TASK} as ${agentType}_agent`);
    console.log(`Branch: agent/${agentType}/${FORCE_TASK}`);
    process.exit(0);
  }
  // Sérialisé : fetch + gate + lock + base SHA
  const agentType = getAgentTypeForTask(FORCE_TASK);
  const scope = getScopeForTask(FORCE_TASK);
  console.log(`🔒 Sérialisation RELEASE pour ${FORCE_TASK} (${agentType}/${scope})...`);
  const gate = release.runReleaseGate({ taskId: FORCE_TASK, agentType, scope });
  if (!gate.ok) {
    console.log(`❌ Gate bloqué: ${gate.reason}`);
    console.log(`Steps: ${gate.steps.join(' | ')}`);
    if (gate.code === 'ALREADY_MERGED') {
      console.log('ℹ️  Correctif déjà sur main — marquer done et pick suivant');
      // Option: auto-marquer done et sortir
    }
    if (gate.code === 'PR_ACTIVE') {
      console.log('ℹ️  Une PR agent/* est déjà active — attendre son merge puis rebase');
    }
    process.exit(1);
  }
  // Worktree doit être clean avant claim (déjà vérifié dans gate)
  // Acquérir lock workspace
  release.acquireWorkspaceLock({ task: FORCE_TASK, agent: agentType, baseSha: gate.baseSha, mission: `SHIP ${FORCE_TASK}` });
  console.log(`🔒 lock workspace acquis @${gate.baseSha.slice(0, 7)}`);
  claimTask(FORCE_TASK, agentType, gate.baseSha);
  const branch = createBranch(FORCE_TASK, agentType, gate.baseSha);
  console.log(`\n🚀 Ready to work on ${FORCE_TASK} as ${agentType}_agent @${gate.baseSha.slice(0, 7)}`);
  console.log(`Branch: ${branch}`);
  console.log(`Base SHA: ${gate.baseSha}`);
  console.log(`\nRappels sérialisation:`);
  console.log(`  - Un seul worktree modifié à la fois (lock 90 min)`);
  console.log(`  - Vérifier avant push: node scripts/lib/release-serialize.cjs --check --task ${FORCE_TASK} --agent ${agentType}`);
  console.log(`  - Si main avance: git fetch origin && git rebase origin/main (ou abort si incompatible)`);
  process.exit(0);
}

if (AUTO) {
  if (!release) {
    // fallback ancien
    const tasks = parseTasks(readFile(TASKS_FILE));
    const next = findNextTask(tasks);
    if (!next) { console.log('✅ No pending tasks!'); process.exit(0); }
    const agentType = getAgentTypeForTask(next.id);
    claimTask(next.id, agentType, null);
    const branch = createBranch(next.id, agentType, null);
    console.log(`\n🚀 Auto-picked: ${next.id} for ${agentType}_agent`);
    console.log(`Branch: ${branch}`);
    process.exit(0);
  }
  // Sérialisé : itérer sur les tâches pending jusqu'à trouver une qui passe le gate
  console.log('🔒 Sérialisation RELEASE — fetch + scan des tâches...');
  let gateRes = null;
  let picked = null;
  try { gateRes = release.fetchOrigin(); console.log(`✅ fetch origin/main → ${gateRes.slice(0, 7)}`); } catch (e) { console.error(`❌ fetch échoué: ${e.message}`); process.exit(1); }
  const tasks = parseTasks(readFile(TASKS_FILE));
  const pending = tasks.filter(t => t.status === ' ' && t.id);
  const priorityOrder = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3 };
  pending.sort((a, b) => {
    const pa = priorityOrder[a.id.split('-')[1]?.[0]] || 99;
    const pb = priorityOrder[b.id.split('-')[1]?.[0]] || 99;
    return pa - pb;
  });
  for (const cand of pending) {
    const agentType = getAgentTypeForTask(cand.id);
    const scope = getScopeForTask(cand.id);
    const gate = release.runReleaseGate({ taskId: cand.id, agentType, scope });
    console.log(`\n🔍 ${cand.id} (${agentType}/${scope}): ${gate.ok ? '✅ GATE OK' : `❌ ${gate.reason}`}`);
    if (gate.ok) { picked = cand; gateRes = gate; break; }
    if (gate.code === 'ALREADY_MERGED') {
      console.log(`   → déjà mergé, on marque done et on continue`);
      // On pourrait auto-marquer done, mais on se contente de skip
      continue;
    }
    if (gate.code === 'PR_ACTIVE') {
      console.log(`   → PR active bloque tout nouveau claim (sérialisation globale)`);
      break;
    }
  }
  if (!picked) {
    console.log('\n✅ Aucune tâche pickable (toutes bloquées par gate sérialisé ou déjà mergées)');
    console.log('ℹ️  Attendre merge de la PR active puis re-lancer avec fetch');
    process.exit(0);
  }
  const agentType = getAgentTypeForTask(picked.id);
  const scope = getScopeForTask(picked.id);
  // Acquérir lock
  release.acquireWorkspaceLock({ task: picked.id, agent: agentType, baseSha: gateRes.baseSha, mission: `SHIP ${picked.id}` });
  console.log(`\n🔒 lock workspace acquis pour ${picked.id} @${gateRes.baseSha.slice(0, 7)}`);
  claimTask(picked.id, agentType, gateRes.baseSha);
  const branch = createBranch(picked.id, agentType, gateRes.baseSha);
  
  console.log(`\n🚀 Auto-picked (sérialisé): ${picked.id} for ${agentType}_agent @${gateRes.baseSha.slice(0, 7)}`);
  console.log(`Branch: ${branch}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Work on the task (un seul worktree)`);
  console.log(`  2. Gate: npm run build && node scripts/check-bundle-budget.cjs && node scripts/ux-smoke.mjs`);
  console.log(`  3. Avant push, vérifier incompatibilité: node scripts/lib/release-serialize.cjs --check --task ${picked.id} --agent ${agentType}`);
  console.log(`  4. Run: node scripts/agent-handoff.cjs --complete`);
  console.log(`  5. Push + PR (auto-merge if CI green) — après merge, les autres agents feront fetch + rebase`);
  process.exit(0);
}

console.log('\n🤖 Agent Handoff CLI (sérialisé RELEASE)');
console.log('==========================================\n');

showStatus();

const tasks = parseTasks(readFile(TASKS_FILE));
const next = findNextTask(tasks);

if (next) {
  console.log(`\n🎯 Suggested: ${next.id} (${next.section})`);
  const agentType = getAgentTypeForTask(next.id);
  console.log(`   Agent: ${agentType}_agent`);
  console.log(`   Run: node scripts/agent-handoff.cjs --auto  (sérialisé: fetch + gate + lock)`);
  console.log(`   Or:  node scripts/agent-handoff.cjs --task ${next.id}  (sérialisé)`);
} else {
  console.log('\n✅ All tasks completed!');
}

console.log('\nCommands:');
console.log('  --auto           Pick and claim next task automatiquement (sérialisé)');
console.log('  --task TASK-ID   Force claim a specific task (sérialisé)');
console.log('  --complete       Mark current in-progress task as done (libère lock)');
console.log('  --ship           Push branch + create PR (vérifie incompatibilité main)');
console.log('  --status         Show current status (avec gate sérialisé)');
console.log('  --release-check --task TASK --agent coding --scope money  Gate sérialisé dry-run');
