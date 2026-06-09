Décision tranchée d'architecte. Pas de menu, pas de "ça dépend".



# PARTIE 1 — DÉCISION

## Verdict (2 lignes)
**GO INCRÉMENTAL, webhook-first — PAS de migration Supabase maintenant.** Première action : poser un endpoint Stripe **signé** (PHP sur le cPanel déjà en place) qui devient l'unique source de vérité du revenu. Supabase reste sur l'étagère tant que le volume ne le justifie pas.

## Pourquoi (ROI cash, pas religion technique)
Les 4 analyses convergent sur **un seul fait dur** : la "DB" n'encaisse rien. Stripe encaisse (Payment Link + trial + dunning + factures), et le PHP lit déjà l'état Stripe en live (`verify_subscription`, `portal`). Le Sheet/Apps Script est une couche CRM/analytics qui **tient 10× sans transpirer**.

Le seul défaut réel et chiffrable n'est pas un problème de DB : le "webhook" `checkout.session.completed` est un **POST navigateur non signé, falsifiable, qui rate les conversions sans retour d'onglet** (auto-documenté Code.js:601). Conséquence cash directe : ton MRR affiché (34,93 €) est **sous-compté ET falsifiable**.

- **Coût du fix réel** : ~1-2h en PHP, zéro nouveau service, zéro facture, zéro migration.
- **Coût migration Supabase complète** : 8-12 j (ou 1-3 semaines selon l'avocat du diable) = **1 à 3 ans de MRR brûlés en temps** pour résoudre un problème de scale que tu n'as pas avant ~50-100×.

Le mur de croissance est l'**acquisition** (modal→CTA, SEO, nouveaux domaines), pas la persistance. Supabase est la bonne cible *plus tard* — pas le bon coût *maintenant*.

## Plan incrémental ordonné (si GO — c'est GO)
**Étape 0 — 1re action, plus haut ROI (~1-2h)** : `public/api/stripe-webhook.php` signé sur cPanel.
- Vérifie `Stripe-Signature` (HMAC-SHA256 sur le **raw body**, `file_get_contents('php://input')`), idempotence par `event.id`.
- Filtre `metadata.island` (compte Stripe partagé botwow/sargagame → sinon tu comptes du revenu BOT-WOW comme sargasses).
- Forward l'event **vérifié** vers l'Apps Script existant (qui garde son rôle de log/funnel). `whsec_` ajouté dans `stripe-config.php`, re-deploy via `deploy-stripe-config.cjs`.
- Capte enfin `invoice.payment_succeeded` / `subscription.deleted` / `payment_failed` → MRR et churn **réels**.

**Étape 1 (conditionnelle, seulement si décision business "scale multi-domaines")** : email engine → Resend (le mur MailApp 100/j, déjà câblé côté PHP). C'est le seul vrai blocage technique au scale, et il est **indépendant de Supabase**.

**Étape 2 (différée, trigger explicite)** : Supabase. À déclencher **uniquement** quand l'un de ces seuils tombe : >500 subscribers actifs, ou ≥3 domaines live avec revenu, ou MailApp/Apps Script qui timeout en prod. Alors : schéma + `region`, edge `stripe-webhook`, dual-write, réconciliation par comptage, bascule lecture après delta=0 sur 30j.

## Ce qu'on NE fait PAS maintenant
- Pas de schéma Postgres, pas de RLS, pas d'edge functions, pas de migration de données.
- Pas de cache `subscriptions` Supabase (= risque de désync avec Stripe, la vraie source).
- Pas de réécriture des consommateurs `?action=` / `.cjs` / JSX.
- Pas de touche au flux d'encaissement (Payment Link + PHP) qui marche.

## Garde-fous anti-régression MQ/GP
1. **Le nouveau webhook s'AJOUTE, ne remplace pas** : l'Apps Script log continue en parallèle. Rollback = supprimer l'endpoint dans le Stripe Dashboard (0 code).
2. **Raw body obligatoire** : lire `php://input` AVANT tout parsing JSON, sinon la signature ne matche jamais.
3. **Filtre `island`** strict sur chaque event (anti-pollution BOT-WOW).
4. **Réconciliation J+1** : `count + sum(amount)` webhook signé vs tab `payments` Sheet, par `region`. Delta ≠ 0 = alerte, pas de bascule.
5. **`sk_live` jamais exposée** : reste dans `stripe-config.php` (`.htaccess Require all denied` + gitignore). Le `whsec_` suit le même chemin.
6. **Idempotence** : `unique(event.id)`, jamais dédup par `session_id` (Stripe rejoue, plusieurs events / session).
