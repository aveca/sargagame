#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function checkAccessibilityInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Check for buttons without accessible name
  const buttonsWithoutName = [];
  const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  let match;
  
  while ((match = buttonRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const innerContent = match[1];
    
    const hasAriaLabel = fullMatch.includes('aria-label');
    const hasAriaLabelledby = fullMatch.includes('aria-labelledby');
    const hasTextContent = innerContent.trim().length > 0 && !innerContent.includes('<');
    
    if (!hasAriaLabel && !hasAriaLabelledby && !hasTextContent) {
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      buttonsWithoutName.push({ line: lineNumber, html: fullMatch.substring(0, 200) });
    }
  }
  
  // Also check role="button"
  const roleButtonRegex = /<[^>]+role="button"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
  while ((match = roleButtonRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const innerContent = match[1];
    
    const hasAriaLabel = fullMatch.includes('aria-label');
    const hasAriaLabelledby = fullMatch.includes('aria-labelledby');
    const hasTextContent = innerContent.trim().length > 0 && !innerContent.includes('<');
    
    if (!hasAriaLabel && !hasAriaLabelledby && !hasTextContent) {
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      buttonsWithoutName.push({ line: lineNumber, html: fullMatch.substring(0, 200) });
    }
  }
  
  return buttonsWithoutName;
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
      const buttons = checkAccessibilityInFile(fullPath);
      if (buttons.length > 0) {
        const relPath = path.relative(distDir, fullPath);
        results.push({ path: relPath, buttons });
      }
    }
  }
}

walk(distDir);

let totalButtons = 0;
for (const r of results) {
  totalButtons += r.buttons.length;
  console.log(r.path + ': ' + r.buttons.length + ' buttons without accessible name');
  for (const b of r.buttons) {
    console.log('  Line ' + b.line + ': ' + b.html);
  }
}

console.log('\nTotal buttons without accessible name in dist: ' + totalButtons);

// Also check for form inputs without labels in dist
console.log('\n=== Form inputs without labels in dist ===');
function checkFormInputs(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];
  
  const inputRegex = /<(input|select|textarea)[^>]*>/gi;
  let match;
  
  while ((match = inputRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const hasId = fullMatch.includes('id=');
    const hasAriaLabel = fullMatch.includes('aria-label');
    const hasAriaLabelledby = fullMatch.includes('aria-labelledby');
    
    // Check if wrapped in label (simplified)
    const beforeMatch = content.substring(Math.max(0, match.index - 200), match.index);
    const afterMatch = content.substring(match.index, match.index + 200);
    const wrappedInLabel = beforeMatch.includes('<label') || afterMatch.includes('</label>');
    
    if (!hasId && !hasAriaLabel && !hasAriaLabelledby && !wrappedInLabel) {
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      issues.push({ line: lineNumber, html: fullMatch.substring(0, 200) });
    } else if (hasId && !hasAriaLabel && !hasAriaLabelledby && !wrappedInLabel) {
      // Check for label[for]
      const idMatch = fullMatch.match(/id=["']([^"']+)["']/);
      if (idMatch) {
        const id = idMatch[1];
        const hasLabelFor = content.includes('for="' + id + '"') || content.includes("for='" + id + "'");
        if (!hasLabelFor) {
          const beforeMatch = content.substring(0, match.index);
          const lineNumber = beforeMatch.split('\n').length;
          issues.push({ line: lineNumber, html: fullMatch.substring(0, 200) + ' (id=' + id + ', no label[for])' });
        }
      }
    }
  }
  
  return issues;
}

const formResults = [];
function walkForms(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkForms(fullPath);
    } else if (file.endsWith('.html')) {
      const issues = checkFormInputs(fullPath);
      if (issues.length > 0) {
        const relPath = path.relative(distDir, fullPath);
        formResults.push({ path: relPath, issues });
      }
    }
  }
}

walkForms(distDir);

for (const r of formResults) {
  console.log(r.path + ': ' + r.issues.length + ' form inputs without labels');
  for (const i of r.issues) {
    console.log('  Line ' + i.line + ': ' + i.html);
  }
}