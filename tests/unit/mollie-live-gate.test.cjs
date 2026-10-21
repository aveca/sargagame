const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflow = fs.readFileSync(path.join(__dirname, "../../.github/workflows/cloudflare-production.yml"), "utf8");
const gateStart = workflow.indexOf("\\n  mollie-live-gate:");
const gateEnd = workflow.indexOf("\\n  deploy:", gateStart);
assert.notEqual(gateStart, -1, "production workflow defines mollie-live-gate");
assert.ok(gateEnd > gateStart, "gate is a distinct job before deploy");
const gate = workflow.slice(gateStart, gateEnd);
assert.match(gate, /needs: \\[scope\\]/);
assert.match(gate, /needs\\.scope\\.outputs\\.production == 'true'/);
assert.match(gate, /live_\\*/);
assert.match(gate, /SUPABASE_SERVICE_KEY/);
assert.match(gate, /MOLLIE_WEBHOOK_SECRET/);
assert.doesNotMatch(gate, /echo[^\\n]*\\$MOLLIE_API_KEY/);

assert.match(workflow, /deploy:\\n    needs: \\[build, certification-gate, scope, mollie-live-gate\\]/);
assert.match(workflow, /deploy-pages:\\n    needs: \\[build, certification-gate, scope, mollie-live-gate\\]/);
console.log("PASS: Mollie production gate is fail-closed and wired to Worker + Pages deploy jobs");
