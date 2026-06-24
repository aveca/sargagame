> **🎬 PROTOTYPE NAVIGABLE COMPLET = `design/arena-v2.html` (28 écrans, transitions, annotations UX/UI).** Ouvrir en local OU en prod `/arena-v2.html`. Assemblé par `node scripts/build-v2-proto.cjs` depuis `design/v2-parts/`. Construit en multi-agents (contexte frais).

# SCREENS_V2 — backlog de reconstruction « ARENA v2 » (spec = maquette fondateur)

> **Source de vérité = la maquette ARENA v2 du fondateur** (image ~40 écrans comic,
> envoyée en session 2026-06-19). Ce fichier la décompose en **backlog fini** : 1 ligne
> = 1 écran = 1 tâche autonome. Une boucle agent prend le prochain `[ ]`, le construit
> à l'identique de la maquette, le vérifie (smoke), le connecte, le coche `[x]`, ship.
> Lire `PRODUCT.md` (design system) + `AUTONOMOUS_BUILD.md` (boucle + garde-fous).

## Pitch produit (à rendre LIMPIDE — critique fondateur « pas compréhensible »)
**LE VEILLEUR** — un satellite-mascotte qui scanne la mer chaque matin. Toi = **chasseur
de plages** : tu reçois le **verdict du jour** sous forme de **cartes à collectionner**,
tu montes en **rang**, tu te mesures au **classement**. Premium = la **prévision 7 j** +
l'**alerte** le jour où ta plage bascule. Un seul monde **comic-book animé** (réf Spider-Verse).

## Règles de reconstruction
- Fidélité **pixel-intention** à la maquette (layout, hiérarchie, couleurs, onomatopées, cases).
- Design system = `PRODUCT.md §4` (ink/paper/yel, Anton, ombres dures, halftone, chroma steppée).
- **Connecté** : chaque écran déclare ses entrées/sorties (colonne « → vers »). Zéro cul-de-sac.
- Réversible + flag si ça touche conversion/revenu. **Stripe jamais touché.** Smoke avant merge.
- Mobile-first (390×844), reduced-motion = plancher, i18n fr/en/es.

