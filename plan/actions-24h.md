# Plan d'action — 0 à 24h (impact élevé, effort faible)

## Objectif
Mettre en place immédiatement les CTA et le suivi analytique sans modifier les flux de paiement sensibles.

## Actions

### 1. CTA visibles sur toutes les pages clés
- [ ] Page d'accueil BOT-WOW (FR) : bouton « Réserver ma licence Beta — 9 € » vers le lien Stripe Planner (désactivé si vente bloquée par CGV)
- [ ] Page carte Martinique/Guadeloupe : CTA « Activer Le Veilleur — 7j gratuits » vers /alertes
- [ ] Page carte Martinique/Guadeloupe : lien « Voir nos Pass » vers /offres
- [ ] Page offres : boutons « Acheter Pass 7j/30j/Saison » et « S'abonner Pro » vers liens Stripe existants
- [ ] Page fiabilité : lien « Consulter la carte en direct » vers /carte

### 2. Suivi analytique (GA4 / Matomo)
- [ ] Créer les événements : cta_impression, cta_click, form_submit, checkout_initiated
- [ ] Configurer le consentement RGPD (bandeau CNIL) avant tout suivi
- [ ] Vérifier l'anonymisation IP et le consentement préalable

### 3. Liens internes et SEO
- [ ] S'assurer que chaque page à fort trafic (carte, prévisions) contient un lien textuel vers Offres ou Alertes
- [ ] Vérifier titres et meta descriptions (voir seo/meta-templates.json)
- [ ] Vérifier qu'aucun CTA n'annonce un paiement BOT-WOW si la vente est bloquée par les CGV

### 4. Contrainte légale (à respecter absolument)
- [ ] Ne PAS afficher de CTA « Acheter maintenant » irrévocable sur BOT-WOW tant que le logiciel final n'est pas livré
- [ ] Ne PAS modifier les prix ni conditions des offres Sargasses existantes

## Livrables
- Boutons CTA sur pages : accueil BOT-WOW, carte MQ/GP, offres MQ/GP, fiabilité MQ/GP
- Bandeau RGPD sur toutes les pages
- Événements de suivi configurés
