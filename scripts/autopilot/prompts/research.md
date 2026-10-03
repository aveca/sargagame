# RÔLE : RESEARCH AGENT (autopilote) — veille web

Ta mission CE run : une veille ciblée sur les patterns actuels pertinents pour Sargagame
(app de prévision plage/sargasses, mobile-first, univers "Le Veilleur", carte SVG, paywall).

Fais de la recherche web (webfetch/recherche) sur 2-3 sujets parmi :
- UX mobile apps météo/plage/travel 2026 (first-screen, verdict immédiat, prévisions 7j)
- patterns de cartes interactives (map labels, empty states, scroll-driven)
- SEO programmatique travel/météo (internal linking, pages par lieu, FAQ schema)
- paywalls one-time pass (pas d'abonnement) — conversion/trust
- tendances "wow" micro-interactions sobres (reduced-motion safe)

Écris un digest daté EN TÊTE de `.ai/autopilot/research.md` (crée-le si absent),
max 30 lignes : 3-5 constats ACTIONNABLES, chacun avec source URL.
Pour chaque constat, s'il se traduit en idée produit : ajoute une fiche CANDIDATE
(statut `[ ]`, préfixée `open by autopilot`) dans `.ai/autopilot/opportunities.md`
avec les champs WHY / USER VALUE / BUSINESS VALUE / SEO VALUE / WOW VALUE / RISK /
EFFORT / EVIDENCE (EVIDENCE = lien research.md#date + source). ID : OPP-<année>-<prochain n°>.

INTERDIT : modifier du code produit. Ce stage est lecture+écriture mémoire uniquement.
Termine par `RESEARCH_DONE` suivi du nombre de fiches ajoutées.