## Backlog (cocher au fur et à mesure ; statut comic actuel entre parenthèses)
### Bloc 1 — Entrée & accueil
- [x] 01 SPLASH — Le Veilleur + barre de chargement comic (fait) → 02
- [x] 02 ONBOARDING « Bienvenue chasseur de plages » (fait) → 03
- [x] 03 ONBOARDING « Le satellite scanne » (fait) → 04
- [ ] 04 ONBOARDING « Choisis ta région » (MQ/GP/…) — sélecteur cartes comic → 05
- [x] 05 ACCUEIL / RADAR « Verdict du jour » (= arène booster, fait) → 06/07/10/12
### Bloc 2 — Plages & cartes
- [x] 06/21/22 RECHERCHE + FILTRES du Pokédex (search + chips statut — fait) → 08
- [x] 07 CARTE PLAGE DU JOUR (= booster vedette, fait) → 08/12
- [x] 08 DÉTAIL PLAGE + 7 JOURS (= ChasseDetail, fait) → 09/12/voisines
- [x] 09 PRÉVISION 7 JOURS — aperçu honnête de la prévision RÉELLE dans ChasseDetail (J0 réel + J+1.. teinte statut/cadenas/confiance décroissante, horizon estompé, headline allClean «propre toute la semaine» / sinon «alerte le jour où ça bascule»). Frontière calquée ForecastChart, 0 fabrication (plage non-couverte→cadenas), réversible `?fc7=0`. Commit 301073e6 / PR #90, déployé. → 12
- [ ] 11 PLAGE — PRÉVISIONS (fiche data en comic, remplace le « scroll satellite ») → 12
### Bloc 3 — Carte
- [x] 10 CARTE monde golden-hour (fait) — ⚠️ pins → doivent ouvrir le **détail comic** (item ⭐, cf PRODUCT §8)
### Bloc 4 — Jeu / rétention (le « plein de jeux » demandé)
- [x] 13 PROFIL / MA COLLECTION (= Pokédex + paliers, fait) → 07
- [ ] 14 CLASSEMENT / TOP JOUEURS (leaderboard série 🔥) → 13
- [x] 15 DÉFI DU JOUR « plus chaud / plus froid » (higher-lower 1 round/jour — fait) → 13
- [x] 16 BADGES / « MES SUCCÈS » — modale `BadgesSheet` (13 badges) ouverte depuis le Pokédex, dérivés de la progression **RÉELLE** (collected/streak/best/`sgUnlock`/email capté), rareté TCG, verrouillés grisés honnêtes (0 fabrication), i18n+a11y+reduced-motion, réversible `?badges=0`. → 13
- [x] 17 RÉCOMPENSE (célébration comic « NIVEAU ! » au franchissement de rang — fait) → 13
- [ ] 18 DÉFI DU THÈME / contest → 14
- [x] 28 SÉRIE « 7 jours d'affilée » — section comic `.lc-week` (ruban 7 cases BD) dans ChasseHome, dérivée de la série **RÉELLE** (`sg_chasse` streak/best/last), états vivante/froide/vide honnêtes, célébration « SEPTAINE BOUCLÉE » + CTA premium **one-shot persistant** (`sg_chasse_seal`, fix re-fire de la revue), i18n+a11y+reduced-motion, réversible `?streak7=0`. → 05
### Bloc 5 — Conversion
- [~] 12 PAYWALL « Réveil du Veilleur » / Pass (partiel comic — finir variants) → paiement
- [ ] 06b PAIEMENT on-site (PayStep) en comic → succès → 29
- [ ] 29 BIENVENUE PREMIUM (PaidOnboarding) en comic → 05
### Bloc 6 — Système & utilitaires
- [x] 19 CENTRE D'ALERTES « MES ALERTES » — cloche 🔔 (pastille count) dans le header arène → modale `AlertsModal`, alertes dérivées du **forecast RÉEL** (`computeAlerts` via resolveForecast : 1re transition de statut J+N + repère H₂S si `avoid`), filtre horizon/confiance<50, état vide honnête « tout est calme », **0 fabrication** (preview `?alerts=preview` clairement badgé « données d'exemple »). Réversible `?alerts=0`. → 13
- [~] 20 ALERTE SARGASSE / hydrogène sulfuré — repère santé H₂S **livré dans le détail comic** (`H2sNote` dans ChasseDetail : case BD rouge sur plages `avoid` + ambre sur `moderate`, danger H₂S/ammoniac + consignes groupes sensibles bébés/asthme/grossesse/seniors, i18n fr/en/es, réversible `?h2snote=0`). Reste : centre d'alertes/notifications (cf 19) + push
- [x] 21 RECHERCHE plages (fait, cf 06)
- [x] 22 FILTRES statut (fait, cf 06)
- [x] 24 FIABILITÉ DU VEILLEUR (jauge track-record honnête — fait)
- [x] 25 PARTAGE (navigator.share + fallback copie, sur le détail — fait)
- [ ] 27 HORS-LIGNE / envoi
- [ ] (+ écrans restants de la maquette à transcrire : ~30→40)

## Connexions (graphe minimal)
`01→02→03→04→05`(accueil hub)`→{06 liste, 07 carte-jour, 10 carte, 13 profil, 12 paywall}`.
`07/06/10-pins → 08 détail → {09 prévision, 12 paywall, voisines}`. `12 → paiement → 29 → 05`.
Jeu : `05 → 15 défi → 16/17 → 13 profil → 14 classement`. **Aucun écran ne sort du monde comic.**

## Statut légende : [ ] à faire · [~] partiel · [x] fait (vérifié smoke + en prod)
