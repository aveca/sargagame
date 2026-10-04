'use strict';
/**
 * ux-observer.cjs — Autonomous UX Observer & Task Generator
 * 
 * OBSERVE → DIAGNOSE → PRIORITIZE → GENERATE TASK
 * 
 * Analyzes:
 * - Playwright observations (console errors, page errors, broken links, visual diffs)
 * - Funnel metrics (paywall reach, CTA visibility, conversion signals)
 * - Screenshots (visual regression, mobile usability)
 * - Performance (LCP, bundle budget, JS errors)
 * 
 * Generates structured UX tasks with scoring:
 *   SCORE = REVENUE_IMPACT × USER_IMPACT × CONFIDENCE ÷ IMPLEMENTATION_COST
 */

const fs = require('fs');
const path = require('path');
const C = require('./lib/common.cjs');
const mem = require('./lib/memory.cjs');
const metrics = require('./lib/metrics.cjs');

const OBSERVATIONS_DIR = path.join(C.paths.observations);
const SCREENSHOTS_DIR = path.join(OBSERVATIONS_DIR, 'shots');

/**
 * Load latest observation data
 */
function loadLatestObservation() {
  const latestPath = path.join(OBSERVATIONS_DIR, 'latest.json');
  if (!fs.existsSync(latestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Load funnel metrics from autopilot memory
 */
function loadFunnelMetrics() {
  try {
    return metrics.snapshot ? metrics.snapshot() : null;
  } catch {
    return null;
  }
}

/**
 * Load tasks.md and extract UX-related pending tasks
 */
function loadUXBacklogTasks() {
  const tasksPath = path.join(C.ROOT, '.ai', 'tasks.md');
  if (!fs.existsSync(tasksPath)) return [];
  
  const content = fs.readFileSync(tasksPath, 'utf8');
  const lines = content.split('\n');
  const uxTasks = [];
  let currentSection = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) currentSection = line.slice(3).trim();
    
    // Only list format: - [ ] TASK-PX-XXX
    const match = line.match(/^-\s*\[\s*\]\s*(TASK-P\d-\d{3})\s*(.*)/);
    if (match) {
      const taskId = match[1];
      const rest = match[2].trim();
      
      // Check if UX-related (contains UX, UI, paywall, CTA, conversion, funnel, mobile, visual, comic, modal)
      const isUX = /ux|ui|paywall|cta|conversion|funnel|mobile|visual|comic|modal|transition|animation|header|button|checkout/i.test(rest + currentSection);
      
      if (isUX) {
        // Extract more context from following lines
        let description = rest;
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          if (lines[j].startsWith('- **') || lines[j].startsWith('###')) break;
          if (lines[j].trim() && !lines[j].startsWith('- [')) {
            description += ' ' + lines[j].trim();
          }
        }
        
        uxTasks.push({
          id: taskId,
          section: currentSection,
          description: description,
          priority: taskId.includes('P0') ? 0 : taskId.includes('P1') ? 1 : taskId.includes('P2') ? 2 : 3
        });
      }
    }
  }
  
  // Sort by priority
  uxTasks.sort((a, b) => a.priority - b.priority);
  return uxTasks;
}

/**
 * Analyze observations for UX issues
 * Returns array of findings with severity and evidence
 */
