# RAPPORT FINAL — CYCLE 3 : PUBLICATION, REVUE ET SÉCURISATION DU FULFILLMENT MOLLIE

**Projet** : `aveca/sargagame`  
**Branche** : `fix/p0-mollie-fulfillment` (sur `origin`)  
**SHA complet** : `747af8376d972c9bd4712abb7b02b7f614f00b9c`  
**Commit unique** : `747af8376 fix(p0-mollie-fulfillment): regional worker grants via RPC + legacy p7 compatibility`  
**Date** : 2026-11-04  
**Statut** : publié, inspectable, prêt pour review — **aucun merge, aucun déploiement, aucun backfill, aucun email client**.

---

## 1. PUBLICATION DU TRAVAIL

| Élément | Valeur |
|---------|--------|
| Branche locale | `fix/p0-mollie-fulfillment` |
| Branche distante | `origin/fix/p0-mollie-fulfillment` (push simple, pas de force push) |
| SHA 40 caractères | `747af8376d972c9bd4712abb7b02b7f614f00b9c` |
| Commits d'avance sur `main` | 1 |
| `main` modifié | Non |

Diff exact vs `main` (3 fichiers, +592 / −9) :
- `scripts/automation/backfill-mollie-grants.cjs` (nouveau, 234 lignes)
- `tests/unit/mollie-fulfillment-cycle2.test.cjs` (nouveau, 308 lignes)
- `workers/sargagame/index.js` (modifié, 59 insertions, 9 suppressions)

URL de la branche GitHub : https://github.com/aveca/sargagame/tree/fix/p0-mollie-fulfillment  
URL de création de PR (à ouvrir manuellement) : https://github.com/aveca/sargagame/pull/new/fix/p0-mollie-fulfillment

> Aucun outil GitHub (`gh`, GitHub MCP) n'est disponible dans cette session, donc la PR n'a pas pu être créée automatiquement. À ouvrir manuellement vers `main`, sans merger.

---

## 2. RENFORCEMENT DE L'ALIAS HISTORIQUE `p7`

### Règles appliquées (dans `workers/sargagame/index.js`)

| Règlement | Implémentation |
|-----------|----------------|
| Reconnaître `p7` comme alias de `trip7` | `LEGACY_PASS_ALIASES = { p7: "trip7" }` |
| Uniquement pour paiements déjà créés | Consulté dans `validateMollieAmount` (webhook) et `grantB2CPassIdempotent` (payment_status) ; **jamais** dans `create_payment` |
| Date de coupure historique | `LEGACY_CUTOFF_DATE = "2026-08-01T00:00:00Z"` ; un `p7` créé ≥ cette date → `legacy_expired`, rejeté |
| Montants historiques uniquement | `LEGACY_PRICES = { trip7: { EUR: [7.99], USD: [5.99] } }` ; le prix actuel (4,99 €) n'est **pas** accepté pour un code legacy |
| Pas de nouveau paiement `p7` | `create_payment` valide contre `PASS_PRICES` uniquement (`p7` absent → 400 "Prix invalide") |
| Aucun tarif public modifié | Les prix publics (`PASS_PRICES`) sont inchangés |

### Preuve : aucun autre endpoint ne crée du `p7`
Le seul endpoint de création de paiement est `create_payment` (action `/api/mollie` ou `/api/mollie.php`). Il vérifie `PASS_PRICES[pass]`, qui ne contient pas `p7` → rejet. Aucun autre endpoint (`create_subscription`, `b2b-trial`, etc.) n'émet un pass B2C `p7`.

---

## 3. SUPPRESSION DES IDENTIFIANTS TRANSACTIONNELS DES LOGS

Avant (cycle 2) :
```js
console.error("[mollie-webhook] grant rejected", {paymentId: id, reason: validation.reason});
console.error("[mollie-webhook] Supabase grant RPC failed", {paymentId: String(payment?.id)||"", status: r.status, code: ...});
```

Après (cycle 3) :
```js
console.error("[mollie-webhook] grant rejected", {cid: opaqueId(id), reason: validation.reason});
console.error("[mollie-webhook] Supabase grant RPC failed", {cid: opaqueId(payment?.id), status: r.status, code: code||"unknown"});
```

