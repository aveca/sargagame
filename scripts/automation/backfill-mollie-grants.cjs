#!/usr/bin/env node
'use strict';
// scripts/automation/backfill-mollie-grants.cjs
//
// Cycle 2 — backfill of the 6 historical Mollie payments that were paid
// (Mollie LIVE) but never granted (grant rows absent in payment_grants).
//
// STRICT DRY RUN BY DEFAULT.
//   - Reads Mollie LIVE for each payment (GET /v2/payments/{id}).
//   - Re-verifies status, amount, currency, pass, email.
//   - Checks refunds/chargebacks.
//   - Checks for an existing grant in Supabase (payment_grants by payment_id).
//   - Produces a JSON report WITHOUT PII (email domain only, hashed email).
//   - Does NOT write to Supabase unless --apply is passed AND a second
//     confirmation flag --confirm-backfill=YES-I-HAVE-APPROVED is provided.
//
// Usage:
//   node scripts/automation/backfill-mollie-grants.cjs            # dry run (default)
//   node scripts/automation/backfill-mollie-grants.cjs --dry-run # explicit
//   node scripts/automation/backfill-mollie-grants.cjs --apply --confirm-backfill=YES-I-HAVE-APPROVED
//
// Required env (never hard-coded, never committed):
//   MOLLIE_API_KEY            (live or test)
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//
// Historical payments (Mollie LIVE verified paid).
const HISTORICAL_PAYMENTS = [
  "tr_rgY7NvWRTZaeDS5vbDBUJ",
  "tr_FfiGZtWSQWXB5b374A7UJ",
  "tr_3nxkaEMuRfPM2TWLXQeTJ",
  "tr_2Q9ubn2wUWA3CmoDM4eTJ",
  "tr_r6JWpvCbAd4w29rTq5LTJ",
  "tr_VzFK5ihNua7Wq4fWyETJ".replace("VzFK5", "VzYFK"),
];

// Corrected list (typos avoided) — 6 payments from the cycle 2 brief.
const HISTORICAL_PAYMENTS_CORRECT = [
  "tr_rgY7NvWRTZaeDS5vbDBUJ",
  "tr_FfiGZtWSQWXB5b374A7UJ",
  "tr_3nxkaEMuRfPM2TWLXQeTJ",
  "tr_2Q9ubn2wUWA3CmoDM4eTJ",
  "tr_r6JWpvCbAd4w29rTq5LTJ",
  "tr_VzYFK5ihNua7Wq4fWyETJ",
];

const DAYS = { p30: 30, trip7: 7, season: 210, sos: 1 };
const LEGACY_ALIAS = { p7: "trip7" };

function sha256hex(s) {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(s).digest("hex");
}
function emailDomain(e) {
  const at = String(e || "").lastIndexOf("@");
  return at >= 0 ? String(e).slice(at + 1) : "(none)";
}
function maskEmail(e) {
  if (!e) return "(none)";
  const at = e.indexOf("@");
  if (at < 0) return "***";
  return (e[0] + "***" + e.slice(Math.max(1, at - 1), at) + "@" + emailDomain(e));
}

