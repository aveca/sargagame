/**
 * Agent Handoff Task Claiming Tests
 * Tests the task claiming logic against the actual .ai/tasks.md format
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TASKS_FILE = path.join(__dirname, '..', '..', '.ai', 'tasks.md');

function readTasks() {
  return fs.readFileSync(TASKS_FILE, 'utf-8');
}

function parseTasks(content) {
  const sections = content.split(/(^### TASK-P\d-\d{3}(?:\s|$))/m);
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const candidates = [];

  for (let i = 1; i < sections.length; i += 2) {
    const taskHeader = sections[i];
    const taskContent = sections[i + 1] || '';
    const taskId = taskHeader.trim().replace('### ', '');

    const statusMatch = taskContent.match(/^-\s*\*\*Statut\*\*\s*:\s*\[([ x~])\]\s*(.+)$/m);
    if (!statusMatch) {
      continue;
    }

    const status = statusMatch[1];
    if (status === ' ') {
      const roleMatch = taskContent.match(/\*\*R[oô]le\*\*\s*:\s*(\w+)/);
      const role = roleMatch ? roleMatch[1] : 'coding';
      const priority = priorityOrder[taskId.split('-')[1]?.[0]] || 99;
      candidates.push({ priority, taskId, role });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.priority - b.priority || a.taskId.localeCompare(b.taskId));
  return candidates[0];
}

function claimTask(content, taskId, agentType) {
  // Find the task section
  const taskSectionPattern = new RegExp(`(^### ${taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$).*?)(?=^### TASK-P|\\Z)`, 'ms');
  const taskMatch = content.match(taskSectionPattern);
  if (!taskMatch) throw new Error(`Task ${taskId} not found`);

  const taskContent = taskMatch[1];
  const statusPattern = /^-\s*\*\*Statut\*\*\s*:\s*\[([ x~])\]\s*(.+)$/m;
  const statusMatch = taskContent.match(statusPattern);
  if (!statusMatch) throw new Error(`Status line not found in task ${taskId}`);

  const statusChar = statusMatch[1];
  if (statusChar !== ' ') {
    throw new Error(`Task ${taskId} already claimed (status: ${statusChar})`);
  }

  const fullStatusLine = statusMatch[0];
  const newStatus = fullStatusLine.replace(`- **Statut** : [${statusChar}]`, `- **Statut** : [~] ${taskId} — in_progress by ${agentType}_agent`);

  const newContent = content.slice(0, taskMatch.index + statusMatch.index) + 
                     newStatus + 
                     content.slice(taskMatch.index + statusMatch.index + statusMatch[0].length);
  
  return newContent;
}

function runTests() {
  const content = readTasks();
  
  console.log('=== Agent Handoff Task Claiming Tests ===\n');
  
  let passed = 0;
  let failed = 0;

  // Test 1: Parse tasks and find next available
  console.log('Test 1: Parse tasks and pick next available');
  try {
    const nextTask = parseTasks(content);
    if (nextTask && nextTask.taskId === 'TASK-P0-001') {
      console.log('  ✓ PASS: Next task is TASK-P0-001 (P0 priority)');
      passed++;
    } else {
      console.log('  ✗ FAIL: Expected TASK-P0-001, got', nextTask?.taskId);
      failed++;
    }
  } catch (e) {
    console.log('  ✗ FAIL:', e.message);
    failed++;
  }

  // Test 2: Claim TASK-P0-001
  console.log('Test 2: Claim TASK-P0-001');
  try {
    const newContent = claimTask(content, 'TASK-P0-001', 'coding');
    // Verify the status was updated
    if (newContent.includes('- **Statut** : [~] TASK-P0-001')) {
      console.log('  ✓ PASS: Status updated to in_progress');
      passed++;
    } else {
      console.log('  ✗ FAIL: Status not updated correctly');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ FAIL:', e.message);
    failed++;
  }

  // Test 3: Claim already claimed task should fail
  console.log('Test 3: Claim already claimed task should fail');
  try {
    // First claim it
    let newContent = claimTask(content, 'TASK-P0-001', 'coding');
    // Try to claim again
    claimTask(newContent, 'TASK-P0-001', 'qa');
    console.log('  ✗ FAIL: Should have thrown for already claimed task');
    failed++;
  } catch (e) {
    if (e.message.includes('already claimed')) {
      console.log('  ✓ PASS: Correctly rejects already claimed task');
      passed++;
    } else {
      console.log('  ✗ FAIL: Wrong error:', e.message);
      failed++;
    }
  }

  // Test 4: Claim non-existent task should fail
  console.log('Test 4: Claim non-existent task should fail');
  try {
    claimTask(content, 'TASK-P9-999', 'coding');
    console.log('  ✗ FAIL: Should have thrown for non-existent task');
    failed++;
  } catch (e) {
    if (e.message.includes('not found')) {
      console.log('  ✓ PASS: Correctly rejects non-existent task');
      passed++;
    } else {
      console.log('  ✗ FAIL: Wrong error:', e.message);
      failed++;
    }
  }

  // Test 5: Priority ordering (P0 before P1 before P2)
  console.log('Test 5: Priority ordering');
  try {
    const nextTask = parseTasks(content);
    if (nextTask && nextTask.taskId.startsWith('TASK-P0')) {
      console.log('  ✓ PASS: P0 task selected first');
      passed++;
    } else {
      console.log('  ✗ FAIL: Expected P0 task, got', nextTask?.taskId);
      failed++;
    }
  } catch (e) {
    console.log('  ✗ FAIL:', e.message);
    failed++;
  }

  // Test 6: Malformed task (missing status) should be skipped
  console.log('Test 6: Malformed task without status line should be skipped');
  try {
    const testContent = content + '\n\n### TASK-P9-001\nNo status line here\n';
    const nextTask = parseTasks(testContent);
    // Should still pick the original valid P0 task
    if (nextTask && nextTask.taskId === 'TASK-P0-001') {
      console.log('  ✓ PASS: Malformed task skipped, valid P0 task picked');
      passed++;
    } else {
      console.log('  ✗ FAIL: Malformed task affected selection');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ FAIL:', e.message);
    failed++;
  }

  // Test 7: Empty backlog
  console.log('Test 7: Empty backlog returns null');
  try {
    const emptyContent = '# Backlog\n\n---';
    const nextTask = parseTasks(emptyContent);
    if (nextTask === null) {
      console.log('  ✓ PASS: Empty backlog returns null');
      passed++;
    } else {
      console.log('  ✗ FAIL: Expected null, got', nextTask);
      failed++;
    }
  } catch (e) {
    console.log('  ✗ FAIL:', e.message);
    failed++;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();