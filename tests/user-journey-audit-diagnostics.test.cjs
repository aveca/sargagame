#!/usr/bin/env node
"use strict";

// Régression : les audits E2E doivent identifier la ressource HTTP fautive,
// sans conserver de query string qui pourrait contenir un jeton ou un identifiant.
const assert = require("node:assert/strict");
const {
  dedupKey,
  safeResourceUrl,
  isIgnoredResource,
  resourceHttpDefect,
  resourceNetworkDefect,
  consoleDefect
} = require("../scripts/automation/user-journey-audit.cjs");

function test(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    console.error("  FAIL " + name + ": " + error.message);
    process.exitCode = 1;
  }
}

test("un 404 expose le code HTTP et le chemin exact", () => {
  const d = resourceHttpDefect("sargazotulum.com", 404, "https://sargazotulum.com/assets/missing.js");
  assert.equal(d.type, "http-404");
  assert.equal(d.detail, "404 https://sargazotulum.com/assets/missing.js");
});

test("les query params et fragments ne sont pas enregistrés", () => {
  const url = "https://example.test/assets/missing.js?token=secret&email=user%40example.test#debug";
  assert.equal(safeResourceUrl(url), "https://example.test/assets/missing.js");
  const d = resourceHttpDefect("example.test", 404, url);
  assert.doesNotMatch(d.detail, /secret|user%40example\.test/);
});

test("les réponses réussies ne créent pas de défaut", () => {
  assert.equal(resourceHttpDefect("example.test", 200, "https://example.test/app.js"), null);
  assert.equal(resourceHttpDefect("example.test", 302, "https://example.test/redirect"), null);
});

test("les ressources explicitement hors périmètre restent ignorées", () => {
  assert.equal(isIgnoredResource("https://example.test/api/b2b-partners"), true);
  assert.equal(resourceHttpDefect("example.test", 404, "https://example.test/referral.php"), null);
});

test("une erreur réseau utile contient la ressource", () => {
  const d = resourceNetworkDefect("example.test", "https://example.test/fonts/site.woff2", "net::ERR_NAME_NOT_RESOLVED");
  assert.equal(d.type, "network-error");
  assert.match(d.detail, /https:\/\/example\.test\/fonts\/site\.woff2/);
});

test("les annulations de requête ne deviennent pas de faux défauts", () => {
  assert.equal(resourceNetworkDefect("example.test", "https://example.test/app.js", "net::ERR_ABORTED"), null);
});

test("le message console HTTP générique est remplacé par le défaut avec URL", () => {
  assert.equal(consoleDefect("example.test", "Failed to load resource: the server responded with a status of 404 ()"), null);
  assert.deepEqual(consoleDefect("example.test", "TypeError: cannot read property"), {
    domain: "example.test",
    step: "any",
    type: "console-error",
    detail: "TypeError: cannot read property"
  });
});

test("deux URL 404 différentes restent dédupliquées séparément", () => {
  const a = resourceHttpDefect("example.test", 404, "https://example.test/assets/a.js");
  const b = resourceHttpDefect("example.test", 404, "https://example.test/assets/b.js");
  assert.notEqual(dedupKey(a), dedupKey(b));
});
