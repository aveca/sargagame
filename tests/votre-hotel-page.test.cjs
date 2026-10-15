const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/votre-hotel/index.html"), "utf8");
const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");

// The static public page is not parsed by Vite, so explicitly syntax-check its inline JS.
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, "hotel page should have one inline script");
assert.doesNotThrow(() => new Function(scripts[0][1]), "inline page script must parse");

assert.match(html, /\/api\/b2b-trial/, "trial form must call the worker endpoint");
assert.match(html, /days:14/, "hotel pilot must request 14 days");
assert.match(html, /\/api\/copernicus\/forecast\.php\?k=/, "J+3 must use the authenticated forecast endpoint");
assert.match(html, /hotel_page_open/, "page openings must be tracked");
assert.match(html, /hotel_trial_signup/, "successful trials must be tracked");
assert.match(html, /localStorage\.setItem\("sg_hotel_trial_token"/, "trial token must survive refresh");
assert.match(html, /url\.searchParams\.delete\("k"\)/, "share links must never expose the trial token");

const marker = "-- B2B hotel pilot page events";
const start = schema.indexOf(marker);
assert.notEqual(start, -1, "B2B event schema migration must exist");
const eventsSchema = schema.slice(start);
assert.match(eventsSchema, /create table if not exists public\.b2b_hotel_events/);
assert.match(eventsSchema, /alter table public\.b2b_hotel_events enable row level security/);
assert.match(eventsSchema, /for insert to anon/);
assert.doesNotMatch(eventsSchema, /for select to anon/, "anonymous users must not read B2B event rows");
assert.doesNotMatch(eventsSchema, /email\s+text/, "event table must not store email addresses");

console.log("PASS: hotel page JS syntax, 14-day trial, authorized forecast, tracking, safe share link, and RLS schema");
