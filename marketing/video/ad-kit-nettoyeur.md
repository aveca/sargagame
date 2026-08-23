# Kit pub vidéo IA — « Le Nettoyeur » (mécanique Mad Muscles adaptée)

Concept : l'EXPERT crédible (un nettoyeur de plage, râteau en main, qui voit les
sargasses revenir chaque matin) + l'APPRENTI qui galère → le produit qui résout
(notre app : savoir OÙ aller avant de partir). Le nettoyage plage/bateau est le
DÉCOR et la CRÉDIBILITÉ, pas la promesse — on ne nettoie pas les plages, on
prédit où elles sont propres. 100 % généré par IA + 1 insert d'écran RÉEL de
l'app (capture vraie — jamais de fausse UI).

## Garde-fous (non négociables)
- Mention « Images générées par IA » au début ou en description (Meta exige la
  divulgation pour de l'humain réaliste IA ; EU AI Act transparence).
- AUCUNE claim « nous nettoyons » / « plage garantie propre ». La claim produit
  reste la vraie : « la seule prévision 7 jours plage par plage » + honnêteté
  J1-3 fiable / J4-7 tendance.
- L'écran d'app montré = capture réelle du Verdict Hero / fiche plage du jour.
- Pas de logo d'hôtel/marque réelle dans les images générées.

## Script 30 s (6 plans × ~5 s) — FR (MQ/GP)

| # | Plan | Action | Dialogue |
|---|------|--------|----------|
| 1 | HOOK — aube, plage couverte de sargasses | L'apprenti (20 ans, t-shirt fluo) ratisse frénétiquement, en sueur, dépassé | APPRENTI : « Mais… y'en a PARTOUT ! » |
| 2 | L'expert entre dans le champ, calme, râteau sur l'épaule | Le nettoyeur (50 ans, casquette, peau tannée) pose une main sur l'épaule du petit | NETTOYEUR : « Doucement. Moi je nettoie ici chaque matin depuis 8 ans. » |
| 3 | Gros plan nettoyeur, vagues derrière | Il regarde la mer, sourire en coin | NETTOYEUR : « Demain, tout ça revient. C'est le vent qui décide. Pas ton râteau. » |
| 4 | Sur un petit bateau de pêche, il pousse des algues par-dessus bord | Geste ample, naturel | NETTOYEUR : « Le secret c'est pas de nettoyer plus vite… » |
| 5 | INSERT ÉCRAN RÉEL — l'app : hero « ANSE COLLAT — PROPRE AUJOURD'HUI 79/100 » puis fiche prévisions 7 j | Doigt qui tape, scroll forecast | NETTOYEUR (voix off) : « …c'est de savoir OÙ aller. Satellite, 4 fois par jour, plage par plage. » |
| 6 | Les deux assis sur le sable d'une plage PROPRE, glacière ouverte | L'apprenti lève son verre, soulagé | NETTOYEUR : « Regarde avant de partir. » → CARTON : sargasses-martinique.com — « La plage propre du jour. Gratuit. » |

## Script EN (Punta Cana / Miami) — mêmes plans
1. APPRENTICE: "It's… EVERYWHERE!"
2. CLEANER: "Easy, kid. I've raked this beach every morning for 8 years."
3. CLEANER: "Tomorrow it's all back. The wind decides. Not your rake."
4. CLEANER: "The trick isn't raking faster…"
5. VO: "…it's knowing WHERE to go. Satellite-checked, 4× a day, beach by beach."
6. CLEANER: "Check before you drive out." → CARD: sargassumpuntacana.com — "Today's clean beach. Free."

## Script ES (Cancún) — mêmes plans
1. APRENDIZ: «¡Está… POR TODAS PARTES!»
2. LIMPIADOR: «Tranquilo. Yo rastrillo esta playa cada mañana desde hace 8 años.»
3. LIMPIADOR: «Mañana vuelve todo. Lo decide el viento. No tu rastrillo.»
4. LIMPIADOR: «El truco no es rastrillar más rápido…»
5. VO: «…es saber ADÓNDE ir. Satélite, 4 veces al día, playa por playa.»
6. LIMPIADOR: «Míralo antes de salir.» → CARTÓN: sargassumcancun.com — «Tu playa limpia de hoy. Gratis.»

## Prompts Veo 3.1 (1 prompt = 1 plan de 8 s, audio natif)

FICHE PERSONNAGES (à coller en tête de CHAQUE prompt pour la cohérence) :
« CHARACTER A "the cleaner": Caribbean man, ~50, weathered tan skin, short grey
beard, faded blue cap, sleeveless khaki work shirt, holding a wide beach rake.
CHARACTER B "the apprentice": skinny man early 20s, oversized neon-yellow
t-shirt, board shorts, clumsy energy. Setting: Caribbean beach at golden-hour
dawn, thick brown sargassum seaweed piled on the sand, turquoise water behind.
Style: handheld documentary realism, 35mm, natural light, no logos. »

- PLAN 1 : « Handheld shot: CHARACTER B frantically rakes huge piles of brown
  seaweed, sweating, overwhelmed, throws his arms up and shouts in French
  "Mais… y'en a PARTOUT !" Camera shakes slightly. Ambient: waves, gulls. »
- PLAN 2 : « CHARACTER A walks into frame calmly, rake on shoulder, puts a hand
  on CHARACTER B's shoulder, says warmly in French: "Doucement. Moi je nettoie
  ici chaque matin depuis 8 ans." Dawn light, waves rolling. »
- PLAN 3 : « Close-up of CHARACTER A looking at the sea, wry smile, says in
  French: "Demain, tout ça revient. C'est le vent qui décide. Pas ton râteau."
  Wind moves his shirt. Sargassum drifting on the waves behind. »
- PLAN 4 : « On a small weathered fishing boat: CHARACTER A pushes a clump of
  sargassum off the deck into the sea with his rake, says in French: "Le secret
  c'est pas de nettoyer plus vite…" Boat rocks gently. »
- PLAN 5 : INSERT RÉEL — pas de génération. Capture d'écran verticale de l'app
  (hero du jour + scroll fiche prévisions). Voix off : générer en plan 4 rallongé
  OU TTS (la voix Veo du personnage, prompt « voice-over only, same voice »).
- PLAN 6 : « CHARACTER A and CHARACTER B sit on clean white sand, no seaweed,
  cooler open between them, CHARACTER B raises a cup, relieved. CHARACTER A
  looks at camera and says in French: "Regarde avant de partir." Golden hour. »

Déclinaisons EN/ES : remplacer les dialogues (mêmes prompts visuels).

## Outils & coûts (état juin 2026)

| Route | Qualité parle+bouge | Coût estimé 3 langues | Notes |
|---|---|---|---|
| **Veo 3.1 (Flow/Gemini)** — RECOMMANDÉ | Seul à faire dialogue lip-sync + action physique dans le même plan | ~15 plans×8 s ≈ 120 s + retakes ×2 ≈ 25-40 $ en API, ou inclus si abo Google AI Pro | Cohérence personnages via fiche + « ingredients » |
| Kling 3.0 | Mouvement humain top, voix faible | ~0,07 $/s → ~17 $ les retakes incluses | B-roll plans 1/4/6, mais il faut doubler la voix ailleurs |
| HeyGen Creator 29 $/mois | Talking-head parfait, PAS d'action (ratisser/bateau) | 29 $/mois illimité | Plan B si Veo indisponible : version « le nettoyeur face cam » |

## Distribution (ZERO MANUAL au max)
1. **FB groupes** (machine fb-post-groups existante) : vidéo native + texte court
   par langue, lien utm `utm_source=fb&utm_medium=video_nettoyeur`.
2. **Reels/TikTok/Shorts** : format 9:16, hook <2 s (plan 1 direct), sous-titres
   incrustés (les 3 scripts ci-dessus), publication manuelle 1× par marché puis
   on mesure avant d'industrialiser.
3. **Pages /press/** : embed de la vidéo EN comme asset média.

## Mesure
- utm dédié par plateforme/langue → GA4 sessions + `premium_modal_open` source.
- Seuil de poursuite : si 1 marché fait >500 vues organiques et >2 % de clics
  sortants en 7 j → décliner en série (1 vidéo/situation : « le honeymoon
  raté », « le capitaine de catamaran », « la famille du samedi »).
