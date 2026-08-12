# 03 — Kit de motifs partagés (à réutiliser À L IDENTIQUE)

> Ces phrases sont l ADN verbal. Toute page/mail qui les emploie doit les copier telles quelles (fr/en/es) — pas de paraphrase.

### Refrain de confiance
  - FR : « Mesuré au satellite, pas deviné. Rien de magique — et quand on se trompe, on l'écrit. »
  - EN : « Measured by satellite, not guessed. Nothing magic — and when we're wrong, we say so. »
  - ES : « Medido por satélite, no adivinado. Nada de magia — y cuando nos equivocamos, lo escribimos. »

### Ligne du pacte
  - FR : « Pass, paiement unique — pas d'abonnement. »
  - EN : « Pass, one-time payment — no subscription. »
  - ES : « Pase, pago único — sin suscripción. »

### Garantie
  - FR : « 30 jours · un email suffit · sans condition. »
  - EN : « 30 days · one email is enough · no questions asked. »
  - ES : « 30 días · basta un email · sin condiciones. »

### Hero referral
  - FR : « Invite un proche : vous gagnez tous les deux un Pass 30 jours offert. »
  - EN : « Invite a friend: you both get a free 30-day Pass. »
  - ES : « Invita a alguien: los dos ganáis un Pase de 30 días gratis. »

### Rituel du matin
  - FR : « Chaque matin, Le Veilleur regarde la mer pour toi. »
  - EN : « Every morning, The Watcher looks at the sea for you. »
  - ES : « Cada mañana, El Vigía mira el mar por ti. »

### Ancrage regret
  - FR : « Un jour de plage gâché = ~200 € perdus (≈ 200 $ aux Amériques). Ton Pass coûte une fraction de ça. »
  - EN : « One ruined beach day = ~$200 lost (≈ 200 € in the French Antilles). Your Pass costs a fraction of that. »
  - ES : « Un día de playa perdido = ~200 $ perdidos (≈ 200 € en las Antillas francesas). Tu Pase cuesta una fracción de eso. »

### Humeurs du Veilleur (liées à la donnée live)
- **calme** — _status=clean — la mer est claire, aucun radeau de sargasses détecté ce matin_
  « La mer est claire. Le Veilleur a veillé, tu peux y aller. »
- **scan** — _status=watch — Le Veilleur croise les 7 facteurs, 4×/jour ; à surveiller, ou alerte de saison calme en faible confiance_
  « Le Veilleur croise la mer, 4×/jour. À surveiller — en saison calme, faible confiance, on te le dit. »
- **alerte** — _status=avoid — quelque chose bascule au large, sargasses en approche (jamais affiché en haute confiance hors saison)_
  « Quelque chose bascule au large. Le Veilleur te prévient avant les sargasses — passe au Plan B. »

### Signature email
Le Veilleur — mesuré au satellite, pas deviné. Projet indépendant opéré depuis la Martinique · Copernicus & NOAA, données publiques et auditables · 136+ plages, 4×/jour. Quand on se trompe, on l'écrit.

### Mots signature (à privilégier)
`mesuré au satellite` · `deviné` · `Le Veilleur veille la mer` · `il regarde la mer, jamais toi` · `verdict du matin` · `dépêche du matin` · `faible confiance (étiqueté)` · `on se trompe parfois, on l'écrit` · `baie par baie` · `chaque crique` · `la journée sauvée` · `le week-end sauvé` · `Pass, paiement unique` · `carte à collectionner` · `booster du jour` · `donnée publique, auditable` · `Copernicus` · `NOAA` · `heure dorée` · `le matin où ça bascule` · `Plan B`

### Mots BANNIS
~~abonnement~~ · ~~premier mois gratuit~~ · ~~essai gratuit~~ · ~~7 jours gratuit~~ · ~~renouvellement automatique~~ · ~~annulation à tout moment~~ · ~~prévisions parfaites~~ · ~~100 % de justesse~~ · ~~99 % précis~~ · ~~fiabilité maximale~~ · ~~algorithme secret~~ · ~~algorithme propriétaire~~ · ~~IA exclusive~~ · ~~boîte noire~~ · ~~deviné~~ · ~~estimé~~ · ~~startup~~ · ~~scale-up~~ · ~~leader du marché~~ · ~~Sophie · Le Diamant~~ · ~~Marie-Jo · Rivière-Salée~~ · ~~Marie · Schoelcher~~ · ~~témoignages fabriqués~~ · ~~45 minutes perdues~~ · ~~surveillance~~ · ~~Big Brother~~ · ~~surveille l'utilisateur~~ · ~~haute saison mesurée~~

### Taglines
- « Mesuré au satellite, pas deviné. »
- « Le Veilleur veille la mer. Toi, tu profites. »
- « Mesuré, pas deviné. Et quand on se trompe, on l'écrit. »
- « Ta plage, vérifiée chaque matin — avant que tu partes. »
- « De l'angoisse à l'heure dorée : un coup d'œil suffit. »
- « Une seule mer, une famille d'îles, une dépêche chaque matin. »
- « Il veille la mer pendant que tu dors. Jamais toi. »

---

## Easter eggs golden-hour — direction illustrative additive (carte SVG)

