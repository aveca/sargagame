# B2B Prospect Hunt — 100 prospects Concierge (MQ + GP)

Objectif : 100 prospects qualifiés → 5 trials configurés → 1 premier paiement.
Offre : Concierge 29 €/mois (deep-link `/pro/espace/?offre=concierge`), essai 30 j sans carte.
Machine : `b2b-cold-outreach.cjs` (C0 + C4, caps, dédup, opt-out) — NE JAMAIS envoyer en masse sans les caps.

## Critères d'inclusion (tous obligatoires)

1. À ≤ 2 km d'une plage suivie par Sargagame (vérifier sur la carte).
2. Activité réelle : hôtel / villa / conciergerie / restaurant de plage / excursion / activité nautique avec avis récents (< 6 mois, Google ou TripAdvisor).
3. Site web avec page d'accueil accessible (le script scrape l'email de contact PUBLIC).
4. Email de contact trouvable sur le site (sinon : pas de prospection, pas d'enrichissement tiers payant).
5. Exclure : chaînes internationales (cycle enterprise), déjà contactés (`b2b-funnel.json`), installeurs widget (reçoivent le mail chaud dédié).

## Protocole de vérification (avant tout ajout à b2b-targets.json)

1. Charger la homepage : HTTP 200 + contenu réel (pas de parking OVH, pas de "site en construction").
2. Confirmer l'adresse littorale (mentions légales ou page contact).
3. Ajouter `{ "url": "https://...", "island": "mq|gp" }` — jamais d'URL devinée.
4. Exemples vérifiés 2026-09-11 : `https://hotel-bakoua.fr/` (MQ, déjà en cibles), `https://www.toubana.com/` (GP, déjà en cibles).
5. Exemples REJETÉS 2026-09-11 : `http://www.lacocoteraie.com` (parking OVH), `http://www.bwachik.com` (vide) — ne pas ajouter.

## Clusters de chasse (ordre = proximité des plages volatiles)

| # | Cluster | Requêtes de chasse | Cible |
|---|---------|-------------------|-------|
| 1 | Sainte-Anne MQ (Salines, Pointe Marin) | hôtel + villa + restaurant plage Sainte-Anne | 15 |
| 2 | Diamant / Trois-Îlets MQ | hôtel bord de mer Diamant, Anse Mitan/Noire/Dufour locations | 15 |
| 3 | Gosier / Sainte-Anne GP | hôtel plage Gosier, Sainte-Anne, Saint-François | 15 |
| 4 | Saint-François GP (Raisins Clairs, golf) | hôtel + restaurant lagon Saint-François | 10 |
| 5 | Le Marin / Vauclin / Robert MQ (communes les plus touchées) | hôtel + excursions + pêche/promenades en mer | 10 |
| 6 | Deshaies / Malendure / Bouillante GP (plongée) | clubs plongée, hôtels Malendure | 10 |
| 7 | Conciergeries Airbnb littoral (superhosts Sud MQ + Sud Grande-Terre) | profils + sites vitrines | 15 |
| 8 | Activités nautiques (kitesurf Vauclin, catamaran Marin, surf Tartane) | sites + pages avis | 10 |

## Séquence (existante, ne pas réinventer)

- J0 : C0 avec data-hook plage réelle + CTA `?offre=concierge` (cap auto 5→50 selon ramp).
- J+3 : C4 « rendu daté » (relance auto si `daysSince(c0) >= FOLLOWUP_DAYS`).
- J+7 : dernier mot manuel uniquement sur les ouvreurs (pixel first-party).
- Trial activé → J+25 : relance conversion (offre annuelle -20 % : décision fondateur).
- Métriques hebdo : contactés / ouvreurs / trials configurés (widget collé) / paid.

## Garde-fous (non négociables)

- Un seul email par domaine (dédup), opt-out visible, jamais sans `--send` validé en dry-run d'abord.
- Volume : respecter CAP_NEW (warmup domaine). Pas d'achat de listes.
- Ne jamais promettre un état de plage futur précis (« votre plage sera propre » interdit — seul le verdict daté est cité).
