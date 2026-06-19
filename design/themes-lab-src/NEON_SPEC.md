# NEON — spec écrans (thème ARCADE / SYNTHWAVE / cyber-manga)

Tu produis des écrans mockup HTML pour une app météo-sargasses transformée en jeu d'arcade rétro-futuriste.
**Style** : arcade néon / synthwave / cyberpunk + énergie manga. Fond sombre, grilles néon, glow cyan/magenta,
HUD de jeu vidéo (barres de PV/XP), police "Anton" pour les titres avec halo néon. Vibe « boss fight / scan ».

## CSS — utilise UNIQUEMENT les classes de `/themes-lab/neon.css`
Classes dispo : `.ph .sb .view .bg-grid .bg-dark .pad`, titres `.h-xl .h-lg .eyebrow`, texte `.txt`,
boutons `.btn .btn.cya` (+ `<small>`), `.panel .panel.cya`, HUD `.hud`, barre `.bar>i` (largeur via style="width:NN%"),
`.pill(.dot)`, `.row`, `.nav>a`. Palette : --mag #ff2fb9, --cya #23e0ff, --yel #ffe45e, --grn #3dffa0, fond #0a0118.
Reste dans cette palette néon (jamais de fond clair/papier).

## Template EXACT d'un écran (copie-colle puis remplis)
```html
<div class="scr">
  <div class="cap">NOM DE L'ÉCRAN</div>
  <div class="ph">
    <div class="sb"><span>9:41</span><span>📶 4G &nbsp;🔋</span></div>
    <div class="view">
      <div class="bg-grid"></div>
      <div class="pad">
        <!-- contenu de l'écran ici -->
      </div>
      <div class="nav"><a>🏠<br>Base</a><a>🗺️<br>Radar</a><a>🎴<br>Deck</a><a>🛰️<br>Veilleur</a></div>
    </div>
  </div>
</div>
```
Hauteur écran = 640px (déborde = ok). Vise un écran REMPLI, crédible, type HUD de jeu.

## Données réelles à utiliser (authenticité)
- Marque : **SARGASSES MARTINIQUE**, mascotte = **LE VEILLEUR** (satellite-œil, ici en mode "scanner/IA"), données **Copernicus Marine**, slogan « scanné par satellite, pas deviné ».
- Statuts : **PROPRE** (vert néon #3dffa0), **MODÉRÉ** (ambre #ffe45e), **À ÉVITER** (magenta/rouge #ff2fb9).
- Premium = « LE VEILLEUR » **4,99€/mois**, alerte la veille sur TA plage, annulable 1 clic.
- Plages (nom · commune · score/100 · statut) :
  Anse Mitan · Les Trois-Îlets · 77 · PROPRE | Les Salines · Sainte-Anne · 92 · PROPRE |
  Grande Anse du Carbet · Le Carbet · 81 · PROPRE | Anse Charpentier · Sainte-Marie · 34 · À ÉVITER |
  Le Diamant · Le Diamant · 68 · MODÉRÉ | Anse Dufour · Les Anses-d'Arlet · 88 · PROPRE |
  Tartane · La Trinité · 59 · MODÉRÉ | Anse Noire · Les Anses-d'Arlet · 84 · PROPRE |
  Pointe Marin · Sainte-Anne · 79 · PROPRE | Anse Trabaud · Sainte-Anne · 26 · À ÉVITER.
- Facteurs (7) : Sargasses, Houle, Vent, Eau, Ciel, UV, Marée (affiche-les en barres .bar HUD). AFAI, H₂S, fiabilité ~79%.
- Vibe jeu arcade : score = PV/HP, facteurs = stats, prévision = "timeline", premium = "mode débloqué",
  défi quotidien = "high score", classement = "arcade ranking", badges = "trophées", streak = "combo".

## Catalogue des 32 écrans (chacun = un bloc .scr)
1 Splash (logo néon, barre de chargement "SCANNING COAST…")
2 Onboarding — Bienvenue (insert coin / start)
3 Onboarding — Comment ça marche (le scan satellite)
4 Onboarding — Choisis ta région (MQ/GP)
5 Home — Verdict du jour (plage vedette + HUD PV)
6 Liste des plages (grille type "select stage")
7 Carte plage hero (grand panneau néon, stats PV + barres)
8 Fiche plage (détail : 7 facteurs en barres .bar, statut néon)
9 Prévision 7 jours (timeline, J3-7 verrouillés 🔒 premium)
10 Radar / map (pins glow sur grille, Veilleur scanner)
11 Plan B — plages propres proches (3 lignes + distances)
12 Paywall premium ("MODE VEILLEUR — DÉBLOQUER" + bénéfices + prix)
13 Plans & prix (mensuel/annuel, comparatif néon)
14 Paiement / checkout (carte bancaire style terminal arcade)
15 Paiement réussi ("VEILLEUR ONLINE", glow, trophée)
16 Profil — ma collection (grille plages scannées, % complétion)
17 Classement / leaderboard (ARCADE RANKING, top scores)
18 Défi du jour (high-score "devine le score", timer)
19 Déblocage trophée (pop "TROPHÉE !" néon)
20 Réglages (toggles néon, compte, langue)
21 Sélecteur de thème (vignettes des thèmes)
22 Notifications (log d'alertes, style terminal)
23 Alerte santé H₂S (warning néon + consignes)
24 Recherche (champ + résultats)
25 Filtres (statut/distance/commune en chips néon)
26 À propos / confiance (données, Copernicus)
27 Fiabilité (gros % + barre .bar + "sur N scans")
28 Partage (carte sociale néon "PROPRE — high score")
29 État vide (aucun résultat, scanner vide)
30 Erreur / hors-ligne ("SIGNAL LOST", retry)
31 Streak / combo quotidien (flamme/combo jours)
32 Onboarding post-achat ("VEILLEUR ONLINE", configure ta plage)
