# NEXT_SESSION — Handoff 2026-09-16 17:45 UTC

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
| B2B Monthly (29€/79€ + USD) | PRêt merge | Validation paiement trial |
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
| `src/lib/partner-commerce.js` | Client lib réutilisable |
| `src/lib/partners.js` | Résolution + capabilities |
| `regions/mq.json`, `regions/gp.json` | Source vérité partenaires |

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

**Prochaine session = validation money-path principal. Tout le reste attend.**

---

*Dernière MAJ : 2026-09-16 17:45 UTC · Agent: coding-agent*