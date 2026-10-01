const fs = require('fs');
const filePath = "C:\\Users\\user\\Documents\\Backup\\sargagame\\add_functions.cjs";
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');
// We want to extract the content of the newFunctions variable, which is from line 22 (0-indexed) to line 131 (0-indexed) inclusive.
// This corresponds to 1-indexed lines 23 to 132.
const functionLines = lines.slice(22, 132); // 0-indexed 22 to 131 inclusive
let functions = functionLines.join('\n');
// Remove the trailing newline if any
functions = functions.trim();
// If the string ends with "`;", remove it
if (functions.endsWith('`;')) {
  functions = functions.slice(0, -2);
}
// Write to file
fs.writeFileSync("C:\\Users\\user\\Documents\\Backup\\sargagame\\opencode_functions.txt", functions, 'utf8');
console.log('Functions extracted');