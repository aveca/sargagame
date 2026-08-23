# .ai/context.md — Contexte produit permanent

> Lu par TOUT agent avant toute action. Ne contient que la vérité produit immuable.

## Produit

**Sargagame** — SaaS de prévision sargasses **par plage** pour voyageurs (B2C) et hôteliers (B2B).

- **5 régions live** : Martinique, Guadeloupe, Florida (sargassummiami.com), Riviera Maya (sargassumcancun.com), Punta Cana (sargassumpuntacana.com)
- **136+ pages SEO**, 1 monolithe React (`src/Sargasses_PROD.jsx`), build Vite
- **Univers** : "Le Veilleur" — mascotte qui regarde la mer, univers comic/golden-hour, jamais corporate
- **Moat** : honnêteté absolue, données 100% satellite ERDDAP, jamais de fabrication

## Business

- **B2C** : pass one-time (EUR 7,99/14,99/24,99 · USD 5,99/11,99/19,99) via **Mollie on-site**
- **B2B** : Pro 79 €/mois ou 690 €/an · Brief 29 €/mo (decoy) · essai 30j gratuit sans carte
- **Stripe** : legacy lecture seule (abos EUR historiques, source de vérité MRR · ~14 abos)
- **PayPal** : secondaire vivant
- **Funnel** : carte → verdict → paywall → paiement (pas de cul-de-sac)

## Technique

- **Frontend** : React 18 + Vite 5, JSX pur (pas de TypeScript), pas de lib externe lourde
- **Data satellite** : ERDDAP via `scripts/fetch-sargassum-live.cjs` → `public/api/copernicus/sargassum.json`
- **Paiements** : `public/api/mollie.php`, `public/api/paypal.php`, `public/api/mollie-webhook.php`
- **Backend state** : Supabase (nouveaux états), Apps Script (legacy, ne pas étendre)
- **Déploiement** : GitHub Actions → build → push via FTP sur les 5 domaines
- **Bundle budget** : ≤ 210 Ko gzip eager (CI bloquant)

## Interdictions absolues

| Jamais | Pourquoi |
|--------|----------|
| Inventer des données | Meurt du produit |
| Casser le funnel de paiement | Revenu direct |
| Modifier `dist/` | Build généré |
| Ajouter nouvelle action Apps Script | Bloquant pour le fondateur |
| Remplacer source satellite ERDBAP | Source unique |
| Push sans Build + tests OK | Auto-deploy en prod |
| Ajouter dépendances sans justification | Budget bundle |

===

> **Ce fichier** = contexte permanent. Pour l'état actuel → `.ai/current_state.md`. Pour le backlog → `.ai/tasks.md`. Pour les bugs → `.ai/bugs.md`.