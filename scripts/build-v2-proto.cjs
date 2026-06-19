#!/usr/bin/env node
/* Assemble le prototype ARENA v2 : injecte design/v2-parts/part*.html entre
   les marqueurs <!--SCREENS_START--> ... <!--SCREENS_END--> de design/arena-v2.html.
   Idempotent (re-runnable). Usage: node scripts/build-v2-proto.cjs */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const shellPath = path.join(root, "design", "arena-v2.html");
const partsDir = path.join(root, "design", "v2-parts");
let shell = fs.readFileSync(shellPath, "utf8");

const parts = ["partA.html", "partB.html", "partC.html"]
  .map(f => { const p = path.join(partsDir, f); return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : ""; })
  .filter(Boolean)
  .join("\n\n");

const START = "<!--SCREENS_START-->", END = "<!--SCREENS_END-->";
const a = shell.indexOf(START), b = shell.indexOf(END);
if (a === -1 || b === -1) { console.error("Marqueurs SCREENS_START/END introuvables"); process.exit(1); }
shell = shell.slice(0, a + START.length) + "\n" + parts + "\n" + shell.slice(b);
fs.writeFileSync(shellPath, shell);

const count = (shell.match(/class="vscreen/g) || []).length;
console.log("OK — " + count + " écrans assemblés dans design/arena-v2.html");