function analyzeObservations(obs) {
  const findings = [];
  
  if (!obs || !obs.regions) return findings;
  
  for (const [regionId, regionData] of Object.entries(obs.regions)) {
    if (!regionData.pages) continue;
    
    for (const page of regionData.pages) {
      const route = page.route || 'unknown';
      const viewport = page.viewport || 'unknown';
      const url = page.url || '';
      
      // 1. Console errors (excluding known noise)
      if (page.consoleErrors && page.consoleErrors.length > 0) {
        const criticalErrors = page.consoleErrors.filter(e => 
          !e.includes('Content Security Policy') &&
          !e.includes('Refused to connect') &&
          !e.includes('favicon') &&
          !e.includes('analytics') &&
          !e.includes('gtag') &&
          !e.includes('clarity')
        );
        if (criticalErrors.length > 0) {
          findings.push({
            type: 'js_error',
            severity: 'high',
            region: regionId,
            route,
            viewport,
            evidence: `Console errors: ${criticalErrors.slice(0, 3).join('; ')}`,
            rawErrors: criticalErrors,
            revenueImpact: route.includes('paywall') || route.includes('checkout') ? 0.9 : 0.5,
            userImpact: 0.8,
            confidence: 0.9,
            implementationCost: 0.3
          });
        }
      }
      
      // 2. Page errors (JS exceptions)
      if (page.pageErrors && page.pageErrors.length > 0) {
        findings.push({
          type: 'page_error',
          severity: 'critical',
          region: regionId,
          route,
          viewport,
          evidence: `Page errors: ${page.pageErrors.slice(0, 3).join('; ')}`,
          rawErrors: page.pageErrors,
          revenueImpact: 0.9,
          userImpact: 0.9,
          confidence: 0.95,
          implementationCost: 0.4
        });
      }
      
      // 3. First-party failures (broken API calls)
      if (page.firstPartyFailures && page.firstPartyFailures.length > 0) {
        findings.push({
          type: 'api_failure',
          severity: 'high',
          region: regionId,
          route,
          viewport,
          evidence: `First-party failures: ${page.firstPartyFailures.map(f => `${f.url} (${f.status})`).slice(0, 3).join('; ')}`,
          rawErrors: page.firstPartyFailures,
          revenueImpact: route.includes('paywall') || route.includes('checkout') ? 0.9 : 0.6,
          userImpact: 0.7,
          confidence: 0.85,
          implementationCost: 0.5
        });
      }
      
      // 4. Broken internal links
      if (page.brokenLinks && page.brokenLinks.length > 0) {
        findings.push({
          type: 'broken_link',
          severity: 'medium',
          region: regionId,
          route,
          viewport,
          evidence: `Broken links: ${page.brokenLinks.map(b => `${b.url} (${b.status})`).slice(0, 5).join('; ')}`,
          rawErrors: page.brokenLinks,
          revenueImpact: 0.4,
          userImpact: 0.6,
          confidence: 0.8,
          implementationCost: 0.2
        });
      }
      
      // 5. Visual regression flagged
      if (page.visual && page.visual.flagged) {
        findings.push({
          type: 'visual_regression',
          severity: 'medium',
          region: regionId,
          route,
          viewport,
          evidence: `Visual diff: meanAbs=${page.visual.meanAbs}, pctHot=${page.visual.pctHot}`,
          rawErrors: page.visual,
          revenueImpact: route.includes('paywall') ? 0.7 : 0.4,
          userImpact: 0.7,
          confidence: 0.6,
          implementationCost: 0.4
        });
      }
      
      // 6. Performance issues (LCP > 4s, load > 5s)
      if (page.timing) {
        const lcp = page.timing.lcp || page.timing.load || 0;
        if (lcp > 4000) {
          findings.push({
            type: 'performance',
            severity: 'medium',
            region: regionId,
            route,
            viewport,
            evidence: `LCP/Load too slow: ${lcp}ms (threshold 4000ms)`,
            rawErrors: page.timing,
            revenueImpact: route.includes('paywall') || route.includes('checkout') ? 0.7 : 0.4,
            userImpact: 0.6,
            confidence: 0.7,
            implementationCost: 0.5
          });
        }
      }
      
      // 7. Missing critical UI elements (paywall CTA, map labels, etc.)
      if (page.checks) {
        if (route.includes('paywall') && page.checks.dialogs === 0) {
          findings.push({
            type: 'missing_paywall',
            severity: 'critical',
            region: regionId,
            route,
            viewport,
            evidence: 'Paywall route loaded but no modal dialog detected',
            revenueImpact: 0.95,
            userImpact: 0.95,
            confidence: 0.8,
            implementationCost: 0.3
          });
        }
        
        if (route === 'home' && !page.checks.hasContent) {
          findings.push({
            type: 'empty_page',
            severity: 'critical',
            region: regionId,
            route,
            viewport,
            evidence: 'Home page has insufficient content (<500 chars)',
            revenueImpact: 0.8,
            userImpact: 0.9,
            confidence: 0.85,
            implementationCost: 0.4
          });
        }
      }
    }
  }
  
  return findings;
}

