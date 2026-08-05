# PLAN STRATÉGIQUE — SARGAGAME 2026-2027

> Basé sur les données analytics réelles (sheet, daily-metrics, GA4, GitHub).
> **Objectif : MRR €500/mo d'ici 2027-01** via conversion + acquisition + B2B.

---

## 1. DIAGNOSTIC — Les vrais chiffres

### Funnel actuel (juillet 2026)

| Étape | Volume | Taux | Note |
|---|---|---|---|
| Visiteurs GA4 (MQ+GP) | ~1 900/mois | — | |
| Leads email (cumul) | 480 | +7.2/jour | Accélère |
| **GP→paid** | 197 leads → 1 paid | **0.5%** | 🔴 Pire perf |
| **MQ→paid** | 186 leads → 9 paid | **4.8%** | 🟢 Meilleure perf |
| **USD→paid** | 98 leads → 2 paid | **2.0%** | 🟡 Potentiel |
| Mollie payers (30j) | 5 | Revenu ~€55/mois | |
| B2B | 0 | 0 € | 🔴 Aucune conversion |
| Parrainage | 0 | 0 € | 🔴 Pas activé |
| **MRR totale** | **~€125/mois** (Stripe €70 + Mollie ~€55) | | |

### Problèmes identifiés (classés par impact)

1. **🔴 Conversion GP → paid à 0.5%** — 197 leads pour 1 seul paiement. Soit le produit n'est pas adapté au marché GP, soit le funnel n'est pas optimisé.
2. **🔴 0 B2B** — Infrastructure complète (trial, paylinks, widget, drip) mais zéro vente. Le lead le plus chaud (Anoli Lodges, widget installé) n'a pas converti.
3. **🔴 Pas de récupération des échecs paiement** — 3 vrais utilisateurs ont essayé de payer et échoué (egoursaud, jcroulier, hamitchell62). Perte estimée : ~€30-50 non récupérés.
4. **🟡 Parrainage inactif** — Code backend PHP fonctionnel, front-end partiel. La boucle n'est pas fermée car l'action Apps Script `referral` nécessite `clasp push` (bloqué).
5. **🟡 USD sous-performe** — 98 leads, 2 payers. Le trafic USD est là mais ne convertit pas assez.
6. **🟡 Pas de tracking email (opens/clicks)** — SMTP ne donne pas d'events. On envoie 480/jour sans savoir si c'est lu.
7. **🟡 Social media = 0 publication** — Les cards sont générées mais jamais postées.
8. **🟡 Barbados ready, pas live** — 12 plages, contenu SEO prêt, domaine enregistré. Marché touriste US/UK/Canada non exploité.

---

## 2. KPIs CIBLES (trimestre T3 2026)

| KPI | Actuel | Objectif T3 | Levier principal |
|---|---|---|---|
| **MRR** | ~€125/mois | €300/mois | Conversion + B2B |
| **Mollie payers (30j)** | 5 | 15 | Récupération échecs + optimisation paywall |
| **B2B payants** | 0 | 2 clients | Relance Anoli + outreach USD |
| **Email leads/jour** | 7.2 | 15 | SEO + contenu original |
| **Conversion leads→paid** | ~2% | 5% | UX + design tests |
| **GP conversion** | 0.5% | 3% | Funnel redesign GP |
| **USD conversion** | 2% | 5% | Localisation + confiance |
| **Parrainages** | 0 | 5% des nouveaux paid | Activer boucle |
| **Email ouverture** | inconnu | >25% | Tracking opens |

---

## 3. AXES STRATÉGIQUES (les 4 piliers)

### Axe 1 : CONVERSION — Transformer les leads en payeurs

**KPI :** Conversion leads→paid de 2% à 5%
**Impact estimé :** +€100-150/mois sans nouveau trafic

Actions classées par effort :

| Action | Effort | Impact | Priorité |
|---|---|---|---|
| **Récupérer les 3 paiements échoués** | 1h | €30-50 immédiat | P0 |
| **Activer le parrainage** (script Node.js → Sheet direct) | 4h | +15% lead gen viral | P0 |
| **A/B test : redesign paywall GP** (pourquoi 0.5% vs 4.8% MQ ?) | 8h | ×10 conversion GP | P1 |
| **Exit-intent → email → drip → conversion** (déjà fait, optimiser) | 4h | +10-20% conversion | P1 |
| **Tracking email opens/clicks** (track-open.php déjà déployé) | 2h | Visibilité complète | P1 |
| **One-time push : win-back dormant users** (push-winback.cjs) | 1h | Réactivation | P1 |

### Axe 2 : B2B — Premier revenu récurrent

**KPI :** 2 clients payants B2B
**Impact estimé :** €158-1 380/mois selon plan

| Action | Effort | Impact | Priorité |
|---|---|---|---|
| **Relance Anoli Lodges** (email perso avec offre white-label) | 1h | 1er client potentiel | P0 |
| **Activer MOLLIE_CART_RECOVERY=1** dans pipeline | 15min | Récupération continue | P0 |
| **Débloquer l'outreach B2B USD** (i18n copy EN + ES) | 3h | Nouveau pool de prospects | P1 |
| **Présenter le widget Pro dans l'app** (espace pro visible) | 6h | Lead gen B2B organique | P1 |
| **Landing page B2B** → SEO hôtels (déjà existe, la promouvoir) | 2h | Trafic organique B2B | P2 |

### Axe 3 : CRÉATION D'ACTIFS — SVG, vidéo, design original

**KPI :** 1 nouvel actif visuel/semaine publié
**Impact :** SEO + engagement + partages sociaux

