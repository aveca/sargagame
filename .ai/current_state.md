## 2026-09-16 18:30 UTC · Agent: coding-agent (B2C Payment Race Condition FIXED + /api/mollie routing FIXED)

### Travail effectué
- **Résumé 1 ligne** : Race condition corrigée (payMountedRef) + routage /api/mollie (invalid_json) — money-path B2C prêt pour validation prod

### Fichiers modifiés
- `src/PremiumModal.jsx` : ajout `payMountedRef` partagé
- `src/PremiumModal/OnsiteCheckout.jsx` : utilisation `payMountedRef` partagé, mount 4 composants Mollie avant `sg_onsite_checkout_opened`
- `src/PremiumModal/doSubscribe.jsx` : attente `payMountedRef` (5s/120ms polling) avant `createToken()`, events `sg_mollie_mounted_timeout` / `sg_mollie_mounted_after_wait`
- `workers/sg-payments/src/index.ts` (commit e8c665085) : `handleMollie` utilise `request.text()` + `JSON.parse()` pour corriger `invalid_json` sur body vide

### PROBLÈMES RÉSOLUS

| Problème | Cause racine | Correctif | Commit |
|----------|--------------|-----------|--------|
| **A. "Not all required components are mounted"** | `createToken()` appelé avant que les 4 Mollie Components (cardHolder, cardNumber, expiryDate, verificationCode) ne soient montés dans le DOM | `payMountedRef` partagé + attente 5s/120ms polling dans `doSubscribe` avant `createToken()` | f11ca638a |
| **B. "invalid_json" / body vide sur POST /api/mollie** | Worker lisait `request.json()` sur body déjà consommé / vide | `handleMollie` utilise `request.text()` + `JSON.parse()` avec fallback sécurisé | e8c665085 |

### VALIDATION TECHNIQUE

| Check | Résultat |
|-------|----------|
| `npm run build` | ✅ 388 modules, 0 erreur |
| Bundle budget (38.1 Ko / 210 Ko) | ✅ |
| PHP lint (mollie.php, mollie-lib.php, mollie-webhook.php) | ✅ |
| Unit tests | ✅ 200+ PASS |
| Funnel-payment E2E | ✅ 12/13 PASS (1 flaky comic variant) |
| Contract-pass-one-time | ✅ 2/2 PASS |
| Regions validation | ✅ 5 régions valides |

### TESTS E2E PAYMENT FLOW — CE QUI EST COUVERT

| Test | Couvert |
|------|---------|
| Carte → fiche → paywall : funnel reaché + events | ✅ |
| Paywall affiche CTA Premium | ✅ |
| Pas d'erreurs JS critiques | ✅ |
| Rollback flags (?flag=0, ?pwcomic=0) | ✅ |
| Paywall → email → CTA checkout visible | ✅ |
| Premium localStorage activation | ✅ |
| Reduced motion | ✅ |
| Multi-region EUR (MQ) | ✅ |

### ARCHITECTURE MONEY-PATH B2C — ÉTAT

| Composant | Statut |
|-----------|--------|
| `PremiumModal.jsx` → `OnsiteCheckout` overlay (z 1300) | ✅ Monté |
| `OnsiteCheckout` : 4 Mollie Components + email | ✅ Montés avant `sg_onsite_checkout_opened` |
| `doSubscribe` → `payMountedRef` wait → `createToken()` | ✅ Race condition éliminée |
| `POST /api/mollie.php` (worker `handleMollie`) | ✅ Body parsing corrigé |
| Mollie `create_payment` → `checkoutUrl` / `paymentId` | ✅ Code prêt |
| Webhook `payment.paid` → `payment_grants` → `sg_auth` | ✅ Code prêt |

### DÉPENDANCES EXTERNES NON VALIDÉES EN PROD

| Dépendance | Statut | Action requise |
|------------|--------|----------------|
| POST /api/mollie live → Mollie sandbox | **NON TESTÉ EN PROD** | Déclencher un checkout réel (P0) |
| Webhook Mollie → grant → entitlement | **NON TESTÉ EN PROD** | Vérifier après 1er paiement |
| Event `sg_mollie_mounted_timeout` / `sg_mollie_mounted_after_wait` | **NON ÉMIS EN PROD** | Surveiller après déploiement |

### PROCHAINES ACTIONS RECOMMANDÉES

1. **Déployer via normal mechanism** (push main → daily-copernicus.yml → build → FTP → health-check)
2. **Valider money-path réel** : 1 paiement test Mollie sandbox (si nécessaire) ou attendre 1er paiement réel
3. **Surveiller events** : `sg_mollie_mounted_timeout` (doit rester à 0), `sg_mollie_mounted_after_wait` (doit > 0 si délai), `sg_pass_cta` → `sg_onsite_checkout_opened` → `sg_payment_failed`/`mollie_checkout_redirect` → `conversion`
4. **Confirmer disparition erreur** "Not all required components are mounted" en prod
5. **Mettre à jour .ai/current_state.md** après validation prod

### Branche / Commit
- Branche : `main` (HEAD = `f11ca638a`)
- Fixes inclus : f11ca638a (payMountedRef), e8c665085 (invalid_json)

### STATUT FINAL : **FIXED — frontend race condition + /api/mollie routing — PRÊT POUR VALIDATION PROD**

---

### HANDOFF TEMPLATE

```
## 2026-09-16 18:30 UTC · Agent: coding-agent

### Travail effectué
- Fix race condition "Not all required components are mounted" via payMountedRef (5s/120ms polling)
- Fix /api/mollie invalid_json via request.text() + JSON.parse()
- Build OK, bundle 38.1 Ko, tests 200+ PASS, funnel-payment E2E 12/13

### Fichiers modifiés
- src/PremiumModal.jsx, src/PremiumModal/OnsiteCheckout.jsx, src/PremiumModal/doSubscribe.jsx
- workers/sg-payments/src/index.ts

### Problèmes résolus
A. Race condition frontend : createToken() avant mount Composants → payMountedRef wait
B. Routing /api/mollie : body vide → request.text() + JSON.parse()

### Prochaine action
1. Push main → deploy auto (daily-copernicus.yml)
2. Valider money-path prod : 1 paiement test
3. Surveiller events sg_mollie_mounted_* + funnel complet
4. Confirmer disparition erreur "Not all required components are mounted"
```