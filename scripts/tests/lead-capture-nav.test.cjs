#!/usr/bin/env node
/**
 * UX-QA-004 — contrat LeadCapture / BottomNav.
 * Verifie le correctif structurel sans toucher au money path.
 */
const assert = require("assert")
const fs = require("fs")
const path = require("path")

const lead = fs.readFileSync(path.join(__dirname, "../../src/LeadCapture.jsx"), "utf8")
const premium = fs.readFileSync(path.join(__dirname, "../../src/PremiumModal.jsx"), "utf8")

let checks = 0
function check(name, fn) { fn(); checks++; console.log(`ok ${checks} — ${name}`) }

check("banniere mobile remontee au-dessus du dock", () => {
  assert.ok(
    lead.includes('bottom: isMobile ? "calc(90px + env(safe-area-inset-bottom,0px))" : 0'),
    "LeadCapture mobile doit etre ancree au-dessus de la BottomNav"
  )
})

check("z-index LeadCapture conserve 1250", () => {
  assert.ok(lead.includes("zIndex: 1250"), "LeadCapture doit rester a z1250")
})

check("paywall reste au-dessus de LeadCapture", () => {
  const panelZ = [...premium.matchAll(/zIndex\s*:\s*(\d+)/g)].map(m => Number(m[1]))
  assert.ok(panelZ.includes(1260), "PremiumModal doit conserver le panel z1260")
  assert.ok(1250 < 1260, "LeadCapture doit rester sous le paywall")
})

check("tracking LeadCapture conserve", () => {
  assert.ok(lead.includes('track("sg_lead_banner_view"'), "tracking view absent")
  assert.ok(lead.includes('track("sg_lead_banner_submit"'), "tracking submit B2B absent")
  assert.ok(lead.includes('track("sg_lead_b2c_submit"'), "tracking submit B2C absent")
  assert.ok(lead.includes('track("sg_lead_banner_dismiss"'), "tracking dismiss absent")
})

check("rollback b2c=0 conserve", () => {
  assert.ok(lead.includes('b2cFlagOff'), "rollback ?b2c=0 absent")
})

console.log(`\n✓ lead-capture-nav : ${checks} checks OK`)
