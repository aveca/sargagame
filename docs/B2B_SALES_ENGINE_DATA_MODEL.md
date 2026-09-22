# B2B Sales Engine — Phase 1 Data Model

## Scope

Phase 1 establishes the canonical data model for the B2B sales engine without importing SIRENE data, scoring records, sending email, placing calls, or changing the payment path.

The model is designed to reuse the existing outreach_contacts / outreach_events layer as the sending system rather than introducing a third sender.

## Entities

- companies: legal entity / SIREN-level identity.
- company_establishments: physical establishment / SIRET-level identity.
- contacts: people and contact channels.
- company_enrichment: field-level provenance (source_id, confidence, observed/fetched timestamps).
- segments: configurable segmentation rules.
- prospects: business state machine joining company + establishment + primary contact + segment.
- prospect_scores: append-only score history with component scores, reasons, and model version.
- suppressions: unified email / phone / company / contact suppression ledger.
- consents: purpose + legal-basis ledger; it does not grant send permission by itself.
- data_sources: source registry for SIRENE and future enrichers.
- b2b_audit_log: unified action history.

## Existing-system bridge

outreach_contacts.prospect_id links the new prospect model to the existing outreach queue. The outreach worker remains the sole sending layer.

No third sender, no voice provider, no provider credentials, and no contact seed are introduced.

## Security

All new tables are RLS-enabled, revoke anon and authenticated, and grant service_role. No new table is exposed to the browser/Data API by this phase.

The legacy outreach_contacts RLS policy is intentionally unchanged; tightening that table is a separate security scope.

## Activation boundary

This PR is schema-only and reviewable. Production application occurs only after merge to main, because apply-supabase-schema.yml runs on pushes to main when supabase/schema.sql changes.

No SIRENE ingestion, enrichment, scoring execution, automated outreach, voice calls, or payment changes are part of Phase 1.

## Phase 2 — SIRENE ingestion + deterministic scoring (DRY_RUN)

Phase 2 adds code only; it performs NO production import until the Phase 1 schema is actually applied (apply-supabase-schema.yml green).

- `scripts/lib/sirene-client.cjs` — SIRENE v3.11 client. Single source of legal truth. Luhn validation for SIREN/SIRET (La Poste exception), status mapping A→active / F→inactive / else unknown, normalization to the Phase 1 columns. Injectable `fetchFn`; geocoordinates are never invented (null).
- `scripts/lib/b2b-store.cjs` — deterministic upsert layer (read-then-write keyed on siren/siret; PostgREST cannot upsert on our partial unique indexes). fail-closed without credentials; `probeSchema()` refuses `--execute` until tables exist; dry-run = zero HTTP.
- `scripts/automation/sirene-mq-import.cjs` — Martinique (972) CLI. DRY_RUN by default; `--from-file` for offline input; `--execute` requires SIRENE creds + Supabase service key + applied schema. Synthetic summary logs only (no PII, no secrets). Never creates contacts, emails, phones.
- `scripts/lib/b2b-scoring.cjs` — pure deterministic scoring (no network, no DB, no clock): b2b_relevance 25 + sector_relevance 25 + commercial_potential 20 + contactability 15 + company_quality 10 + data_confidence 5 = 0..100, priorities A+/A/B/C/D from configurable thresholds (default 85/70/50/30), explicit `reasons[]`, `model_version = deterministic-v1`. Inactive companies capped at 25.
- Sector weights are CONFIG (segment rules), currently unset → `unknown_sector` until segments are defined.

Schema alignment for Phase 2 (prod tables still absent → zero migration risk):
`companies` += ape_label, employee_range, is_micro_enterprise, creation_date, source_updated_at ; `company_establishments` += siege, ape_code, source_updated_at ; `prospect_scores` switches from the legacy PFCV component columns to the six deterministic components above.

## Tests

- `scripts/tests/b2b-scoring.test.cjs` — bounds, determinism, thresholds, reasons, edge cases (43 assertions).
- `scripts/tests/sirene-import.test.cjs` — Luhn, status mapping, normalization, dedup, dry-run zero-HTTP, fail-closed execute, in-memory PostgREST upsert idempotence, pagination/backoff, CLI dry-run (77 assertions).
- `scripts/tests/b2b-phase2-guards.test.cjs` — static anti-activation contract: no outreach/email/payment/voice references, scoring purity, no hardcoded secrets, no workflow runs the importer (33 assertions).
- `scripts/tests/b2b-sales-engine-schema.test.cjs` — extended to lock the Phase 2 columns and component bounds.