#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const region = JSON.parse(fs.readFileSync(path.join(ROOT, "regions/tulum.json"), "utf8"));
const esPath = path.join(ROOT, "regions/seo-content/tulum.json");
const enPath = path.join(ROOT, "regions/seo-content/tulum.en.json");
const es = JSON.parse(fs.readFileSync(esPath, "utf8"));
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const langs = require(path.join(ROOT, "scripts/lib/region-langs.cjs"));

function validateContent(content, lang) {
  assert.ok(Array.isArray(content.faq) && content.faq.length >= 5, lang + ": at least five useful FAQs");
  for (const item of content.faq) {
    assert.ok(item.q && item.a, lang + ": FAQ question and answer are required");
  }
  for (const key of ["forecast", "today", "map", "season"]) {
    const page = content.pages && content.pages[key];
    assert.ok(page, lang + ": missing page " + key);
    for (const field of ["slug", "title", "desc", "h1", "intro"]) {
      assert.ok(typeof page[field] === "string" && page[field].trim(), lang + ": " + key + "." + field + " is required");
    }
  }
  assert.ok(Array.isArray(content.pages.season.months) && content.pages.season.months.length >= 4, lang + ": seasonal guidance must include four cautious periods");
  assert.ok(content.pages.season.tips, lang + ": season planning tips are required");
  assert.ok(content.press && content.press.slug === "press" && Array.isArray(content.press.sections) && content.press.sections.length >= 3, lang + ": press page contract");
  assert.ok(content.resortPageTpl && content.resortPageTpl.titlePattern.includes("{resort}") && content.resortPageTpl.introPattern.includes("{beach}"), lang + ": resort template tokens");
  assert.ok(content.beachFaq && Array.isArray(content.beachFaq.questions) && content.beachFaq.questions.length >= 2, lang + ": per-beach FAQ templates");
  for (const item of content.beachFaq.questions) assert.ok(item.q && item.a, lang + ": per-beach FAQ needs q/a");
  assert.ok(typeof content.beachFaq.nextArrivalNone === "string" && content.beachFaq.nextArrivalNone.includes("{beach}"), lang + ": no-arrival fallback must be present and beach-specific");
  assert.doesNotMatch(content.beachFaq.nextArrivalNone.toLowerCase(), /next seven days|next 7 days|próximos siete días|próximos 7 días/i, lang + ": no-arrival copy must not claim a fixed seven-day horizon when forecast coverage can be shorter");
  const blurbs = Object.keys(content.beachBlurbs || {}).sort();
  const beachIds = (region.beaches || []).map(b => b.id).sort();
  assert.deepEqual(blurbs, beachIds, lang + ": every configured Tulum beach must have a blurb and no foreign beach IDs");
  const slugFields = Object.values(content.pages).map(p => p.slug).filter(Boolean);
  assert.equal(new Set(slugFields).size, slugFields.length, lang + ": hub slugs must be unique");
  const serialized = JSON.stringify(content);
  assert.doesNotMatch(serialized, /\b100\s?%|\b\d{3,4}\s+(?:pares|comparisons|predicciones|forecasts)\b/i, lang + ": no hard-coded reliability claims or live counts");
}

assert.equal(region.id, "tulum", "Tulum region config must be the source of truth");
assert.equal(es.pages.season.slug, region.routes.season, "Spanish season page must match the configured regional route");
assert.equal(es.pages.season.slug, "temporada-sargazo-tulum", "Spanish route remains stable");
assert.equal(es.routes, undefined, "primary Spanish routes must remain in regions/tulum.json");
assert.equal(en.routes.best, "best-beaches-without-sargassum-tulum", "English best-beaches route");
assert.equal(en.routes.weekly, "tulum-sargassum-this-week", "English weekly route");
assert.deepEqual(langs.emittedLangs(region), ["es", "en"], "Spanish root plus English /en/ must be emitted when both files exist");
validateContent(es, "es");
validateContent(en, "en");

console.log("tulum-seo-content: Spanish/English hubs, route contracts, beach blurbs, FAQs and non-stale copy OK");
