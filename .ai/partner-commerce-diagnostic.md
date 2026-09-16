# DIAGNOSTIC — Partner Commerce Intégré Sargagame

> **STATUT : PARKED** — Architecture complète en local, tests contract 37/37 verts, MAIS money-path principal non validé, endpoints 404 en prod, table `partner_orders` absente, 0 accès API partenaire.

---

## FAITS VÉRIFIÉS (2026-09-16)

| Élément | Statut réel |
|---------|-------------|
| Table `partner_orders` Supabase | **ABSENTE** — code catch "table may not exist" |
| Endpoints `/api/partner/*` | **404 en prod** — routes Cloudflare non configurées (wrangler.jsonc frozen) |
| Money-path principal | **NON VALIDÉ** — `POST /api/mollie` non testé via flux partenaire |
| Table `partner_orders` | **NON CRÉÉE** — migration requise |
| Accès API partenaires | **0/3** — tous accès absents |
| Nouveaux events funnel | **9** (pas 8) — tous allowlistés |
| Tests contract | **37/37 PASS** — mais testent allowlist/contract, PAS flux réel |

**Décision : PARKED** — Architecture prête, money-path principal non validé.

---

## A. Ce qui peut être vendu IMMÉDIATEMENT (données existantes)

| Partenaire | Région | Type | Données dispo | Capacité commerce |
|------------|--------|------|---------------|-------------------|
| Taxis Martinique | MQ | Transport | name, category, url, bookingUrl (via RHUMZ), trackingId | ❌ Pas d'API prix/disponibilité/réservation |
| RHUMZ | MQ + GP | Transport/VTC | name, category, url, bookingUrl, supportsBeachContext, trackingId | ❌ Pas d'API prix/disponibilité/réservation |
| Lovelly | MQ | Shopping (bijoux) | name, category, url, location, trackingId | ❌ Pas de catalogue produits/prix |

**Conclusion** : Aucun partenaire n'a d'API ou flux exploitable pour du commerce natif aujourd'hui. Tout est des liens sortants (outbound).

---

## B. Ce qui nécessite un accès/API partenaire

| Partenaire | Besoin | Accès manquant | Statut |
|------------|--------|----------------|--------|
| Taxis Martinique | Quote temps réel, réservation, annulation | API transport / webhook booking | ❌ Absent — externe |
| RHUMZ | Quote, réservation VTC, tracking chauffeur | API VTC / partenaire | ❌ Absent — externe |
| Lovelly | Catalogue produits, prix, stock, variantes | API e-commerce / flux CSV/XML/JSON | ❌ Absent — externe |

---

## C. Ce qui est DÉJÀ DISPONIBLE dans le repo (code local)

| Composant | Fichier | Utilisable pour commerce |
|-----------|---------|--------------------------|
| Catalogue partenaires (config-driven) | `src/lib/partners-catalog.json` + `regions/*.json` | ✅ Base de registre partenaires |
| Résolution contextuelle | `src/lib/partners.js` | ✅ Extension possible (capabilities) |
| UI PartnerContext | `src/components/PartnerContext.jsx` | ✅ À étendre (cards produit, CTA achat) |
| Paiement Mollie (on-site) | `workers/sg-payments/src/index.ts` + `src/PremiumModal/doSubscribe.jsx` | ✅ Réutilisable tel quel |
| Webhook Mollie | `workers/sg-payments/src/index.ts` | ✅ Pour vérifier paiement commande |
| Tracking funnel | `src/supabasePhotos.js` + `scripts/automation/funnel-from-supabase.cjs` | ✅ À étendre (événements commerce) |
| KV rate-limit/idempotence | `workers/sg-payments/src/index.ts` | ✅ Pour commandes |
| Supabase payment_grants | `workers/sg-payments/src/index.ts` | ✅ Modèle pour orders table |
| Kill-switch | `?partnerctx=0` | ✅ Garde existante |

---

## D. Ce qu'il faut IMPLÉMENTER (architecture PartnerCommerce) — CODE LOCAL PRÊT

### 1. Extension catalogue (capabilities par partenaire) — ✅ FAIT
```json
// partners-catalog.json → ajouter capabilities[]
"capabilities": {
  "catalog": false,      // liste produits
  "product": false,      // détail produit
  "quote": false,        // prix/dispo temps réel
  "availability": false, // stock/dispo
  "order": false,        // créer commande
  "payment": false,      // paiement natif (via Mollie Sargagame)
  "fulfillment": false,  // confirmation/transmission
  "cancel": false,       // annulation
  "refund": false        // remboursement
}
```

