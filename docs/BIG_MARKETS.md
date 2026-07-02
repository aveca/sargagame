# BIG_MARKETS — Ouvrir des parts de marché >100 Md$ (verdict panel 2026-07-02)

> **Directive fondateur** : « OPEN MORE VERTICAL MARKET SHARE — cherche les marchés >101 Md$ et vise 1 % atteignable (prendre des parts dans les gros business). »
> **Méthode** : panel d'agents adverses (Workflow, 15 agents : 7 recherches TAM + WebSearch, 7 critiques avocat-du-diable, 1 synthèse). On suit le verdict du panel, pas le framing initial.
> **Ce doc fige la décision.** Ne pas re-litiger sans nouvelles données. Autorité supérieure = `CLAUDE.md` (bloc maître).

## Verdict en une phrase

Le cadrage « marché >100 Md$ → 1 % » est un **piège à TAM** : chaque catégorie réellement >100 Md$ (assurance, immobilier, maritime, paramétrique) ne devient adressable qu'en **cassant un mur non-négociable** du mandat (ZÉRO-call, moat honnêteté, reuse/coût-marginal-0). La couche logicielle **réellement** vendable par notre stack pèse **~0,15-0,25 Md$** → 1 % = **~1,5-2,5 M$ ARR**. Le vrai levier de croissance = **VOLUME à moat intact**, pas une nouvelle catégorie prestigieuse.

## Les 5 murs non-négociables (grille de scoring du panel)

Un wedge n'est retenu que s'il respecte les CINQ :
1. **ZÉRO-call self-serve** (pas de force de vente, RFP, SLA, licence assurance, consortium).
2. **Moat honnêteté intact** : verdict 100 % dérivé de la donnée MESURÉE (AFAI ERDDAP) ; 0 fabrication ; on publie le taux d'erreur. Interdit de publier un taux d'erreur sur un aléa non-backtesté.
3. **Supply 100 % insourçable** (Copernicus/Sentinel/NOAA open-license ; aucun tiers coupable de nous couper — leçon webcams).
4. **Reuse élevé / coût marginal ~0** (pas de pipeline data NET-NEW ; idéalement data-change-not-code sur le moteur de régions).
5. **Vitesse** (time-to-revenue en semaines, pas en trimestres).

## Classement des 7 candidats

| Rang | Candidat | TAM affiché | TAM réel wedge | Verdict | Mur cassé |
|---|---|---|---|---|---|
| 1 (82) | **Sargassum Golfe/Caraïbe élargi** (extension géo pure) | — | ~0,15-0,25 Md$ | **GAGNANT** | aucun |
| 2 (68) | **HAB / red-tide beach-day** (Floride+Golfe) | 2,7 Md$ douleur | ~0,15 Md$ | **PILOT gaté** | moat (chlorophylle = proxy, pas AFAI) |
| 3 (58) | Intelligence destination voyage (API/widget embarquable) | 2,5 Md$ | ~0,15-0,25 Md$ | PILOT | WTP menacé (widgets gratuits) |
| 4 (55) | Coastal-hazard index API self-serve (packaging sargassum.json) | — | ~0,15 Md$ | PILOT (distribution SKU, pas croissance) | commodity race |
| 5 (22) | Climate/coastal physical-risk (assurance+immobilier) | 8,5 Md$ | 0,15 Md$ | **KILL** | ZÉRO-call + moat |
| 6 (15) | Immobilier côtier (overlay portails) | 4 Md$ | 0,3 Md$ | **KILL** | reuse (érosion = pipeline net-new) + acheteur hostile (Zillow a retiré les scores climat, nov. 2025) |
| 7 (12) | Maritime/industriel (Intake Sentinel) | 28 Md$ | 0,15 Md$ | **KILL** | ZÉRO-call (RFP 9-18 mois) + hardware SLA |
| 8 (10) | Assurance paramétrique plage | 25 Md$ | — | **KILL** | anti-sélection FATALE (notre app dit gratuitement quand ce sera sale → l'acheteur s'assure au pire moment) + argent↔verdict |

## Gagnants

### #1 — Sargassum Golfe du Mexique / Caraïbe élargi (à faire MAINTENANT)
Même aléa, même AFAI (**zéro proxy**), moat 100 % intact, `/fiabilite/` déjà backtesté, reuse ~98 % (data-change pur), self-serve zéro-call **déjà prouvé** (2 vraies ventes B2C), time-to-revenue 1-2 sem. C'est « du volume à moat intact » — exactement le levier coût-marginal-0 du mandat.

**Premier wedge (zéro-blocage, zéro creds) : densifier la géo sargassum USD sur les domaines DÉJÀ live et monétisés** (`rivieramaya`/sargassumcancun.com, `florida`/sargassummiami.com, `puntacana`). Ajouter des plages à très fort trafic « sargazo/sargassum <plage> » manquantes = plus de long-tail SEO sur des sites qui encaissent déjà. **Créer un NOUVEAU domaine = action creds fondateur (bloqueur)** → queue ci-dessous, pas un blocage du wedge présent.

