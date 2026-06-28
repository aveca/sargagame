# Next Venture — la machine cold-email → abonnement self-service, re-pointée

> Décision 2026-06-28 (audit `auto10k-audit`). L'actif n'est NI les sargasses NI le SEO :
> c'est la **machine cold-email → Mollie → drip → funnel** qui tourne déjà. Le sargasse
> reste en B2C SEO passif (paie ses frais), mais ne fera pas €10k (marché trop étroit).
> Le move vers €10k = **garder la machine, changer la niche.**

## Niche décidée : e-réputation / avis Google (commerces locaux)
- **Produit (self-service, livré par email)** : monitoring des avis Google d'un commerce +
  **réponses rédigées par IA** (brouillons prêts à coller) + digest hebdo + alerte avis négatif.
  Pas d'OAuth requis (monitoring + brouillons, on ne poste pas à leur place) → friction nulle.
- **Pourquoi cette niche passe le filtre dur** : emails pros scrapables (Google Maps/sites),
  TAM = millions (restos/hôtels/cliniques/salons), douleur **récurrente** (les avis ne
  s'arrêtent jamais → churn faible), valeur **non-gratuite** (monitoring + IA + livraison).
- **Pricing** : 29–49 €/mois (annuel poussé). €10k ≈ ~250 × 40 € ou ~120 × 83 €.

## Le calcul €10k (générique, toute niche B2B self-service)
~120 clients × ~83 € = €10k MRR. Au régime cold-email (50/j, 35% ouverture, ~5% clic,
~25% essai→payant) ≈ ~14 payants/mois bruts → ~9-11 mois moins le churn. Besoin :
**≥6 000 prospects** par segment/géo pour ne pas épuiser la niche.

## Ce que JE construis (réutilise la machine 1:1)
- Scraper de listes généralisé (annuaire local → emails validés MX) — *le vrai investissement*.
- Landing self-service + offre + lien de paiement Mollie (réutilise `mollie-paylinks.cjs`).
- Séquence cold-email (réutilise `b2b-cold-outreach.cjs`, ramp + token par prospect).
- Livraison auto (digest IA par email) + drip conversion + funnel tracker + auto-reply IA (L1).

## Ce que TOI tu fais (one-time, ~1h — pas de la prospection, de la config)
1. **Enregistrer un domaine dédié** pour la nouvelle marque (ex. `<marque>.com`) + DNS
   (SPF/DKIM/DMARC — je te donne les valeurs exactes). Sans ça, zéro envoi possible.
2. Mettre la clé Mollie / un produit pour le nouveau prix.
3. Valider l'offre + 1 paiement test.

## Le test décisif (AVANT de builder le produit complet)
500–800 cold-emails + landing + lien Mollie → **≥3% réponses chaudes ET ≥1 clic-paiement**
en <30 j. Si 0 → on change de niche, pas de produit. (C'est le test que le sargasse B2B
n'a jamais passé.)

## Séquencement (discipliné, zéro gaspillage)
1. **Le sargasse B2B tourne déjà** (108 cibles, Mollie LIVE) = **preuve gratuite et vivante
   que la machine convertit AU MOINS quelqu'un**. On le laisse courir 2-3 semaines.
2. **En parallèle**, je prépare la niche avis (liste + offre + rig) pour qu'on puisse
   l'allumer dès que le domaine dédié existe.
3. **Go/no-go** : si le sargasse (niche la plus chaude qui soit) convertit 0 en 2-3 sem,
   le problème est la MACHINE/le modèle, pas la niche → on revoit avant d'investir ailleurs.
   S'il convertit ≥1 → le modèle marche, on industrialise sur la niche avis (gros TAM).

## Réutilisé tel quel (déjà en prod)
`b2b-cold-outreach.cjs` · `drip-b2b-email.cjs` · `b2b-funnel.cjs` · `mollie-paylinks.cjs`
· `widget-convert.cjs` · `create-checkout.php` / `mollie.php` · dunning · winback · le
savoir-faire full-static + GH Actions. **On ne repart pas de zéro.**
