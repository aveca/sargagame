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