Conformément à la doctrine "Le Veilleur" (assets SVG, zéro IA, zéro photo stock) :

| Actif | Usage | Priorité |
|---|---|---|
| **Scènes SVG hero par région** (golden-hour propre à chaque marché) | Landing pages, partages | P0 |
| **Vidéo "Brief plage" quotidienne** (pipeline vidéo local : ffmpeg + nos calques SVG) | YouTube Shorts, Reels, SEO vidéo | P0 |
| **Scènes de saison** (print des sargasses, été calme, hiver) | Page d'accueil dynamique | P1 |
| **Infographies SVG "Comment lire la donnée"** (éducatif, trust) | /fiabilite/, blog | P1 |
| **Animation météo** (vents, courants en SVG) | Carte, fiches plages | P2 |
| **Portraits de plages** (illustration SVG unique par plage) | Fiches plages SEO | P2 |

### Axe 4 : ACQUISITION — Plus de trafic qualifié

**KPI :** Trafic ×2 (3 800 → 7 600 visites/mois)
**Impact :** Double le haut du funnel

| Action | Effort | Impact | Priorité |
|---|---|---|---|
| **Mettre en ligne Barbados** (nouveau marché, 0 concurrence) | 8h | Nouveau trafic US | P1 |
| **Contenu SEO EN/ES pour MQ/GP** (actuellement ~13 EN, 6 ES seulement) | 12h | ×2 trafic MQ/GP | P1 |
| **Network footer MQ/GP → USD** (backlinks des domaines établis) | 2h | SEO USD boost | P1 |
| **Publier le reservoir social** (valve unlock) | 2h | Trafic social gratuit | P2 |
| **YouTube Shorts SEO** (vidéos brief plage en 9:16) | 4h/semaine | Trafic vidéo | P2 |
| **Maillage interne** (cross-links entre plages, communes) | 4h | SEO on-page | P2 |

---

## 4. ROADMAP — Phases

### Phase 1 : Récupération rapide (semaine 1-2)

> Actions en cours / prêtes à envoyer. Cash immédiat.

- [ ] Envoyer relance paiements échoués (3 users chauds)
- [ ] Relance Anoli Lodges (email perso B2B)
- [ ] Activer MOLLIE_CART_RECOVERY=1 (recovery continue)
- [ ] Activer le rapport de parrainage via Sheet (script Node.js)
- [ ] Faire un push win-back aux utilisateurs dormants

### Phase 2 : Optimisation funnel (semaine 3-4)

> UX tests, design tests, KPI-driven.

- [ ] **A/B test : redesign GP** — hypothèse : le problème GP est culturel (marin/pêcheurs) vs MQ (tourisme). Tester angles différents.
- [ ] **Tracking email opens/clicks** — savoir ce qui marche
- [ ] **Analyser les 186 lead MQ qui n'ont pas payé** — où dropent-ils ?
- [ ] **Optimiser le paywall USD** — test A/B sur la page de prix (montants, devise, confiance)
- [ ] **Créer la 1re scène SVG hero de région** (Punta Cana, plage de Bavaro)

### Phase 3 : Infrastructure et scale (mois 2-3)

> Nouveaux marchés, nouveaux actifs, automation.

- [ ] **Mettre en ligne Barbados** (câbler Mollie, purger Stripe, déployer)
- [ ] **Contenu EN/ES pour MQ/GP** (créer les seo-content files manquants)
- [ ] **Network footer** sur MQ/GP → USD links
- [ ] **Pipeline vidéo brief plage** en prod (YouTube Shorts quotidiens)
- [ ] **Débloquer stratégie B2B USD** (enrichir contacts hôtels, i18n outreach)

### Phase 4 : Croissance (mois 4-6)

> Cap vers €500/mois MRR.

- [ ] **B2C monthly subscription Mollie** (si les données justifient la demande)
- [ ] **Parrainage fully operational** (boucle fermée, visible dans l'app)
- [ ] **Widget B2B visible** (espace pro + landing)
- [ ] **SEO : 300+ pages générées** (toutes régions × toutes langues)
- [ ] **Scène SVG unique par plage** (portfolio plages)
- [ ] **A/B tests permanents** (au moins 3 en permanence)

---

## 5. MÉTHODE DE TRAVAIL

### Gated by data, pas par intuition

Chaque décision suit ce cycle :
1. **Analyser** les données existantes (sheet, analytics, daily-metrics)
2. **Hypothèse** → objectif KPI chiffré
3. **Build** → minimal (SVG, code, email)
4. **Test** → A/B flag, rollout progressif
5. **Mesurer** → verdict data
6. **Itérer ou abandonner**

### Assets visuels : 100% originaux

- **SVG = notre médium**. Pas de photos stock, pas d'IA
- **Scène = Le Veilleur + mer golden-hour + bateau local**
- **Vidéo = pipeline local gratuit** (ffmpeg calques SVG → mp4 9:16)
- **1 asset/semaine minimum** en prod

### Workflow éditorial

- Le contenu vidéo/SEO suit le cycle `daily-copernicus.yml`
- Les assets SVG sont versionnés dans `design/` puis intégrés dans `src/`
- Tout nouvel actif passe le Gate de ship (bundle budget, smoke test)

---

## 6. PROCHAINE ACTION IMMÉDIATE

La priorité absolue = **envoyer les relances préparées** :

1. `recover-failed-payments.cjs --send` (3 emails)
2. Préparer relance Anoli Lodges
3. Activer `MOLLIE_CART_RECOVERY=1`
4. Script parrainage via Sheet direct

On commence dès ta validation.
