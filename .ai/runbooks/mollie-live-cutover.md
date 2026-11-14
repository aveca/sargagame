# Runbook — bascule `MOLLIE_API_KEY` TEST → LIVE, vérification du mode, test d'achat contrôlé

> **Ce document n'exécute rien.** Tout ce qui suit est une **procédure** à
> exécuter par le fondateur (ou sous son autorisation explicite), pas par
> l'agent qui l'a écrit. Aucune clé n'a été lue, affichée, copiée ni journalisée
> pendant sa rédaction. Aucune transaction n'a été créée.
>
> Runbook associé : `.ai/runbooks/sg-payments-deploy.md` (déploiement de la
> Worker + rollback).

---

## 0. Rappel de l'état (établi le 2026-11-12, lecture seule)

| Élément | État |
|---|---|
| Clé `MOLLIE_API_KEY` du **Worker** `sg-payments` | **TEST** (un paiement `mode=test` ne livre **aucun** accès : `validatePaymentForFulfillment` exige `mode === "live"`) |
| Clé `MOLLIE_API_KEY` du **secret GitHub** `MOLLIE_API_KEY` | présente, **fail-closed** : la porte `mollie-live-gate` exige un préfixe `live_` |
| Effet d'un push sur `main` aujourd'hui | **aucun déploiement** : `deploy` et `deploy-pages` dépendent tous deux de `mollie-live-gate` (échec sur clé TEST) **et** le gate satellite échoue (3836,6 min > 900 min) |
| Worker `sg-payments` live | `42470a47-b4f7-4296-89b0-c37cdb4f3574` (2026-11-11T18:36:22Z) |
| Encaissement réel | **0 €** (`payments_this_month=0`, `mrr=0 €`, `active_subs=0`) |
| Demandes B2B réellement persistées | **0** (9 trials dans le funnel, 0 activé, 0 payé) |

> **Le Worker et le secret GitHub sont deux clés distinctes.** Les deux doivent
> passer en LIVE, sinon :
> - Worker en TEST + secret GitHub en LIVE → le CI autorise un déploiement, mais
>   les paiements restent refusés (`not_live_mode`) ;
> - Worker en LIVE + secret GitHub en TEST → les paiements sont acceptés, mais
>   le CI refuse tout déploiement (fail-closed).

---

## 1. Ordre recommandé

1. Déployer `sg-payments` (runbook de déploiement) — **sans** changer la clé :
   on met le code en place et on vérifie que rien ne casse en mode TEST.
2. Vérifier les 10 sondes post-déploiement (runbook de déploiement §5).
3. Basculer la clé du **Worker** en LIVE (§2.1), puis vérifier le mode (§3).
4. Basculer le secret **GitHub** en LIVE (§2.2).
5. Test d'achat réel contrôlé (§4), puis annulation immédiate (§4.5).

> Ne jamais inverser 3 et 4 : avec la clé GitHub en LIVE alors que le Worker
> est en TEST, la porte CI s'ouvre et un push sur `main` **déclencherait un
> déploiement** de la flotte (le gate satellite reste bloqué, mais le risque
> devient inutile).

---

## 2. Remplacement sécurisé de la clé

### 2.0 Règles absolues

- ❌ La clé **n'est jamais** passée en argument de ligne de commande
  (`wrangler secret put MOLLIE_API_KEY live_xxx` = valeur dans l'historique
  shell et dans la liste des processus).
- ❌ La clé n'est **jamais** écrite dans un fichier, un script, un issue, un
  PR, un canal Discord, un log, ni dans un `.env` versionné.
- ❌ La clé n'est **jamais** affichée, même partiellement (pas de `echo`, pas
  de `head -c`, pas de préfixe).
- ✅ La clé est saisie au **prompt masqué** du CLI, ou lu sur l'entrée
  standard, et n'est jamais journalisée.
