# CRO Implementation Package — BOT-WOW & Sargasses

## Priorite actuelle : SARGASSES

Les fichiers suivants sont prets pour les sites Sargasses (Martinique, Guadeloupe, Punta Cana, Cancun, Miami) :

- `sites/sargasses/martinique/` : carte.html, offres.html, fiabilite.html, alertes.html
- `sites/sargasses/guadeloupe/` : carte.html, offres.html, fiabilite.html, alertes.html
- `sites/sargasses/puntacana/` : carte.html, offres.html, fiabilite.html
- `sites/sargasses/cancun/` : carte.html, offres.html, fiabilite.html
- `sites/sargasses/miami/` : carte.html, offres.html, fiabilite.html

## Scripts disponibles (dossier scripts/)

| Script | Rôle |
|--------|------|
| `validate_sargasses.py` | Valide la structure HTML, les attributs tracking, les liens Stripe, le bandeau RGPD |
| `test_links_and_cta.py` | Verifie la cohérence des liens internes, CTA, scripts et attributs data-* |
| `build_deploy_package.py` | Cree une archive ZIP prete a transmettre aux proprietaires des sites |

## Comment lancer les verifications

Depuis le dossier `cro-implementation/` :

```powershell
# Validation structurelle des pages Sargasses
python scripts\validate_sargasses.py

# Test des liens internes et attributs de tracking
python scripts\test_links_and_cta.py

# Creation du package de deployment (ZIP)
python scripts\build_deploy_package.py
```

## Deployment sur les sites Sargasses

Je n'ai pas d'acces direct aux serveurs des sites Sargasses (sargasses-martinique.com, etc.).
Le package doit etre transmis a une personne qui a acces au code des sites.

Etapes :
1. Executer `python scripts\build_deploy_package.py` pour generer le ZIP dans `deploy/`
2. Transmettre le ZIP et le guide `INTEGRATION_SARGASSES.md` au proprietaire du site
3. Le proprietaire suit le guide pour copier-coller le code sur chaque page
4. Valider avec `CHECKLIST_DEPLOIEMENT_SARGASSES.md`
5. Remplacer les liens Stripe TEST par les vrais liens uniquement avec accord explicite

## Contraintes legales (respecter absolument)

- Aucun vrai paiement sans activation explicite des cles Stripe live
- Ne pas modifier les prix ni conditions des offres Sargasses existantes
- Aucun suivi analytique avant consentement RGPD (bandeau CNIL)
- BOT-WOW : aucun CTA "Acheter maintenant" irrevocable tant que le logiciel final n'est pas livré

## Arborescence

```
cro-implementation/
├── components/           # CTA, sticky, RGPD, styles, liste d'attente
├── tracking/             # events.js, consent-manager.js, ab-test.js
├── payments/             # stripe-links.json (liens TEST par defaut)
├── seo/                  # meta-templates.json, internal-links.md
├── sites/
│   ├── botwow/           # home-fr.html, demo-fr.html
│   └── sargasses/        # martinique, guadeloupe, puntacana, cancun, miami
├── scripts/              # validate_sargasses.py, test_links_and_cta.py, build_deploy_package.py
├── plan/                 # actions-24h.md, actions-7j.md, actions-30j.md
├── INTEGRATION_SARGASSES.md
├── CHECKLIST_DEPLOIEMENT_SARGASSES.md
├── EMAIL_PROPRIETAIRES_SARGASSES.md
└── README.md
```

## Avertissement

Ce code est un point de départ. Il doit être adapté à votre stack technique réelle, testé en staging, et validé juridiquement (CGV, RGPD) avant mise en production.