### #2 — HAB / red-tide (Floride+Golfe) — PILOT STRICTEMENT GATÉ
Ne devient actionnable **que** quand un backtest HAB honnête (vs ground-truth FWC datable) produit un vrai taux d'erreur dans `/fiabilite/` HAB qui passe le Gate. **La chlorophylle est un PROXY** → publier « red tide mesuré au satellite » depuis la chloro serait du deviné-déguisé = **casse le moat**. On l'ouvre APRÈS avoir empoché le volume sargassum-Golfe. Second aléa **additif sur les MÊMES régions** (upsell de la base installée, pas d'acquisition neuve → double l'ARPU par plage sans doubler le CAC).

## Chemin vers 1 % (~1,5-2,5 M$ ARR), VOLUME pas marge

1. **Densifier la géo sargassum USD** : chaque côte à fort trafic = plus de pages SEO. On est **déjà #1 organique** sur « sargassum <ville> » → l'atteignabilité du 1 % est portée par un intent-match que les incumbents ne matchent pas (Beach Day API = temps-réel **sans forecast ni taux d'erreur** ; widgets gratuits **sans audit**).
2. **Monétiser les deux côtés déjà câblés** : B2C pass one-time USD + B2B widget hôtel/marina HMAC self-serve (essai 30 j, paylink Mollie) sur chaque côte → même trafic, deux revenus.
3. **Si le backtest passe** : ajouter le red-tide HAB comme 2e aléa sur les mêmes régions Floride/Golfe (upsell base installée).

**Différenciateur qui tient le 1 % face au plancher gratuit** : « le SEUL feed qui publie son taux d'erreur ET prévoit J+7 ».

## Garde-fous (loi absolue)

1. **Moat honnêteté = jamais dilué** : verdict 100 % donnée MESURÉE ; donnée manquante → incertitude/cadenas affiché, **jamais** un chiffre inventé.
2. **INTERDIT** de publier un taux d'erreur sur un aléa non-backtesté (red-tide/HAB → `/fiabilite/` seulement après backtest FWC qui passe le Gate ; copy hedgée + ground-truth FWC affiché à côté ; jamais « mesuré au satellite » sur un proxy).
3. **Jamais de re-badge d'un péril qu'on ne mesure pas** (piège First Street : prédictions publiquement fausses = la tombe crédibilité qu'on évite).
4. **L'argent ne touche JAMAIS le verdict** : refuser tout montage (assurance/paramétrique) où un payout dépend de notre trigger = conflit d'intérêt + anti-sélection.
5. **Supply insourçable only** : refuser toute source révocable (citizen-science, flux tiers, hardware/bouées SLA).
6. **ZÉRO-call strict** : si un wedge dérive vers l'enterprise/régulé → KILL, on reste B2C pass + B2B widget self-serve.
7. **Money-path ADDITIF only** : ne jamais casser le flux B2C prouvé.

## Critères de mort (chiffrés)

- **Sargassum-Golfe** : (a) un nouveau marché USD qui n'indexe pas top-10 sur « sargassum <ville> » en **90 j** → ne pas en ouvrir un autre sur le même modèle ; (b) <1 vente B2C OU <1 essai B2B widget en **60 j** après indexation → geler l'expansion de cette côte ; (c) bbox non couverte par l'AFAI ERDDAP (verdict permanent en « incertitude ») → retirer la région (un verdict cadenassé ne convertit pas et n'a pas à mentir).
- **HAB/red-tide (PILOT)** : (d) **mort immédiate** si le backtest HAB vs FWC ne produit pas un taux d'erreur défendable qui passe le Gate → **aucune** page red-tide (règle 0-fabrication) ; (e) si la copy honnête hedgée effondre la conversion sous le sargassum de la même géo → KILL le red-tide, garder le sargassum seul ; (f) taux d'erreur HAB significativement pire que le sargassum (~76 % tous régimes) au point d'être invendable honnêtement → KILL.
- **Transverse** : tout aléa dont le moat repose sur un proxy non-auditable ou une supply révocable = **KILL on-sight**, sans dette.

## Queue action fondateur (creds — non bloquant pour le wedge présent)

L'expansion géo à plein régime (passer de 3 à ~12-15 marchés USD) suppose de **nouveaux domaines** → chacun = DNS + compte FTP + produits Mollie/Stripe = action fondateur. Candidats à fort trafic « sargassum » non encore couverts par un domaine dédié (à provisionner quand tu veux ; le `regions/<id>.json` se frappe en minutes ensuite) :
- **Tulum** (sargassumtulum.com) — aujourd'hui sous `rivieramaya`, mais trafic propre énorme.
- **Playa del Carmen** (dédié) — idem.
- **Barbados** — déjà PRÉPARÉ (résidus Stripe à purger + câbler Mollie, cf. bloc maître CLAUDE.md).
- Côtes US Atlantique hors Floride (ex. **Texas Gulf**, selon couverture AFAI ERDDAP à vérifier).

## Queue R&D (data-eng, sans page publique)

- **Backtest HAB / Karenia brevis vs archive FWC** (Florida Fish & Wildlife). Produit le taux d'erreur qui débloque (ou tue) le gagnant #2. **Zéro page publique** tant que `/fiabilite/` HAB ne passe pas le Gate.
