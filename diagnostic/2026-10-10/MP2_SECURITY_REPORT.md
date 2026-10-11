# MP-2 — Sécurisation des liens pass premium
**Branche :** `agent/security/mp2-gift-hmac` · **PR :** https://github.com/aveca/sargagame/pull/873 · **Non fusionnée, non déployée.**

## Cause exacte et chemin d'exploitation

Dans `src/Sargasses_PROD.jsx`, le handler du paramètre `?pass=` posait directement `sg_premium_pass_end` dans localStorage dès la lecture de l'URL, SANS validation serveur :

```js
// AVANT (vulnérable) :
if(passParam&&(passParam==="trip"||/^p\d{1,3}$/.test(passParam))){
  const days=passParam==="trip"?7:Math.min(120,Math.max(1,parseInt(passParam.slice(1),10)||7))
  try{localStorage.setItem("sg_premium_pass_end",String(end))}catch{}  // ← GRANT SANS PREUVE
```

**Exploit :** `https://<domaine>/?pass=p120` dans un navigateur = 120 jours de premium gratuit. Même chose pour `?premium=1` seul ou `?session_id=arbitraire` (grant premium À VIE sans vérification).

## Correctif

1. **`?pass=` seul → REFUSÉ** : track `sg_pass_blocked`, nettoyage URL, aucun grant.
2. **`?session_id=` / `?premium=1` seuls → REFUSÉS** : ne constituent pas une preuve.
3. **`?gift=<token HMAC>` → vérifié serveur** : signature, expiration, passage anti-tampering, consommation atomique (1 token = 1 usage, clé `gift_<jti>` dans payment_grants).
4. **Paiement Mollie confirmé → préservé** : `?mollie_return=1` avec vérif serveur `/api/mollie.php?action=payment_status`, anti-rejeu MP-1 intact.
5. **Liens cadeaux legacy (comps.php, `?premium_email=`) → inchangés** : vérif email côté serveur Supabase.

## Fichiers modifiés

| Fichier | Type | Détail |
|---|---|---|
| `src/Sargasses_PROD.jsx` | Modifié | Gate `?pass=` + `?premium=1` ; handler `?gift=` async |
| `workers/sargagame/index.js` | Modifié | Route `POST /api/gift-redeem` (vérif + consommation atomique, fail-closed) |
| `workers/sargagame/gift-token.js` | **Nouveau** | Lib HMAC sign/verify (WebCrypto, partagée Worker/Node) |
| `scripts/automation/gift-link.cjs` | **Nouveau** | Générateur de liens cadeaux signés |
| `scripts/automation/blast-mollie-offer.cjs` | Modifié | Fallback : lien cadeau signé ou paywall sans pass |
| `wrangler.template.jsonc` | Modifié | Doc des secrets (GIFT_LINK_SECRET requis) |
| `tests/unit/gift-token.test.cjs` | **Nouveau** | 10 checks : roundtrip, falsification, expiration, wrong-secret, bornes, fail-closed |
| `tests/unit/gift-redeem-worker.test.cjs` | **Nouveau** | 8 checks route réelle : grant, rejeu 409, falsifié 403, secret-absent 503, expiré 410 |
| `tests/e2e/mp2-pass-gate.spec.ts` | **Nouveau** | 6 scénarios E2E : pass nu bloqué, session arbitraire bloquée, gift falsifié/expiré bloqués, premium=1 bloqué, mollie_return OK |
| `tests/e2e/money-path-regression.spec.ts` | Modifié | T4 : contrat inversé (session_id seul ≠ preuve) |

## Résultats avant/après

| Scénario | Avant | Après |
|---|---|---|
| `?pass=p120` seul | ❌ GRANT 120j gratuit | ✅ Refusé |
| `?pass=p30&session_id=cs_arbitraire` | ❌ GRANT 30j | ✅ Refusé |
| `?premium=1` seul | ❌ GRANT premium à vie | ✅ Refusé |
| `?gift=falsifié` | (n'existait pas) | ✅ Refusé 403 |
| `?gift=expiré` | (n'existait pas) | ✅ Refusé 410 |
| `?gift=` réutilisé | (n'existait pas) | ✅ Refusé 409 |
| `?mollie_return=1` confirmé serveur | ✅ Grant OK | ✅ Grant OK (régression vérifiée) |
| Gift lien signé valide | (n'existait pas) | ✅ Grant OK (testé route + unit) |

## Tests

- ✅ `npm run build` : exit **0** (206.9 Ko ≤ 210 Ko)
- ✅ `node scripts/ux-smoke.mjs` : **4/4 tokens verts** (`FUNNEL_REACHED=map+fiche+paywall`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`)
- ✅ `node tests/unit/gift-token.test.cjs` : **10/10 PASS**
- ✅ `node tests/unit/gift-redeem-worker.test.cjs` : **8/8 PASS** (route Worker réelle, fetch Supabase stubbé)
- ✅ `npx playwright test tests/e2e/mp2-pass-gate.spec.ts` : **6/6 PASS**
- ✅ `npx playwright test tests/e2e/money-path-regression.spec.ts` : T4-T5-T6 PASS (T1 = dérive harnais pré-existante, hors scope MP-2)
- ✅ `node scripts/run-tests.cjs` : **184/230** (46 échecs identiques avant/après = artefacts worktrees legacy, aucune nouvelle régression)

## PR et CI

- **PR #873** : https://github.com/aveca/sargagame/pull/873
- **Statut** : OPEN, **non fusionnée** (mission : ne pas merger sans autorisation)
- **CI** : en cours à la création du rapport (`test-frontend`, `perf` in_progress ; GitGuardian ✅)

## Migrations / secrets requis

**Avant déploiement, provisionner le secret Worker :**
```bash
# Pour chaque région (mq, gp, florida, puntacana, rivieramaya, tulum, barbados)
npx wrangler secret put GIFT_LINK_SECRET --config wrangler.jsonc
# Générer : openssl rand -base64 48
```
Sans ce secret : `/api/gift-redeem` retourne **503** (fail-closed, jamais d'octroi par erreur).

## Contrôles restants non vérifiés

- ⚠️ **Déploiement réel** : mission interdit de merger → vérification post-déploiement non faite
- ⚠️ **GIFT_LINK_SECRET en prod** : non provisionné (action manuelle CI/CD)
- ⚠️ **Rejeu de liens cadeaux en prod** : non testable (nécessite backend déployé)
- ⚠️ **T1 money-path-regression** : dérive harnais pré-existante (sélecteur multi-étapes paywall), hors scope MP-2
