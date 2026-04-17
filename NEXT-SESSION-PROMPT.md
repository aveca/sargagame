/sargasses

# Next session prompt (template)

*Mis à jour 2026-04-17.*

## Contexte actuel

- **MRR** : €34,93/mois (7 clients × 4,99). +133% en 5 jours (3 → 7 payants).
- **Leads** : 58 subscribers, 10 bounces nettoyés lifetime.
- **Stripe** : Payment Links same-tab fonctionnels, trial 7j. Webhook vers Apps Script `payments` sheet (source de vérité revenu).
- **Apps Script** : v22 @38, endpoint `?action=funnel` source canonique.
- **A/B live** : `pw_cta_order` (paid-first vs sample-first) + `pw_prelude` (direct redirect vs interstitiel Stripe Prelude). Mesure 4-8 semaines.
- **Pipeline v3** : ERDDAP-live, 4×/j, stable. Beach Score 0-100 en prod.
- **SEO** : MQ pos 3,8 (all-time best), GP 119 clk/j peak après fix cannibalization session 38.

## Shipped récemment (2026-04-17)

15+ commits sur la journée :
- Paywall : 7 itérations Design v1+v2 (social proof, Stripe Prelude, bullets lean, foot trust)
- Map : 3 fixes click/overlap (b0bb553, c1c88dd, 158b7f4)
- Trust page `/a-propos/` (commit 9ec81fe)
- Pro tier 9,99€ scaffold (commit 5ce0ea2, activation manuelle Stripe Link requise)
- CI optim : npm cache + rebase -X theirs + concurrency guard

## Décisions pendantes

1. **Activer Pro tier** : créer Stripe Payment Link 9,99€/mois + coller URL dans `STRIPE_LINK_PRO` (Sargasses_PROD.jsx:341) → +€10-30 MRR potentiel
2. **Attendre A/B data** : ne pas itérer paywall avant 4+ semaines de mesure
3. **GP SEO** : mesurer impact fix cannibalization, viser head term "sargasses guadeloupe"
4. **Bug map click** : si ouvertures depuis dimanche confirment le fix, clore. Sinon diagnostiquer via DevTools sur élément non-cliquable.

## Bloqueurs connus

- GA4 custom dimensions FAIL 403 (Analytics Admin API pas activée, projet GCP 48071671409)
- Resend GP domaine pas vérifié (plan gratuit = 1 seul domaine)
- Design en cours sur Trust/Morning Brief/Map Hero v2

## Commandes démarrage session

```bash
# 1. Pipeline freshness
node -e "const d=JSON.parse(require('fs').readFileSync('public/api/copernicus/sargassum.json'));const h=(Date.now()-new Date(d.updatedAt))/3.6e6;console.log('Source:',d.source,'Age:',h.toFixed(1)+'h',h<12?'OK':'STALE')"

# 2. Funnel live
curl -sL "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel"

# 3. GH Actions status
gh run list --repo aveca/sargagame --limit 5

# 4. Dernier commit + éventuel work in progress
git log --oneline -5
git status --short
```
