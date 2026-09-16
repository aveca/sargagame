# NEXT_SESSION — Handoff 2026-09-16 18:30 UTC

## 🎯 PRIORITÉ ABSOLUE (inchangée)

**MONEY-PATH PRINCIPAL → PREMIER PAIEMENT RÉEL**

```
sg-payments → POST /api/mollie → Mollie → webhook → grant → paiement réel
```

**RIEN d'autre ne se déploie tant que ce flux n'est pas validé en prod.**

---

## ✅ FIXES DÉPLOYÉS (2026-09-16 18:30)

| Problème | Cause | Correctif | Commit |
|----------|-------|-----------|--------|
| **"Not all required components are mounted"** | `createToken()` appelé avant mount 4 composants Mollie | `payMountedRef` partagé + attente 5s/120ms polling avant `createToken()` | `f11ca638a` |
| **"invalid_json" / body vide POST /api/mollie** | Worker lisait `request.json()` sur body consommé | `handleMollie` : `request.text()` + `JSON.parse()` + fallback | `e8c665085` |

**Validation technique** : Build OK, bundle 38.1 Ko, unit tests 200+ PASS, funnel-payment E2E 12/13 PASS, PHP lint OK.

---

## 🎯 PRIORITÉ ABSOLUE (inchangée)

**MONEY-PATH PRINCIPAL → PREMIER PAIEMENT RÉEL**

```
sg-payments → POST /api/mollie → Mollie → webhook → grant → paiement réel
```

**RIEN d'autre ne se déploie tant que ce flux n'est pas validé en prod.**

---

## 📦 CE QUI EST PRÊT MAIS PARKED

### Partner Commerce (architecture complète, 37/37 tests verts)
| Composant | Statut | Blocage |
|-----------|--------|---------|
| Catalogue + capabilities | ✅ Local | capabilities toutes `false` |
| Client lib (`partner-commerce.js`) | ✅ Local | Dépend money-path |
| UI (ProductCard, Cart, Checkout) | ✅ Local | Dépend money-path |
| Worker endpoints `/api/partner/*` | ✅ Code | **Routes Cloudflare ABSENTES** (404) |
| Table `partner_orders` | ❌ | Migration Supabase requise |
| Tracking 9 events | ✅ Allowlisté | Table `partner_orders` absente |
| Accès API partenaires | **0/3** | Tous externes |

**Décision** : **PARKED** jusqu'à validation money-path principal.

---

## 🔴 ACTIONS IMMÉDIATES (fondateur requis)

1. **Valider money-path principal** — 1 paiement test réel via `POST /api/mollie` → Mollie → webhook → grant
2. **Configurer routes Cloudflare** — `/api/partner/*` + `/api/mollie` routes dans dashboard (wrangler.jsonc frozen 2026-09-02)
3. **Créer table `partner_orders`** Supabase (migration) — *après* validation money-path

---

## 📋 AUTRES CHANTIERS EN ATTENTE

| Chantier | Statut | Bloqué par |
|----------|--------|------------|
| Partner Commerce | PARKED | Money-path + accès API |
| B2B Monthly (29€/79€ + USD) | Prêt merge | Validation paiement trial |
| UI Lots 1-8 | Deployés | — |
| Sprint 5 Decision Gate (AXIS A Revenue) | Prêt implémentation | — |
| Sprint 8 SEO SSR | Audit seul | — |

---

## 📊 MÉTRIQUES À SURVEILLER (7j)

| Métrique | Cible | Source |
|----------|-------|--------|
| `sg-payments` health | 200 | `/api/mollie-health` |
| Funnel `pass_cta` → `mollie_checkout_redirect` → `conversion` | > 0 | `daily-metrics.json` |
| MRR Stripe (legacy) | Stable | `daily-metrics.json` stripe bloc |
| 6 domaines health | 200 | `daily-copernicus.yml` health check |
| **NOUVEAU** `sg_mollie_mounted_timeout` | = 0 | `daily-metrics.json` / funnel |
| **NOUVEAU** `sg_mollie_mounted_after_wait` | ≥ 0 | `daily-metrics.json` / funnel |

---

## 📁 FICHIERS CLÉS POUR PROCHAINE SESSION

| Fichier | Rôle |
|---------|------|
| `workers/sg-payments/src/index.ts` | Money-path + Partner endpoints |
| `workers/sg-payments/wrangler.jsonc` | Routes Cloudflare (frozen) |
| `src/Sargasses_PROD.jsx` | Funnel events + tracking |
| `src/lib/partner-commerce.js` | Client commerce lib |
| `src/components/PartnerProductCard.jsx` | UI produit natif |
| `src/components/PartnerCart.jsx` | Panier slide-in |
| `src/components/PartnerCheckout.jsx` | Checkout Mollie |
| `src/components/PartnerContext.jsx` | Slot partenaires (natif si capabilities) |
| `src/lib/partners.js` | Résolution + capabilities |
| `regions/mq.json`, `regions/gp.json` | Source vérité partenaires |
| `src/PremiumModal/doSubscribe.jsx` | **payMountedRef wait logic (ligne 298-310)** |
| `src/PremiumModal/OnsiteCheckout.jsx` | **Mount 4 composants Mollie (ligne 201-219)** |

---

## 🚫 INTERDICTIONS (rappel)

- ❌ Ne PAS déployer Partner Commerce sans money-path validé
- ❌ Ne PAS inventer données partenaires (prix, stock, dispo)
- ❌ Ne PAS toucher Mollie/KV/paiement sans validation
- ❌ Ne PAS créer table `partner_orders` sans money-path validé
- ❌ Ne PAS négocier accès API sans validation money-path

---

## 📋 PROCHAINES ÉTAPES CONCRÈTES

1. **Fondateur** : Valider 1 paiement test réel via `curl POST /api/mollie` → vérifier webhook → grant
2. **Fondateur** : Configurer routes `/api/partner/*` + `/api/mollie` dans Cloudflare dashboard
3. **Agent** : Créer migration `partner_orders` Supabase (APRÈS validation money-path)
4. **Agent** : Négocier 1 accès API partenaire pilote (Taxis Martinique OU RHUMZ OU Lovelly)
5. **Agent** : Implémenter adaptateur pour le partenaire pilote

---

## 📋 VALIDATION POST-DEPLOY (checklist)

- [ ] `npm run build` OK (déjà validé)
- [ ] Push main → daily-copernicus.yml → deploy FTP → health-check 6/6
- [ ] Surveiller `sg_mollie_mounted_timeout` = 0 (si > 0 = race condition résiduelle)
- [ ] Surveiller `sg_mollie_mounted_after_wait` ≥ 0 (si > 0 = délai normal)
- [ ] Funnel `pass_cta` → `sg_onsite_checkout_opened` → `createToken` → `sg_payment_failed` / `mollie_checkout_redirect` → `conversion`
- [ ] Confirmer disparition erreur "Not all required components are mounted" en prod
- [ ] 1 paiement test réel (si nécessaire) → vérifier webhook → grant → entitlement

---

**Prochaine session = validation money-path principal en prod. Tout le reste attend.**

---

*Dernière MAJ : 2026-09-16 18:30 UTC · Agent: coding-agent*