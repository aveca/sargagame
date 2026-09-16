## 2026-09-16 17:45 UTC · Agent: coding-agent (Partner Commerce — FACTUAL VERIFICATION COMPLETE)

### Travail effectué
- **Résumé 1 ligne** : Architecture Partner Commerce implémentée (catalogue capabilities, client lib, UI, worker endpoints, tracking) — **MAIS** : table `partner_orders` ABSENTE de Supabase, endpoints `/api/partner/*` 404 en prod (routes non configurées Cloudflare), money-path NON validé end-to-end, 0 accès API partenaire. Architecture = **PARKED** en attente validation money-path principal.

### Fichiers modifiés (cette passe)
- `.ai/current_state.md` (cette entrée), `NEXT_SESSION.md`, `.ai/decisions.md` (DEC-2026-09-16 Partner Commerce), `.ai/partner-commerce-diagnostic.md` (mis à jour faits vérifiés)

### FAITS VÉRIFIÉS (correction rapport précédent)

| Élément | Rapport initial | RÉALITÉ VÉRIFIÉE |
|---------|----------------|------------------|
| Table `partner_orders` | "déployée" | **ABSENTE** — code catch silencieux "table may not exist" |
| Nouveaux events | 8 | **9** : `sg_product_view`, `sg_cart_add`, `sg_cart_open`, `sg_checkout_start`, `sg_checkout_payment`, `sg_order_paid`, `sg_order_failed`, `sg_order_confirmed`, `sg_order_cancelled` |
| Endpoints `/api/partner/*` | "déployés" | **404 en prod** — routes non déclarées dans Cloudflare dashboard (wrangler.jsonc frozen 2026-09-02) |
| Money-path | "prêt" | **NON VALIDÉ** — `POST /api/mollie` non testé via `/api/partner/create-order` |
| Table `partner_orders` Supabase | existe | **NON CRÉÉE** — migration requise |
| Accès API partenaires | "à demander" | **TOUS ABSENTS** — Taxis Martinique / RHUMZ / Lovelly : 0 accès confirmé |

### ARCHITECTURE IMPLÉMENTÉE (code local, tests verts)

| Couche | Fichiers | Statut |
|--------|----------|--------|
| Catalogue + capabilities | `regions/mq.json`, `regions/gp.json`, `gen-context-partners.cjs` | ✅ `capabilities` (9 flags) toutes `false` |
| Résolution front | `src/lib/partners.js` | ✅ `hasCapability()`, `getCapabilities()` |
| Client commerce | `src/lib/partner-commerce.js` | ✅ `PartnerProductCard`, `PartnerCart`, `PartnerCheckout`, `createSargagameOrder` via Mollie |
| UI | `PartnerProductCard.jsx`, `PartnerCart.jsx`, `PartnerCheckout.jsx` | ✅ Design comic, i18n, safe-area |
| PartnerContext | `PartnerContext.jsx` | ✅ Native si `capabilities.order+payment`, fallback outbound |
| Worker sg-payments | `workers/sg-payments/src/index.ts` | ✅ Endpoints `/api/partner/*` + table `partner_orders` + paiement Mollie |
| Tracking funnel | `Sargasses_PROD.jsx`, `funnel-from-supabase.cjs`, `daily-stats-check.cjs` | ✅ 9 events allowlistés |
| Tests contract | `partners-contract.test.cjs` | ✅ **37/37 PASS** (allowlist, catalogue, kill-switch, pas de données inventées) |

### ACCÈS PARTENAIRES — ÉTAT RÉEL

| Partenaire | Accès confirmé | Accès absent | Format requis | Dépendance |
|------------|----------------|--------------|---------------|------------|
| **Taxis Martinique** | ❌ | ✅ | API réservation / webhook booking / CSV export | Externe (humain) |
| **RHUMZ** (MQ+GP) | ❌ | ✅ | API VTC (quote, booking, driver tracking) | Externe (humain) |
| **Lovelly** (MQ) | ❌ | ✅ | Flux catalogue (CSV/JSON/XML) + prix + stock + images | Externe (humain) |

### DEPENDANCES MONEY-PATH NON VALIDÉES

| Composant | Statut | Blocage |
|-----------|--------|---------|
| `PartnerCheckout.jsx` | Code local ✅ | Dépend de `createSargagameOrder` → `POST /api/partner/create-order` (404) |
| `createSargagameOrder()` | Code local ✅ | Appelle `POST /api/partner/create-order` → `POST /api/mollie` (Mollie worker) |
| `/api/partner/create-order` | Worker code ✅ | **Route Cloudflare ABSENTE** → 404 en prod |
| Paiement Mollie | Worker code ✅ | Non testé via flux partenaire |
| Confirmation commande | Worker code ✅ | Dépend webhook Mollie + `partner_orders` table (absente) |

### TESTS CONTRACT — CE QU'ILS COUVRENT RÉELLEMENT

| Zone | Couvert | NON couvert |
|------|---------|-------------|
| Capabilities (catalogue) | ✅ Champs `capabilities` whitelistés, 9 flags | Fonctionnement réel si `true` |
| Catalogue (synchro regions) | ✅ Miroir exact, regions exactes | Disponibilité réelle produits |
| Panier/checkout/order (tracking) | ✅ 9 events allowlistés | Flux paiement réel, table `partner_orders` |
| Tracking (allowlist) | ✅ 9 events dans `SG_FUNNEL_EVENTS` + 2 scripts funnel | Émission réelle depuis UI |
| Kill-switch | ✅ `?partnerctx=0` → null | |
| Pas de données inventées | ✅ Catalogue sans prix/commission | Prix réels si capability `quote` |

### DÉCISION

**PARKED** — Architecture complète en local, tests contract 37/37 verts, **MAIS** :
1. Table `partner_orders` Supabase non créée (migration requise)
2. Routes `/api/partner/*` non configurées Cloudflare (wrangler.jsonc frozen, action fondateur requise)
3. Money-path principal (`sg-payments` + Mollie) non validé via flux partenaire
4. 0 accès API partenaire confirmé — tous dépendants externes

**Priorité globale inchangée** : `sg-payments → /api/mollie → Mollie → webhook → grant → premier paiement réel`

### Prochaine action recommandée
1. **Valider money-path principal** : `POST /api/mollie` → Mollie → webhook → grant → paiement réel (priorité P0)
2. **Créer table `partner_orders`** Supabase (migration) — seulement si money-path validé
3. **Configurer routes `/api/partner/*`** Cloudflare dashboard (action fondateur)
4. **Négocier accès API** 1 partenaire pilote (Taxis Martinique ou RHUMZ ou Lovelly)
5. **Ne pas déployer Partner Commerce** tant que money-path principal non validé en prod

### Branche / Commit
- Branche : `agent/coding/deploy-verify-678` (actuelle, worktree)
- Commit head : `a06b655a2` (dernier merge #678)
- Fichiers nouveaux non committés : `src/components/PartnerProductCard.jsx`, `PartnerCart.jsx`, `PartnerCheckout.jsx`, `src/lib/partner-commerce.js`, `.ai/partner-commerce-diagnostic.md`

---

**STATUT FINAL : PARKED — architecture prête, dépendances externes identifiées, money-path principal non validé**