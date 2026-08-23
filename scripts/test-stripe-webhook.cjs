#!/usr/bin/env node
/**
 * Tests locaux du webhook Stripe signé (public/api/stripe-webhook.php).
 * Aucun appel réseau vers Stripe ni vers l'Apps Script de prod : le forward
 * est redirigé vers 127.0.0.1:9 (échec immédiat → teste le chemin de log).
 *
 * Deux modes :
 *  - php-cli présent  → php -l + simulation complète (signature valide → 200,
 *    signature invalide → 400, timestamp périmé → 400, replay event.id → 200
 *    duplicate, island inconnu → 200 ignore, invoice lines metadata → 200).
 *  - php-cli absent   → équivalence JS de l'extraction/vérification de
 *    signature (même algo : t/v1, HMAC-SHA256, comparaison temps constant,
 *    tolérance 300 s) + checks statiques du source PHP + parité avec
 *    regions/index.cjs. Le test PHP complet se rejoue après le deploy
 *    (ou dès qu'un php-cli est installé) : node scripts/test-stripe-webhook.cjs
 */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { getAllRegions, getRegion } = require("../regions/index.cjs");

const ROOT = path.join(__dirname, "..");
const WEBHOOK_PHP = path.join(ROOT, "public", "api", "stripe-webhook.php");
const CHECKOUT_PHP = path.join(ROOT, "public", "api", "create-checkout.php");
const DATA_HTACCESS = path.join(ROOT, "public", "api", "data", ".htaccess");

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok || !detail ? "" : " — " + detail}`);
  if (!ok) failures++;
}

// ── Miroir JS exact de la vérification PHP (parsing t=/v1=, HMAC, 300 s) ─────
function verifySignature(sigHeader, payload, secret, nowSec) {
  let ts = null;
  const v1s = [];
  for (const part of String(sigHeader).split(",")) {
    const p = part.trim();
    const eq = p.indexOf("="); // = explode('=', $part, 2)
    if (eq === -1) continue;
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    if (k === "t") ts = v;
    else if (k === "v1") v1s.push(v);
  }
  if (ts === null || !/^\d+$/.test(ts) || v1s.length === 0) return false; // ctype_digit
  if (Math.abs(nowSec - parseInt(ts, 10)) > 300) return false; // replay protection 5 min
  const expected = crypto.createHmac("sha256", secret).update(ts + "." + payload).digest("hex");
  return v1s.some((v1) => {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(v1));
    return a.length === b.length && crypto.timingSafeEqual(a, b); // = hash_equals
  });
}

function sign(payload, secret, ts) {
  const v1 = crypto.createHmac("sha256", secret).update(ts + "." + payload).digest("hex");
  return `t=${ts},v1=${v1}`;
}

function runJsMirrorTests() {
  console.log("\n[1] Équivalence JS de la vérification de signature");
  const secret = "whsec_test_local_only";
  const payload = JSON.stringify({ id: "evt_js_1", type: "checkout.session.completed" });
  const now = Math.floor(Date.now() / 1000);

  check("signature valide acceptée", verifySignature(sign(payload, secret, now), payload, secret, now) === true);
  const tampered = sign(payload, secret, now).replace(/v1=./, "v1=0").replace(/v1=00/, "v1=0f");
  check("v1 altéré rejeté", verifySignature(`t=${now},v1=${"0".repeat(64)}`, payload, secret, now) === false);
  check("payload altéré rejeté", verifySignature(sign(payload, secret, now), payload + " ", secret, now) === false);
  check("mauvais secret rejeté", verifySignature(sign(payload, "whsec_autre", now), payload, secret, now) === false);
  check("timestamp -600 s rejeté (replay)", verifySignature(sign(payload, secret, now - 600), payload, secret, now) === false);
  check("timestamp +600 s rejeté", verifySignature(sign(payload, secret, now + 600), payload, secret, now) === false);
  check("timestamp -299 s accepté", verifySignature(sign(payload, secret, now - 299), payload, secret, now) === true);
  check("header sans t= rejeté", verifySignature(`v1=${"a".repeat(64)}`, payload, secret, now) === false);
  check("header vide rejeté", verifySignature("", payload, secret, now) === false);
  const good = sign(payload, secret, now);
  const multi = `t=${now},v1=${"b".repeat(64)},${good.split(",")[1]}`;
  check("plusieurs v1 dont un valide accepté (rotation)", verifySignature(multi, payload, secret, now) === true);
  void tampered;
}

// ── Checks statiques du source PHP ───────────────────────────────────────────
function stripQuotedAndComments(src) {
  // Retire commentaires // et contenus de chaînes pour compter les délimiteurs
  let out = "";
  let inS = false, inD = false, inC = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inC) { if (c === "\n") { inC = false; out += c; } continue; }
    if (inS) { if (c === "\\") { i++; continue; } if (c === "'") inS = false; continue; }
    if (inD) { if (c === "\\") { i++; continue; } if (c === '"') inD = false; continue; }
    if (c === "/" && n === "/") { inC = true; continue; }
    if (c === "'") { inS = true; continue; }
    if (c === '"') { inD = true; continue; }
    out += c;
  }
  return out;
}

function runStaticChecks() {
  console.log("\n[2] Checks statiques de stripe-webhook.php");
  const src = fs.readFileSync(WEBHOOK_PHP, "utf-8");

  // a) Première instruction utile = lecture brute de php://input
  const firstStmt = src
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && l !== "<?php" && !l.startsWith("//"));
  check(
    "1re instruction utile = $payload = file_get_contents('php://input')",
    !!firstStmt && firstStmt.startsWith("$payload = file_get_contents('php://input')"),
    firstStmt
  );

  // b) Vérification de signature conforme
  check("hash_hmac('sha256', $ts . '.' . $payload, …) présent", src.includes("hash_hmac('sha256', $ts . '.' . $payload"));
  check("comparaison via hash_equals (temps constant)", src.includes("hash_equals($expected, $v1)"));
  check("aucune comparaison == sur la signature", !/\$expected\s*==|==\s*\$expected/.test(src));
  check("tolérance replay 300 s présente", src.includes("<= 300"));
  check("aucun json_decode avant la vérification de signature", src.indexOf("json_decode") > src.indexOf("hash_equals"));

  // c) Les 4 event types gérés
  for (const t of ["checkout.session.completed", "invoice.payment_succeeded", "customer.subscription.deleted", "invoice.payment_failed"]) {
    check(`event type géré: ${t}`, src.includes(`'${t}'`));
  }

  // d) Parité KNOWN_REGIONS ↔ regions/index.cjs (le commentaire SYNC du PHP)
  const m = src.match(/\$KNOWN_REGIONS\s*=\s*\[([^\]]*)\]/);
  const phpRegions = m ? (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)).sort() : [];
  const jsRegions = getAllRegions().map((r) => r.id).sort();
  check(
    "KNOWN_REGIONS == ids de regions/*.json",
    JSON.stringify(phpRegions) === JSON.stringify(jsRegions),
    `php=[${phpRegions}] regions=[${jsRegions}]`
  );

  // e) URL Apps Script identique à celle de create-checkout.php (canonique)
  const checkoutSrc = fs.readFileSync(CHECKOUT_PHP, "utf-8");
  const urlRe = /script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\//;
  const idWebhook = (src.match(urlRe) || [])[1];
  const idCheckout = (checkoutSrc.match(urlRe) || [])[1];
  check("deployment Apps Script == create-checkout.php", !!idWebhook && idWebhook === idCheckout, `${idWebhook} vs ${idCheckout}`);

  // f) Forward : follow 302 + timeout 10 s + log d'échec non servi
  check("CURLOPT_FOLLOWLOCATION => true (302 Apps Script)", src.includes("CURLOPT_FOLLOWLOCATION => true"));
  check("CURLOPT_TIMEOUT => 10", src.includes("CURLOPT_TIMEOUT      => 10") || /CURLOPT_TIMEOUT\s*=>\s*10/.test(src));
  check("échec forward loggé dans data/webhook-errors.log", src.includes("webhook-errors.log"));
  check("200 envoyé avant le forward (échec aval ≠ retry Stripe)", src.indexOf("http_response_code(200);\necho json_encode(['received' => true]);") < src.indexOf("forward_to_appsscript($APPSSCRIPT_URL"));

  // g) Idempotence + purge 30 j
  check("idempotence sur event.id (marqueur fichier)", src.includes("$event['id']") && src.includes("file_exists($marker)"));
  check("purge des marqueurs > 30 jours", src.includes("30 * 86400"));
  check("display_errors coupé (pas de stack trace client)", src.includes("ini_set('display_errors', '0')"));

  // h) Délimiteurs équilibrés (sanity sans php-cli)
  const clean = stripQuotedAndComments(src);
  for (const [o, c] of [["{", "}"], ["(", ")"], ["[", "]"]]) {
    const no = clean.split(o).length - 1;
    const nc = clean.split(c).length - 1;
    check(`délimiteurs ${o}${c} équilibrés`, no === nc, `${no} vs ${nc}`);
  }

  console.log("\n[3] Checks périphériques");
  const ht = fs.readFileSync(DATA_HTACCESS, "utf-8");
  check("public/api/data/.htaccess = Require all denied", ht.includes("Require all denied"));

  // CORS : les régions avec checkout live doivent être dans la whitelist
  for (const id of ["mq", "gp", "puntacana"]) {
    const domain = getRegion(id).domain;
    check(`CORS create-checkout.php inclut https://${domain}`, checkoutSrc.includes(`https://${domain}`));
  }

  const example = fs.readFileSync(path.join(ROOT, "public", "api", "stripe-config.example.php"), "utf-8");
  check("stripe-config.example.php contient webhook_secret", example.includes("'webhook_secret'") && example.includes("whsec_REPLACE_ME"));
  check("aucun secret réel dans le webhook (whsec_ live)", !/whsec_[A-Za-z0-9]{8,}/.test(src));
}

