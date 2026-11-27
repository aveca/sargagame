# Guide d'intégration Sargasses — Copier-coller prêt à déployer

Ce guide indique exactement quoi copier-coller sur chaque page des sites Sargasses (Martinique, Guadeloupe, Punta Cana, Cancún, Miami).

## Prérequis
- Vous avez accès au code source HTML des pages cibles (ou vous transmettez ce package au propriétaire du site).
- Les liens Stripe dans `payments/stripe-links.json` sont des liens **TEST** (`buy.stripe.com/TEST_…`). Aucun vrai paiement n'est activé.

---

## 1. Fichiers à importer sur le site

Copiez ces fichiers à la racine de votre site (ou ajustez les chemins relatifs) :

| Fichier | Destination suggérée |
|---------|----------------------|
| `components/cta-styles.css` | `/css/cta-styles.css` ou `/components/cta-styles.css` |
| `tracking/consent-manager.js` | `/js/consent-manager.js` |
| `tracking/events.js` | `/js/events.js` |
| `components/gdpr-banner.html` | À insérer directement dans le HTML de chaque page |

---

## 2. Sur chaque page (carte, offres, fiabilité, alertes)

### a) Ajouter le CSS
Dans `<head>` :
```html
<link rel="stylesheet" href="/components/cta-styles.css">
```

### b) Ajouter l'attribut data-site sur `<body>`
Exemple Martinique :
```html
<body data-site="sargasses_martinique">
```
Exemple Guadeloupe :
```html
<body data-site="sargasses_guadeloupe">
```

### c) Insérer le bandeau RGPD avant `</body>`
Copiez le contenu de `components/gdpr-banner.html` juste avant la balise `</body>` de chaque page.

### d) Charger les scripts de tracking après le bandeau
```html
<script src="/tracking/consent-manager.js"></script>
<script src="/tracking/events.js"></script>
```

---

## 3. CTA par page

### Page Carte
Ajouter ces deux CTA :

**CTA principal (bouton) :**
```html
<a href="/alertes" class="cta-btn" data-cta="cta_sarg_alert" data-page="carte" data-site="sargasses_martinique">
  Activer Le Veilleur — 7j gratuits
</a>
```

**CTA secondaire (lien texte) :**
```html
<a href="/offres" class="cta-inline" data-cta="cta_sarg_offres" data-page="carte" data-site="sargasses_martinique">
  Voir nos offres Pass & Pro
</a>
```

**Bandeau sticky mobile (bas d'écran, masqué sur desktop) :**
```html
<div class="cta-sticky" id="cta-sticky-mobile" aria-label="Bouton d'action rapide">
  <span class="cta-sticky-text">Ne manquez plus aucun changement sur votre plage.</span>
  <a href="/alertes" class="cta-btn" data-cta="cta_sarg_alert_sticky" data-page="carte" data-site="sargasses_martinique">
    Alertes gratuites
  </a>
</div>
```

### Page Offres
Remplacer `TEST_…` par vos vrais liens Stripe quand vous serez prêt. En attendant, garder les liens TEST.

Exemple bouton Pass 7 jours Martinique :
```html
<a href="https://buy.stripe.com/TEST_PASS7_MQ" class="cta-btn" data-cta="cta_pass7" data-page="offres" data-site="sargasses_martinique">
  Acheter Pass 7 jours (7,99 €)
</a>
```

**Contrainte : ne pas modifier les prix affichés (7,99 € / 14,99 € / 24,99 €, Pro 79 €/mois ou 690 €/an).**

---

## 4. Sur la page Alertes (nouvelle)

La page `alertes.html` contient déjà :
- Un formulaire d'inscription aux alertes (email + plage)
- Un lien vers la carte
- Un lien vers les offres
- Le tracking `form_submit` sur l'envoi du formulaire

Intégrez-la telle quelle, en ajustant les chemins relatifs des CSS/JS (`../../../components/…` depuis le sous-dossier de chaque site).

---

## 5. Vérification avant mise en ligne

1. Ouvrir la page dans un navigateur.
2. Vérifier que le bandeau RGPD s'affiche au premier chargement.
3. Cliquer sur "Accepter" → le bandeau disparaît.
4. Cliquer sur un CTA → aucun événement n'est envoyé tant que le consentement n'est pas donné (respect RGPD).
5. Après consentement, cliquer sur un CTA → l'événement `cta_click` est envoyé (visible en console si vous décommentez le `console.log` dans `events.js`).
6. Vérifier sur mobile que le bandeau sticky ne provoque pas de scroll horizontal.
7. Vérifier que tous les liens Stripe pointent vers des URLs TEST tant que vous n'avez pas activé le mode live.

---

## 6. Contraintes légales (à respecter absolument)

- **Aucun vrai paiement** tant que les clés Stripe live ne sont pas configurées et validées par vous.
- **Ne pas modifier** les prix ni les conditions des offres Sargasses existantes.
- **Aucun suivi analytique** avant consentement RGPD (bandeau CNIL).
- **BOT-WOW** : aucun CTA « Acheter maintenant » irrévocable tant que le logiciel final n'est pas livré.

---

## 7. Prochaines étapes après intégration

1. Tester le tunnel Stripe en mode test sur la page Offres.
2. Configurer GA4 ou Matomo avec l'ID de mesure dans `tracking/events.js` (variable `CONFIG.provider` et `CONFIG.measurementId`).
3. Lancer le suivi des KPI : `cta_impression`, `cta_click`, `checkout_initiated`, `form_submit`.
