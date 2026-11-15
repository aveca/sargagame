# Migration Google Sheets / Apps Script → Supabase

**Projet** : Sargagame  
**Project ref Supabase** : `rswdmjtdzrucqzzukfmd` (us-east-1, PostgreSQL 17)  
**Branch de migration** : `feat/sargagame-supabase-google-migration`  
**Date de début** : 2026-11-15

## Règles absolues (non négociables)

1. Ne jamais supprimer les Google Sheets ou scripts existants.
2. Ne jamais écraser les données historiques.
3. Ne jamais exposer de token, clé API, refresh token ou secret dans Git, les logs ou les réponses.
4. Ne jamais désactiver les automatisations historiques avant validation de leur remplacement.
5. Ne pas envoyer de campagnes massives pendant la migration.
6. Ne pas modifier les paiements, tarifs ou parcours de checkout.
7. Ne pas rendre les données B2C publiques.
8. Ne pas confondre collecte d'une adresse pour une alerte avec consentement marketing.
9. Préserver les historiques, les identifiants, les horodatages et les relations entre données.
10. Chaque étape doit produire des preuves vérifiables.
11. Ne jamais inventer une donnée manquante.
12. Ne jamais faire de `clasp push` pendant la Phase 1 (inventaire).

## Organisation du dossier

```
docs/migration-google-sheets/
├── README.md                      # Ce fichier (vue d'ensemble)
├── inventory-google.md            # Phase 1 — Inventaire complet Google
├── appscript-code-backup/         # Sauvegarde du code Apps Script
│   ├── Code.js                    # Projet principal (~1075 lignes)
│   ├── stripe-webhook.gs          # Webhook Stripe + vérification premium
│   └── apps-script-digest.gs      # Digest hebdomadaire (projet séparé)
├── sheets-inventory/              # Schémas des onglets et données
├── reconciliation/                # Rapports de réconciliation (Phase 4)
├── tests/                         # Tests d'import (Phase 7)
└── migration-report.json          # Phase 9 — Rapport final structuré
```

## Phases de la migration

| Phase | Nom | Statut | Description |
|-------|-----|--------|-------------|
| 1 | Inventaire complet Google | 🔄 En cours | Sheets, onglets, Apps Script, triggers, web apps, déploiements |
| 2 | Audit Supabase existant | ⏳ En attente | Schéma, RLS, Edge Functions, secrets, cron |
| 3 | Modèle de données cible | ⏳ En attente | Schéma relationnel, déduplication, clés source |
| 4 | Migration des données | ⏳ En attente | Import reproductible, staging, réconciliation |
| 5 | Migration des automatisations | ⏳ En attente | Triggers SQL, Edge Functions, Cron, file de tâches |
| 6 | Accès ChatGPT et observabilité | ⏳ En attente | Vues de reporting sécurisées, rapport d'état SQL |
| 7 | Tests | ⏳ En attente | Import, déduplication, triggers, Edge Functions, RLS |
| 8 | Basculement progressif | ⏳ En attente | Export, import, réconciliation, bascule, lecture seule |
| 9 | Livraison et preuves | ⏳ En attente | PR, documentation, rapport JSON, rollback |

## Liens clés

- **Google Sheet de départ** : https://docs.google.com/spreadsheets/d/1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ/edit
- **Apps Script projet principal** : code local dans `scripts/appscript/Code.js` (sauvegardé ci-dessus)
- **Apps Script projet digest** : `1v23rVvp2Oa7bergwETnODYRf-kRbxRiIvGtY3bKonNtxp6ZR1UfpAsRV`
- **Supabase URL** : https://rswdmjtdzrucqzzukfmd.supabase.co

## Blocs identifiés

- **clasp** : installé (v3.4.1) mais non authentifié — `clasp login` requis pour puller les versions déployées, lister les triggers et déploiements
- **GOOGLE_SERVICE_ACCOUNT_JSON** : non défini localement — les scripts `fetch-subscribers.cjs`, `fetch-payers.cjs`, `ab-fetch-ga4.cjs` ne peuvent pas s'exécuter localement sans ce secret
- **Accès Supabase API** : `SUPABASE_SERVICE_KEY` non défini localement — l'audit Phase 2 requiert ce secret
