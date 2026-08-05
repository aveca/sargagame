#!/usr/bin/env node
const fs = require('fs');
const content = fs.readFileSync('dist/index.html', 'utf-8');

// Find all buttons
const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
let match;
let count = 0;
while ((match = buttonRegex.exec(content)) !== null) {
  const fullMatch = match[0];
  const innerContent = match[1];
  const hasAriaLabel = fullMatch.includes('aria-label');
  const hasAriaLabelledby = fullMatch.includes('aria-labelledby');
  const hasTextContent = innerContent.trim().length > 0 && !innerContent.includes('<');
  const hasSVG = innerContent.includes('<svg');
  
  if (!hasAriaLabel && !hasAriaLabelledby && !hasTextContent && !hasSVG) {
    const beforeMatch = content.substring(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    count++;
    console.log('Button ' + count + ' at line ' + lineNumber + ': ' + fullMatch.substring(0, 200));
  }
}

console.log('Total buttons without accessible name (no aria, no text, no SVG): ' + count);

// Also check role="button"
const roleButtonRegex = /<[^>]+role="button"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
let roleCount = 0;
while ((match = roleButtonRegex.exec(content)) !== null) {
  const fullMatch = match[0];
  const innerContent = match[1];
  const hasAriaLabel = fullMatch.includes('aria-label');
  const hasAriaLabelledby = fullMatch.includes('aria-labelledby');
  const hasTextContent = innerContent.trim().length > 0 && !innerContent.includes('<');
  const hasSVG = innerContent.includes('<svg');
  
  if (!hasAriaLabel && !hasAriaLabelledby && !hasTextContent && !hasSVG) {
    const beforeMatch = content.substring(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    roleCount++;
    console.log('Role=button ' + roleCount + ' at line ' + lineNumber + ': ' + fullMatch.substring(0, 200));
  }
}
console.log('Total role=button without accessible name: ' + roleCount);