### 2. Couche générique `PartnerCommerce` (client + worker) — ✅ CODE LOCAL PRÊT
- `catalog()` → liste produits (si capability)
- `getProduct(id)` → détail
- `quote(params)` → prix + dispo
- `availability(params)` → stock
- `createOrder(cart)` → order_id SG + webhook partenaire
- `createPayment(order)` → Mollie checkout (existant)
- `confirmOrder(order_id)` → vérif paiement + transmission
- `cancelOrder(order_id)` → annulation + remboursement si payé
- `fulfillment(order_id)` → transmission au partenaire

### 3. Tables Supabase nécessaires — ❌ MIGRATION REQUISE
```sql
-- partner_orders (nouvelle)
order_id (SG-ORDER-XXXXXXXX)
partner_id (trackingId)
partner_name
product_id
product_name
quantity
unit_price_cents
total_cents
currency
customer_email
customer_name
region_id
beach_id (contexte)
mollie_payment_id
partner_reference
status (PENDING|PAYMENT_PENDING|PAID|PROCESSING|CONFIRMED|FULFILLED|CANCELLED|REFUNDED|FAILED)
gross_amount_cents
partner_cost_cents (NULL si inconnu)
sargagame_margin_cents (NULL si inconnu)
created_at
updated_at
```

### 4. Événements tracking à ajouter (allowlist) — ✅ FAIT (9 events)
- `sg_product_view`
- `sg_cart_add`
- `sg_cart_open`
- `sg_checkout_start`
- `sg_checkout_payment`
- `sg_order_paid`
- `sg_order_failed`
- `sg_order_confirmed`
- `sg_order_cancelled`

### 5. UI Components — ✅ CODE LOCAL PRÊT
- `PartnerProductCard` — photo, prix, variantes, CTA "Ajouter au panier"
- `PartnerCart` — slide-in / modal, résumé, total
- `PartnerCheckout` — email, infos client, total, Mollie Components
- `PartnerOrderConfirmation` — order_id, résumé, transmission partenaire

---

## E. Accès manquants à demander — TOUS ABSENTS

### ACCÈS REQUIS — Taxis Martinique
- **Accès** : API réservation / webhook booking / flux CSV export
- **Pourquoi** : Actuellement seul lien outbound. Pour vendre : quote temps réel + création réservation + confirmation
- **Endpoint/ressource** : `POST /api/booking` ou webhook partenaire
- **Ce que cela débloque** : Transport natif "Réserver ici" avec prix réel
- **Statut** : ❌ **ABSENT** — dépendance externe (humain)

### ACCÈS REQUIS — RHUMZ
- **Accès** : API VTC (quote, booking, driver tracking, cancel)
- **Pourquoi** : Partenaire multi-îles (MQ+GP), gros potentiel
- **Endpoint/ressource** : API REST RHUMZ ou webhook
- **Ce que cela débloque** : VTC natif sur 2 régions
- **Statut** : ❌ **ABSENT** — dépendance externe

### ACCÈS REQUIS — Lovelly
- **Accès** : Flux catalogue produits (CSV/JSON/XML) + prix + stock + images
- **Pourquoi** : Shopping bijoux/souvenirs, panier natif
- **Endpoint/ressource** : Export catalogue ou API Shopify/WooCommerce
- **Ce que cela débloque** : Shopping natif "Acheter ici"
- **Statut** : ❌ **ABSENT** — dépendance externe

---

## PLAN D'ACTION — PARKED JUSQU'À VALIDATION MONEY-PATH

**NE PAS EXÉCUTER TANT QUE MONEY-PATH NON VALIDÉ**

1. ~~Étendre le catalogue avec `capabilities`~~ — ✅ FAIT
2. ~~Créer `PartnerCommerce` client library~~ — ✅ CODE LOCAL PRÊT
3. ~~Créer endpoints Worker `/api/partner/*`~~ — ✅ CODE LOCAL PRÊT (404 en prod)
4. **Créer table `partner_orders` Supabase** — ❌ BLOQUÉ (attendre validation money-path)
5. ~~Étendre tracking (funnel events + allowlist)~~ — ✅ FAIT (9 events)
6. ~~UI : `PartnerProductCard`, `PartnerCart`, `PartnerCheckout`~~ — ✅ CODE LOCAL PRÊT
7. ~~Intégrer dans PartnerContext~~ — ✅ FAIT (natif si capabilities)
8. **Valider money-path principal** — 🔴 **ACTION FONDATEUR REQUISE**
9. **Configurer routes `/api/partner/*` Cloudflare** — 🔴 **ACTION FONDATEUR REQUISE**
10. **Négocier 1 accès API partenaire pilote** — 🔴 **ACTION FONDATEUR/HUMAIN REQUISE**

---

**PREMIER PARCOURS TRANSACTIONNEL POSSIBLE** : Dès que money-path validé + 1 accès API partenaire → architecture prête, implémenter l'adaptateur.

---

**STATUT FINAL : PARKED** — Architecture complète en local, tests contract 37/37 verts, MAIS money-path principal non validé, endpoints 404 en prod, table `partner_orders` absente, 0 accès API partenaire.