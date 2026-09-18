# Whiteness audit — surfaces hors #688 (AUDIT ONLY, aucun code modifié)

> Branche : `agent/ui/whiteness-audit` (base `76c2197ff`, descendant de `f448250bb`).
> Méthode : Playwright + `getComputedStyle` (jamais la couleur d'une capture headless),
> mobile 390×844 + desktop 1440×900, fresh context par surface (zéro contamination
> d'état), couverture réelle vérifiée par `elementFromPoint`.
> Preuves brutes (hors repo) : `Temp/opencode/visual-audit/wa/` (sweep + verify +
> screenshots). Zéro écriture prod, zéro test modifié, zéro fix proposé (scope à
> établir d'abord). G1 non lancé.

## Verdict #688 (non-régression)

Re-sweep Accueil + Plages + Ma Plage : aucun texte visible < 4.5 autre que les
couleurs-statut (F3, préexistant). Cartes CR 19.53, filtres actifs OK, sticky OK.
**#688 tient, aucune régression introduite.**

## Findings (tous préexistants, aucun causé par #688)

### F1 — Badge fraîcheur « il y a 1 j » (P1, visible, mineur)
- Route : `/` (header, toutes vues) · Composant : `.sg-seg.sg-freshness` (app-runtime.css)
- Élément : span date, 11px, `#B87A00` sur sticker blanc → **CR 3.61 < 4.5**
- Viewports : mobile + desktop · Preuve : computed + screenshots header
- Note : le pendant `stale` (rouge, `.stale`) n'a pas été observé en session.

### F2 — Pill « EN DIRECT » sur fond variable (P2, conditionnel, fragilité)
- Route : `/` (top rail) · Composant : `A.sg-seg.sg-live`
- Élément : texte ink sur `rgba(0,158,142,.12)` ; chaîne d'ancêtres 100 % transparente
  jusqu'à BODY → le fond réel est **la carte/scène derrière** (variable).
- Lisible sur scène claire (screenshots), fragile sur mer sombre. Préexistant.
- Viewports : mobile + desktop · Preuve : ancestor-chain + screenshots.

### F3 — Numéraux/mots aux couleurs-statut sous le seuil large-texte (P2, design-system)
- Blanc sur vert `#22C55E` → 2.28 (pins carte « 86 », 17px) ; blanc sur `#B87A00` →
  3.61 (pastilles « SUPER ») ; le seuil large-texte (≥18px ou ≥14px gras) est 3.0.
- Toujours accompagnés d'une FORME + d'un MOT (bible 1 rôle = 1 valeur : jamais
  l'info par la couleur seule) → lisibilité fonctionnelle conservée.
- Viewports : mobile + desktop · Preuve : computed. Préexistant, hors scope #688.

### F4 — Chat : chips/× rendus blanc/noir par le skin (info, lisible, off-design)
- Route : `/` (panel SargaChat, auto-open frustration) · Composant : `SargaChat.jsx`
- Les chips or-tintés et le × tombent sur `.theme-comic button` (blanc/noir, CR 21).
  Lisible, volontairement non touché (audit only).
- **Verdict « Envoyer » : SAIN** — le bouton `type=submit` reçoit le dégradé or
  (règle `.theme-comic button[type="submit"]`) + encre → bouton or lisible.
  Prouvé par rage-click (frustration auto-open, `?frustration=0` existe) + computed
  + screenshot. Le flag initial (encre sur `#120821`) était un artefact de lecture
  (couleur de base transparente, peinture dégradée non résolue par le sweep).

## Sains (prouvés, à ne pas re-auditer sans preuve neuve)

Carte labels (blanc + scrim, 19.53 / 5.3+ombre) · fiche ChasseDetail `.lc-detail`
(screenshot desktop complet) · fiche `.bsc-sheet` · paywall (panel, E2 12.13,
inputs 18.92, sticky 2 lignes) · cookie Accepter/Refuser (21) · mapchips/mapcta
(18.09) · hero dismiss · bottom nav · XP post-#688.

## Artefacts du sweep (pas des findings)

- Legacy `BeachListView` monté SOUS l'overlay XP (fixed z900) : contenu invisible
  car recouvert (`elementFromPoint` = overlay), pas car mal contrasté.
- Éléments recouverts (fiche sous compare, carte sous paywall) : exclus par couverture.
- Fonds en dégradé : le résolveur remonte au BODY — exiger la peinture effective
  (règle `!important` / screenshots) avant de conclure, cf. F4.

## Observations hors scope (non actionnées)

- `DemoReel` (QR « SCANNEZ ») prend tout l'écran après ~75 s d'inactivité.
- Frustration auto-open du chat prouvé par rage-click (12 taps) — pas de fix proposé.
- Mobile : 0 pin visible (declutter) vs 5 desktop — timing/declutter, pas contraste.

## Règle de sortie (pour la phase fix, scope à établir)

Aucune correction à l'aveugle : 1 finding = 1 repro + 1 cause + 1 correctif minimal
(pattern armure du repo) + avant/après + test + rollback `?flag=0`.