- ✅ Seuls les **noms** de secrets sont vérifiés après coup
  (`wrangler secret list`, `gh api .../actions/secrets --jq '.secrets[].name'`).

### 2.1 Clé du Worker `sg-payments`

```bash
# Le prompt masqué demande la valeur ; rien n'est écrit dans l'historique.
npx wrangler secret put MOLLIE_API_KEY --name sg-payments
```

- `wrangler secret put` crée une **nouvelle version** de la Worker ; la
  baseline `42470a47-b4f7-4296-89b0-c37cdb4f3574` **reste listée** (rollback
  toujours possible).
- Vérifier que **rien n'a été perdu** :

```bash
npx wrangler secret list --name sg-payments
# attendu : MOLLIE_API_KEY, MOLLIE_PROFILE_ID, MOLLIE_WEBHOOK_SECRET,
#           RESEND_API_KEY, SUPABASE_SERVICE_KEY  (les NOMS, jamais les valeurs)
```

### 2.2 Secret GitHub `MOLLIE_API_KEY`

```bash
# Sans --body : gh lit la valeur sur l'entrée standard (prompt masqué si TTY).
gh secret set MOLLIE_API_KEY --repo aveca/sargagame
```

Vérification (noms uniquement) :

```bash
gh api repos/aveca/sargagame/actions/secrets --jq '.secrets[].name' | sort
```

### 2.3 Les autres secrets ne bougent pas

`MOLLIE_PROFILE_ID`, `MOLLIE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
`SUPABASE_SERVICE_KEY` **ne sont pas modifiés**. `MOLLIE_WEBHOOK_SECRET` doit
correspondre à la clé du compte Mollie : si la clé live a un webhook secret
différent, le webhook sort en 403 → **argent encaissé, accès non livré**.
Vérifier dans `dashboard.mollie.com` que la clé webhook live est bien celle
posée dans le Worker.

---

## 3. Vérifier le mode LIVE sur les six domaines — **sans créer de transaction**

### 3.1 Contrôle sur le Worker (le plus direct)

L'endpoint de diagnostic `/api/mollie-mode` a été ajouté avec la PR #1423 :

```bash
for d in sargasses-martinique.com sargasses-guadeloupe.com sargassummiami.com \
         sargassumpuntacana.com sargassumcancun.com sargazotulum.com; do
  printf '%s -> ' "$d"
  curl -sS --max-time 20 "https://$d/api/mollie-mode"; echo
done
```

Attendu sur les 6 domaines :

```json
{"ok":true,"mode":"live","api_mode":"live"}
```

- `mode` = déduit du **préfixe** de la clé du Worker (`live_` / `test_`) ;
- `api_mode` = le champ `mode` renvoyé par l'API Mollie elle-même
  (`GET /v2/payments?limit=1`, **lecture seule**) ;
- l'endpoint ne retourne **jamais** la clé ni un fragment de clé, et ne crée
  **aucune** transaction (contrat verrouillé par
  `tests/unit/p0-mollie-mode-diagnostic.test.cjs`, 17 assertions).

### 3.2 Contrôle sur le secret GitHub (fail-closed)

La porte `mollie-live-gate` de `cloudflare-production.yml` fait exactement ce
contrôle et n'affiche que le mode :

```bash
case "${MOLLIE_API_KEY:-}" in
  live_*) echo "Mollie key mode: LIVE" ;;
  *)      echo "Mollie key mode: PAS LIVE" ;;
