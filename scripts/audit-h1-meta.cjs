#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function countH1s(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const matches = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  return matches ? matches.length : 0;
}

function getH1Content(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const matches = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  return matches ? matches.map(m => m.replace(/<[^>]+>/g, '').trim()) : [];
}

function getTitle(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : 'NO TITLE';
}

function getMetaDesc(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/<meta name="description" content="([^"]*)"/i);
  return match ? match[1].trim() : 'NO META DESC';
}

function getGenerator(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Try to detect generator from comments or patterns
  if (content.includes('Sargasses_PROD.jsx') || content.includes('id="root"')) return 'SPA (Sargasses_PROD.jsx)';
  if (content.includes('build-sargassum-json')) return 'build-sargassum-json.cjs';
  if (content.includes('gen-b2b-partners')) return 'gen-b2b-partners.cjs';
  if (content.includes('auto-optimize')) return 'auto-optimize.cjs';
  if (content.includes('auto-copywriting')) return 'auto-copywriting.cjs';
  return 'static/other';
}

const distDir = 'dist';
const results = [];

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith('.html')) {
      const h1Count = countH1s(fullPath);
      const h1Contents = getH1Content(fullPath);
      const title = getTitle(fullPath);
      const metaDesc = getMetaDesc(fullPath);
      const generator = getGenerator(fullPath);
      const relPath = path.relative(distDir, fullPath);
      results.push({ path: relPath, h1Count, h1Contents, title, metaDesc, generator });
    }
  }
}

walk(distDir);

console.log('Page | H1 Count | Generator | H1 Content | Title | Meta Desc');
console.log('-----|----------|-----------|------------|-------|----------');
for (const r of results.sort((a,b) => a.path.localeCompare(b.path))) {
  console.log(r.path + ' | ' + r.h1Count + ' | ' + r.generator + ' | ' + JSON.stringify(r.h1Contents) + ' | ' + r.title.substring(0,80) + ' | ' + r.metaDesc.substring(0,80));
}

// Summary
const h1Stats = {};
for (const r of results) {
  h1Stats[r.h1Count] = (h1Stats[r.h1Count] || 0) + 1;
}
console.log('\n=== H1 Distribution ===');
for (const [count, num] of Object.entries(h1Stats).sort((a,b) => parseInt(a[0]) - parseInt(b[0]))) {
  console.log('H1=' + count + ': ' + num + ' pages');
}

const genStats = {};
for (const r of results) {
  genStats[r.generator] = (genStats[r.generator] || 0) + 1;
}
console.log('\n=== Generator Distribution ===');
for (const [gen, num] of Object.entries(genStats).sort((a,b) => b[1] - a[1])) {
  console.log(gen + ': ' + num + ' pages');
}