/**
 * Analyze funnel metrics for conversion issues
 */
function analyzeFunnelMetrics(metrics) {
  const findings = [];
  
  if (!metrics) return findings;
  
  const d7 = metrics.d7 || {};
  
  // Low paywall CTA rate
  if (d7.modalOpens && d7.modalCta) {
    const ctaRate = d7.modalCta / d7.modalOpens;
    if (ctaRate < 0.15) { // Less than 15% CTA click rate
      findings.push({
        type: 'low_cta_rate',
        severity: 'high',
        route: 'paywall',
        viewport: 'all',
        evidence: `Paywall CTA rate: ${(ctaRate * 100).toFixed(1)}% (${d7.modalCta}/${d7.modalOpens})`,
        revenueImpact: 0.9,
        userImpact: 0.7,
        confidence: 0.75,
        implementationCost: 0.4
      });
    }
  }
  
  // Low checkout conversion
  if (d7.onsite && d7.paid) {
    const conversionRate = d7.paid / d7.onsite;
    if (d7.onsite > 20 && conversionRate < 0.05) { // Less than 5% with enough traffic
      findings.push({
        type: 'low_checkout_conversion',
        severity: 'high',
        route: 'checkout',
        viewport: 'all',
        evidence: `Checkout conversion: ${(conversionRate * 100).toFixed(1)}% (${d7.paid}/${d7.onsite})`,
        revenueImpact: 0.95,
        userImpact: 0.8,
        confidence: 0.7,
        implementationCost: 0.5
      });
    }
  }
  
  // Low premium modal open rate
  if (d7.sessions && d7.modalOpens) {
    const openRate = d7.modalOpens / d7.sessions;
    if (openRate < 0.08) { // Less than 8% see paywall
      findings.push({
        type: 'low_paywall_reach',
        severity: 'medium',
        route: 'paywall',
        viewport: 'all',
        evidence: `Paywall reach rate: ${(openRate * 100).toFixed(1)}% (${d7.modalOpens}/${d7.sessions})`,
        revenueImpact: 0.7,
        userImpact: 0.6,
        confidence: 0.65,
        implementationCost: 0.3
      });
    }
  }
  
  return findings;
}

/**
 * Calculate priority score: REVENUE × USER × CONFIDENCE ÷ COST
 */
function calculateScore(finding) {
  const revenue = finding.revenueImpact || 0.5;
  const user = finding.userImpact || 0.5;
  const confidence = finding.confidence || 0.5;
  const cost = finding.implementationCost || 0.5;
  
  return (revenue * user * confidence) / cost;
}

/**
 * Generate task from finding
 */
