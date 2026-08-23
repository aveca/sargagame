# Template email — contacter les clients Premium (7 clients @ 2026-04-17)

## Contexte
MRR €34,93/mois · 7 payants × 4,99€ · funnel 184 modal → 28 CTA → 7 paid.
Objectif : comprendre le POURQUOI de l'abonnement pour orienter produit/pricing/copy.

## Objet
Merci pour ton abonnement Sargasses — 2 questions rapides

## Corps

Salut,

Merci d'utiliser Sargasses Premium. Tu fais partie des 7 premiers abonnés, ton avis compte énormément.

2 questions rapides (30 secondes) :

1. **Pourquoi tu t'es abonné ?** (juste 1 phrase)
   - Pour planifier tes weekends plage ?
   - Pour éviter de perdre du temps en voiture ?
   - Pour protéger tes enfants du H2S ?
   - Autre chose ?

2. **Qu'est-ce qui te manque le plus ?**

Si tu as 5 minutes pour un appel, je suis dispo cette semaine.
Réponds directement à cet email.

Merci,
[Ton prénom]
Sargasses Martinique

---

## Comment récupérer les emails

1. Google Sheet ID `1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ`
2. Onglet **`payments`** (source de vérité revenu — voir Apps Script v22)
3. Filtrer `status = active` → récupérer 7 emails
4. Envoyer individuellement (pas en masse, éviter trigger spam)
5. Logger les réponses dans `memory/project_customer_insights.md`

## Pourquoi c'est critique

- 7 clients = 7 datapoints sur le POURQUOI quelqu'un paie 4,99€/mois
- Leurs réponses orientent TOUT : produit, pricing, messaging, next features
- Un seul appel de 5 min > 100 A/B tests sur le paywall
- Si >3 mentionnent la même friction → ship un fix dans la semaine

## À éviter

- Envoyer en masse (pas en BCC groupé) — ton trop "corporate", faible taux de réponse
- Lancer avant d'avoir rangé la sheet : check `churn` / `cancelled` avant de contacter
- Oublier de répondre aux retours dans les 48h — ces 7 personnes sont le noyau ambassadeur
