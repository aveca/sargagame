#!/usr/bin/env node
/**
 * playwright-runner.cjs — Run Playwright scripts directly without npx wrapper.
 * This avoids shell:true on Windows which can create console windows.
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error('Usage: node playwright-runner.cjs <script-path>');
  process.exit(1);
}

const script = fs.readFileSync(scriptPath, 'utf8');

(async () => {
  try {
    // eslint-disable-next-line no-eval
    eval(script);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();