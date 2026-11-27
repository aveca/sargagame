const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Le blob git est en LF, mais un checkout Windows (core.autocrlf=true) le
// matérialise en CRLF : sans normalisation, les assertions de CE TEST passent
// en CI (LF) et échouent en local (CRLF) sur le MÊME SHA. On normalise les fins
// de ligne à la lecture — l'assertion fonctionnelle reste identique partout.
const workflow = fs
  .readFileSync(path.join(__dirname, "../../.github/workflows/cloudflare-production.yml"), "utf8")
  .replace(/\r\n/g, "\n");
const gateStart = workflow.indexOf("\n  mollie-live-gate:");
const gateEnd = workflow.indexOf("\n  deploy:", gateStart);
assert.notEqual(gateStart, -1, "production workflow defines mollie-live-gate");
assert.ok(gateEnd > gateStart, "gate is a distinct job before deploy");
const gate = workflow.slice(gateStart, gateEnd);
assert.ok(gate.includes("needs: [scope]"));
assert.ok(gate.includes("needs.scope.outputs.production == 'true'"));
assert.ok(gate.includes("live_*"));
assert.ok(gate.includes("SUPABASE_SERVICE_KEY"));
assert.ok(gate.includes("MOLLIE_WEBHOOK_SECRET"));
assert.ok(!/echo[^\n]*\$MOLLIE_API_KEY/.test(gate), "secret value must never be echoed");
assert.ok(workflow.includes("deploy:\n    needs: [build, certification-gate, scope, mollie-live-gate]"));
assert.ok(workflow.includes("deploy-pages:\n    needs: [build, certification-gate, scope, mollie-live-gate]"));
console.log("PASS: Mollie production gate is fail-closed and wired to Worker + Pages deploy jobs");
