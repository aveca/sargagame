const assert = require('assert');

const {
  extractTask,
  toOpportunity,
  inferPersona,
} = require('../../scripts/autopilot/bridge.cjs');

const task = {
  id: 'TASK-TEST-001',
  source: 'chatgpt-test',
  priority: 'high',
  mode: 'agent',
  moneyPath: false,
  humanGate: false,
  title: 'Fix broken CTA',
  diagnostic: 'CTA fails on mobile',
  evidence: 'Playwright evidence',
  filesToRead: ['src/Sargasses_PROD.jsx'],
  filesToModify: ['src/PassOffer.jsx'],
  implementation: 'Make the CTA visible and clickable',
  tests: ['npm test'],
  acceptance: ['CTA clickable on 390px'],
  metric: 'premium CTA rate',
  rollback: '?autopilotcta=0',
  constraints: ['bundle <= 210 Ko'],
  stopCondition: 'Any money-path touch',
  confidence: 'proven',
};

const fence = String.fromCharCode(96).repeat(3);
const body = [
  '# AUTOPILOT TASK',
  'AUTOPILOT_TASK',
  fence + 'json',
  JSON.stringify(task, null, 2),
  fence,
].join('\n');

const parsed = extractTask(body);
assert.deepStrictEqual(parsed, task);

const opp = toOpportunity(task, {
  number: 123,
  url: 'https://github.com/aveca/sargagame/issues/123',
  title: '[AUTOPILOT] Fix broken CTA',
  createdAt: '2026-09-29T15:00:00Z',
});

assert.strictEqual(opp.id, 'TASK-TEST-001');
assert.strictEqual(opp.actionable, 'agent');
assert.strictEqual(opp.severity, 'high');
assert.strictEqual(opp.confidence, 'proven');
assert.deepStrictEqual(opp.scope.files, ['src/PassOffer.jsx']);
assert.strictEqual(opp.sourceIssue.number, 123);
assert.strictEqual(opp.persona, 'ui-ux');
assert.deepStrictEqual(opp.task.filesToRead, ['src/Sargasses_PROD.jsx']);

const seoTask = { ...task, id: 'TASK-TEST-SEO', title: 'Fix hreflang issue', filesToModify: ['scripts/seo.cjs'] };
assert.strictEqual(inferPersona(seoTask), 'seo');

const moneyTask = { ...task, id: 'TASK-TEST-MONEY', mode: 'agent', moneyPath: true, humanGate: false };
const moneyOpp = toOpportunity(moneyTask, { number: 124, url: null, title: '[AUTOPILOT] money', createdAt: null });
assert.strictEqual(moneyOpp.actionable, 'human');
assert.strictEqual(moneyOpp.task.humanGate, true);

const sensitivePathTask = { ...task, id: 'TASK-TEST-SENSITIVE', filesToModify: ['workers/sg-payments/src/index.ts'] };
const sensitiveOpp = toOpportunity(sensitivePathTask, { number: 127, url: null, title: '[AUTOPILOT] sensitive', createdAt: null });
assert.deepStrictEqual(sensitiveOpp.scope.files, ['workers/sg-payments/src/index.ts']);

const autoNoRecipe = { ...task, id: 'TASK-TEST-AUTO', mode: 'auto' };
assert.strictEqual(
  toOpportunity(autoNoRecipe, { number: 125, url: null, title: '[AUTOPILOT] auto', createdAt: null }).actionable,
  'agent'
);

const autoRecipe = { ...autoNoRecipe, recipe: 'banner-z-below-paywall' };
assert.strictEqual(
  toOpportunity(autoRecipe, { number: 126, url: null, title: '[AUTOPILOT] auto', createdAt: null }).actionable,
  'auto'
);

assert.strictEqual(extractTask('AUTOPILOT_TASK\n' + fence + 'json\n{bad}\n' + fence), null);
assert.strictEqual(extractTask('nothing here'), null);

console.log('AUTOPILOT bridge contract: PASS');