- `opaqueId(s)` : FNV-1a tronqué à 10 caractères hexadécimaux préfixés `c` (ex. `c13m8g7q`). Opaque, non réversible, suffisant pour corréler les logs.
- Aucun `paymentId` brut, aucune adresse email, aucune donnée client, aucune clé n'est loguée.
- Les corps de réponse HTTP (webhook acknowledgment) conservent `paymentId` car ils font partie du protocole d'acquittement Mollie (nécessaire à l'idempotence côté client) — ce n'est pas un log.
- Cohérent avec la politique de confidentialité (pas de PII dans les logs, cf. PR #1260 / politique de confidentialité du projet).

---

## 4. AUDIT DU BACKFILL (`scripts/automation/backfill-mollie-grants.cjs")

### Comportement par défaut : DRY RUN
`dryRun = !args.includes("--apply") || args.includes("--dry-run")` → écriture Supabase **impossible** sans `--apply --confirm-backfill=YES-I-HAVE-APPROVED`.

### Couverture des scénarios demandés (vérifiée par lecture du code)

| Scénario | Traitement dans le backfill |
|----------|----------------------------|
| email manquant | `emailOk = false` si `canonical !== "sos"` et pas d'email → `canGrant = false` ; signalé "MISSING — manual lookup required" |
| email ambigu | Pas de déduction : l'email est pris tel quel depuis `payment.metadata` ; jamais deviné ni reconstruit |
| paiement remboursé | `refunds.count === 0` requis pour `canGrant` |
| chargeback | Apparaît comme remboursement Mollie → couvert par `refunds.count` |
| montant ou devise incorrect | `amountOk` vérifié contre `LEGACY_PRICES` (legacy) ou `PASS_PRICES` (courant) |
| grant déjà existant | `!existing.length` (requête Supabase `payment_grants` par `payment_id`) + idempotence DB (`ON CONFLICT DO NOTHING`) |
| RPC indisponible | `supabaseRpcGrant` renvoie le statut, consigné dans `applyResult` ; aucune écriture fantôme |
| réseau indisponible | `fetch` lève → attrapé par le `main().catch` (sortie en erreur, écriture partielle uniquement) |
| paiement modifié entre contrôle et exécution | **Risque résiduel TOCTOU** : pas de re-vérification immédiatement avant l'écriture. Atténué par le caractère manuel (`--apply` + confirmation double) et l'idempotence DB. |
| rejeu du même backfill | Idempotent : `existing.length` bloque un second grant ; la contrainte unique `payment_id` empêche le double en DB |
| expiration depuis la délivrance effective | `p_expires_at = Date.now() + days*86400000` (date effective, **pas** la date de paiement initiale) |

### Limites
- Le script n'a **pas** été exécuté contre le live Mollie (aucune clé API disponible dans ce contexte, et consigne de ne jamais lancer `--apply`). L'audit est donc statique (lecture du code + `node -c` OK).
- Le paiement sans email (selon le rapport de rapprochement) nécessite une corrélation manuelle (session/analytics/client Mollie) avant toute délivrance — le script le signale mais ne résout pas l'email.

---

## 5. TESTS — RÉSULTATS RÉELS

### Runner officiel `node scripts/run-tests.cjs`
Découvre automatiquement tous les `*.test.cjs` du repo.

| Suite | Résultat |
|-------|----------|
| `tests/unit/mollie-fulfillment-cycle2.test.cjs` | **PASS 21/21** (découvert automatiquement par le runner) |
| `tests/unit/mollie-payment-logic.test.cjs` | PASS |
| `tests/unit/mollie-webhook-p03.test.cjs` | PASS |
| Global dépôt | 221/267 fichiers OK |
| Échecs globaux (46) | Préexistants / environnementaux (workflow YAML structure, PremiumModal, journey flags, cart-recovery, etc.) — **aucun fichier Mollie/fulfillment en échec** |

### 21 cas du cycle de fulfillment (tous verts)
payé → grant ; rejoué idempotent ; non-payé/open/pending/canceled → pas de grant ; devise incorrecte ; pass inconnu ; `p7` EUR 7,99 → `trip7` 7 j ; `p7` USD 5,99 → `trip7` ; `p7` mauvais montant → rejet ; `p7` après coupure → `legacy_expired` (aucun RPC) ; `trip7` EUR 4,99 → grant ; fraude 0,01 € → rejet ; RPC 500 → 503 puis retry succès ; RPC 401 (service role invalide) → 503 sans succès ; RPC 404 PGRST202 → `rpc_unavailable` ; réseau Supabase/Mollie down → 503 ; Mollie 404 → 404 ; contrat JSON signé → 415 ; `create_payment` avec `p7` → 400.

### Preuves spécifiques demandées
- **HTTP 503 en cas de panne RPC** : prouvé (tests RPC 500 / 401 / 404 / réseau renvoient 503, jamais de succès).
- **Aucun marqueur KV après échec de grant** : prouvé — le Worker régional **n'écrit aucun KV de grant** (c'était le comportement de l'ancien `sg-payments`). L'idempotence repose uniquement sur la contrainte unique `payment_id` de la DB. Dans les tests, le mock `fetch` lève sur toute URL qui n'est ni Mollie ni Supabase RPC ; comme tous les tests passent, aucune URL KV n'est appelée.
- **Rejeu webhook** : idempotent (un seul `payment_id` → une seule ligne DB via `ON CONFLICT DO NOTHING`, plusieurs rejets du webhook ne créent pas de doublon).
- **Rejeu backfill** : idempotent (`existing.length` + contrainte DB).
- **Opaque ID dans les logs** : prouvé — les logs affichent `cid: 'c13m8g7q'`, jamais le `paymentId` brut.

---

## 6. PR (À CRÉER MANUELLEMENT)

- Branche source : `fix/p0-mollie-fulfillment`
- Branche cible : `main`
- Titre suggéré : `fix(p0-mollie-fulfillment): regional worker grants via RPC + legacy p7 compatibility`
- Corps : décrire les 3 fichiers, les 21 tests, le backfill DRY RUN, et mentionner explicitement que **le routage Cloudflare et le déploiement production ne sont pas effectués**, qu'aucun backfill n'est lancé, qu'aucun email n'est envoyé.
- **Ne pas merger.** **Ne pas déployer.** **Ne pas exécuter de backfill.** **Ne pas envoyer d'emails.**

---

## 7. RISQUES RÉSIDUELS

| Risque | Niveau | Atténuation |
|--------|--------|-------------|
| Routage Cloudflare `/api/mollie*` encore pointé vers `sg-payments` (ancien Worker sans fulfillment) | Élevé (les 6 ventes ne sont pas encore livrées en prod) | À corriger après approbation : pointer `/api/mollie-webhook` + `.php` vers les Workers régionaux `sargagame-<region>` |
| Pas de secret HMAC `MOLLIE_WEBHOOK_SECRET` sur le Worker régional (webhook fail-open sur signature) | Moyen | Bug préexistant (BUG-2026-001) ; à provisionner côté serveur, pas dans ce PR |
| TOCTOU backfill (paiement modifié entre contrôle et écriture) | Faible | Écriture uniquement sous `--apply` + double confirmation ; idempotence DB |
| Paiement sans email dans le rapprochement | Moyen | Corrélation manuelle requise (session/analytics/client Mollie) avant délivrance |
| 46 échecs de tests préexistants dans le dépôt | Faible | Non liés à ce changement ; aucun fichier Mollie/fulfillment en échec |

---

## 8. PROCÉDURE DE ROLLBACK

1. **Code** : `git revert 747af8376d972c9bd4712abb7b02b7f614f00b9c --no-edit` puis `git push origin main` → restaure l'état avant cycle 2/3 (le Worker régional redevient sans compatibilité `p7` et avec les logs raw paymentId — état antérieur, pas de régression fonctionnelle sur le routing).
2. **Routing Cloudflare** : si des routes avaient été modifiées (non fait à ce stade), les restaurer vers `sg-payments` dans le dashboard Cloudflare (réversible instantanément).
3. **Backfill** : aucun n'a été exécuté (DRY RUN seulement), donc rien à rollback du côté Supabase.
4. **Aucune migration Supabase n'a été ajoutée** (consigne respectée) → aucun rollback de schéma nécessaire.

---

## 9. CRITÈRES DE RÉUSSITE DU CYCLE 3

- [x] Branche publiée sur `origin`, SHA 40 chars confirmé
- [x] Commit contient exactement les 3 fichiers prévus
- [x] Alias `p7` durci avec date de coupure (2026-08-01) ; `create_payment` rejette `p7`
- [x] Logs sans identifiants transactionnels bruts (`cid` opaque)
- [x] Backfill audité sur tous les scénarios demandés ; DRY RUN par défaut
- [x] 21 tests de fulfillment passés ; runner officiel 221/267 OK, 0 échec lié au changement
- [x] HTTP 503 prouvé sur panne RPC ; aucun marqueur KV après échec ; rejeu webhook/backfill idempotent
- [x] PR préparée (à créer manuellement), non mergée, non déployée
- [x] Rapport final, risques résiduels, procédure de rollback documentés

**La mission est terminée : le code est publié, inspectable et prêt pour review. Aucune action de production n'a été exécutée. Les six ventes restent à livrer après approbation du routage, déploiement du Worker régional, et exécution autorisée du backfill.**
