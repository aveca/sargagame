/sargasses

Session 6 — Pre-saison, 2 semaines avant le pic.

## Contexte
- 3 clients premium (4.99 EUR/mois = ~15 EUR MRR), 3 emails, 0 feedbacks
- Stripe: 2 liens recurrents (mensuel + annuel) avec trial 7j. Fonctionnel.
- Apps Script backend deploye (v9), emails fonctionnels, webhook Stripe configure
- 5 A/B tests actifs depuis le 6 avril — resultats attendus ~14 avril
- GA4 custom dimensions: FAIL 403 — Analytics Admin API pas activee dans GCP. Les event params sont envoyes via gtag mais pas filtrables dans Explorations tant que l'API n'est pas activee.
- Web Search Indexing API: FAIL 403 — pas activee dans GCP non plus. URLs pas soumises automatiquement.
- SEO audit: timeout reduit (URL inspection limitee a 30 URLs). A relancer.
- Exit-intent popup deploye (email capture avant depart)
- Email weekend ameliore (CTA premium visible)
- Posts Facebook/WhatsApp rediges dans marketing/posts-session5.md + images social generees

## APIs Google a activer (bloquant)
Aller dans Google Cloud Console (https://console.developers.google.com) pour le projet 48071671409 :
1. Google Analytics Admin API → permet register-ga4-dimensions.cjs
2. Web Search Indexing API → permet submit-indexing.cjs

## A faire cette session

### 1. A/B tests — lire les vrais resultats (14 jours de data)
- Les custom dims GA4 collectent-elles enfin des donnees ? (verifier apres activation API)
- node scripts/automation/ab-evaluate.cjs → appliquer les gagnants
- Si pas assez de data : attendre la saison (trafic naturel)

### 2. Poster sur Facebook/WhatsApp (si pas fait manuellement)
- Posts prets dans marketing/posts-session5.md
- Images dans public/social-facebook-mq.png et public/social-facebook-gp.png
- Groupe cible : "Bons Plans En Martinique" (105K membres) + groupes GP
- Verifier resultats : combien de nouveaux emails apres le post ?

### 3. Check metriques reelles
- node scripts/automation/daily-stats-check.cjs
- GSC : GP position (etait 70, hreflang deploye fin mars)
- GA4 : sessions, exit-intent conversion, push opt-in rate
- Stripe dashboard : nouveaux abonnes trial ?

### 4. Mode saison haute (mai)
- Le trafic va augmenter naturellement avec les sargasses
- Adapter le contenu : messages plus urgents quand AFAI monte
- Verifier les push notifs fonctionnent quand une plage passe en "avoid"
- Monitorer le funnel : push recu → app ouverte → trial demarre

### 5. Si temps
- Referral program (parraine = 1 mois offert)
- Notifications personnalisees par plage favorite
- Enrichissement SEO par plage (contenu unique long-tail)
- Contacter les 3 clients existants (comprendre pourquoi ils paient)

Regle : autonomie totale, commit+push apres chaque modif, ne jamais demander.
