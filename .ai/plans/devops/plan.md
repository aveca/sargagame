# DevOps Agent Plan — Deploy, CI/CD, Infrastructure, Monitoring

## Mission
CI/CD, déploiement FTP, monitoring, backups. Push main → build → FTP → health-check, zero touch.

## Priorités P0-P2

### P0 — Immédiat
1. **Deploy verification v220** (5 domaines)
   - Checklist par domaine:
     - [ ] `https://{domain}/version.json` → `v220`
     - [ ] `https://{domain}/api/copernicus/sargassum.json` → `stale: false`, age <12h
     - [ ] `https://{domain}/?paywall=1` → paywall Mollie s'ouvre, checkout URL valide
     - [ ] `https://{domain}/api/copernicus/sargassum-banks.json` → banks array présent
     - [ ] Homepage 200 OK, pas d'erreur JS console
   - Domaines: MQ, GP, Miami, Cancun, Punta Cana

2. **GitHub Actions health**
   - `daily-copernicus.yml` (4x/jour) → success
   - `deploy-cloudflare.yml` → success (CLOUDFLARE_API_TOKEN configuré)
   - `ci-tests.yml` + `perf-budget.yml` → green sur PR

### P1 — Cette semaine
3. **FTP deploy optimization**
   - Current: `scripts/prepare-ftp.cjs` + `lftp` mirror
   - Optimize: parallel uploads, delta-only, retry logic
   - Target: <60s pour 5 domaines (vs ~5-10min actuel)

4. **Monitoring & alerting**
   - Uptime: `curl` health-check post-deploy (déjà dans daily-copernicus)
   - Data freshness: alert si `sargassum.json.stale=true` >2h
   - Payment: alert si Mollie webhook 5xx >5/min
   - Bundle size: alert si >210 Ko gzip

5. **Secrets rotation**
   - Rotate: `MOLLIE_API_KEY` (exposed in git history commit 3f07490)
   - Update: Render `sargasse-api` env vars
   - Verify: `MOLLIE_WEBHOOK_SECRET` unique per env

### P2 — Sprint 2
6. **Rollback automation**
   - Current: `git revert <bad-commit> --no-edit && git push origin main`
   - Automate: `scripts/rollback.cjs` avec confirmation Slack/email
   - Target: <5min rollback complet

7. **Preview environments**
   - GitHub Actions: deploy PR preview sur Cloudflare Pages
   - URL pattern: `pr-{number}.sargagame.pages.dev`
   - Auto-comment PR with preview link

8. **Backup strategy**
   - Supabase: daily pg_dump → R2 (already via `scripts/backup-supabase.cjs`)
   - FTP: weekly full mirror → local NAS
   - Git: GitHub + mirror GitLab (already)

## Checklists par déploiement

### Pre-deploy (local)
```bash
npm run build                    # exit 0
node scripts/check-bundle-budget.cjs  # ≤210 Ko
php -l public/api/*.php          # syntax OK
node scripts/ux-smoke.mjs        # 4 tokens OK
npx playwright test tests/e2e/funnel-payment.spec.ts  # 15/15
```

### Post-deploy (auto via daily-copernicus)
```bash
# Pour chaque domaine
curl -sf https://{domain}/version.json
curl -sf https://{domain}/api/copernicus/sargassum.json | jq '.stale'
curl -sf https://{domain}/?paywall=1 | grep -q "sg-modal-panel"
```

## Artefacts
- `deploy-checklist.md` → template par domaine
- `rollback-runbook.md` → procédure <5min
- `secrets-rotation.md` → calendrier trimestriel

## SLA
| Métrique | Target |
|----------|--------|
| Deploy time (5 domaines) | <5min |
| Rollback time | <5min |
| Uptime | 99.9% |
| Data freshness | <12h |
| Bundle size | ≤210 Ko gzip |