esac
```

À lire dans le **log du job** `mollie-live-gate` du prochain run sur `main`
(la valeur n'y est jamais affichée). ⚠️ Ce run déclenche le parcours de
production : à n'utiliser **qu'après** la bascule du Worker (§2.1), et en
conséquence du gate satellite.

### 3.3 Contrôle dans l'interface Mollie

`dashboard.mollie.com` → **Developers → API keys** : la clé live apparaît comme
« Live ». C'est le contrôle le plus simple, et il ne peut rien divulguer.

### 3.4 Ce qu'il ne faut PAS faire

- ❌ Ne pas créer un paiement de 1 € « pour tester » : en mode LIVE, une
  carte de test Mollie est **refusée**, et une vraie carte = un vrai paiement.
- ❌ Ne pas essayer de deviner le mode depuis le checkout : l'indicateur de mode
  n'est pas rendu par `/api/mollie-pay` aujourd'hui.

---

## 4. Test d'achat réel contrôlé — **procédure, NON exécutée**

> **Exige une autorisation explicite du fondateur, séparée du déploiement.**
> C'est le **seul** test qui prouve la livraison réelle de l'accès : un
> paiement `mode=test` ne livre rien (c'est voulu, fail-closed).

### 4.1 Prérequis

- [ ] Worker déployé (§1.1 du runbook de déploiement) et **mode = live** (§3).
- [ ] Migrations `001` + `002` appliquées.
- [ ] `MOLLIE_WEBHOOK_SECRET` live correct (§2.3).
- [ ] Une **adresse e-mail de test dédiée**, contrôlée par le fondateur
      (ex. `p0-test@<domaine-du-fondateur>`) — jamais une adresse client.
- [ ] Une carte **réelle** utilisable (en mode LIVE, les cartes de test
      Mollie sont refusées) et un budget de **29 €** (plan `brief_monthly`).

### 4.2 Déroulé

1. **Accusé d'essai (optionnel, mais c'est le chemin marketing réel)** :
   ouvrir `https://<domaine>/pro/espace/`, saisir l'adresse de test, valider.
   - Attendu : le lead est persisté par le sink, **puis** l'essai est annoncé
     (comportement #1418 : rien n'est annoncé si le lead n'est pas confirmé).
   - Vérifier : le sink (`?action=stats`) doit montrer **+1** trial.
2. **Création de l'abonnement de test** (29 €) — via le checkout B2B ou via
   l'API. Exemple via l'API (le plan, le montant et la durée sont **résolus
   par le serveur** : on ne peut rien falsifier) :

   ```bash
   curl -sS -X POST "https://<domaine>/api/mollie.php" \
     -H "Content-Type: application/json" \
     -d '{"action":"create_subscription","plan":"brief_monthly","email":"p0-test@<domaine-du-fondateur>","hosted":true}'
   # attendu : { "checkoutUrl": "https://checkout.mollie.com/...", "paymentId": "tr_...", "customerId": "cst_..." }
   ```

   - Le plan `brief_monthly` = **29 €** (le moins cher du catalogue B2B).
   - Alternative flagship : `plan:"pro_annual"` = 690 €, **abonnement unique**
     (pas de reconduction) — plus cher, mais plus simple à nettoyer.
3. **Paiement** : ouvrir `checkoutUrl` dans un navigateur, payer avec la carte
   réelle.
4. **Vérifier la chaîne de livraison** (5 preuves) :

   | # | Preuve | Où |
   |---|---|---|
   | a | Webhook `payment.paid` reçu | logs Worker (`wrangler tail`) / dashboard Mollie |
   | b | `payment_grants` contient la ligne (type B2B, email de test) | Supabase |
   | c | **Email reçu** avec le lien `/pro/espace/?k=<jeton>` | boîte de test |
   | d | Le jeton fonctionne : `GET /api/widget-token.php?k=<jeton>` → `{"pro":true}` | API |
   | e | `/pro/espace/?k=<jeton>` affiche l'espace Pro actif | navigateur |

   - La durée appliquée doit être **30 jours** pour `brief_monthly`
     (`plan.interval` présent) — c'est exactement ce que #1406 a corrigé :
     la durée vient du catalogue serveur, pas des métadonnées client.

### 4.3 Critères de succès

- [ ] Les 5 preuves (a→e) sont réunies.
- [ ] Aucune erreur `not_live_mode`, `amount_mismatch`, `currency_mismatch`,
      `b2c_grant_rpc_failed` dans les logs.
- [ ] **Aucun** second abonnement créé par `maybeCreateFollowupSubscription`
      avant le premier paiement (garde-fou #1411).

### 4.4 Critères d'échec → rollback immédiat

- [ ] `not_live_mode` → la clé n'est pas LIVE : ne pas recommencer, vérifier §3.
- [ ] `amount_mismatch` / `currency_mismatch` → le catalogue serveur ne
      correspond pas : **ne pas modifier le client**, corriger le serveur.
- [ ] `b2c_grant_rpc_failed` → la migration `001` n'est pas appliquée : le
      paiement est encaissé mais l'accès n'est pas livré → **rembourser puis
      appliquer la migration**.

### 4.5 Annulation immédiate (obligatoire, dans l'ordre)

1. **Annuler l'abonnement** `cst_…` / `sub_…` (dashboard Mollie →
   Abonnements → annuler). Sans cela, une **reconduction à 29 €/mois** est
   débitée le mois suivant.
2. **Rembourser** le paiement `tr_…` (dashboard Mollie → Paiements →
   Rembourser, montant intégral).
3. **Révoquer le droit** : supprimer la ligne `payment_grants` ou laisser
   `expires_at` expirer (le rollback de la Worker **ne ré-accuse pas** un
   droit déjà écrit).
4. **Supprimer le client de test** `cst_…` et le lead de test dans le sink
   (pour ne pas polluer le funnel : 9 trials + 1 test = 10).
5. Consigner dans le rapport : `paymentId`, `subscriptionId`, timestamps,
   preuve de remboursement, preuve d'annulation.

### 4.6 Ce que ce test ne prouve pas

- Il ne prouve pas le parcours **multi-domaines** (un seul domaine testé).
- Il ne prouve pas la **reconduction** (annulée avant).
- Il ne remplace pas le suivi commercial : au 2026-11-12, le compteur reste
  **0 demande réellement persistée, 0 paiement réellement encaissé**.

---

## 5. Retour à TEST (si le test échoue ou si la bascule est annulée)

```bash
# 1. Remettre la clé TEST sur le Worker (prompt masqué)
npx wrangler secret put MOLLIE_API_KEY --name sg-payments

# 2. Remettre le secret GitHub à TEST (prompt masqué)
gh secret set MOLLIE_API_KEY --repo aveca/sargagame

# 3. Vérifier que le mode est bien revenu à TEST, sans transaction
curl -sS "https://<domaine>/api/mollie-mode"
# attendu : {"ok":true,"mode":"test", ...}
```

Le retour à TEST **neutralise** le risque d'encaissement sans livraison
(les paiements `mode=test` ne créent aucun droit).

---

## 6. Liste des actions nécessitant une intervention du fondateur

| # | Action | Pourquoi l'agent ne peut pas la faire |
|---|---|---|
| 1 | **Fournir la clé Mollie LIVE** (et le webhook secret live si différent) | le secret ne doit jamais transiter par l'agent ni ses logs |
| 2 | **Valider la bascule TEST → LIVE** (ordre §1) | décision commerciale + manipulation de secret |
| 3 | **Autoriser le déploiement `sg-payments`** | déploiement de production = autorisation explicite |
| 4 | **Appliquer les migrations `001` + `002`** en base | écriture en base de production |
| 5 | **Autoriser le test d'achat réel** (29 €, carte réelle) | paiement réel |
| 6 | **Annuler l'abonnement + rembourser** après le test | acte financier sur le compte Mollie |
| 7 | **Rétablir le SLA satellite** (observation ERDDAP < 900 min) | Punta Cana et toute la flotte restent bloqués tant que ce n'est pas fait |
| 8 | **Trancher BUG-2026-015** : l'entrée paywall est conditionnée à une observation ERDDAP de < 12 h alors que NOAA ne publie qu'une fois par jour | **la vente B2C est structurellement fermée ~12 h sur 24** : décision produit, pas technique |
