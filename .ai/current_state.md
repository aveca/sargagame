# .ai/current_state.md — État actuel du projet
>
> Dernière mise à jour par agent. Format strict.

---

## 2026-08-05 12:00 UTC · Agent: OpenCode (ui_agent + coding_agent)

### Travail effectué
- ✅ PR #545 — Documentation agent (prompt 07, rôles, AGENTS.md, tasks, current_state)
- ✅ PR #546 — **CRITICAL FIX** : alignement clé "saison"→"season" PassOffer.jsx↔backend mollie.php
- ✅ PR #547 — Hardening mollie-lib.php (Supabase mirror, CRITICAL log sur clé manquante)
- ✅ PR #548 — Analytics swipe-down tracking (PremiumModal.jsx)
- Analyse complète du pipeline paiement : Mollie on-site vs Stripe vs PayPal allowlists
- Découverte critique : USD price mismatch (1499¢ frontend vs $19.99 mollie-passlinks.json)

### Fichiers modifiés (3 PRs)
- PR #546 (`agent/ui/ux-pass-saison`) : `src/PassOffer.jsx`, `src/app-runtime.css`, `CLAUDE.md`, `public/api/mollie-config.example.php`
- PR #547 (`agent/coding/mollie-mirror`) : `public/api/mollie-lib.php`
- PR #548 (`agent/qa/analytics-swipe`) : `src/PremiumModal.jsx`

### Découvertes critiques (paiement)
- **PassOffer.jsx L9** : `key: "saison"` ≠ backend `"season"` → paiement Mollie rejeté "Prix invalide"
  - ✅ CORRIGÉ (PR #546)
- **USD cents** : 1499¢ ($14.99) ≠ mollie-passlinks.json $19.99 → ⏸️ en attente décision produit
- **USD allowlist Stripe/PayPal** : `[599]` uniquement → saison $19.99 pas encore supporté on-site
  - ⚠️ Nécessite mise à jour allowlist si produit décide de vendre saison en USD

### Tasks.md update
- TASK-P0-002 : [~] in_progress — PR #546 déploie sticky CTA + trust badges + copy
- TASK-P0-003 : [~] in_progress — PR #546 corrige le bug clé saison→season
- TASK-P1-007 : [~] in_progress — PR #548 ajoute tracking swipe_down

### Tests réalisés
- [x] PR #545 — doc only, aucun code produit
- [x] PR #546 — `php -l mollie-config.example.php` ✓, `npx esbuild PassOffer.jsx` ✓
- [x] PR #547 — `php -l mollie-lib.php` ✓
- [x] PR #548 — `npx esbuild PremiumModal.jsx` ✓
- [ ] Pas de test E2E (PRs non bloquantes, rollback git revert disponible)

### Prochaine action recommandée
1. **[PENDING]** — Décider : vendre le pass saison en USD ($19.99) on-site ?
   → Si OUI : mettre à jour `create-checkout.php` + `paypal.php` allowlist `[599]` → `[599, 1999]` + PassOffer.jsx `usd: 1499` → `usd: 1999`
   → Si NON : garder tel quel (USD islands = trip7 only)
2. **[PENDING]** — Vérifier `SUPABASE_SERVICE_KEY` sur tous les serveurs FTP (PR #547)
3. **[P2]** — Nettoyer code mort Stripe/PayPal (3 PRs, allowlists, configs)

### Branches / PRs actives
- `agent/ui/TASK-P0-001-doc` → PR #545 ✅ (documentation)
- `agent/ui/ux-pass-saison` → PR #546 ✅ (paywall + key fix)
- `agent/coding/mollie-mirror` → PR #547 ✅ (Supabase mirror)
- `agent/qa/analytics-swipe` → PR #548 ✅ (analytics)
- `main` : 37 fichiers non commités restants (autres tâches non liées)

---

### Historique handoff

| Date | Agent | Travail | Fichiers |
|------|-------|---------|----------|
| 2026-07-31 | Release Engineer | Production cleanup & release | src/ArchipelView.jsx, scripts/lib/coast-zones.js, .ai/ |
| 2026-07-31 | CTOs/OpenCode | Transformation AI-native | .ai/, AGENTS.md, tests/, CI |
| 2026-07-30 | Claude Code | Payment fix | mollie.php, PremiumModal.jsx, Sargasses_PROD.jsx |
| 2026-07-01 | Claude Code | B2B recurring | mollie-lib.php, mollie.php |
| 2026-06-29 | Claude Code | Pricing B2B panel | mollie-paylinks.cjs, B2B_*.md |