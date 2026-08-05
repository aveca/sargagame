#!/usr/bin/env node
/**
 * agent-handoff.cjs — Script de handoff automatisé entre agents
 * 
 * Usage:
 *   node scripts/agent-handoff.cjs                    # Mode interactif
 *   node scripts/agent-handoff.cjs --auto             # Mode auto (pick + claim)
 *   node scripts/agent-handoff.cjs --task TASK-P1-001 # Forcer une tâche
 *   node scripts/agent-handoff.cjs --complete         # Marquer tâche courante done
 *   node scripts/agent-handoff.cjs --status           # Afficher état actuel
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AI_DIR = '.ai';
const TASKS_FILE = path.join(AI_DIR, 'tasks.md');
const STATE_FILE = path.join(AI_DIR, 'current_state.md');
const CHANGELOG_FILE = path.join(AI_DIR, 'changelog.md');
const HANDOFF_TEMPLATE = path.join(AI_DIR, 'handoff-template.md');

const args = process.argv.slice(2);
const AUTO = args.includes('--auto');
const FORCE_TASK = args.find(a => a.startsWith('--task='))?.split('=')[1] || args[args.indexOf('--task') + 1];
const COMPLETE = args.includes('--complete');
const STATUS = args.includes('--status');

function readFile(p) { return fs.readFileSync(p, 'utf-8'); }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); }
function run(cmd) { return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim(); }

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
        // Chercher le statut dans les lignes suivantes
        tasks.push({
          status: ' ',
          id: match[1],
          rest: match[2].trim(),
          section: currentSection
        });
        continue;
      }
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

function claimTask(taskId, agentType) {
  let content = readFile(TASKS_FILE);
  content = content.replace(
    new RegExp(`^(- \\[ \\] ${taskId})`, 'm'),
    `$1 — in_progress by ${agentType}_agent`
  );
  writeFile(TASKS_FILE, content);
  run(`git add ${TASKS_FILE}`);
  run(`git commit -m "chore(tasks): claim ${taskId} by ${agentType}_agent"`);
  console.log(`✅ Claimed ${taskId} for ${agentType}_agent`);
}

function completeTask(taskId, agentType) {
  let content = readFile(TASKS_FILE);
  content = content.replace(
    new RegExp(`^(- \\[~\\] ${taskId} .*in_progress by ${agentType}_agent)`, 'm'),
    `$1 → [x] done by ${agentType}_agent (${new Date().toISOString().split('T')[0]})`
  );
  writeFile(TASKS_FILE, content);
  run(`git add ${TASKS_FILE}`);
  run(`git commit -m "chore(tasks): complete ${taskId} by ${agentType}_agent"`);
  console.log(`✅ Completed ${taskId}`);
}

function createBranch(taskId, agentType) {
  const branch = `agent/${agentType}/${taskId}`;
  run(`git checkout -b ${branch}`);
  console.log(`✅ Created branch: ${branch}`);
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
  console.log('\n=== AGENT HANDOFF STATUS ===\n');
  
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
  } catch (e) {
    console.log('\n🔄 Git: not a repo or error');
  }
}

if (STATUS) {
  showStatus();
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
  const agentType = getAgentTypeForTask(FORCE_TASK);
  claimTask(FORCE_TASK, agentType);
  createBranch(FORCE_TASK, agentType);
  console.log(`\n🚀 Ready to work on ${FORCE_TASK} as ${agentType}_agent`);
  console.log(`Branch: agent/${agentType}/${FORCE_TASK}`);
  process.exit(0);
}

if (AUTO) {
  const tasks = parseTasks(readFile(TASKS_FILE));
  const next = findNextTask(tasks);
  
  if (!next) {
    console.log('✅ No pending tasks!');
    process.exit(0);
  }
  
  const agentType = getAgentTypeForTask(next.id);
  claimTask(next.id, agentType);
  const branch = createBranch(next.id, agentType);
  
  console.log(`\n🚀 Auto-picked: ${next.id} for ${agentType}_agent`);
  console.log(`Branch: ${branch}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Work on the task`);
  console.log(`  2. Run Gate de ship: npm run build && node scripts/check-bundle-budget.cjs && node scripts/ux-smoke.mjs`);
  console.log(`  3. Run: node scripts/agent-handoff.cjs --complete`);
  console.log(`  4. Push + PR (auto-merge if CI green)`);
  process.exit(0);
}

console.log('\n🤖 Agent Handoff CLI');
console.log('====================\n');

showStatus();

const tasks = parseTasks(readFile(TASKS_FILE));
const next = findNextTask(tasks);

if (next) {
  console.log(`\n🎯 Suggested: ${next.id} (${next.section})`);
  const agentType = getAgentTypeForTask(next.id);
  console.log(`   Agent: ${agentType}_agent`);
  console.log(`   Run: node scripts/agent-handoff.cjs --auto`);
  console.log(`   Or:  node scripts/agent-handoff.cjs --task ${next.id}`);
} else {
  console.log('\n✅ All tasks completed!');
}

console.log('\nCommands:');
console.log('  --auto           Pick and claim next task automatically');
console.log('  --task TASK-ID   Force claim a specific task');
console.log('  --complete       Mark current in-progress task as done');
console.log('  --status         Show current status');