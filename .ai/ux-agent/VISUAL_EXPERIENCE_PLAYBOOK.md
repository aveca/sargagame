# Sargagame Visual Experience Playbook

## Mission
Créer des moments « wow / aha » qui améliorent une décision réelle. Le visuel n'est jamais décoratif par défaut.

## Primitive library

### 1. BeachReveal
Hero plage + verdict immédiat + révélation progressive de la preuve.
- AHA: « je comprends immédiatement si cette plage vaut le coup aujourd'hui ».
- Mobile: une action de reveal/tap maximum.
- Motion: 250–700ms, reduced-motion fallback statique.

### 2. RiskWave
SVG léger montrant l'évolution du risque dans le temps.
- Utiliser pour rendre J+1/J+7 compréhensible.
- Ne jamais suggérer une précision supérieure aux données.

### 3. ForecastTimeline
J-7 → aujourd'hui → J+7 avec état, confiance et fenêtre utile.
- Interaction: swipe/tap.
- AHA: faire émerger la meilleure fenêtre plutôt que montrer une table.

### 4. CleanWindow
Carte visuelle « meilleure fenêtre » avec justification courte.
- Verdict → raison → preuve.
- CTA secondaire vers la plage alternative.

### 5. AlternativeBeach
Quand la plage demandée est défavorable, proposer une alternative contextualisée.
- Montrer distance/raison/état.
- Ne jamais présenter une alternative sans données.

### 6. ConfidenceReveal
Transformer fiabilité et fraîcheur en signal compréhensible.
- Source + timestamp + historique.
- Pas de fausse précision.

### 7. ArrivalAnimation
Micro-transition au moment où l'utilisateur passe de SEE à DECIDE ou de DECIDE à GO.
- Elle doit confirmer le changement d'état.
- Aucun effet si cela ralentit l'action.

### 8. PremiumReveal
Paywall centré sur la valeur décisionnelle:
« ce que vous saurez / ce que cela change / pourquoi maintenant ».
- Montrer une partie de la preuve gratuitement.
- Révéler la profondeur premium sans manipuler l'utilisateur.

### 9. MotionMedia
Images, WebP/GIF, vidéo courte ou cinemagraph seulement si le média explique mieux qu'un composant statique.
- lazy-load hors viewport.
- poster image obligatoire pour vidéo.
- aucune vidéo bloquante au-dessus de la ligne de flottaison sans preuve de gain UX.
- respecter reduced-motion/data-saver quand disponible.

## AHA ladder
1. Verdict en <5 secondes.
2. Surprise utile.
3. Preuve visible.
4. Décision facilitée.
5. Alternative si nécessaire.
6. Action.
7. Retour utile / anticipation de demain.

## Design quality gate
Avant toute PR UI:
- 390px, 768px, 1440px.
- premier écran compréhensible sans lecture longue.
- CTA primaire identifiable.
- aucun état mort.
- aucun contenu important uniquement transmis par couleur.
- reduced-motion.
- contraste et cibles tactiles >=44px.
- i18n.
- CLS stable.
- bundle eager <=210 KB gzip.
- media lazy quand possible.
- flag de rollback.
- capture avant/après si l'outillage le permet.

## Creative rule
L'agent doit proposer au maximum une idée visuelle principale par cycle. Il doit expliquer l'AHA, la fonction UX et le signal business avant de coder.

## Anti-patterns
- animation gratuite
- carousel automatique
- vidéo lourde pour décorer
- GIF répétitif sans fonction
- parallaxe qui masque le contenu
- modal qui interrompt sans intention
- « wow » qui retarde le CTA
- fake data / faux niveau de précision
