#!/usr/bin/env node
/**
 * github-discovery.cjs — GitHub Discovery Engine for Sargagame Factory
 * 
 * Discovers relevant repos from GitHub Trending, Search, and recent activity.
 * Filters by priority topics, analyzes, security checks, and creates candidate tasks.
 * 
 * Usage:
 *   node scripts/automation/github-discovery.cjs --run
 *   node scripts/automation/github-discovery.cjs --dry-run
 *   node scripts/automation/github-discovery.cjs --status
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'scripts', 'automation', 'data');
const DISCOVERY_FILE = path.join(DATA_DIR, 'github-discovery.json');
const CANDIDATES_FILE = path.join(DATA_DIR, 'github-candidates.json');
const SEEN_FILE = path.join(DATA_DIR, 'github-discovery-seen.json');

const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

fs.mkdirSync(DATA_DIR, { recursive: true });

// Priority topics for Sargagame factory
const PRIORITY_TOPICS = [
  // AI & Agents
  'ai', 'agents', 'mcp', 'llm', 'automation', 'coding-agents', 'memory',
  'orchestration', 'evals', 'langchain', 'langgraph', 'autogen', 'crewai',
  // Cloudflare & Supabase
  'cloudflare', 'workers', 'durable-objects', 'supabase', 'postgres',
  // Payments & Revenue
  'payments', 'mollie', 'stripe', 'paypal', 'billing', 'subscription',
  // Analytics & SEO
  'analytics', 'ga4', 'google-analytics', 'search-console', 'seo',
  // Frontend & Performance
  'react', 'vite', 'typescript', 'performance', 'web-vitals', 'lighthouse',
  'pwa', 'preact',
  // API & Integration
  'api', 'rest', 'graphql', 'openapi', 'swagger', 'webhooks',
  // B2B & Conversion
  'b2b', 'ecommerce', 'conversion', 'funnel', 'crm', 'outreach',
  // Observability & Testing
  'observability', 'monitoring', 'logging', 'tracing', 'testing',
  'playwright', 'vitest', 'ci-cd', 'github-actions'
];

// Search queries for different discovery modes
const SEARCH_QUERIES = {
  trending: [
    'stars:>100 language:javascript ai agent',
    'stars:>100 language:typescript mcp',
    'stars:>50 language:javascript cloudflare workers',
    'stars:>50 language:typescript supabase',
    'stars:>30 language:javascript mollie stripe payments',
    'stars:>30 language:typescript seo analytics',
    'stars:>50 language:javascript react vite performance',
    'stars:>30 language:typescript b2b ecommerce conversion',
    'stars:>50 language:javascript observability monitoring',
    'stars:>30 language:typescript github-actions ci-cd'
  ],
  recent: [
    'pushed:>2026-01-01 language:javascript ai agent',
    'pushed:>2026-01-01 language:typescript mcp llm',
    'pushed:>2026-01-01 language:javascript cloudflare',
    'pushed:>2026-01-01 language:typescript supabase database',
    'pushed:>2026-01-01 language:javascript payments stripe mollie',
    'pushed:>2026-01-01 language:typescript seo analytics ga4',
    'pushed:>2026-01-01 language:javascript react vite',
    'pushed:>2026-01-01 language:typescript b2b saas',
    'pushed:>2026-01-01 language:javascript testing playwright',
    'pushed:>2026-01-01 language:typescript observability'
  ]
};

function loadJSON(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function runGH(args, allowFail = false) {
  try {
    // On Windows, the URL with & chars needs to be quoted
    const isWin = process.platform === 'win32';
    let cmd;
    if (isWin) {
      // Join args, then wrap the whole thing in quotes for gh api
      const apiPath = args.join(' ');
      cmd = `gh api "${apiPath}"`;
    } else {
      cmd = ['gh', 'api', ...args].join(' ');
    }
    if (GH_TOKEN) cmd = `GH_TOKEN=${GH_TOKEN} ${cmd}`;
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', shell: true, timeout: 30000 });
  } catch (e) {
    if (!allowFail) throw e;
    return null;
  }
}

function runGHSearch(query, perPage = 30) {
  // gh api with query string parameter
  const encoded = encodeURIComponent(query);
  return runGH([`/search/repositories?q=${encoded}&sort=stars&order=desc&per_page=${perPage}`], true);
}

async function discoverTrending() {
  console.log('[github-discovery] Discovering trending repos...');
  const results = [];
  
  for (const query of SEARCH_QUERIES.trending) {
    try {
      const resp = runGHSearch(query, 20);
      if (!resp) continue;
      const data = JSON.parse(resp);
      for (const repo of data.items || []) {
        results.push({
          source: 'trending',
          query,
          repo: normalizeRepo(repo)
        });
      }
    } catch (e) {
      console.warn('[github-discovery] Query failed:', query, e.message);
    }
  }
  return results;
}

async function discoverRecent() {
  console.log('[github-discovery] Discovering recent active repos...');
  const results = [];
  
  for (const query of SEARCH_QUERIES.recent) {
    try {
      const resp = runGHSearch(query, 20);
      if (!resp) continue;
      const data = JSON.parse(resp);
      for (const repo of data.items || []) {
        results.push({
          source: 'recent',
          query,
          repo: normalizeRepo(repo)
        });
      }
    } catch (e) {
      console.warn('[github-discovery] Query failed:', query, e.message);
    }
  }
  return results;
}

function normalizeRepo(repo) {
  const topics = repo.topics || [];
  const priorityMatches = topics.filter(t => PRIORITY_TOPICS.includes(t.toLowerCase()));
  
  return {
    id: repo.id,
    fullName: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    description: repo.description || '',
    url: repo.html_url,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    language: repo.language,
    topics,
    priorityMatches,
    priorityScore: calculatePriorityScore(repo, priorityMatches),
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at,
    license: repo.license?.spdx_id || 'unknown',
    isFork: repo.fork,
    isArchived: repo.archived,
    defaultBranch: repo.default_branch,
    openIssues: repo.open_issues_count
  };
}

function calculatePriorityScore(repo, priorityMatches) {
  let score = 0;
  score += priorityMatches.length * 10;
  score += Math.min(repo.stargazers_count / 100, 50);
  score += Math.min(repo.forks_count / 50, 20);
  
  // Bonus for recent activity
  const daysSincePush = (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePush < 30) score += 20;
  else if (daysSincePush < 90) score += 10;
  
  // Penalty for archived or stale
  if (repo.archived) score -= 100;
  if (daysSincePush > 365) score -= 30;
  
  return Math.max(0, Math.round(score));
}

function filterAndDedupe(results, seen) {
  const unique = new Map();
  
  for (const item of results) {
    const repo = item.repo;
    if (!repo) continue;
    if (repo.isArchived) continue;
    if (repo.isFork && repo.forks_count < 10) continue;
    if (seen[repo.fullName]) continue;
    if (repo.priorityScore < 15) continue; // Minimum threshold
    
    const key = repo.fullName;
    if (!unique.has(key) || unique.get(key).repo.priorityScore < repo.priorityScore) {
      unique.set(key, item);
    }
  }
  
  return Array.from(unique.values())
    .sort((a, b) => b.repo.priorityScore - a.repo.priorityScore);
}

async function analyzeCandidate(item) {
  const repo = item.repo;
  const analysis = {
    repo: repo.fullName,
    score: repo.priorityScore,
    topics: repo.topics,
    priorityTopics: repo.priorityMatches,
    language: repo.language,
    stars: repo.stars,
    lastPush: repo.pushedAt,
    license: repo.license,
    securityFlags: [],
    usefulFor: [],
    recommendation: 'skip'
  };
  
  // Security checks
  if (repo.license === 'unknown' || repo.license === 'other') {
    analysis.securityFlags.push('unknown-license');
  }
  if (repo.openIssues > 200 && repo.stars < 1000) {
    analysis.securityFlags.push('high-issue-ratio');
  }
  
  // Determine usefulness
  const topicStr = repo.topics.join(' ').toLowerCase();
  
  if (topicStr.includes('ai') || topicStr.includes('agent') || topicStr.includes('mcp') || topicStr.includes('llm')) {
    analysis.usefulFor.push('ai-agents');
  }
  if (topicStr.includes('cloudflare') || topicStr.includes('workers') || topicStr.includes('durable-objects')) {
    analysis.usefulFor.push('cloudflare-workers');
  }
  if (topicStr.includes('supabase') || topicStr.includes('postgres')) {
    analysis.usefulFor.push('supabase');
  }
  if (topicStr.includes('mollie') || topicStr.includes('stripe') || topicStr.includes('payments')) {
    analysis.usefulFor.push('payments');
  }
  if (topicStr.includes('seo') || topicStr.includes('analytics') || topicStr.includes('ga4')) {
    analysis.usefulFor.push('analytics-seo');
  }
  if (topicStr.includes('react') || topicStr.includes('vite') || topicStr.includes('performance')) {
    analysis.usefulFor.push('frontend-perf');
  }
  if (topicStr.includes('b2b') || topicStr.includes('ecommerce') || topicStr.includes('conversion')) {
    analysis.usefulFor.push('b2b-conversion');
  }
  if (topicStr.includes('observability') || topicStr.includes('testing') || topicStr.includes('playwright')) {
    analysis.usefulFor.push('observability-testing');
  }
  if (topicStr.includes('github-actions') || topicStr.includes('ci-cd')) {
    analysis.usefulFor.push('ci-cd');
  }
  
  // Recommendation
  if (analysis.usefulFor.length >= 2 && repo.priorityScore >= 30) {
    analysis.recommendation = 'candidate';
  } else if (analysis.usefulFor.length >= 1 && repo.priorityScore >= 20) {
    analysis.recommendation = 'review';
  }
  
  return analysis;
}

async function createCandidateTask(analysis) {
  if (analysis.recommendation !== 'candidate') return null;
  
  const taskId = `DISC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  
  return {
    id: taskId,
    type: 'github_discovery_candidate',
    repo: analysis.repo,
    score: analysis.score,
    usefulFor: analysis.usefulFor,
    priorityTopics: analysis.priorityTopics,
    securityFlags: analysis.securityFlags,
    createdAt: new Date().toISOString(),
    status: 'pending_review',
    suggestedActions: generateSuggestedActions(analysis)
  };
}

function generateSuggestedActions(analysis) {
  const actions = [];
  
  if (analysis.usefulFor.includes('ai-agents')) {
    actions.push('Evaluate for agent orchestration / MCP integration');
    actions.push('Test sandbox compatibility');
  }
  if (analysis.usefulFor.includes('cloudflare-workers')) {
    actions.push('Test Cloudflare Workers deployment');
    actions.push('Check Durable Objects patterns');
  }
  if (analysis.usefulFor.includes('supabase')) {
    actions.push('Evaluate for Supabase schema/migrations');
    actions.push('Check realtime/Edge Function patterns');
  }
  if (analysis.usefulFor.includes('payments')) {
    actions.push('Review Mollie/Stripe integration patterns');
    actions.push('Check webhook handling');
  }
  if (analysis.usefulFor.includes('analytics-seo')) {
    actions.push('Evaluate GA4/Search Console automation');
    actions.push('Check SEO tooling patterns');
  }
  if (analysis.usefulFor.includes('frontend-perf')) {
    actions.push('Review Vite/React performance patterns');
    actions.push('Check bundle optimization techniques');
  }
  if (analysis.usefulFor.includes('b2b-conversion')) {
    actions.push('Review B2B funnel/outreach patterns');
    actions.push('Check conversion optimization');
  }
  if (analysis.usefulFor.includes('observability-testing')) {
    actions.push('Evaluate testing/observability patterns');
    actions.push('Check Playwright/Vitest integration');
  }
  if (analysis.usefulFor.includes('ci-cd')) {
    actions.push('Review GitHub Actions workflow patterns');
    actions.push('Check deployment automation');
  }
  
  return actions;
}

async function runDiscovery(options = {}) {
  const { dryRun = false, maxCandidates = 10 } = options;
  
  console.log('[github-discovery] Starting discovery run...');
  
  const seen = loadJSON(SEEN_FILE, {});
  const existingCandidates = loadJSON(CANDIDATES_FILE, []);
  
  // Discover
  const trending = await discoverTrending();
  const recent = await discoverRecent();
  const allResults = [...trending, ...recent];
  
  console.log(`[github-discovery] Found ${allResults.length} raw results`);
  
  // Filter and dedupe
  const filtered = filterAndDedupe(allResults, seen);
  console.log(`[github-discovery] After filtering: ${filtered.length} unique repos`);
  
  // Analyze top candidates
  const analyses = [];
  for (const item of filtered.slice(0, 50)) {
    try {
      const analysis = await analyzeCandidate(item);
      analyses.push(analysis);
      
      // Mark as seen
      seen[item.repo.fullName] = {
        firstSeen: new Date().toISOString(),
        score: item.repo.priorityScore,
        topics: item.repo.topics
      };
    } catch (e) {
      console.warn('[github-discovery] Analysis failed for', item.repo?.fullName, e.message);
    }
  }
  
  // Create candidate tasks
  const newCandidates = [];
  for (const analysis of analyses) {
    const task = await createCandidateTask(analysis);
    if (task) newCandidates.push(task);
  }
  
  console.log(`[github-discovery] ${newCandidates.length} new candidates created`);
  
  if (!dryRun) {
    // Save updated seen
    saveJSON(SEEN_FILE, seen);
    
    // Save candidates (append new, keep last 100)
    const allCandidates = [...newCandidates, ...existingCandidates].slice(0, 100);
    saveJSON(CANDIDATES_FILE, allCandidates);
    
    // Save discovery log
    const discoveryLog = loadJSON(DISCOVERY_FILE, []);
    discoveryLog.unshift({
      timestamp: new Date().toISOString(),
      rawResults: allResults.length,
      filtered: filtered.length,
      analyzed: analyses.length,
      candidates: newCandidates.length,
      topCandidates: newCandidates.slice(0, 5).map(c => ({ repo: c.repo, score: c.score }))
    });
    saveJSON(DISCOVERY_FILE, discoveryLog.slice(0, 50));
  }
  
  return {
    rawResults: allResults.length,
    filtered: filtered.length,
    analyzed: analyses.length,
    candidates: newCandidates.length,
    candidatesList: newCandidates.slice(0, maxCandidates)
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const showStatus = args.includes('--status');
  
  if (showStatus) {
    const candidates = loadJSON(CANDIDATES_FILE, []);
    const discoveryLog = loadJSON(DISCOVERY_FILE, []);
    const seen = loadJSON(SEEN_FILE, {});
    
    console.log('\n=== GitHub Discovery Status ===\n');
    console.log(`Seen repos: ${Object.keys(seen).length}`);
    console.log(`Total candidates: ${candidates.length}`);
    console.log(`Pending review: ${candidates.filter(c => c.status === 'pending_review').length}`);
    console.log(`Last run: ${discoveryLog[0]?.timestamp || 'never'}`);
    
    if (candidates.length) {
      console.log('\nTop candidates:');
      candidates.slice(0, 10).forEach((c, i) => {
        console.log(`  ${i+1}. ${c.repo} (score: ${c.score}) - ${c.usefulFor.join(', ')}`);
      });
    }
    return;
  }
  
  try {
    const result = await runDiscovery({ dryRun });
    
    console.log('\n=== Discovery Result ===');
    console.log(`Raw results: ${result.rawResults}`);
    console.log(`Filtered: ${result.filtered}`);
    console.log(`Analyzed: ${result.analyzed}`);
    console.log(`New candidates: ${result.candidates}`);
    
    if (result.candidatesList.length) {
      console.log('\nTop new candidates:');
      result.candidatesList.forEach((c, i) => {
        console.log(`  ${i+1}. ${c.repo} (score: ${c.score})`);
        console.log(`     Useful for: ${c.usefulFor.join(', ')}`);
        console.log(`     Security flags: ${c.securityFlags.join(', ') || 'none'}`);
        console.log(`     Suggested: ${c.suggestedActions.slice(0, 2).join('; ')}`);
      });
    }
    
    if (dryRun) {
      console.log('\n[DRY RUN] No changes saved');
    }
    
  } catch (e) {
    console.error('[github-discovery] Fatal error:', e.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { runDiscovery, PRIORITY_TOPICS, SEARCH_QUERIES };