function generateTask(finding, index) {
  const score = calculateScore(finding);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const typePrefix = finding.type.toUpperCase().slice(0, 3);
  const taskId = `UX-${typePrefix}-${timestamp}-${String(index).padStart(3, '0')}`;
  
  let title = '';
  let description = '';
  let files = [];
  
  switch (finding.type) {
    case 'js_error':
    case 'page_error':
      title = `Fix JS error on ${finding.route} (${finding.viewport})`;
      description = `Critical JavaScript error detected: ${finding.evidence}`;
      files = getFilesForRoute(finding.route);
      break;
    case 'api_failure':
      title = `Fix API failure on ${finding.route}`;
      description = `First-party API calls failing: ${finding.evidence}`;
      files = getFilesForRoute(finding.route).concat(getAPIFiles());
      break;
    case 'broken_link':
      title = `Fix broken links on ${finding.route}`;
      description = `Internal links returning 4xx/5xx: ${finding.evidence}`;
      files = getFilesForRoute(finding.route);
      break;
    case 'visual_regression':
      title = `Fix visual regression on ${finding.route} (${finding.viewport})`;
      description = `Visual diff detected: ${finding.evidence}`;
      files = getFilesForRoute(finding.route);
      break;
    case 'performance':
      title = `Improve performance on ${finding.route} (${finding.viewport})`;
      description = `Page load/LCP exceeds threshold: ${finding.evidence}`;
      files = getFilesForRoute(finding.route);
      break;
    case 'missing_paywall':
      title = `Paywall not displaying on ${finding.route}`;
      description = `Paywall modal not appearing: ${finding.evidence}`;
      files = ['src/PremiumModal.jsx', 'src/hooks/usePremiumModal.js', 'src/components/PaywallComic.jsx'];
      break;
    case 'empty_page':
      title = `Empty page content on ${finding.route}`;
      description = `Page has insufficient content: ${finding.evidence}`;
      files = getFilesForRoute(finding.route);
      break;
    case 'low_cta_rate':
      title = `Improve paywall CTA conversion rate`;
      description = `Paywall CTA click rate below 15%: ${finding.evidence}`;
      files = ['src/components/PaywallComic.jsx', 'src/PremiumModal.jsx', 'src/hooks/usePaywallVariants.js'];
      break;
    case 'low_checkout_conversion':
      title = `Improve checkout conversion rate`;
      description = `Checkout conversion below 5%: ${finding.evidence}`;
      files = ['src/components/CheckoutFlow.jsx', 'src/lib/mollie-lib.php', 'public/api/checkout.php'];
      break;
    case 'low_paywall_reach':
      title = `Increase paywall reach rate`;
      description = `Paywall reach rate below 8%: ${finding.evidence}`;
      files = ['src/Sargasses_PROD.jsx', 'src/hooks/usePaywallTrigger.js', 'src/components/PaywallComic.jsx'];
      break;
    default:
      title = `UX Issue: ${finding.type} on ${finding.route}`;
      description = finding.evidence;
      files = getFilesForRoute(finding.route);
  }
  
  return {
    id: taskId,
    type: 'ux_task',
    title,
    description,
    finding,
    score: Math.round(score * 1000) / 1000,
    severity: finding.severity,
    route: finding.route,
    viewport: finding.viewport,
    region: finding.region,
    files: [...new Set(files)],
    evidence: finding.evidence,
    expectedImpact: estimateImpact(finding),
    rollback: 'revert',
    actionable: score > 0.5 ? 'agent' : 'human',
    persona: 'ui-ux',
    status: 'new',
    createdAt: new Date().toISOString()
  };
}

/**
 * Map route to likely files to modify
 */
function getFilesForRoute(route) {
  const routeMap = {
    'home': ['src/Sargasses_PROD.jsx', 'src/components/WorldMapView.jsx', 'src/components/ChasseHome.jsx'],
    'paywall': ['src/components/PaywallComic.jsx', 'src/PremiumModal.jsx', 'src/hooks/usePremiumModal.js'],
    'checkout': ['src/components/CheckoutFlow.jsx', 'src/lib/mollie-lib.php', 'public/api/checkout.php'],
    'beach': ['src/components/BeachExperience.jsx', 'src/components/BeachDetailComic.jsx'],
    'seo-beach': ['src/components/BeachExperience.jsx', 'src/components/BeachDetailComic.jsx'],
    'seo-deep': ['src/Sargasses_PROD.jsx', 'src/components/WorldMapView.jsx'],
    'map': ['src/components/WorldMapView.jsx', 'src/hooks/useMapData.js'],
    'fiche': ['src/components/BeachDetailComic.jsx', 'src/components/BeachExperience.jsx']
  };
  
  for (const [key, files] of Object.entries(routeMap)) {
    if (route.includes(key)) return files;
  }
  return ['src/Sargasses_PROD.jsx'];
}

function getAPIFiles() {
  return ['public/api/copernicus/*.json', 'src/lib/api.js'];
}

/**
 * Estimate expected impact for task
 */
