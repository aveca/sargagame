/sargasses

Session 5 — Post-audit, saison dans ~3 semaines.

## Contexte
- 3 clients one-time (pas recurrents), 3 emails reels, 0 feedback
- Stripe: 2 liens recurrents (mensuel 4.99 + annuel 39.99) avec trial 7j gratuit. Ancien lien one-time desactive.
- Apps Script backend deploye (v9), emails fonctionnels (bulletin weekend envoye et recu), webhook Stripe configure
- GA4: 6 custom dimensions enregistrees (ab_lock1..ab_price1) — A/B tests collectent enfin des donnees
- SEO workflow fixe (customEvent:page → pagePath) et tourne OK
- 3 axes differentiation deployes: Best Beach Widget, Community Reports, Reliability Score
- iOS PWA install tutorial deploye
- GitHub token dans .env, tous les workflows triggerables

## A faire cette session

### 1. Marketing Facebook/WhatsApp (priorite #1 — acquisition)
- Rediger un POST Facebook convaincant pour "Bons Plans En Martinique" (105K membres) + groupes GP
- Creer une image/visuel accrocheuse pour le post (OG image ou custom)
- Le lien = https://sargasses-martinique.com/weekend.html (capture email)
- Poster aussi dans groupes WhatsApp MQ/GP si possible
- Ton = utile, pas commercial. "La saison arrive, voici un outil gratuit."

### 2. A/B tests — lire les resultats (~8 jours de data)
- Verifier GA4 Explorations : les custom dims collectent-elles des donnees ?
- Si oui : node scripts/automation/ab-evaluate.cjs → appliquer les gagnants
- 5 tests actifs : lock1, modal1, onb1, free1, vp1

### 3. Check metriques reelles
- curl stats endpoint : payments, emails, feedbacks
- daily-metrics.json : tendances depuis le 6 avril
- GSC : GP SEO position (etait 70, hreflang fix deploye il y a 10 jours)
- GA4 : sessions, conversion funnel, PWA installs

### 4. Preparer la saison (fin avril)
- Les push notifs sont pretes (send-notifications.cjs)
- Le bulletin weekend est automatique (vendredi)
- Verifier que les alertes se declenchent quand une plage passe en "avoid"
- Tester le flow complet : utilisateur recoit push → ouvre app → voit alerte → essai gratuit 7j

### 5. Si temps
- Ameliorer l'email weekend (design, CTA premium plus visible)
- Exit-intent popup pour capturer emails sortants
- Referral program (parraine = 1 mois offert)

Regle : autonomie totale, commit+push apres chaque modif, ne jamais demander.
