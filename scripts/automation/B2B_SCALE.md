# Infrastructure B2B — système & scale

> Objectif : machine B2B **100 % automatisée** (directive fondateur : tout par email,
> zéro prospection/support manuel) qui peut **scaler** quand on le décide. Modèle =
> abonnement Pro récurrent (prépaiement annuel), app conso gratuite en entonnoir.

## La chaîne automatisée (tourne dans `daily-copernicus.yml`, schedule, sans humain)

1. **Découverte / enrichissement** — `b2b-discover` (workflow) + `b2b-enrich` (workflow)
   → établissements littoraux MQ/GP avec email réel + hook perso → `data/b2b-enriched.json`.
2. **Liens de paiement** — `mollie-paylinks.cjs` → crée (idempotent) les liens Mollie
   annuels (Brief 290€, Pro 790€) → `public/api/b2b-paylinks.json`.
3. **Prospection froide** — `b2b-cold-outreach.cjs` → email perso (hook) + relance c4,
   **ramp auto** (5→50/j selon l'âge de campagne), token `&b=` par destinataire.
4. **Widget → Pro** — `widget-convert.cjs` → tout installeur de widget (lead chaud)
   reçoit l'offre Pro + lien de paiement.
5. **Drip B2B** — `drip-b2b-email.cjs` → essai 14j → conversion (b13) avec lien de paiement.
6. **Funnel** — `b2b-funnel.cjs` → agrège chaque prospect (découvert→contacté→lead→payé)
   + prochaine action → `data/b2b-funnel.json` (pilotage).

## Les leviers de scale (déjà branchés)

- **Débit d'envoi** : `rampCap()` monte seul ; override `CAP_NEW`. **PLAFOND RÉEL = la
  délivrabilité du domaine** (cf. ci-dessous).
- **Expéditeur configurable** : `B2B_FROM` / `B2B_REPLY_TO` (env). Changer = scaler sans
  toucher au code.
- **Taille de liste** : relancer `b2b-discover` sur plus de communes / régions → fusionner
  dans `b2b-enriched.json` (dédup par email).
- **Tracking par prospect** : token `&b=<hash8>` dans les liens → l'app logue la visite
  (`sg_b2b_visit`) → `b2b-funnel.cjs` lit le signal clic (quand stats branché) pour
  guider (cliqué-sans-essai → nudge ; essai-sans-paiement → conversion ; payé → onboard).

## ⚠️ LE goulot de scale : le domaine d'envoi

On envoie aujourd'hui depuis `alerte@sargasses-martinique.com` (choix fondateur). **On NE
peut PAS scaler le volume froid dessus** sans cramer la délivrabilité — et ça tuerait
**aussi** les emails clients (verdict quotidien, drip). C'est pour ça que le ramp reste
prudent.

**Pour vraiment scaler le volume**, une seule chose à faire (one-time, ~1h) :
1. Prendre un **domaine d'envoi dédié** (ex. `sargasses-pro.com` ou sous-domaine `mail.`).
2. Mettre les DNS : **SPF, DKIM, DMARC** (+ warmup).
3. Mettre `B2B_FROM='Sargasses Pro <hello@sargasses-pro.com>'` (+ `B2B_REPLY_TO`) en secret CI.
4. Relever le barème `rampCap()`.
→ Le code est déjà prêt pour ce switch.

## Métriques qui comptent

`b2b-funnel.json` → compteurs par étape. La seule qui décide : **# payés**. Test décisif
(mémo) : 3 hôtels qui paient → industrialiser ; sinon, réviser offre/cible/domaine.
