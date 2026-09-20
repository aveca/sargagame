#!/usr/bin/env node
/**
 * B2B SALES ENGINE — Phase 1 schema contract.
 *
 * Static contract only: this test never connects to Supabase and never sends data.
 * It protects the model from accidental public exposure and duplicate engine paths.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
// Normalize line endings: working copies on Windows are CRLF (autocrlf), CI is LF.
const schema = fs.readFileSync(path.join(ROOT, 'supabase/schema.sql'), 'utf8').replace(/\r\n/g, '\n')

let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

function main() {
  const tables = [
    'companies',
    'company_establishments',
    'contacts',
    'company_enrichment',
    'segments',
    'prospects',
    'prospect_scores',
    'suppressions',
    'consents',
    'data_sources',
    'b2b_audit_log',
  ]

  for (const t of tables) {
    ok(schema.includes(`create table if not exists public.${t}`), `table ${t} declared`)
    ok(schema.includes(`alter table public.${t} enable row level security`), `RLS enabled: ${t}`)
    ok(schema.includes(`revoke all on public.${t} from anon, authenticated`), `anon/auth revoked: ${t}`)
    ok(schema.includes(`grant all on public.${t} to service_role`), `service_role grant: ${t}`)
  }

  ok(schema.includes('companies_siren_uidx'), 'SIREN uniqueness')
  ok(schema.includes('company_establishments_siret_uidx'), 'SIRET uniqueness')
  ok(schema.includes('company_enrichment_confidence_chk'), 'enrichment confidence bounded 0..1')
  ok(schema.includes('prospect_scores_score_chk'), 'prospect score bounded 0..100')
  ok(schema.includes('suppressions_type_chk'), 'suppression type allowlist')
  ok(schema.includes('outreach_contacts_prospect_id_fkey'), 'existing outreach bridge -> prospect')
  ok(schema.includes('alter table public.outreach_contacts\n  add column if not exists prospect_id uuid'),
    'existing outreach table reused; no third sender model')

  ok(/model_version\s+text\s+not\s+null\s+default\s+'deterministic-v1'/.test(schema),
    'score provenance/model version stored')
  ok(schema.includes('field_name             text not null') &&
     schema.includes('fetched_at             timestamptz not null default now()'),
    'field-level enrichment provenance stored')
  ok(schema.includes('legal_basis            text') &&
     schema.includes('purpose               text not null'),
    'legal-basis ledger present')

  // Full target state machine (Phase 6) must be representable WITHOUT a later
  // constraint migration on a PII table.
  const chk = schema.match(/constraint prospects_status_chk check \([\s\S]*?\)\s*\)/)
  ok(!!chk, 'prospects_status_chk present')
  const required = [
    'new', 'enriching', 'enriched', 'scored', 'ready', 'contacted', 'replied',
    'interested', 'not_interested', 'callback_requested', 'qualified', 'converted',
    'concierge', 'paid', 'lost', 'bounced', 'opted_out', 'suppressed', 'paused',
  ]
  for (const s of required) {
    ok(!!chk && chk[0].includes(`'${s}'`), `prospect status allowed: ${s}`)
  }

  console.log(failures === 0
    ? '\nB2B-SALES-SCHEMA TESTS: ALL PASS'
    : `\nB2B-SALES-SCHEMA TESTS: ${failures} FAILURE(S)`)
  process.exit(failures ? 1 : 0)
}

main()
