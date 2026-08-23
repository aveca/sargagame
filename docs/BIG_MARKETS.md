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

---

## Appendice — Économie PHYSIQUE des sargasses (collecte / valorisation / anti-échouage) — verdict panel 2026-07-02

> **Directive fondateur (brain-dump de marché)** : « transformer la crise sargasses en opportunité — coût de ramassage ~125-230 €/t, recyclage (biostimulants, bioplastique, briques, biogaz, cosmétique), tourisme-défense (barrages déviants). Comment monter un business rentable ? »
> **Méthode** : panel adverse (Workflow, 10 agents : 6 lentilles → synthèse → 2 sceptiques → verdict). Question **DISTINCTE** du corps du doc (qui traitait les TAM *software* assurance/immo/maritime) : ici l'économie de l'**ATOME**.
> **Convergence** : **6/6 lentilles unanimes**, y compris l'avocat du diable pro-entrée. Les 2 sceptiques confirment le verdict ET le durcissent.

### Verdict en une phrase
L'économie physique des sargasses est un marché de **MARCHÉ PUBLIC (RFP) et de CAPEX**, pas de vente d'algue : **personne n'achète du sargasse — on est payé pour l'ENLEVER**. Les 3 métiers physiques sont **KILL sans appel**. Le seul angle qui respecte nos 5 murs = **revendre notre MÊME prévision de dérive comme intelligence ops** à ceux qui paient déjà le nettoyage — mais les sceptiques le rétrogradent de « PILOT » à **test-de-copy à TAM-résiduel, upside net ≈ 0** (sa valeur multi-sites vit chez les acheteurs RFP inaccessibles ; le petit privé restant a déjà le verdict gratuit). **Conclusion : ne rien lancer de séparé ; on reste sur le wedge figé (densifier le sargassum USD).**

