const fs = require('fs');
const filePath = "C:\\Users\\user\\Documents\\Backup\\sargagame\\.ai\\ux-agent\\opencode-auto.cjs";
const functionsPath = "C:\\Users\\user\\Documents\\Backup\\sargagame\\opencode_functions.txt";
let content = fs.readFileSync(filePath, 'utf8');
let functions = fs.readFileSync(functionsPath, 'utf8');
// We want to insert the functions after line 98 (0-indexed) and before line 100 (0-indexed).
// Line 98 is the closing brace of the checkOllama function.
// We'll split the content into lines.
const lines = content.split('\n');
// We want to insert after line 98, so we will splice the lines array at index 99.
// The lines array is 0-indexed.
// Line 0: first line
// Line 98: the 99th line (the closing brace of the checkOllama function)
// We want to insert after this line, so at index 99.
const newLines = [
  // Lines before the insertion point
  ...lines.slice(0, 99),
  // The functions string split into lines
  ...functions.split('\n'),
  // Lines after the insertion point
  ...lines.slice(99)
];
const newContent = newLines.join('\n');
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Functions inserted successfully');