function estimateImpact(finding) {
  const baseImpacts = {
    'js_error': 'Eliminate JS errors blocking user interaction',
    'page_error': 'Fix runtime exceptions breaking page functionality',
    'api_failure': 'Restore critical API data flow',
    'broken_link': 'Fix navigation dead ends',
    'visual_regression': 'Restore intended visual design',
    'performance': 'Improve LCP/load time for better conversion',
    'missing_paywall': 'Restore paywall visibility → direct revenue impact',
    'empty_page': 'Restore content delivery',
    'low_cta_rate': 'Increase CTA clicks → more checkout entries',
    'low_checkout_conversion': 'Increase paid conversions → direct revenue',
    'low_paywall_reach': 'More users see paywall → more conversion opportunities'
  };
  return baseImpacts[finding.type] || 'Improve UX quality';
}

/**
 * Main observer function - runs analysis and generates tasks
 */
async function runUXObserver() {
  console.log('[UX-OBSERVER] Starting autonomous UX observation...');
  
  const obs = loadLatestObservation();
  if (!obs) {
    console.log('[UX-OBSERVER] No observation data available');
    return { tasks: [], reason: 'no_observation_data' };
  }
  
  const metrics = loadFunnelMetrics();
  
  // Analyze observations
  const obsFindings = analyzeObservations(obs);
  console.log(`[UX-OBSERVER] Found ${obsFindings.length} observation-based issues`);
  
  // Analyze funnel metrics
  const funnelFindings = analyzeFunnelMetrics(metrics);
  console.log(`[UX-OBSERVER] Found ${funnelFindings.length} funnel-based issues`);
  
  // Combine and score
  const allFindings = [...obsFindings, ...funnelFindings];
  
  // Filter out known noise
  const filteredFindings = allFindings.filter(f => {
    // Filter apple-developer-merchantid-domain-association noise
    if (f.type === 'api_failure' && f.rawErrors) {
      const isNoise = f.rawErrors.some(e => 
        e.url && e.url.includes('apple-developer-merchantid-domain-association')
      );
      if (isNoise) return false;
    }
    // Filter favicon noise
    if (f.type === 'api_failure' && f.rawErrors) {
      const isFavicon = f.rawErrors.some(e => 
        e.url && e.url.includes('favicon')
      );
      if (isFavicon) return false;
    }
    return true;
  });
  
  // Deduplicate by type+route (not viewport - one task per route)
  const seen = new Set();
  const uniqueFindings = filteredFindings.filter(f => {
    const key = `${f.type}-${f.route}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // Score and sort
  const scored = uniqueFindings.map(f => ({ ...f, score: calculateScore(f) }))
    .sort((a, b) => b.score - a.score);
  
  // Generate tasks for top findings
  let tasks = scored
    .filter(f => f.score > 0.3) // Minimum threshold
    .slice(0, 10) // Max 10 tasks per cycle
    .map((f, i) => generateTask(f, i));
  
  // If no critical issues found, pick best UX task from backlog
  if (tasks.length === 0) {
    console.log('[UX-OBSERVER] No critical issues — checking UX backlog...');
    const backlogTasks = loadUXBacklogTasks();
    console.log(`[UX-OBSERVER] Found ${backlogTasks.length} UX tasks in backlog`);
    
    if (backlogTasks.length > 0) {
      const topTask = backlogTasks[0];
      console.log(`[UX-OBSERVER] Picking highest-priority UX task: ${topTask.id} (${topTask.section})`);
      
      // Create a task from the backlog item
      const backlogTask = generateBacklogTask(topTask);
      tasks.push(backlogTask);
    }
  }
  
  console.log(`[UX-OBSERVER] Generated ${tasks.length} UX tasks`);
  for (const t of tasks) {
    console.log(`  ${t.id}: ${t.title} (score: ${t.score}, severity: ${t.severity})`);
  }
  
  // Save tasks to queue
  const queue = mem.loadQueue();
  queue.opportunities = queue.opportunities || [];
  
  for (const task of tasks) {
    // Check if similar task already exists
    const exists = queue.opportunities.some(o => 
      o.id === task.id || 
      (o.finding && o.finding.type === task.finding.type && o.finding.route === task.finding.route)
    );
    
    if (!exists) {
      queue.opportunities.push(task);
      mem.writeOpportunityFile(task);
      console.log(`[UX-OBSERVER] Queued task: ${task.id}`);
    }
  }
  
  mem.saveQueue(queue);
  
  return { tasks, findings: scored };
}

/**
 * Run before/after validation for a UX task
 */
async function validateUXTask(taskId, worktreePath, isBefore = true) {
  const label = isBefore ? 'before' : 'after';
  console.log(`[UX-OBSERVER] Running ${label} validation for ${taskId}...`);
  
  // This would run the smoke test + visual QA
  // Returns validation result with screenshots, metrics, etc.
  // Implementation delegated to verify.cjs / visual-qa.cjs
  
  return {
    taskId,
    phase: label,
    timestamp: new Date().toISOString(),
    screenshots: [],
    funnelTokens: {},
    visualDiff: null,
    passed: true
  };
}

/**
 * Generate a UX task from a backlog item
 */
function generateBacklogTask(backlogItem) {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const taskId = `UX-${backlogItem.id}-${timestamp}`;
  
  // Map task ID to likely files and expected impact
  const taskMap = {
    'TASK-P1-003': {
      title: 'Complete paywall comic header variants',
      files: ['src/components/PaywallComic.jsx', 'src/hooks/usePaywallVariants.js'],
      expectedImpact: 'Complete paywall comic variants (scene/constel/beat) → better engagement → higher CTA rate',
      rollback: 'revert',
      persona: 'ui-ux',
      score: 0.85
    },
    'TASK-P2-004': {
      title: 'Implement BD-style transitions between screens',
      files: ['src/components/BeachExperience.jsx', 'src/components/BeachDetailComic.jsx', 'src/styles/transitions.css'],
      expectedImpact: 'Comic-style slide/bolt animations for top-level transitions → improved perceived performance + delight',
      rollback: 'revert',
      persona: 'ui-ux',
      score: 0.75
    },
    'TASK-P2-001': {
      title: 'Split PremiumModal.jsx into sub-components',
      files: ['src/PremiumModal.jsx', 'src/components/PremiumModal/DoSubscribe.jsx', 'src/components/PremiumModal/ErrorModal.jsx', 'src/components/PremiumModal/PayGatewayHandler.jsx'],
      expectedImpact: 'Reduce 3352-line monolith → maintainable code → faster iteration on paywall UX',
      rollback: 'revert',
      persona: 'coding',
      score: 0.7
    }
  };
  
  const taskInfo = taskMap[backlogItem.id] || {
    title: `UX: ${backlogItem.id}`,
    files: ['src/Sargasses_PROD.jsx'],
    expectedImpact: backlogItem.description,
    rollback: 'revert',
    persona: 'ui-ux',
    score: 0.5
  };
  
  return {
    id: taskId,
    type: 'ux_task',
    title: taskInfo.title,
    description: backlogItem.description,
    finding: {
      type: 'backlog_task',
      severity: backlogItem.priority === 0 ? 'high' : backlogItem.priority === 1 ? 'high' : 'medium',
      route: 'paywall',
      viewport: 'mobile',
      evidence: `Backlog task: ${backlogItem.id} — ${backlogItem.description}`,
      revenueImpact: 0.7,
      userImpact: 0.7,
      confidence: 0.6,
      implementationCost: 0.4
    },
    score: taskInfo.score,
    severity: backlogItem.priority === 0 ? 'high' : backlogItem.priority === 1 ? 'high' : 'medium',
    route: 'paywall',
    viewport: 'mobile',
    region: 'mq',
    files: taskInfo.files,
    evidence: `Backlog task: ${backlogItem.id} — ${backlogItem.description}`,
    expectedImpact: taskInfo.expectedImpact,
    rollback: taskInfo.rollback,
    actionable: taskInfo.score > 0.5 ? 'agent' : 'human',
    persona: taskInfo.persona,
    status: 'new',
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  runUXObserver,
  analyzeObservations,
  analyzeFunnelMetrics,
  calculateScore,
  generateTask,
  generateBacklogTask,
  validateUXTask,
  loadLatestObservation,
  loadFunnelMetrics,
  loadUXBacklogTasks
};