### Tableau des 4 candidats
| Candidat | Verdict | Mur(s) cassé(s) | Rationale |
|---|---|---|---|
| **Collecte** (barges/filets/tracteurs, contrats) | **KILL** | 1 (zéro-call) + 4 (coût-marg.-0) + 5 (vitesse) + conflit moat | Revenu = **marchés publics de dépollution** (RFP 9-18 mois, ~0,3-1,1 M$/km/an type Miami-Dade), PAS la vente d'algue. Capex barges/tracteurs + main-d'œuvre saisonnière + permis maritimes + responsabilité « producteur de déchet » sur arsenic/chlordécone. « Collecteur armé de notre dérive bat le collecteur aveugle » = argument pour **LEUR VENDRE la donnée**, jamais DEVENIR le collecteur. En prime : on profiterait de la plage SALE qu'on est censé mesurer neutrement. |
| **Valorisation** (biostim/bioplastique/briques/biogaz/cosméto) | **KILL** (casse les **5**) | 1 + 2 (moat) + 3 (supply) + 4 + 5 | Responsabilité MAXIMALE : usine + procédé de retrait métaux lourds (arsenic + chlore + chlordécone bloquent l'alimentaire) + permis ICPE + product-liability + off-take agri/BTP négocié + **supply d'algue livrée par des tiers (NON insourçable)**. Débouchés encore **pré-commerciaux** (accords Quintana Roo signés *seulement 2025*) → revenu en années. **Conflit moat FATAL** : une usine EXIGE du VOLUME de biomasse → l'entité qui dit « plage propre » perd de l'argent quand c'est vrai → incitation permanente à gonfler les alertes. Un scandale de contamination détonerait le moat par association. |
| **Tourisme-défense** (vente+pose de barrages) | **KILL** | 1 + 4 + 5 + piège moat-miroir | Marché en vrai boom (Riu/Barceló/Palladium, ~10 km de booms au Mexique, ~19 pays) MAIS vendre+POSER du textile marin = inventaire (working capital) + survey de dimensionnement + crews d'installation + SAV + garantie/SLA + responsabilité rupture/érosion. **Piège moat le plus insidieux car « adjacent »** : adosser le verdict à une vente de barrière crée l'incitation-**miroir** à **SUR-alerter** (fear-selling). Au mieux on affilie/référence un fabricant — mais ce n'est plus « hardware » au sens scopé, et l'adjacence hôtelière chaude est déjà captée en amont par le feed. |
| **routing_data_feed** (revendre la prévision de dérive comme intelligence ops) | **PILOT → rétrogradé test-copy TAM-résiduel** | aucun mur cassé, mais **murs 1 ET 2 sous surveillance** + TAM capturable ≈ résidu | SEUL candidat *reuse-consistent* : même `sargassum.json`, coût marginal ~0, self-serve via le funnel widget hôtel déjà live (token HMAC + Mollie + essai 30 j). Honnêteté-**RENFORÇANTE** : l'acheteur ops est puni par **TOUTE** erreur (faux positif = bateau à 230 €/t envoyé pour rien ; faux négatif = nappe ratée) → son argent récompense la neutralité exacte **dans les deux sens** et génère du ground-truth daté qui muscle `/fiabilite/`. **MAIS** (sceptiques) : les gros budgets (Quintana Roo ~135 M$/an, 1,1 M$/km/an) sont **TOUS en procurement** ; le petit privé survivant a **une** plage + le verdict gratuit → WTP ≈ nul + cannibalisation du premium. |

### Le seul wedge « software » ne sauve pas non plus (les 2 sceptiques tranchent)
1. **Clivage acheteur décisif, pas verticale.** La valeur opérationnelle réelle (router N équipes sur M sites, chronométrer la pose de barrage) est concentrée chez les **GROS payeurs** (collectivités sous Plan Sargasses État, groupes hôteliers, collecteurs sous contrat public) — **précisément ceux qui ne peuvent PAS payer par carte** (Code de la commande publique : >40 k€ HT = appel d'offres formalisé ; en-dessous = 3 devis + bon de commande + engagement comptable). **~100 % du budget nettoyage réel est structurellement hors-carte.**
2. **Le survivant self-serve n'a ni budget ni besoin.** Un hôtel indépendant a **une** plage, la regarde par la fenêtre gratuitement, a déjà notre verdict B2C gratuit, et « route » en appelant son gars au tracteur. Le WTP « ops » incrémental positif vit **exactement dans la population KILL**. Chez le survivant : WTP ops ≈ WTP verdict = **déjà capté ou nul** → un « feed ops » pris à la place du premium = **renommage à revenu net nul (substitution)**, pas un gain.
3. **Honnêteté de résolution non-négociable.** Notre moteur résout **plage × jour** (composite AFAI 7 j + dérive Stokes/DBSCAN à confiance décroissante, fraîcheur 12-36 h), pas **pixel-océan × heure**. On peut vendre honnêtement « planifie le nettoyage de CETTE plage à J+1..J+3 » — ce que notre verdict **est déjà**. On **ne peut PAS** vendre « intercepte la nappe à 3 h et 500 m près en mer » : le composite 7 j l'**infère**, ne le **mesure** pas. Sur-promettre = moat en jeu pour un upside marginal.

### Le seul mouvement autorisé (par défaut : rien)
**Décision par défaut = ne rien lancer de séparé** (pas de variante `?use=ops`, pas de funnel dédié, pas de pilote de 6 semaines). Au **maximum** : ajouter **UNE ligne** de bénéfice ops (« planifiez votre équipe de nettoyage avec la prévision de dérive J+2-7 ») dans la copy du widget **79 €/mo EXISTANT**, sans surface neuve. Coût = 1 phrase, réversible. **Ce wedge N'AJOUTE RIEN** au gagnant déjà figé (densifier le sargassum USD) tant que son WTP ops n'est pas prouvé — c'est un test quasi-gratuit à la marge, jamais une réorientation, **zéro sunk-cost**.

### Critères de mort (chiffrés) — SI jamais on teste la ligne de copy
- **Procurement d'abord (test n°1, avant conversion)** : si >70 % des prospects intéressés sont des entités à achat formel (collectivité, groupe >X chambres, sous-traitant de marché public) → marché self-serve = résidu → **KILL sans attendre 6 semaines**.
- **Conversion** trial→paid de la ligne ops **< 2-3 %** (vs copy marketing) sur 6 sem → KILL. Ne compter comme succès QUE des payeurs qui **n'auraient PAS** pris le widget verdict (sinon substitution à revenu nul).
- **Tout appel de cadrage / devis / PO / signature de marché** nécessaire pour conclure → **mur 1 cassé → KILL immédiat, sans re-test.**
- **Toute demande d'INTÉGRATION** (API custom, push feed dans un outil tiers, endpoint dédié, format sur-mesure) — même « self-serve » en apparence — = 1er barreau enterprise (SLA implicite → support → code) → **mur 1 cassé → KILL immédiat.**
- **Toute demande d'un « feed privé ops » ajusté / temporisé / plus optimiste** que le verdict public de SA plage → **mur 2 cassé → KILL immédiat + retrait** (la pression viendra du plus **gros** compte, pas d'un marginal).

### Garde-fous (loi absolue)
1. **ARGENT↔VERDICT** : le feed ops vendu = **STRICTEMENT le même `sargassum.json`** que le verdict public gratuit. Une seule source, **zéro fork**, garanti par construction technique — pas par promesse contractuelle. Un cran de confiance de divergence = moat mort.
2. **JAMAIS de levier de suppression** : aucun bouton « masquer/atténuer/reporter l'alerte de MA plage ». Le payeur achète de la **précision neutre**, jamais le droit de teinter ce que le public voit.
3. **Honnêteté de résolution** : vendre uniquement du **J+1..J+3 plage-scale**. INTERDIT de pitcher du routage d'interception en mer / au pixel-heure.
4. **Claims hedgés** sur chaque payload : « ~76 % tous régimes » + fenêtre datée + N comparaisons + faible confiance sur les rares alertes calme-régime. Jamais un « 100 % » nu.
5. **Responsabilité bornée** : framing « prévision non garantie, vous restez décideur » + ToS click-through à l'émission du token, exposition plafonnée aux frais payés. Vendre de l'intelligence probabiliste bon marché, **jamais** une garantie opérationnelle (sinon dérive SLA → enterprise → murs 1+2). ⚠️ un ToS checkbox ne plafonne PAS la faute lourde en droit FR/UE → accepter ce risque comme raison de **KILL**, pas comme détail.
6. **Financement non-dilutif = piège, PAS un argument d'entrée** : ESA BIC Sud / CASSINI Challenges **EXIGENT une SASU** (co-financement BPI). La mémoire fondateur a figé « STOP SASU » et le mandat interdit entité/capex/salariés. L'argent « gratuit » **déclenche** l'infra juridique/humaine interdite → ne jamais l'invoquer pour justifier une entrée physique.

### Ce qu'on répond au fondateur
Le business physique des sargasses est **une autre entreprise** que la nôtre : capex, salariés, permis, responsabilité métaux lourds, et surtout **vente par marché public** — l'inverse exact de notre modèle zéro-call / coût-marginal-0 / fondateur-mobile. On **ne devient PAS** collecteur, transformateur ni poseur de barrages. Le seul actif transférable est **notre donnée**, pas notre main : et même là, ceux qui ont le budget achètent en RFP (inaccessible) tandis que ceux qui restent self-serviables n'ont ni le besoin ni le budget. **On ne pivote pas.** On empile du **VOLUME à moat intact** sur ce qu'on fait déjà le mieux — densifier le sargassum USD — verdict déjà figé plus haut dans ce doc.
