# MASTER_TO_DEVOPS_HANDOFF.md — Deploy Verification

> **Timestamp**: 2026-08-17 18:00 UTC
> **From**: master_plan
> **To**: devops_agent
> **Priority**: P0

---

## 🚀 Completed Work
- **Version Bump**: `public/version.json` → v220 (2026-08-17)
- **UI Fix**: VeilleurMark black block resolved
- **Test Fix**: `mollie-payment.spec.ts` → `toBeAttached()`
- **Build**: 3.74s, bundle 182.8 Ko, smoke 4/4 OK
- **Git**: Push to `main` → triggers deploy workflows

---

## 📋 Deploy Verification Checklist
| Domain                     | Version (v220) | Data Freshness (<12h) | Paywall Functional | Status |
|----------------------------|----------------|-----------------------|--------------------|--------|
| sargasses-martinique.com   | [ ]            | [ ]                   | [ ]                | ❌     |
| sargasses-guadeloupe.com  | [ ]            | [ ]                   | [ ]                | ❌     |
| sargassummiami.com        | [ ]            | [ ]                   | [ ]                | ❌     |
| sargassumcancun.com       | [ ]            | [ ]                   | [ ]                | ❌     |
| sargassumpuntacana.com    | [ ]            | [ ]                   | [ ]                | ❌     |

### Verification Commands
```bash
# Check version
curl https://<domain>/version.json | jq '.v'

# Check data freshness
curl https://<domain>/api/copernicus/sargassum.json | jq '.updatedAt, .stale'

# Check paywall
curl "https://<domain>/?paywall=1" | grep -q "Pass 30 jours" && echo "✅" || echo "❌"
```

---

## 🔧 Required Actions
1. **Verify Deploy**
   - Check FTP logs (`scripts/deploy-ftp-logs.cjs`)
   - Verify Cloudflare cache purge
   - Confirm version v220 on all domains

2. **Data Freshness**
   - Ensure `sargassum.json` < 12h old
   - Trigger `daily-copernicus.yml` if stale

3. **Paywall Functional**
   - Test Mollie checkout flow (`?paywall=1`)
   - Verify Comic vs World variant (A/B test)

4. **Cloudflare Status**
   - Check `deploy-cloudflare.yml` workflow
   - Verify `CLOUDFLARE_API_TOKEN` secret

---

## 📊 Expected Output
- **File**: `.ai/agent_plans/deploy_verification_2026-08-17.md`
- **Format**:
  ```markdown
  ## Deploy Verification - 2026-08-17

  | Domain                     | Version | Data Freshness | Paywall | Notes |
  |----------------------------|---------|----------------|---------|-------|
  | sargasses-martinique.com   | v220    | 3.2h           | ✅      |       |

  ### Issues
  - sargasses-guadeloupe.com: PHP api/ 403 (cPanel AllowOverride)
  ```

---

## 🔄 Next Handoff
- **To**: growth_agent
- **File**: `.ai/agent_plans/devops_to_growth_handoff.md`
- **Content**: Deploy verification results + conversion monitoring trigger