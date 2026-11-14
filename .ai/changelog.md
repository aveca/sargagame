# .ai/changelog.md — Historique des changements agents

## 2026-11-14 · coding_agent — Phase 1 audit + création PR

- **chore(data): refresh B2B partners catalog et fraîcheur satellite (2026-11-13)**
  - `public/api/b2b-partners.json` : updatedAt 2026-10-25 → 2026-11-13
  - `public/api/copernicus/sargassum.json` : stale=true, dataAgeMinutes=26105 (SLA 900 min dépassé, source erddap-live inchangée)
  - `public/version.json` : restauré (pas de vrai changement, seul CRLF)
- **Branche `agent/data/satellite-freshness-sla-900min`** (depuis main) : commits f4f2e0f1 (SLA 900 min) + 39f1eb8f (docs) + 9b5768d2 (freshness data) → **PR #1469** ouvert sur main
- **Branche `agent/coding/us-beach-index-fix`** rebaseée : seul commit eef898c8 (fix plage /beaches/ /playas/ mission #1) → **PR #1430** déjà ouvert sur main (force-push)
- **Audit forensique Phase 1** : chronologie UTC corrélée (PR #1115, #1243, #1250 tous résolus sur origin) ; factory.lock stale (PID 19504, 08/10) ; 17 node processes

## 2026-11-13 · coding_agent — Mission #1 : index plage USD (commit 28ef78a5 → eef898c8 après rebase)

- `vite.config.js` : génération `/beaches/` (EN) / `/playas/` (ES) pour régions USD dans le bloc IS_NEW_REGION
- `scripts/build-fiche-dive.cjs` : `onOpenBeach` préfixe région-aware (mq/gp→/plages/, fl/pc→/beaches/, rm/tu→/playas/)
- `scripts/lib/fiche-dive-assets.cjs` : régénéré
- Gate de ship passé : build OK, bundle 208.0/210 Ko, smoke 4 tokens OK
