# ARENA — spec écrans (thème COMIC / TCG / BD-Marvel)

Tu produis des écrans mockup HTML pour une app météo-sargasses transformée en jeu de cartes à collectionner.
**Style** : comic / BD / Marvel + cartes à collectionner Yu-Gi-Oh/Pokémon. Couleurs saturées, gros contours encrés noirs, halftone, holographique, onomatopées, police "Anton" pour les titres.

## CSS — utilise UNIQUEMENT les classes de `/themes-lab/arena.css`
Classes dispo : `.ph .sb .view .bg-sky .bg-night .pad`, titres `.h-xl .h-lg .eyebrow`, texte `.txt .txt-w`,
boutons `.btn .btn.yel .btn.blu` (+ `<small>` dedans), `.panel`, `.pow b` (onomatopée), carte TCG `.tcard>.ti>.tbn(.nm,.sc)`,
`.pill(.dot)`, `.row`, `.nav>a`. Tu peux ajouter du style inline ponctuel mais reste dans la palette
(--ink #0d0b14, --paper #fdf6e3, --red #e8322a, --yel #ffd23f, --blu #27a9e3, --grn #27c46b, --org #ff8a3d).

## Template EXACT d'un écran (copie-colle puis remplis)
```html
<div class="scr">
  <div class="cap">NOM DE L'ÉCRAN</div>
  <div class="ph">
    <div class="sb"><span>9:41</span><span>📶 4G &nbsp;🔋</span></div>
    <div class="view">
      <div class="bg-sky"></div>
      <div class="pad">
        <!-- contenu de l'écran ici -->
      </div>
      <!-- nav optionnelle si écran principal -->
      <div class="nav"><a>🏠<br>Accueil</a><a>🗺️<br>Carte</a><a>🎴<br>Collection</a><a>🛰️<br>Veilleur</a></div>
    </div>
  </div>
</div>
```
Hauteur écran = 640px (déborde = ok, le contenu est scrollé masqué). Vise un écran REMPLI et crédible.

## Données réelles à utiliser (authenticité)
- Marque : **SARGASSES MARTINIQUE**, mascotte = **Le Veilleur** (satellite à œil 🛰️👁), données **Copernicus Marine**, slogan « mesuré au satellite, pas deviné ».
- Statuts : **PROPRE** (vert #27c46b), **MODÉRÉ** (ambre #ffd23f/#e8a800), **À ÉVITER** (corail #e8322a).
- Premium = « Le Veilleur » **4,99€/mois**, alerte la veille sur TA plage, annulable 1 clic.
- Plages (nom · commune · score/100 · statut) :
  Anse Mitan · Les Trois-Îlets · 77 · PROPRE | Les Salines · Sainte-Anne · 92 · PROPRE |
  Grande Anse du Carbet · Le Carbet · 81 · PROPRE | Anse Charpentier · Sainte-Marie · 34 · À ÉVITER |
  Le Diamant · Le Diamant · 68 · MODÉRÉ | Anse Dufour · Les Anses-d'Arlet · 88 · PROPRE |
  Tartane · La Trinité · 59 · MODÉRÉ | Anse Noire · Les Anses-d'Arlet · 84 · PROPRE |
  Pointe Marin · Sainte-Anne · 79 · PROPRE | Anse Trabaud · Sainte-Anne · 26 · À ÉVITER.
- Facteurs de score (7) : Sargasses, Houle, Vent, Eau, Ciel, UV, Marée. Prévision 7 jours, indice AFAI, santé H₂S, fiabilité ~79%.
- Vibe jeu : carte = plage, score = PV, rareté ★ (Commune→Légendaire), type 🌊🌴🐢, onomatopées (PROPRE!, PARFAIT!, BERK!), collection/deck, défi du jour, streak, classement.

## Catalogue des 32 écrans (chacun = un bloc .scr)
1 Splash (logo Veilleur, "chargement de la côte…")
2 Onboarding — Bienvenue
3 Onboarding — Comment ça marche (satellite scanne)
4 Onboarding — Choisis ta région (MQ/GP)
5 Home — Verdict du jour (plage vedette en grande carte + CTA)
6 Liste des plages (deck/binder de cartes)
7 Carte plage TCG (hero, grande carte holographique d'Anse Mitan)
8 Fiche plage (détail : statut, 7 facteurs en barres, chips)
9 Prévision 7 jours (rangée de jours, J3-7 floutés "premium")
10 Carte / map (pins colorés sur fond, Veilleur en orbite)
11 Plan B — plages propres à proximité (3 cartes + distances)
12 Paywall premium (carte LÉGENDAIRE holo "Le Veilleur" + bénéfices + prix)
13 Plans & prix (mensuel 4,99 / annuel, comparatif)
14 Paiement / checkout (carte bancaire, style ticket comic)
15 Paiement réussi (confetti, "Veilleur activé !", badge)
16 Profil — ma collection (grille de cartes plage collectées, %)
17 Classement / leaderboard (top voisins, médailles)
18 Défi du jour (mini-jeu "devine le score", barre de temps)
19 Déblocage badge / achievement (pop "NOUVEAU !" + médaille)
20 Réglages (toggles, compte, langue)
21 Sélecteur de thème (vignettes des thèmes, jeu)
22 Notifications (liste d'alertes plage)
23 Alerte santé H₂S (carte d'avertissement + consignes)
24 Recherche (champ + résultats plages)
25 Filtres (statut, distance, commune — chips)
26 À propos / confiance (qui, données, Copernicus)
27 Fiabilité (gros % + barre + "sur N prévisions")
28 Partage (carte sociale "j'ai trouvé une plage PROPRE")
29 État vide (aucune plage trouvée, mascotte triste)
30 Erreur / hors-ligne (Veilleur déconnecté, retry)
31 Streak / récompense quotidienne (flamme jours consécutifs)
32 Onboarding post-achat (bienvenue Veilleur, configure ta plage)
