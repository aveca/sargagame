# Guide de deploiement — Actions manuelles restantes

## 1. Deployer le backend Apps Script (10 min)

Le fichier `scripts/apps-script-backend.gs` remplace l'ancien Apps Script.

1. Ouvre https://script.google.com
2. Ouvre le projet existant (ID: 1v23rVvp2Oa7bergwETnODYRf-kRbxRiIvGtY3bKonNtxp6ZR1UfpAsRV)
3. Remplace TOUT le code par le contenu de `scripts/apps-script-backend.gs`
4. Deploy > Manage deployments > Edit > New version > Deploy
5. Copie l'URL du web app (elle ne change pas si tu updates la meme deployment)

## 2. Configurer Stripe webhook (5 min)

1. Ouvre https://dashboard.stripe.com/webhooks
2. Add endpoint > URL = l'URL Apps Script du step 1
3. Select events: `checkout.session.completed`
4. Save

Aussi dans Payment Links:
1. Ouvre le payment link (plink_1T2OCbP9RK8Orx51wd732OuP)
2. After payment > Redirect > URL: `https://sargasses-martinique.com/?session_id={CHECKOUT_SESSION_ID}`
3. Save

## 3. Envoyer l'email aux 3 clients (10 min)

1. Google Sheet > onglet "payments" > recuperer les emails
2. Template dans `scripts/template-email-clients.md`
3. Envoyer individuellement
4. Logger les reponses

## 4. Partager la landing page

Partager `sargasses-martinique.com/weekend.html` dans :
- Groupes Facebook Martinique (plages, familles, expats)
- Groupes WhatsApp locaux
- Forums tourisme Martinique/Guadeloupe

Objectif : 50 inscrits email en 2 semaines.

## 5. Registrer les custom dimensions GA4

GA4 > Admin > Custom Definitions > Create:
- ab_lock1 (Event scope)
- ab_modal1 (Event scope)
- ab_onb1 (Event scope)
- ab_free1 (Event scope)
- ab_vp1 (Event scope)

## Ce qui tourne deja automatiquement

- 4x/jour: ERDDAP → data → notifs → deploy FTP → stats check
- Vendredi: email weekend bulletin
- Lundi: SEO audit → auto-optimize → A/B evaluate
- Jeudi: UX report

## Metriques a surveiller

- `scripts/automation/data/daily-metrics.json` — snapshots quotidiens
- Google Sheet onglets: emails, payments, feedback, email_log
- GA4: events sg_* (conversion, feedback, beach_open, etc.)