> Source : Prompt 07 — Univers & Motion, Artefact 4 — validé en spec ce tour (2026-08-12,
> commit à venir). Cette section documente l'**intention design** (langage) avant toute
> implémentation. Est additif à `WorldMapView` / `ArchipelView` — jamais refonte, jamais
> cassage. Suit la doctrine calme (skill `sg-design-system` + `sg-svg-scene`).

### Principes directeurs

1. **Localisé, jamais générique** : chaque région porte une silhouette identifiable
   par un local (yole martiniquaise, palmier-tente punta-cana, etc.). Pas de motif standard,
   pas de pastiche « tropical-like ».
2. **Ambient lent, jamais autonomique** : 80–150s par animation. Aucun élément qui traverse
   l'écran en boucle, aucun pulse rapide. Au repos = **tableau** (pas aquarium).
3. **Additif, jamais refonte** : couches `<g>` injectées sur le layer NEAR déjà existant dans
   `ArchipelView` (l.~9474 de `Sargasses_PROD.jsx`). Pas de refonte des calques, pas de
   nouveau moteur de rAF.
4. **Le Veilleur rassure, ne surveille pas** : toute anim respecte la convention « le
   satellite veille la mer, jamais l'utilisateur ». Faisceau vers l'eau, jamais vers le
   spectateur.
5. **Plancher accessibilité** : `prefers-reduced-motion` = tableau figé, lisible, scrollable,
   cliquable. Aucune anim au repos en reduced-motion. L'easter egg n'est pas un droit
   visuel — il est un bonusRender qui doit pas casser l'UX de base.

### Specs par région

| Région | Easter egg | Quando | Échelle visuelle |
|---|---|---|---|
| Martinique | Yole ronde colorée (rouge + blanc, voiles traditionnelles rondes) dérive en silhouette sur fond mer. 80–150s, jamais traverse, juste dérive + micro-respiration. Ancre ~x=400 y=380 viewBox. Modèle : `design/proto-home-funnel.html` déjà existant. | Toujours (saison indifférente) | Petit (12% largeur viewBox) |
| Guadeloupe | Bande de nuages golden-hour glissant en haut (~120s), silhouette raster maison Sainte-Anne en bordure droite. Sable + cocotier stylisé en silhouette NEAR. | Toujours | Petit (10% largeur) |
| Florida (Miami) | Ombre d'un building Art Deco pastel au bord droit (silhouette hint, pas littéral), palmiers silhouettes en NEAR. Pas de soleil animate (déjà dans le ciel gradient) | Toujours | Petit (8%) |
| Riviera Maya | Silhouette de cenote (cercle d'eau douce) en marge basse, htmlspecialcharsing subtile. Reef turcillisé en MID. | Saison sèche (déc–mai) | Très petit (6%) |
| Punta Cana | Palmier-tente penché vers la mer (cinétique = lent balancement bambou), 100s cycle. | Toujours | Petit (12%) |

### Règles techniques dures (à respecter à l'implémentation)

- **1 seul rAF hub** (déjà en place dans `ArchipelView`) — NE PAS en rajouter
- **Pas de `setPointerCapture`** (kill le click → CTA, piège déjà payé cf. skill `sg-svg-scene`)
- **Pas de transform parasite sur perso animé** : g externe = position, g interne = anim
  (sinon le perso s'expulse hors-champ, piège déjà payé)
- **Ambient lent 80–150s** (pas 10s, pas 30s — doctrine calme)
- **`prefers-reduced-motion` = plancher dur** : early-return AVANT d'armer le rAF + les
  listeners, figer une **belle pose finale visible** (piège : une anim `1 both` sur son
  dernier keyframe opacity:0 = scène disparaît ; vérifier)
- **ratio `<g>` additif sur NEAR** (l.~9474 `ArchipelView`) — ne JAMAIS retoucher à FAR/MID
- **Lerp couleur** : snapper à la couleur de marque quand stabilisé (piège : `mix` exponentiel
  n'atteint jamais la cible exacte → « alerte = brun » au lieu du corail ; si on touche à
  l'humeur du Veilleur, snap par défaut)

### Budget & risque

- **Bundle JS** : 0 Ko ajouté au eager — les easter eggs sont du SVG inline dans le même
  composant `ArchipelView` déjà chargé. Valider via `check-bundle-budget.cjs` à l'implémentation.
- **Performance** : 1 seul rAF (existant), pas de setState par frame, LOD par profondeur.
- **Risque cross-device** : obligatoire de tester via Playwright iPhone 12 (390×844) avant
  ship — les easter eggs doivent pas masquer les pins ni le CTA `openPremium`.
- **A/B flag** : `?eg=1/0` (easter eggs on/off) — control intact, shipping additif
  via `abVariant('easter_eggs', ['on','off'], [1,0])` si on veut A/B. Sinon additif direct
  avec `prefers-reduced-motion` comme planceher dur (pas de flag).

### Programmation (prochaine session)

1. Spec pure (ce document) — fait
2. Implémenter 1 région pilote (Martinique = `yole`) sur branche `agent/ui/TASK-P2-005c-easter-eggs-mq`
3. Cross-device test (Playwright iPhone 12 + desktop) +Gate de ship complet
4. Si OK, étendre aux 4 autres régions en filter par REGION.id
5. A/B `?eg=1/0` si doute, sinon remove flag (additif + reduced-motion = plancher dur suffisant)

