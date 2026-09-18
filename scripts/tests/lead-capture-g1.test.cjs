#!/usr/bin/env node
/**
 * lead-capture-g1.test.cjs — verrouille la migration G1
 * "lead capture Apps Script → Supabase".
 *
 * Périmètre vérifié :
 *  1. buildB2CLeadRow : forme exacte de la ligne `b2c_alerts` (miroir
 *     LeadCapture.jsx — le cron mailer compare ce vocabulaire).
 *  2. submitLeadToSupabase : dispatch POST /api/supabase {table,insert}
 *     (contrat worker supabase-proxy), fire-and-forget, sans window crash,
 *     rollback ?lead_sb=0, aucun dispatch sur email invalide.
 *  3. submitLead (Sargasses_PROD.jsx) : le leg Supabase est bien le PRIMAIRE
 *     (utile : c'est LUI qui est appelé par tous les points de capture).
 *  4. LeadCapture.jsx : poste bien /api/supabase (pas Apps Script).
 *
 * Aucune donnée inventée : aucun appel réseau réel (fetch stubbé en mémoire).
 */
const assert = require("assert")
const fs = require("fs")
const path = require("path")
const { pathToFileURL } = require("url")

let checks = 0
function check(name, fn) { fn(); checks++; console.log(`ok ${checks} — ${name}`) }

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, "../../src/supabasePhotos.js")).href)
  const { buildB2CLeadRow, submitLeadToSupabase, leadRegionCode, leadDomain } = mod

  // ── 1. Forme exacte de la ligne b2c_alerts ────────────────────────────────
  check("row b2c_alerts canonique (trim + lowercase + domain sans www + region mq)", () => {
    assert.deepStrictEqual(
      buildB2CLeadRow("  User.Name+Alerte@Example.Fr ", "www.sargasses-martinique.com"),
      { email: "user.name+alerte@example.fr", region: "mq", domain: "sargasses-martinique.com", beaches: [], status: "active" }
    )
  })

  check("mapping region miroir de LeadCapture (gp/mx/do/us + unknown)", () => {
    assert.strictEqual(leadRegionCode("sargasses-guadeloupe.com"), "gp")
    assert.strictEqual(leadRegionCode("sargassumcancun.com"), "mx")
    assert.strictEqual(leadRegionCode("sargazotulum.com"), "mx")
    assert.strictEqual(leadRegionCode("sargassumpuntacana.com"), "do")
    assert.strictEqual(leadRegionCode("sargassummiami.com"), "us")
    assert.strictEqual(leadRegionCode("example.org"), "unknown")
    assert.strictEqual(leadDomain("www.sargasses-martinique.com"), "sargasses-martinique.com") // window.location.hostname est lowercase par spec
  })

  check("emails invalides → null (jamais de ligne vide)", () => {
    assert.strictEqual(buildB2CLeadRow("", "x"), null)
    assert.strictEqual(buildB2CLeadRow("    ", "x"), null)
    assert.strictEqual(buildB2CLeadRow("pasunemail", "x"), null)
    assert.strictEqual(buildB2CLeadRow(null, "x"), null)
    assert.strictEqual(buildB2CLeadRow(undefined, "x"), null)
    assert.strictEqual(buildB2CLeadRow("a".repeat(196) + "@b.co", "x"), null) // >200 chars
  })

  // ── 2. Dispatch /api/supabase (fire-and-forget, sans reseau) ─────────────
  {
    const calls = []
    const savedFetch = global.fetch
    global.window = { location: { hostname: "www.sargasses-martinique.com", search: "" } }
    global.fetch = (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true }) }
    try {
      check("submitLeadToSupabase écrit en DIRECT REST Supabase (pas le hop worker 404)", () => {
        assert.strictEqual(submitLeadToSupabase("Lead@Test.com"), true)
        assert.strictEqual(calls.length, 1)
        assert.ok(calls[0].url.endsWith("/rest/v1/b2c_alerts"), `URL attendue .../rest/v1/b2c_alerts, reçu ${calls[0].url}`)
        assert.ok(calls[0].url.startsWith("https://"), "URL absolue Supabase attendue")
        assert.strictEqual(calls[0].opts.method, "POST")
        assert.strictEqual(calls[0].opts.keepalive, true)
        assert.ok(calls[0].opts.headers.apikey, "header apikey anon requis")
        assert.deepStrictEqual(JSON.parse(calls[0].opts.body), {
          email: "lead@test.com", region: "mq", domain: "sargasses-martinique.com", beaches: [], status: "active",
        })
      })

      check("rollback ?lead_sb=0 → aucun dispatch", () => {
        global.window.location.search = "?b2c=1&lead_sb=0"
        assert.strictEqual(submitLeadToSupabase("x@y.zz"), false)
        assert.strictEqual(calls.length, 1)
        global.window.location.search = ""
      })

      check("email invalide → aucun dispatch", () => {
        assert.strictEqual(submitLeadToSupabase("nopenopenope"), false)
        assert.strictEqual(calls.length, 1)
      })
    } finally {
      if (savedFetch === undefined) { delete global.fetch } else { global.fetch = savedFetch }
      delete global.window
    }
  }

  // ── 3. submitLead : Supabase est le sink PRIMAIRE (tous les points de capture) ──
  check("submitLead() appelle le leg Supabase en primaire + attribution sg_email_submit", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../src/Sargasses_PROD.jsx"), "utf8")
    const start = src.indexOf("export function submitLead(email,source)")
    assert.ok(start > 0, "submitLead introuvable")
    const body = src.slice(start, start + 1600)
    assert.ok(body.includes("submitLeadToSupabase(email)"), "leg Supabase primaire absent")
    assert.ok(body.includes("logAnalyticsEvent("), "event sg_email_submit absent")
  })

  // ── 4. LeadCapture (banniere) — écriture directe REST Supabase (pas le hop worker) ──
  check("LeadCapture.jsx → insert direct REST /rest/v1/{b2c_alerts|b2b_leads} (aucun /api/supabase)", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../src/LeadCapture.jsx"), "utf8")
    assert.ok(!src.includes("/api/supabase"), "le hop worker /api/supabase est mort en prod (404) — ne pas y revenir")
    assert.ok(src.includes("/rest/v1/"), "LeadCapture doit poster en REST direct Supabase")
    assert.ok(src.includes("SUPABASE_ANON_KEY"), "clé anon requise pour l'insert REST")
    assert.ok(src.includes("'b2c_alerts'") && src.includes("'b2b_leads'"), "tables b2c/b2b absentes")
    assert.ok(!src.includes("script.google.com"), "LeadCapture ne doit plus toucher Apps Script")
  })

  console.log(`\n✓ lead-capture-g1 : ${checks} checks OK`)
}

main().catch((e) => { console.error("ÉCHEC lead-capture-g1:", e && e.message); process.exit(1) })