// ── Simulation PHP complète (si php-cli dispo) ───────────────────────────────
function phpAvailable() {
  const r = spawnSync("php", ["-v"], { encoding: "utf-8" });
  return !r.error && r.status === 0;
}

async function runPhpScenarios() {
  console.log("\n[4] php -l + simulation HTTP via php -S (vrai SAPI web)");
  const lint = spawnSync("php", ["-l", WEBHOOK_PHP], { encoding: "utf-8" });
  check("php -l stripe-webhook.php", lint.status === 0, (lint.stdout || lint.stderr || "").trim());
  if (lint.status !== 0) return;

  // Sandbox temp : copie du webhook + config de test (secret factice, forward
  // vers 127.0.0.1:9 → échec immédiat, rien ne part vers Stripe/Apps Script).
  // ⚠ php://input est TOUJOURS vide sous le SAPI CLI (require depuis php-cli ne
  // peut PAS simuler un POST) → on lance un vrai serveur php -S et on POSTe en
  // HTTP. C'est le seul mode de test local fidèle au runtime LiteSpeed/Apache.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sg-webhook-test-"));
  fs.copyFileSync(WEBHOOK_PHP, path.join(tmp, "stripe-webhook.php"));
  fs.writeFileSync(
    path.join(tmp, "stripe-config.php"),
    "<?php\nreturn [\n  'webhook_secret' => 'whsec_test_local_only',\n  'appsscript_url' => 'http://127.0.0.1:9/exec',\n];\n"
  );

  const PORT = 8099 + Math.floor(Math.random() * 400)
  const php = spawn("php", ["-S", `127.0.0.1:${PORT}`, "-t", tmp], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1500));

  const secret = "whsec_test_local_only";
  const now = Math.floor(Date.now() / 1000);
  const run = async (payload, sig, method = "POST") => {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/stripe-webhook.php`, {
        method,
        headers: sig === null ? { "Content-Type": "application/json" } : { "Content-Type": "application/json", "Stripe-Signature": sig },
        body: method === "POST" ? payload : undefined,
      });
      return { code: res.status, body: await res.text() };
    } catch (e) {
      return { code: 0, body: String(e) };
    }
  };

  const evt = (id, type, obj) => JSON.stringify({ id, type, data: { object: obj } });
  const uid = `evt_test_${Date.now()}`;

  try {
    // 1. Signature valide, island MQ → 200 (forward échoue vers 127.0.0.1:9, loggé)
    const p1 = evt(`${uid}_1`, "checkout.session.completed", {
      id: "cs_test_1", payment_status: "paid", amount_total: 499, currency: "eur",
      customer_details: { email: "test@example.com" }, metadata: { island: "MQ" },
    });
    let r = await run(p1, sign(p1, secret, now));
    check("signature valide → 200", r.code === 200 && r.body.includes('"received":true'), `code=${r.code} body=${r.body}`);

    // 2. Signature invalide → 400
    r = await run(p1, `t=${now},v1=${"0".repeat(64)}`);
    check("signature invalide → 400", r.code === 400, `code=${r.code}`);

    // 3. Timestamp périmé (replay) → 400
    r = await run(p1, sign(p1, secret, now - 600));
    check("timestamp périmé → 400", r.code === 400, `code=${r.code}`);

    // 4. Replay du même event.id → 200 duplicate (idempotence)
    r = await run(p1, sign(p1, secret, now));
    check("replay même event.id → 200 duplicate", r.code === 200 && r.body.includes('"duplicate":true'), `code=${r.code} body=${r.body}`);

    // 5. Island inconnu (autre business sur le compte Stripe) → 200 ignore
    const p5 = evt(`${uid}_5`, "checkout.session.completed", { id: "cs_test_5", metadata: { island: "botwow" } });
    r = await run(p5, sign(p5, secret, now));
    check("island inconnu → 200 ignore", r.code === 200 && r.body.includes('"ignored":"island"'), `code=${r.code} body=${r.body}`);

    // 6. invoice.payment_succeeded, island dans lines.data[].metadata → 200
    const p6 = evt(`${uid}_6`, "invoice.payment_succeeded", {
      id: "in_test_6", customer: "cus_test", customer_email: "test@example.com",
      subscription: "sub_test", status: "paid", amount_paid: 499, currency: "usd",
      lines: { data: [{ metadata: { island: "puntacana" } }] },
    });
    r = await run(p6, sign(p6, secret, now));
    check("invoice island via lines.data[].metadata → 200", r.code === 200 && r.body.includes('"received":true') && !r.body.includes("ignored"), `code=${r.code} body=${r.body}`);

    // 7. Event type non géré → 200 ignore
    const p7 = evt(`${uid}_7`, "charge.refunded", { id: "ch_test_7", metadata: { island: "mq" } });
    r = await run(p7, sign(p7, secret, now));
    check("event type non géré → 200 ignore", r.code === 200 && r.body.includes('"ignored":"event_type"'), `code=${r.code} body=${r.body}`);

    // 8. Header Stripe-Signature absent → 400
    r = await run(p1, null);
    check("signature absente → 400", r.code === 400, `code=${r.code}`);

    // 9. GET → 405
    r = await run("", sign("", secret, now), "GET");
    check("GET → 405", r.code === 405, `code=${r.code}`);

    // 10. JSON malformé avec signature valide → 400 invalid payload
    const bad = "{not json";
    r = await run(bad, sign(bad, secret, now));
    check("JSON malformé signé → 400", r.code === 400 && r.body.includes("invalid payload"), `code=${r.code} body=${r.body}`);

    // 11. event.id avec caractères à sanitiser → marqueur dans data/, pas d'évasion
    const p11 = evt("evt/../escape", "checkout.session.completed", { id: "cs_test_11", metadata: { island: "mq" } });
    r = await run(p11, sign(p11, secret, now));
    const markers = fs.existsSync(path.join(tmp, "data")) ? fs.readdirSync(path.join(tmp, "data")) : [];
    check("event.id sanitisé → marqueur dans data/, pas d'évasion", r.code === 200 && markers.includes("evt_.._escape") && !fs.existsSync(path.join(tmp, "..", "escape")), `markers=${markers.join(",")}`);

    // 12. Marqueur d'idempotence = fichier vide (zéro payload persisté)
    const m1 = path.join(tmp, "data", `${uid}_1`);
    check("marqueur event vide (zéro payload persisté)", fs.existsSync(m1) && fs.statSync(m1).size === 0);

    // L'échec du forward (127.0.0.1:9) doit être loggé sans casser le 200
    const log = path.join(tmp, "data", "webhook-errors.log");
    check("échec forward loggé dans data/webhook-errors.log", fs.existsSync(log) && fs.readFileSync(log, "utf-8").includes("forward_failed"));
  } finally {
    php.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  runJsMirrorTests();
  runStaticChecks();
  if (phpAvailable()) {
    await runPhpScenarios();
  } else {
    console.log("\n[4] php-cli absent sur ce poste → simulation PHP sautée.");
    console.log("    L'équivalence JS [1] couvre l'algo de signature ; le test PHP");
    console.log("    complet (php -S) se rejoue dès que php-cli est installé.");
  }

  console.log(failures === 0 ? "\nOK — tous les checks passent." : `\nFAIL — ${failures} check(s) en échec.`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
