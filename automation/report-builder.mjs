/**
 * automation/report-builder.mjs — Générateur de rapports consolidés (JSON, HTML, Markdown).
 * 
 * Usage:
 *   node automation/report-builder.mjs              # Génère tous les rapports
 *   node automation/report-builder.mjs --format=html # Format spécifique
 * 
 * Lit: automation/output/*.json
 * Écrit: automation/output/report.json, report.html, report.md
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const args = process.argv.slice(2);
const flags = {
  outputDir: args.find(a => a.startsWith('--out='))?.split('=')[1] || 'automation/output',
  format: args.find(a => a.startsWith('--format='))?.split('=')[1] || 'all', // all, json, html, md
};

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

function formatMs(ms) {
  if (ms == null) return 'N/A';
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function statusIcon(passed) {
  return passed ? 'OK' : 'FAIL';
}

function budgetStatus(value, budget, unit = 'ms', higherIsWorse = true) {
  if (value == null) return { status: 'unknown', text: 'N/A' };
  const passed = higherIsWorse ? value <= budget : value >= budget;
  const pct = ((value / budget) * 100).toFixed(0);
  return {
    status: passed ? 'pass' : 'fail',
    text: `${formatMs(value)} / ${formatMs(budget)} (${pct}%)`,
    passed,
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}

async function main() {
  const outDir = resolve(flags.outputDir);
  
  // Lire tous les fichiers de résultats
  const uiAudit = readJson(join(outDir, 'audit-ui.json'));
  const networkAudit = readJson(join(outDir, 'network.json'));
  const accessibilityAudit = readJson(join(outDir, 'accessibility.json'));
  const performanceAudit = readJson(join(outDir, 'performance.json'));
  
  // Vérifier qu'on a au moins des données
  const hasData = uiAudit || networkAudit || accessibilityAudit || performanceAudit;
  if (!hasData) {
    console.error('Aucune donnée d\'audit trouvée. Lancez d\'abord les scripts d\'audit.');
    process.exit(1);
  }

  const timestamp = new Date().toISOString();
  
  // ── Construire le rapport consolidé ──
  const report = {
    meta: {
      generatedAt: timestamp,
      version: '1.0',
      baseUrl: 'http://localhost:4174', // default, will be overridden if found in data
    },
    summary: {
      viewports: [...new Set([
        ...(uiAudit?.map(r => r.viewport) || []),
        ...(networkAudit?.map(r => r.viewport) || []),
        ...(accessibilityAudit?.map(r => r.viewport) || []),
        ...(performanceAudit?.map(r => r.viewport) || []),
      ])],
      routes: [...new Set([
        ...(uiAudit?.map(r => r.route) || []),
        ...(networkAudit?.map(r => r.route) || []),
        ...(accessibilityAudit?.map(r => r.route) || []),
        ...(performanceAudit?.map(r => r.route) || []),
      ])],
      totals: {
        screenshots: 0,
        ghostButtons: 0,
        consoleErrors: 0,
        networkErrors: 0,
        rmInfinite: 0,
        contrastIssues: 0,
        ariaIssues: 0,
        budgetViolations: 0,
      },
    },
    ui: uiAudit || [],
    network: networkAudit || [],
    accessibility: accessibilityAudit || [],
    performance: performanceAudit || [],
  };

  // Try to extract baseUrl from network audit which has full URLs
  if (networkAudit && networkAudit[0]?.allResponses?.[0]?.url) {
    try {
      report.meta.baseUrl = new URL(networkAudit[0].allResponses[0].url).origin;
    } catch (e) {}
  }

  // Calculer totaux
  if (uiAudit) {
    report.summary.totals.ghostButtons = uiAudit.reduce((s, r) => s + (r.ghostButtons?.length || 0), 0);
    report.summary.totals.consoleErrors = uiAudit.reduce((s, r) => s + (r.consoleErrors?.length || 0) + (r.pageErrors?.length || 0), 0);
  }
  if (networkAudit) {
    report.summary.totals.networkErrors = networkAudit.reduce((s, r) => s + (r.summary?.failedCount || 0), 0);
  }
  if (accessibilityAudit) {
    report.summary.totals.rmInfinite = accessibilityAudit.reduce((s, r) => s + (r.reducedMotion?.infiniteAnimations?.length || 0), 0);
    report.summary.totals.contrastIssues = accessibilityAudit.reduce((s, r) => s + (r.contrast?.issues?.length || 0), 0);
    report.summary.totals.ariaIssues = accessibilityAudit.reduce((s, r) => s + (r.normal?.ariaIssues?.length || 0), 0);
  }
  if (performanceAudit) {
    for (const r of performanceAudit) {
      if (r.budget) {
        for (const [key, val] of Object.entries(r.budget)) {
          if (val.value != null && val.value > val.budget) {
            report.summary.totals.budgetViolations++;
          }
        }
      }
    }
  }

  // ── Sortie JSON ──
  if (flags.format === 'all' || flags.format === 'json') {
    const jsonPath = join(outDir, 'report.json');
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`[report-builder] JSON: ${jsonPath}`);
  }

  // ── Sortie Markdown ──
  if (flags.format === 'all' || flags.format === 'md') {
    let md = `# Rapport d'audit automatisé Sargagame\n\n`;
    md += `**Généré le:** ${new Date(timestamp).toLocaleString('fr-FR')}\n`;
    md += `**Base URL:** ${report.meta.baseUrl}\n`;
    md += `**Viewports testés:** ${report.summary.viewports.join(', ')}\n`;
    md += `**Routes testées:** ${report.summary.routes.join(', ')}\n\n`;
    
    md += `## Résumé global\n\n`;
    md += `| Métrique | Valeur |\n|----------|--------|\n`;
    md += `| Boutons fantômes/invisibles | ${report.summary.totals.ghostButtons} |\n`;
    md += `| Erreurs console | ${report.summary.totals.consoleErrors} |\n`;
    md += `| Erreurs réseau (4xx/5xx) | ${report.summary.totals.networkErrors} |\n`;
    md += `| Animations infinies (reduced-motion) | ${report.summary.totals.rmInfinite} |\n`;
    md += `| Problèmes contraste (WCAG AA) | ${report.summary.totals.contrastIssues} |\n`;
    md += `| Problèmes ARIA | ${report.summary.totals.ariaIssues} |\n`;
    md += `| Violations budget performance | ${report.summary.totals.budgetViolations} |\n\n`;
    
    // UI Audit
    if (uiAudit && uiAudit.length > 0) {
      md += `## Audit UI\n\n`;
      for (const vp of report.summary.viewports) {
        md += `### Viewport: ${vp}\n\n`;
        const vpResults = uiAudit.filter(r => r.viewport === vp);
        for (const r of vpResults) {
          md += `#### ${r.route} (${r.path})\n\n`;
          if (r.error) {
            md += `❌ **Erreur:** ${r.error}\n\n`;
            continue;
          }
          const ghosts = r.ghostButtons?.length || 0;
          const errors = (r.consoleErrors?.length || 0) + (r.pageErrors?.length || 0);
          const overflow = r.overflow?.hasHorizontalOverflow ? '⚠️ OUI' : '✅ NON';
          md += `- Boutons fantômes/invisibles: **${ghosts}** ${ghosts === 0 ? '✅' : '❌'}\n`;
          md += `- Erreurs console: **${errors}** ${errors === 0 ? '✅' : '❌'}\n`;
          md += `- Overflow horizontal: ${overflow}\n`;
          if (r.ghostButtons?.length > 0) {
            md += `\n**Détails boutons:**\n`;
            for (const b of r.ghostButtons.slice(0, 10)) {
              md += `- ${b.why}: "${b.text}" (class: ${b.class})\n`;
            }
          }
          md += `\n`;
        }
      }
    }
    
    // Network Audit
    if (networkAudit && networkAudit.length > 0) {
      md += `## Audit Réseau\n\n`;
      for (const vp of report.summary.viewports) {
        md += `### Viewport: ${vp}\n\n`;
        const vpResults = networkAudit.filter(r => r.viewport === vp);
        for (const r of vpResults) {
          if (r.error) continue;
          md += `#### ${r.route}\n\n`;
          md += `- Requêtes totales: **${r.summary?.totalRequests || 0}**\n`;
          md += `- Poids total: **${formatBytes(r.summary?.totalBytes || 0)}**\n`;
          md += `- Requêtes échouées: **${r.summary?.failedCount || 0}**\n`;
          md += `- JS: **${formatBytes(r.summary?.totalJsSize || 0)}** (${r.summary?.criticalCount || 0} critiques)\n`;
          md += `- CSS: **${formatBytes(r.summary?.totalCssSize || 0)}**\n\n`;
          
          if (r.failedRequests?.length > 0) {
            md += `**Requêtes échouées:**\n`;
            for (const f of r.failedRequests.slice(0, 10)) {
              md += `- [${f.status}] ${f.url} (${f.type})\n`;
            }
            md += `\n`;
          }
        }
      }
    }
    
    // Accessibility Audit
    if (accessibilityAudit && accessibilityAudit.length > 0) {
      md += `## Audit Accessibilité\n\n`;
      for (const vp of report.summary.viewports) {
        md += `### Viewport: ${vp}\n\n`;
        const vpResults = accessibilityAudit.filter(r => r.viewport === vp);
        for (const r of vpResults) {
          if (r.error) continue;
          md += `#### ${r.route}\n\n`;
          
          // Reduced motion
          const rm = r.reducedMotion;
          const rmPassed = rm?.passed ? '✅' : '❌';
          md += `- Reduced-motion (animations infinies): **${rm?.infiniteAnimations?.length || 0}** ${rmPassed}\n`;
          if (rm?.infiniteAnimations?.length > 0) {
            for (const a of rm.infiniteAnimations.slice(0, 5)) {
              md += `  - ${a.name} sur ${a.element}\n`;
            }
          }
          
          // Contraste
          const contrast = r.contrast;
          const contrastPassed = contrast?.passed ? '✅' : '❌';
          md += `- Contraste WCAG AA: **${contrast?.issues?.length || 0}** problèmes ${contrastPassed}\n`;
          if (contrast?.issues?.length > 0) {
            for (const c of contrast.issues.slice(0, 5)) {
              md += `  - Ratio ${c.ratio}:1 (seuil ${c.threshold}:1) - "${c.text}"\n`;
            }
          }
          
          // ARIA
          const aria = r.normal?.ariaIssues?.length || 0;
          md += `- Problèmes ARIA: **${aria}** ${aria === 0 ? '✅' : '❌'}\n`;
          if (r.normal?.ariaIssues?.length > 0) {
            for (const a of r.normal.ariaIssues.slice(0, 5)) {
              md += `  - ${a.issue}: ${a.tag}.${a.class}\n`;
            }
          }
          
          // Landmarks
          const landmarks = r.normal?.landmarks;
          if (landmarks) {
            md += `- Landmarks: `;
            md += Object.entries(landmarks).map(([k, v]) => `${k}:${v}`).join(', ');
            md += `\n`;
          }
          
          // Headings
          const headings = r.normal?.headings?.length || 0;
          md += `- Titres (h1-h6): **${headings}**\n`;
          
          // Focus
          const focusStyles = r.normal?.focusStyles?.filter(f => f.hasVisibleFocus).length || 0;
          const focusTotal = r.normal?.focusStyles?.length || 0;
          md += `- Styles de focus visibles: **${focusStyles}/${focusTotal}**\n`;
          
          md += `\n`;
        }
      }
    }
    
    // Performance Audit
    if (performanceAudit && performanceAudit.length > 0) {
      md += `## Audit Performance\n\n`;
      for (const vp of report.summary.viewports) {
        md += `### Viewport: ${vp}\n\n`;
        const vpResults = performanceAudit.filter(r => r.viewport === vp);
        for (const r of vpResults) {
          if (r.error) continue;
          md += `#### ${r.route} (médiane sur ${r.successfulRuns}/${r.runs} runs)\n\n`;
          
          const b = r.budget;
          if (b) {
            md += `| Métrique | Valeur | Budget | Statut |\n|----------|--------|--------|--------|\n`;
            for (const [key, val] of Object.entries(b)) {
              if (val.value != null) {
                const status = val.value <= val.budget ? '✅' : '❌';
                md += `| ${key.toUpperCase()} | ${formatMs(val.value)} | ${formatMs(val.budget)} | ${status} |\n`;
              }
            }
            md += `\n`;
          }
          
          md += `- Requêtes totales: **${r.resources?.total || 0}**\n`;
          md += `- Poids total: **${formatBytes(r.resources?.totalBytes || 0)}**\n`;
          md += `- JS: **${formatBytes(r.resources?.js?.bytes || 0)}** (${r.resources?.js?.count || 0} fichiers)\n`;
          md += `- CSS: **${formatBytes(r.resources?.css?.bytes || 0)}** (${r.resources?.css?.count || 0} fichiers)\n\n`;
        }
      }
    }
    
    md += `---\n*Rapport généré automatiquement par automation/report-builder.mjs*\n`;
    
    const mdPath = join(outDir, 'report.md');
    writeFileSync(mdPath, md);
    console.log(`[report-builder] Markdown: ${mdPath}`);
  }

  // ── Sortie HTML ──
  if (flags.format === 'all' || flags.format === 'html') {
    let html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport d'audit Sargagame - ${new Date(timestamp).toLocaleDateString('fr-FR')}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #fafafa; }
    h1 { color: #0EA5E9; border-bottom: 2px solid #0EA5E9; padding-bottom: 8px; }
    h2 { color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; margin-top: 32px; }
    h3 { color: #333; margin-top: 24px; }
    h4 { color: #444; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:hover { background: #fafafa; }
    .pass { color: #16a34a; font-weight: 600; }
    .fail { color: #dc2626; font-weight: 600; }
    .warn { color: #ca8a04; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-pass { background: #dcfce7; color: #16a34a; }
    .badge-fail { background: #fee2e2; color: #dc2626; }
    .badge-warn { background: #fef9c3; color: #ca8a04; }
    .section { background: white; padding: 20px; border-radius: 8px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .card { background: white; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .metric { font-size: 24px; font-weight: 700; color: #0EA5E9; }
    .metric-label { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    pre { background: #1a1a1a; color: #e5e5e5; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
    code { font-family: 'SF Mono', Monaco, monospace; }
    .collapsible { cursor: pointer; }
    .collapsible + .content { display: none; }
    .collapsible.open + .content { display: block; }
    .timestamp { color: #666; font-size: 14px; }
    .viewport-tag { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-right: 8px; }
  </style>
</head>
<body>
  <h1>Rapport d'audit automatisé Sargagame</h1>
  <p class="timestamp">Généré le ${new Date(timestamp).toLocaleString('fr-FR')} | Base: ${report.meta.baseUrl}</p>
  
  <div class="grid">
    <div class="card">
      <div class="metric-label">Viewports testés</div>
      <div class="metric">${report.summary.viewports.length}</div>
    </div>
    <div class="card">
      <div class="metric-label">Routes testées</div>
      <div class="metric">${report.summary.routes.length}</div>
    </div>
    <div class="card">
      <div class="metric-label">Boutons fantômes/invisibles</div>
      <div class="metric ${report.summary.totals.ghostButtons === 0 ? 'pass' : 'fail'}">${report.summary.totals.ghostButtons}</div>
    </div>
    <div class="card">
      <div class="metric-label">Erreurs console</div>
      <div class="metric ${report.summary.totals.consoleErrors === 0 ? 'pass' : 'fail'}">${report.summary.totals.consoleErrors}</div>
    </div>
    <div class="card">
      <div class="metric-label">Erreurs réseau</div>
      <div class="metric ${report.summary.totals.networkErrors === 0 ? 'pass' : 'fail'}">${report.summary.totals.networkErrors}</div>
    </div>
    <div class="card">
      <div class="metric-label">Animations infinies (a11y)</div>
      <div class="metric ${report.summary.totals.rmInfinite === 0 ? 'pass' : 'fail'}">${report.summary.totals.rmInfinite}</div>
    </div>
    <div class="card">
      <div class="metric-label">Problèmes contraste</div>
      <div class="metric ${report.summary.totals.contrastIssues === 0 ? 'pass' : 'fail'}">${report.summary.totals.contrastIssues}</div>
    </div>
    <div class="card">
      <div class="metric-label">Violations budget perf</div>
      <div class="metric ${report.summary.totals.budgetViolations === 0 ? 'pass' : 'fail'}">${report.summary.totals.budgetViolations}</div>
    </div>
  </div>

  ${generateHtmlSection('UI', uiAudit, report.summary.viewports, renderUiSection)}
  ${generateHtmlSection('Réseau', networkAudit, report.summary.viewports, renderNetworkSection)}
  ${generateHtmlSection('Accessibilité', accessibilityAudit, report.summary.viewports, renderA11ySection)}
  ${generateHtmlSection('Performance', performanceAudit, report.summary.viewports, renderPerfSection)}

  <script>
    document.querySelectorAll('.collapsible').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('open');
      });
    });
  </script>
</body>
</html>`;

    function generateHtmlSection(title, data, viewports, renderer) {
      if (!data || data.length === 0) return '';
      let html = `<div class="section"><h2>${title}</h2>`;
      for (const vp of viewports) {
        const vpData = data.filter(r => r.viewport === vp);
        if (vpData.length === 0) continue;
        html += `<h3><span class="viewport-tag">${vp}</span> ${title}</h3>`;
        html += renderer(vpData);
      }
      html += `</div>`;
      return html;
    }

    function renderUiSection(data) {
      let html = '';
      for (const r of data) {
        if (r.error) {
          html += `<div class="card"><h4>${escapeHtml(r.route)} <span class="badge badge-fail">ERREUR</span></h4><pre>${escapeHtml(r.error)}</pre></div>`;
          continue;
        }
        const ghosts = r.ghostButtons?.length || 0;
        const errors = (r.consoleErrors?.length || 0) + (r.pageErrors?.length || 0);
        const overflow = r.overflow?.hasHorizontalOverflow;
        const statusClass = ghosts === 0 && errors === 0 && !overflow ? 'badge-pass' : 'badge-fail';
        const statusText = ghosts === 0 && errors === 0 && !overflow ? 'OK' : 'ISSUES';
        html += `<div class="card"><h4>${escapeHtml(r.route)} <span class="badge ${statusClass}">${statusText}</span></h4>`;
        html += `<p>Boutons fantômes: <strong>${ghosts}</strong> | Erreurs: <strong>${errors}</strong> | Overflow: <strong>${overflow ? 'OUI' : 'NON'}</strong></p>`;
        if (r.ghostButtons?.length > 0) {
          html += `<button class="collapsible">Voir détails (${r.ghostButtons.length})</button><div class="content"><ul>`;
          for (const b of r.ghostButtons.slice(0, 15)) {
            html += `<li><code>${escapeHtml(b.why)}</code>: "${escapeHtml(b.text)}" — class: ${escapeHtml(b.class)}</li>`;
          }
          html += `</ul></div>`;
        }
        html += `</div>`;
      }
      return html;
    }

    function renderNetworkSection(data) {
      let html = '';
      for (const r of data) {
        if (r.error) continue;
        html += `<div class="card"><h4>${escapeHtml(r.route)}</h4>`;
        html += `<p>Requêtes: <strong>${r.summary?.totalRequests || 0}</strong> | Poids: <strong>${formatBytesHtml(r.summary?.totalBytes || 0)}</strong> | Échecs: <strong class="${r.summary?.failedCount > 0 ? 'fail' : 'pass'}">${r.summary?.failedCount || 0}</strong></p>`;
        html += `<p>JS: <strong>${formatBytesHtml(r.summary?.totalJsSize || 0)}</strong> | CSS: <strong>${formatBytesHtml(r.summary?.totalCssSize || 0)}</strong></p>`;
        if (r.failedRequests?.length > 0) {
          html += `<button class="collapsible">Requêtes échouées (${r.failedRequests.length})</button><div class="content"><table><tr><th>Status</th><th>URL</th><th>Type</th></tr>`;
          for (const f of r.failedRequests.slice(0, 20)) {
            html += `<tr><td>${f.status}</td><td>${escapeHtml(f.url)}</td><td>${f.type}</td></tr>`;
          }
          html += `</table></div>`;
        }
        html += `</div>`;
      }
      return html;
    }

    function renderA11ySection(data) {
      let html = '';
      for (const r of data) {
        if (r.error) continue;
        const rm = r.reducedMotion;
        const contrast = r.contrast;
        const aria = r.normal?.ariaIssues?.length || 0;
        const landmarks = r.normal?.landmarks;
        html += `<div class="card"><h4>${escapeHtml(r.route)}</h4>`;
        html += `<p>Reduced-motion: <strong class="${rm?.passed ? 'pass' : 'fail'}">${rm?.infiniteAnimations?.length || 0} animations infinies</strong></p>`;
        html += `<p>Contraste WCAG AA: <strong class="${contrast?.passed ? 'pass' : 'fail'}">${contrast?.issues?.length || 0} problèmes</strong></p>`;
        html += `<p>ARIA: <strong class="${aria === 0 ? 'pass' : 'fail'}">${aria} problèmes</strong></p>`;
        if (landmarks) {
          html += `<p>Landmarks: ${Object.entries(landmarks).map(([k,v]) => `<code>${k}</code>:${v}`).join(' | ')}</p>`;
        }
        if (rm?.infiniteAnimations?.length > 0) {
          html += `<button class="collapsible">Animations infinies</button><div class="content"><ul>`;
          for (const a of rm.infiniteAnimations) {
            html += `<li>${escapeHtml(a.name)} sur <code>${escapeHtml(a.element)}</code></li>`;
          }
          html += `</ul></div>`;
        }
        if (contrast?.issues?.length > 0) {
          html += `<button class="collapsible">Problèmes contraste</button><div class="content"><ul>`;
          for (const c of contrast.issues.slice(0, 10)) {
            html += `<li>Ratio ${c.ratio}:1 (seuil ${c.threshold}:1) — "${escapeHtml(c.text)}"</li>`;
          }
          html += `</ul></div>`;
        }
        html += `</div>`;
      }
      return html;
    }

    function renderPerfSection(data) {
      let html = '';
      for (const r of data) {
        if (r.error) continue;
        html += `<div class="card"><h4>${escapeHtml(r.route)} (médiane ${r.successfulRuns}/${r.runs} runs)</h4>`;
        if (r.budget) {
          html += `<table><tr><th>Métrique</th><th>Valeur</th><th>Budget</th><th>Statut</th></tr>`;
          for (const [key, val] of Object.entries(r.budget)) {
            if (val.value != null) {
              const passed = val.value <= val.budget;
              html += `<tr><td>${key.toUpperCase()}</td><td>${formatMsHtml(val.value)}</td><td>${formatMsHtml(val.budget)}</td><td><span class="badge ${passed ? 'badge-pass' : 'badge-fail'}">${passed ? 'OK' : 'DÉPASSÉ'}</span></td></tr>`;
            }
          }
          html += `</table>`;
        }
        html += `<p>Requêtes: <strong>${r.resources?.total || 0}</strong> | Total: <strong>${formatBytesHtml(r.resources?.totalBytes || 0)}</strong> | JS: <strong>${formatBytesHtml(r.resources?.js?.bytes || 0)}</strong> | CSS: <strong>${formatBytesHtml(r.resources?.css?.bytes || 0)}</strong></p>`;
        html += `</div>`;
      }
      return html;
    }

    function formatBytesHtml(b) {
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
      return `${(b / 1024 / 1024).toFixed(2)} Mo`;
    }
    function formatMsHtml(ms) {
      if (ms == null) return 'N/A';
      if (ms < 1000) return `${ms.toFixed(0)} ms`;
      return `${(ms / 1000).toFixed(2)} s`;
    }

    const htmlPath = join(outDir, 'report.html');
    writeFileSync(htmlPath, html);
    console.log(`[report-builder] HTML: ${htmlPath}`);
  }

  console.log('\n[report-builder] Rapport généré avec succès !');
}

main().catch(err => {
  console.error('[report-builder] Erreur fatale:', err);
  process.exit(1);
});