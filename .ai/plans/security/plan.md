# Security Agent Plan — Dependencies, Secrets, Permissions, RGPD

## Mission
Dépendances, secrets, permissions, RGPD. Zero trust, least privilege.

## Priorités P0-P2

### P0 — Critique
1. **Secrets rotation** (exposed in git history)
   - `MOLLIE_API_KEY=live_H6BUh7uxdUkFKAnBQhz3tRVsuerNPs` (commit 3f07490)
   - Action: Revoke Mollie Dashboard → Create new → Update Render `sargasse-api`
   - Verify: `MOLLIE_WEBHOOK_SECRET` unique per env (prod/staging/local)

2. **Secrets audit** (tous les `.env*`, `*-config.php`, `*.example.php`)
   - `public/api/mollie-config.php` → `getenv()` + fallback local (DONE)
   - `railway-api/api/mollie-config.php` → same (DONE)
   - `public/api/stripe-config.php` → gitignored, placeholder only
   - `railway-api/api/stripe-config.php` → gitignored
   - `puntacana-ftp/api/stripe-config.php` → **UNTRACTED** — verify not deployed

3. **Dependency audit**
   - `npm audit` → 0 critical, 0 high
   - `package-lock.json` pinned versions
   - No unused deps (bundle ≤210 Ko constraint)

### P1 — RGPD & Compliance
4. **Cookie consent** (GDPR)
   - `sg_cookie_consent` localStorage: `accepted` | `declined` | `null`
   - GA4 consent default DENIED (index.html `gtag('consent', 'default', {analytics_storage: 'denied'})`)
   - Accept → `gtag('consent', 'update', {analytics_storage: 'granted'})`
   - Banner: `sg-cookie-banner` z-index 1025, rollback `?cookiebanner=0`

5. **Data retention**
   - `localStorage`: `sg_premium`, `sg_seen`, `sg_track_log` (max 50 events)
   - `sessionStorage`: `sg_exitnudge_shown`, `sg_onb`
   - Supabase: `payment_grants` (retain 7 ans fiscal), `b2b_trials` (30j + 90j grace)
   - Logs: GitHub Actions 90j, server logs 30j

6. **CSP & Headers**
   - `Content-Security-Policy`: script-src 'self' 'unsafe-inline' (Mollie iframes), connect-src ERDDAP + Supabase + Mollie
   - `X-Frame-Options`: DENY
   - `Referrer-Policy`: strict-origin-when-cross-origin
   - `Permissions-Policy`: geolocation=(), camera=(), microphone=()

### P2 — Hardening
7. **Dependency scanning CI**
   - `npm audit` dans `ci-tests.yml`
   - `dependabot.yml` → weekly PRs
   - `package.json` → `overrides` pour CVE critiques

8. **Secrets scanning**
   - GitGuardian / GitHub Secret Scanning activé
   - Pre-commit hook: `ggshield secret scan`
   - Rotation calendar: trimestriel (Mollie, Stripe, Resend, Supabase)

9. **Penetration testing**
   - Annual: OWASP Top 10 scan (Mollie webhook, Supabase RLS, API endpoints)
   - Focus: payment flow, auth bypass, data exfiltration

## Checklists

### Pre-deploy security
```bash
npm audit --audit-level=high          # 0 high/critical
ggshield secret scan .                 # 0 secrets
php -l public/api/*.php                # syntax OK
grep -r "sk_live_\|live_" --include="*.php" --include="*.js" --include="*.jsx" .  # 0 real keys
```

### Post-deploy
- [ ] CSP headers present on all domains
- [ ] Cookie banner functional (accept/decline)
- [ ] Mollie webhook signature verification (prod secret)
- [ ] Supabase RLS policies active on all tables

## Artefacts
- `secrets-rotation-calendar.md` — trimestriel
- `rgpd-compliance-checklist.md` — audit annuel
- `csp-policy.md` — headers par environnement
- `penetration-test-report.md` — annuel

## SLA
| Métrique | Target |
|----------|--------|
| Secrets rotation | 90 jours |
| Dependency critical CVE | 0 (patch <24h) |
| GDPR compliance | 100% |
| CSP coverage | 100% pages |
| Secret scanning | 0 leaks |