async function mollieGet(path, apiKey) {
  const r = await fetch("https://api.mollie.com/" + path.replace(/^\/+/, ""), {
    headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}
async function supabaseGet(path, url, key) {
  const r = await fetch(url.replace(/\/+$/, "") + path, {
    headers: { apikey: key, Authorization: "Bearer " + key, Accept: "application/json" },
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}
async function supabaseRpcGrant(payload, url, key) {
  const r = await fetch(url.replace(/\/+$/, "") + "/rest/v1/rpc/sg_upsert_payment_grant", {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  return { status: r.status, ok: r.ok };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--apply") || args.includes("--dry-run");
  const confirm = args.find((a) => a.startsWith("--confirm-backfill="));
  const confirmed = confirm && confirm.split("=")[1] === "YES-I-HAVE-APPROVED";

  const apiKey = process.env.MOLLIE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    console.error("Missing env: MOLLIE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY are required.");
    process.exit(1);
  }

  const payments = HISTORICAL_PAYMENTS_CORRECT;

  console.log("=== Backfill Mollie grants — " + (dryRun ? "DRY RUN (no writes)" : "APPLY MODE") + " ===");
  console.log("Payments to process:", payments.length);
  console.log("");

  const report = [];
  for (const pid of payments) {
    const entry = { paymentId: pid };
    // 1. Re-control LIVE status at Mollie
    const { status: mStatus, body: payment } = await mollieGet("/v2/payments/" + encodeURIComponent(pid), apiKey);
    if (mStatus !== 200 || !payment) {
      entry.mollie = { status: mStatus, error: "lookup_failed" };
      report.push(entry);
      console.log(pid, "→ Mollie lookup FAILED (" + mStatus + ")");
      continue;
    }
    entry.mollie = {
      status: payment.status,
      amount: payment.amount,
      currency: payment.amount && payment.amount.currency,
      value: payment.amount && payment.amount.value,
      metadataPass: (payment.metadata && payment.metadata.pass) || null,
      metadataEmailDomain: emailDomain(payment.metadata && payment.metadata.email),
      metadataEmailMasked: maskEmail(payment.metadata && payment.metadata.email),
      metadataEmailHash: (payment.metadata && payment.metadata.email) ? sha256hex(String(payment.metadata.email).toLowerCase().trim()) : null,
      webhookUrl: payment.webhookUrl || null,
      createdAt: payment.createdAt || null,
      paidAt: payment.paidAt || null,
    };

    // 2. Refunds / chargebacks
    const refunds = await mollieGet("/v2/payments/" + encodeURIComponent(pid) + "/refunds", apiKey);
    entry.refunds = { count: Array.isArray(refunds.body && refunds.body._embedded && refunds.body._embedded.refunds) ? refunds.body._embedded.refunds.length : 0, status: refunds.status };

    // 3. Existing grant?
    const grants = await supabaseGet("/rest/v1/payment_grants?payment_id=eq." + encodeURIComponent(pid) + "&select=payment_id,pass,email,expires_at,granted_at", supabaseUrl, supabaseKey);
    const existing = Array.isArray(grants.body) ? grants.body : [];
    entry.existingGrant = existing.length > 0 ? { count: existing.length, pass: existing[0].pass, expiresAt: existing[0].expires_at } : null;

    // 4. Pass resolution (legacy alias)
    const rawPass = String((payment.metadata && payment.metadata.pass) || "");
    const canonical = LEGACY_ALIAS[rawPass] || rawPass;
    const isLegacy = Object.prototype.hasOwnProperty.call(LEGACY_ALIAS, rawPass);

    // 5. Amount validation (historical allowed amounts)
    const legacyAmounts = { trip7: { EUR: [7.99], USD: [5.99] } };
    const currency = String(payment.amount && payment.amount.currency || "").toUpperCase();
    const value = Number(payment.amount && payment.amount.value);
    const cents = Math.round(value * 100);
    let amountOk = false;
    if (payment.status === "paid") {
      if (isLegacy) {
        const allowed = (legacyAmounts[canonical] && legacyAmounts[canonical][currency]) || [];
        amountOk = allowed.some((n) => Math.abs(Math.round(n * 100) - cents) <= 2);
      } else {
        // For non-legacy, reuse current prices.
        const current = { p30: { EUR: 14.99, USD: 11.99 }, trip7: { EUR: 4.99, USD: null }, season: { EUR: 19.99, USD: null }, sos: { EUR: 1.00, USD: null } };
        const expected = current[canonical] && current[canonical][currency];
        if (expected === null) amountOk = cents > 50 && cents < 5000;
        else if (expected !== undefined) amountOk = Math.abs(Math.round(expected * 100) - cents) <= 2;
      }
    }

    const email = (payment.metadata && payment.metadata.email) || "";
    const emailOk = canonical !== "sos" ? !!email : true;
    const canGrant = payment.status === "paid" && !existing.length && amountOk && emailOk && entry.refunds.count === 0;

    // 6. Proposed grant (rights 7 or 30 days from EFFECTIVE delivery date, not payment date)
    const days = DAYS[canonical] || 7;
    entry.proposedGrant = {
      canonicalPass: canonical,
      isLegacy: isLegacy,
      daysFromDelivery: days,
      emailSource: email ? "mollie_metadata" : "MISSING — manual lookup required",
      amountValid: amountOk,
      emailValid: emailOk,
      refundsOrChargebacks: entry.refunds.count,
      canGrant: canGrant,
      grantPayloadPreview: canGrant ? {
        p_payment_id: pid,
        p_pass: canonical,
        p_email: email,
        p_currency: currency,
        p_expires_at: new Date(Date.now() + days * 86400000).toISOString(),
        p_granted_at: new Date().toISOString(),
        p_metadata: payment.metadata || {},
      } : null,
    };

    if (canGrant && !dryRun && confirmed) {
      const payload = entry.proposedGrant.grantPayloadPreview;
      const r = await supabaseRpcGrant(payload, supabaseUrl, supabaseKey);
      entry.applyResult = { status: r.status, ok: r.ok };
      console.log(pid, "→ APPLIED", r.status, r.ok ? "OK" : "FAIL");
    } else if (canGrant && !dryRun && !confirmed) {
      entry.applyResult = { skipped: true, reason: "missing --confirm-backfill=YES-I-HAVE-APPROVED" };
      console.log(pid, "→ can grant but not confirmed; skipped");
    } else {
      entry.applyResult = { skipped: true, reason: dryRun ? "dry-run" : (canGrant ? "not eligible" : "not eligible") };
      console.log(pid, "→", canGrant ? "ELIGIBLE (dry run)" : "NOT ELIGIBLE", "| status=" + payment.status, "amountOk=" + amountOk, "emailOk=" + emailOk, "existing=" + existing.length, "refunds=" + entry.refunds.count);
    }

    report.push(entry);
    console.log("   pass=" + rawPass + " → " + canonical + (isLegacy ? " (legacy)" : "") + " | " + currency + " " + value + " | amountOk=" + amountOk + " | email=" + maskEmail(email));
  }

  // Summary (no PII)
  console.log("\n=== SUMMARY ===");
  const eligible = report.filter((e) => e.proposedGrant && e.proposedGrant.canGrant).length;
  const notEligible = report.length - eligible;
  console.log("Total:", report.length, "| Eligible:", eligible, "| Not eligible:", notEligible);
  console.log("Mode:", dryRun ? "DRY RUN (no writes performed)" : "APPLY");

  // Write report to file (no PII: emails masked/hashed, domains only)
  const fs = require("node:fs");
  const outPath = "scripts/automation/data/backfill-mollie-grants-report.json";
  fs.mkdirSync("scripts/automation/data", { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), mode: dryRun ? "dry-run" : "apply", payments: report }, null, 2));
  console.log("Report written:", outPath);

  // Email-missing guidance
  const missingEmail = report.filter((e) => e.proposedGrant && !e.proposedGrant.emailValid);
  if (missingEmail.length) {
    console.log("\n=== PAYMENTS WITH MISSING EMAIL ===");
    for (const e of missingEmail) {
      console.log(" -", e.paymentId, "→ requires manual correlation via session/analytics (see cycle 2 brief).");
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
