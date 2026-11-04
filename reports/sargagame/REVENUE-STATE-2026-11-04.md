# SARGASSES — État de vérité revenue (2026-11-04)

> Source : audits en lecture seule (réconciliation API Mollie — instantané local
> `reconcile-sales.json` (`mode: LIVE`, `generatedAt: 2026-11-04T06:45:00Z`),
> Supabase `analytics_events` en agrégation, code des surfaces publiées) + correctifs
> appliqués sur la branche `revenue/offres-durees-prix-coherence-20261104`.
> **Aucune donnée personnelle, aucun identifiant de paiement et aucun hash d'email ne
> figure dans ce rapport.** L'instantané de réconciliation, lui, en contient : il est
> désormais **hors du dépôt public** (retiré du dépôt et ajouté au `.gitignore` par
> la PR #1259, mergée le 2026-11-04 — `c4f9821d`).
> Rien n'est déclaré « rentable » : les données commerciales sont trop faibles pour
> conclure sur la rentabilité d'une offre.

---

## 1. Architecture d'offre validée

### B2C — gratuit + passs à durée fixe (paiement unique, aucun abonnement)

| Offre | Zone EUR | Zone USD | Durée | Rôle |
|---|---:|---:|---:|---|
| Verdict gratuit (carte, fiche plage, alerte transactionnelle) | 0 € | 0 $ | — | Entrée du tunnel |
| **Pass 30 jours** | **14,99 €** | 11,99 $ (+15 % de juin à nov. → 13,79 $) | 30 j | **Offre principale** |
| Pass 7 jours | 4,99 € | 5,99 $ | 7 j | Court séjour |
| Pass Saison | 19,99 € | *non commercialisé* | 210 j | Contre-saison / residents |

Source de vérité = le serveur : `public/api/mollie.php` (`$passPrices`), allowlist
anti-tampering `public/api/create-checkout.php` (`$ALLOWED_CENTS`), grants
`workers/sargagame/index.js` (`PASS_PRICES` / `DAYS_TABLE`). Le client a désormais un
miroir explicite : `src/lib/pricing.js` (parité verrouillée par
`tests/unit/price-parity.test.cjs`).

### B2B — widget gratuit en entrée, Pro en moteur récurrent

| Offre | Prix | Note |
|---|---:|---|
| Widget / veille publique | 0 € | Point d'entrée, hook sans carte |
| **Pro** | **79 €/mois** ou **690 €/an** | Moteur récurrent principal (décision fondateur 2026-06-29) |
| Brief | 29 €/mois ou 290 €/an | Palier d'entrée / leurre assumé |
| Territoire | dès 199 €/mois HT (1 990 €/an) | Multi-plages + API + widget public, **pas de paylink carte** (sur devis) |

Essai 30 jours sans carte, instantané et self-serve (`/api/b2b-trial.php`).

---

## 2. Vérité revenue (constatée, pas supposée)

Source : instantané de réconciliation API Mollie en lecture seule (`mode: LIVE`,
`generatedAt: 2026-11-04T06:45:00Z`, profil de production). Cet instantané contient
des identifiants de paiement et des hashes d'email : il est **hors du dépôt public**
depuis la PR #1259 (`c4f9821d`) et n'est reproduit ici qu'agrégé.

| Indicateur | Valeur |
|---|---:|
| Paiements créés (30 j glissants du fichier de réconciliation) | 147 |
| **Paiements RÉELS encaissés (`paid`)** | **6** |
| Refunds | **0** |
| Encaissement brut | **56,94** (38,96 € + 17,98 $) |
| Paiements expirés / annulés / échoués | 129 / 9 / 3 |
| Paiements de test exclus | 0 |
| **Premier encaissement** | 2026-06-28 |
| **Dernier encaissement** | **2026-07-19** |

Conséquences, sans interprétation :

1. **Aucun encaissement depuis le 19/07/2026** — soit ~3,5 mois sans revenu B2C,
   alors que le tunnel affiche des milliers de vues d'offre.
2. **Les 6 paiements sont des `paid_no_grant`** : aucun accès n'a été enregistré dans
   `payment_grants` (les 3 lignes présentes sont toutes `b2c_pass` et ne correspondent
   à aucun de ces paiements). Le client a payé **sans** recevoir son accès.
   La ré-accusation des accès est une **écriture en production** → autorisation requise.
3. **6 encaissements ne permettent pas de conclure** sur la rentabilité d'un pass, d'un
   prix ou d'une source de trafic. Le seuil de décision reste : pas de campagne payante,
   pas de changement de prix sur cette base.

### B2B

`b2b_subscriptions` : **0 ligne**. Aucun abonnement B2B n'a jamais été créé.
`b2b_leads` : 21 enregistrements (20 `contacted`, 1 `new`), le dernier du 2026-10-05.
Aucun MRR, aucun churn mesurable : le moteur récurrent n'a pas encore de base.

---

## 3. Funnel — census et limites de mesure

Agrégation lecture seule de `public.analytics_events` sur 30 jours (2026-11-04).
Ce sont des **lignes d'événements**, pas des personnes uniques.

| Événement | Lignes | Dernière observée |
|---|---:|---|
| `sg_premium_modal_open` | 3 479 | 2026-11-04 |
| `sg_pass_offer_view` | 3 324 | 2026-11-04 |
| `sg_pass_cta` | 34 | 2026-10-29 |
| `sg_checkout_started` | 5 | 2026-10-28 |
| `sg_checkout_redirect` | 30 | 2026-10-30 |
| `sg_conversion` | 23 | 2026-10-30 |
| `sg_b2b_offer_view` | 101 | — |
| `sg_b2b_step` | 31 | 2026-10-29 |
| `sg_lead_banner_view` / `submit` | 714 / 1 | 2026-10-07 / 2026-10-05 |

**Limites (à ne pas contourner) :**

- La clé de session n'est présente que dans 22 des 3 324 lignes `sg_pass_offer_view` et
  dans 0 des 34 `sg_pass_cta` → **aucun taux de conversion fiable** ne peut être calculé.
- Les 23 `sg_conversion` ne sont pas une cohorte homogène (14 `p30`, 9 `sos`) : ce ne
  sont pas des achats du PassOffer affiché.
- `sg_demo_open` / `sg_offer_view` : 0 ligne ; `scripts/automation/data/daily-metrics.json`
  s'arrête au 2026-10-21 → l'instrumentation secondaire est aveugle, cause non établie.
- `payments_real` issu du Google Apps Script est connu comme trompeur (champ Stripe
  dominant mais périmé) → **seule** la réconciliation Mollie fait foi.

Tunnel cible B2C (étapes à instrumenter dans cet ordre) :
`plage → verdict → intention → durée → offre → checkout → confirmation → alertes`.
La nouvelle étape **durée** est désormais câblée : `?pass=p30|trip7|season` présélectionne
le pass dans le paywall (`src/PremiumModal.jsx` → `resolvePass`).

---

## 4. Divergences affichage / débit — trouvées et corrigées

| # | Divergence constatée | Où | Correction appliquée | Preuve |
|---|---|---|---|---|
| D1 | « 7,99 € (7 j) » affiché, **4,99 €** débité | `/offres/` | Prix aligné sur le serveur (4,99 €) | `price-parity.test.cjs` §7 |
| D2 | « 24,99 € (saison) » affiché, **19,99 €** débité | `/offres/` | 19,99 € + « 210 jours » | idem |
| D3 | CTA `/offres/` sans paramètre → ouvrait **p30 (30 j)** au lieu du pass choisi | `/offres/` | `?pass=p30|trip7|season` | idem |
| D4 | « 4,99 €/mois » + « S'abonner » annoncés, **14,99 € one-time** débités | `/premium/` | Page régénérée depuis `scripts/lib/premium-page.cjs` : catalogue de passes, plus d'abonnement | idem §7 |
| D5 | 11,99 $ affiché, **13,79 $** débité (surcharge USD +15 %, juin→nov.) | `PassOffer` | Client envoie la **base**, affiche l'**effectif** ; bandeau explicite | `src/lib/pricing.js`, §8 |
| D6 | CGV : 7,99 € / 24,99 € / 19,99 $ (saison en USD) | `public/cgv.html` | 4,99 € / 19,99 € + clause +15 % USD + saison non vendue en USD | idem §7 |
| D7 | « dès 7,99 € » (prix d'entrée) sur 7 surfaces | a-propos, about, veilleur, HomeAZ, HomeJuicy, VerticalesMap, PremiumModal | « dès 4,99 € » = plus bas prix réellement débité | idem §7 |
| D8 | Clé serveur `saison` (invalide) au lieu de `season` ; centimes EUR en dur | PR #1258 (supersédé) | `resolvePass` + `passBaseCents` | `price-parity.test.cjs` §8 |
| D9 | Template de config documentant `p7` (799) et un abonnement B2C fantôme 4,99 €/mois | `public/api/mollie-config.example.php` | `season` documenté, `p7` et l'abonnement fantôme retirés | idem §11 |

**Aucun prix serveur n'a été modifié.** Les allowlists (`mollie.php`, `create-checkout.php`),
les grants (`workers/sargagame`) et les prix Mollie sont inchangés : la correction porte
sur ce qui est **affiché** et sur ce qui est **envoyé** par le client.

---

## 5. P0 trouvé et corrigé : l'essai B2B 30 jours était mort

`public/api/b2b-trial.php` appelait `sg_analytics_event()`, **fonction supprimée de
`public/api/mollie-lib.php` par le commit `16eb15e12c`**. En PHP, l'appel d'une fonction
inexistante est une **Error fatale** — le `@` ne la supprime pas. Conséquence :
l'endpoint d'essai renvoyait une erreur **avant de rendre le token** → l'essai
« instantané » n'était jamais activé, l'événement de funnel `b2b_trial_started`
n'arrivait jamais, et l'hôtelier retombait sur un message « on vous recontacte sous 24 h »
sans personne derrière.

**Preuve ( harnais local, aucune écriture en production )** :
copie de l'endpoint dans un dossier temporaire, sortie Apps Script + Supabase redirigée
vers un sink local, stubs `curl` (PHP local sans extension curl).

- Version commitée (avant correctif) → `Fatal error: Uncaught Error: Call to undefined
  function sg_analytics_event()` en `b2b-trial.php:95`, **aucun JSON, aucun token**.
- Version corrigée → `{"ok":true,"token":"…","days":30}`.

**Correctif :** `sg_analytics_event()` restaurée dans `mollie-lib.php` (fire-and-forget
vers `analytics_events`, clé publique, sans PII) + garde `function_exists()` sur chaque
appel + l'essai est désormais rendu **avant** l'émission de la télémétrie.
Verrouillage : `tests/unit/b2b-trial-consent.test.cjs`.

**Résiduel non traité volontairement :** `mol_b2b_trial_email()` (l'email transactionnel
qui doit livrer le lien d'accès) a été supprimé **par le même commit** et n'existe plus
dans le dépôt → l'email de l'essai **n'est pas envoyé** aujourd'hui, alors que l'IHM
l'annonce (« on vient aussi de vous l'envoyer par email »). Le restaurer change le
comportement d'email client → **autorisation explicite requise** (le code d'origine est
récupérable : commit `af8408e4`).

### Consentement marketing (ajouté, sans toucher aux envois)

- Case **optionnelle, jamais pré-cochée** (`useState(false)`, `checked` piloté).
- Stocké avec **version + horodatage + source** (`consent_v = 2026-11-04`, `consent_ts`,
  `consent_source`) dans le payload du lead et dans l'événement `b2b_marketing_consent`.
- L'essai reste **transactionnel** : l'endpoint n'envoie que l'email d'essai et ne
  déclenche **aucune** campagne. Aucun envoi de masse n'est autorisé sans audit
  préalable (historique d'envoi, désinscription, preuve de consentement).

---

## 6. Instrumentation réelle — état après correctif

| Mesure | État |
|---|---|
| `sg_price_mismatch` (écart affiché/débité) | **nouveau** : le serveur renvoie le montant effectif (`amount` dans la réponse `create_payment`), le client compare et trace l'écart |
| `sg_b2b_trial_started` | restauré (la fonction qui le porte n'existait plus) |
| `sg_b2b_marketing_consent` | nouveau (opt-in explicite, versionné) |
| `sg_pass_cta` / `sg_pass_offer_view` | enrichis (`pass`, `base_cents`, `cents` effectif) |
| Session key / corrélation de parcours | **absente** → pas de taux de conversion calculable (à traiter) |
| `daily-metrics.json` | figé au 2026-10-21 (cause inconnue) |

---

## 7. Résiduel documenté (non réécrit : hors périmètre ou autorisation requise)

| # | Résiduel | Pourquoi pas corrigé ici |
|---|---|---|
| R1 | Allowlist Stripe EUR de `create-checkout.php` : `799` et `2499` (et `999`) encore acceptés | Chemin **latent** (atteignable seulement via `?pay=stripe`), aucun prix affiché ne correspond. Retirer des montants acceptés = modification d'un chemin de paiement → autorisation requise. **Aucun prix vivant n'est rejeté** (499 / 1499 / 1999 présents). |
| R2 | Paywall d'abonnement **legacy** (4,99 €/mois + 49 €/an) encore présent dans `WorldPaywall` / `ComicPaywall` | Visible seulement dans les régions en `PAY_CAPTURE_ONLY` (barbados/tulum) ou via `?pwpass=0` → pas une surface B2C EUR/GP atteignable. Réécriture = refonte, pas un correctif de prix. |
| R3 | `public/api/mollie-passlinks.json` : liens `p7_*` orphelins (7,99 € / 5,99 $) | Paylinks historiques hors catalogue affiché ; plus aucun code ne les lit pour un achat. |
| R4 | Clés i18n mortes `premiumPrice` (« 4,99 €/mois ») dans `Sargasses_PROD.jsx` | Non rendues sur les surfaces publiques actuelles. |
| R5 | `public/themes-lab/*` (maquettes) | Hors production. |
| R6 | Bascule de mois serveur/navigateur autour du 1er juin et du 1er décembre | La surcharge USD est calculée par le serveur (fuseau serveur) alors que l'affichage suit le navigateur. Fenêtre de quelques jours par an. **Désormais mesuré** (`sg_price_mismatch`) au lieu d'être invisible ; correction durable = endpoint de prix serveur (non ajouté ici). |
| R7 | 6/6 paiements payés sans accès (`paid_no_grant`) | Ré-accusation = écriture en production + le correctif racine (alias `p7`) élargirait les montants acceptés → autorisation + arbitrage prix. |
| R8 | `mol_b2b_trial_email()` absent → email de l'essai non envoyé | Changement d'email client → autorisation requise. |
| R9 | `b2b_subscriptions` vide, `sg_b2b_trial_activated` jamais observé | Conséquence du P0 §5 : le tunnel B2B n'a jamais pu s'activer. |

---

## 8. Trois prochaines actions (classées : potentiel de revenu × preuve × effort)

### 1) Déployer le correctif P0 B2B et prouver l'activation d'un essai
**Potentiel : élevé** (le moteur récurrent Pro n'a jamais produit une seule activation) ·
**Preuve : forte** (E2E local reproduit le fatal et sa disparition) · **Effort : faible**
(déploiement FTP des fichiers `public/api/` + 1 essai réel autorisé).
À faire **avec** l'autorisation de restaurer l'email transactionnel (§5 R8), sinon l'hôtelier
reste sans accès par email.

### 2) Fermer la boucle « payé → accès » (les 6 `paid_no_grant`)
**Potentiel : élevé** (6 clients ont payé sans service ; le taux de remboursement est
actuellement de 0/6, ce qui est un risque juridique et réputationnel) ·
**Preuve : forte** (réconciliation Mollie + table `payment_grants`) · **Effort : moyen**
(écriture en production + correctif racine à arbitrer : l'alias `p7` historique).
Décision fondateur requise : ré-accuser manuellement les 6, ou assumer.

### 3) Rétablir un taux de conversion mesurable (session key + funnel checkout)
**Potentiel : moyen** (sans session key, aucune optimisation CRO n'est prouvable ;
actuellement 3 324 vues d'offre → 34 CTA → 6 encaissements sur 3,5 mois) ·
**Preuve : forte** (census §3) · **Effort : moyen** (session id first-party, respect du
consentement, jamais d'empreinte).

---

## 9. Journal de preuves techniques (branche `revenue/offres-durees-prix-coherence-20261104`)

| Contrôle | Résultat |
|---|---|
| `node tests/unit/price-parity.test.cjs` | PASS (11 sections, parité des 6 sources de prix) |
| `node tests/unit/pass-offer-copy.test.cjs` | PASS (contrat de prix désormais porté par `src/lib/pricing.js`) |
| `node tests/unit/b2b-trial-consent.test.cjs` | PASS (fonction de télémétrie + consentement) |
| `php -l` sur `mollie.php`, `mollie-lib.php`, `b2b-trial.php`, `mollie-config.example.php` | OK |
| E2E local `b2b-trial.php` (sink local) | 500 fatale avant → 200 + token après |
| `npm run build` | OK |
| `node scripts/check-bundle-budget.cjs` | **206,6 Ko ≤ 210 Ko** (base : 210,0 Ko) — l'import mort de `PassOffer` dans `Sargasses_PROD.jsx` tirait le module de prix dans le chunk eager ; supprimé |
| `npm test` | voir §10 |

### §10 — CI / PR / déploiement

#### Identifiants

| Élément | Valeur |
|---|---|
| Branche | `revenue/offres-durees-prix-coherence-20261104` |
| Commit | `f899da28` (rebased sur `main` = `c4f9821d`, PR #1259) |
| **PR mergée** | **#1264** → `22ff4d8b3228778a384ae4763707576fc3f30b4b` (mergée le 2026-11-04T11:04:48Z) |
| PR initiale (abandonnée) | #1263 — fermée : GitHub lie une PR au SHA d'origine et refuse de la rouvrir après un force-push (« state cannot be changed… branch was force-pushed »). Le contenu a été repris à l'identique dans #1264. |
| PR #1259 (sécurité, mergée avant) | `c4f9821d` — retire les artefacts financiers/contact du dépôt public |
| PRs fermées comme supersédées | #1254 (spec 3 abonnements B2C mensuels), #1258 (clé `saison` + centimes en dur + CI rouge), #1260 (supersédée par #1259) |

#### CI sur le SHA exact

| Run | ID | Résultat |
|---|---|---|
| CI Tests (PR) | `41817769459` | **PASS** (`test-frontend`) |
| Perf Budget + Lighthouse (PR) | `41817769356` | **PASS** (`perf`, `lighthouse-report`) |
| GitGuardian | — | PASS |
| CI Tests (push `main`) | `41818452440` | **PASS** |
| Perf Budget + Lighthouse (push `main`) | `41818452517` | **PASS** |
| Daily Copernicus + Deploy (push `main`) | `41818452572` | **PASS** |

`npm test` local sur le même contenu : **141/141 fichier(s) de test OK** (le fichier
`tests/unit/financial-artifact-privacy.test.cjs` de #1259 s'ajoute aux 140 de la
branche). Le correctif CRLF du test `morning-brief-freshness` rend la suite portable
Windows/Linux (l'échec existait **aussi** sur `origin/main`).

#### Déploiement — BLOQUÉ par une garde de fraîcheur (pré-existante, diagnose complète)

| Élément | Valeur |
|---|---|
| Run de déploiement | `41818452612` (Cloudflare Production, SHA `22ff4d8b`) → **FAILURE** |
| Étape en échec | `Pre-deploy satellite freshness gate (all six regions)` |
| Message | `FAIL SATELLITE_PREDEPLOY region=puntacana limit=900min reason=observation hors SLA (2825.20 min > 900 min)` |
| Étapes non atteintes | `certification-gate` → `deploy` → `deploy-pages` → `verify-fleet` → `post-deploy-verify` (jamais exécutées) |

**Ce n'est pas une régression du correctif de prix.** La même garde a fait échouer
**20 déploiements consécutifs** du 2026-11-03T00:50Z au 2026-11-04T11:04Z, y compris
des SHAs qui ne contiennent **aucun** changement de cette branche :

| Run | SHA | Région signalée | Âge de l'observation |
|---|---|---|---|
| `41790290141` | `ec49b167` (main **avant** cette branche) | florida | 2 590 min |
| `41816656514` | `c4f9821d` (PR #1259) | rivieramaya | 2 809 min |
| `41818452612` | `22ff4d8b` (**cette** branche) | puntacana | 2 825 min |

**Cause racine, mesurée sur l'upstream.** Le payload Copernicus engage dans le dépôt
porte `erddapTimestamp = 2026-11-02T12:00:00Z`. Interrogation directe de l'upstream
NOAA (`noaa_aoml_atlantic_oceanwatch_AFAI_7D` et `_1D`) le 2026-11-04T11:10Z :

| Dataset | Dernière observation | Âge | Verdict SLA 900 min |
|---|---|---|---|
| AFAI 7D | `2026-11-03T12:00:00Z` | 1 390 min (23,2 h) | HORS SLA |
| AFAI 1D | `2026-11-03T12:00:00Z` | 1 390 min (23,2 h) | HORS SLA |

Les 6 régions partagent la même grille globale NOAA. L'historique git du payload
commité confirme une cadence **d'une grille par jour, horodatée 12:00:00Z**
(24/10 → 25/10 → 26/10 → 27/10 → 29/10 → 02/11 → 03/11).

**Conséquence structurelle :** une publication **quotidienne** à 12:00Z ne peut pas
satisfaire une SLA de **900 min (15 h)** en permanence — l'âge de la dernière
observation balaie 0 h → 24 h dans la journée. La fenêtre où la garde passe est donc
**00:00Z → 03:00Z** (3 h/jour), et encore faut-il que la grille du jour soit déjà
publiée. Le cron `0 0 * * *` tombe dedans (le run du 2026-11-03T00:50Z a bien publié
`erddapTimestamp = 2026-11-02T12:00:00Z`, `dataAgeMinutes = 771`) ; les crons
`0 6`, `0 12`, `0 18` et tous les runs `push` tombent **dehors**.

**Pourquoi le pipeline ne rattrape pas.** Dans `daily-copernicus.yml`, le job
`fetch-data` (seul à rafraîchir **et publier** le payload) est conditionné à
`if: github.event_name != 'push'` → sur un push il est **skipped**. Sur `schedule` il
s'exécute mais se termine en `Copernicus publication status is BLOCKED_STALE_SOURCE`
(runs `41780985819` du 05:43Z et `41736428821` du 23:06Z) : la même SLA de 900 min
appliquée à la source. Résultat : le payload reste figé, la garde refuse, et le cycle
se répète depuis 2 jours.

**Chemin de déblocage honnête (aucun affaiblissement de la vérité produit).**
1. Attendre la publication de la grille NOAA suivante (le `2026-11-04T12:00:00Z` est
   attendu ; à 12:00Z l'âge repart de ~0 et la fenêtre SLA rouvre).
2. Re-dispatcher `Daily Copernicus + Deploy` (`workflow_dispatch`) : `fetch-data`
   s'exécute alors, publie le payload frais sur `main`, et le `push` résultant
   déclenche `CI Tests` → `Perf Budget` → `Cloudflare Production` sur le SHA exact.
3. Vérifier `deploy` + `deploy-pages` + `verify-fleet` + `post-deploy-verify`, puis
   relire en production les surfaces corrigées (`/offres/`, `/premium/`, CGV).

**Ce qui n'a PAS été fait, volontairement.** La SLA de 900 min n'a **pas** été
abaissée et la garde n'a **pas** été contournée : une SLA relâchée rendrait possible
d'afficher « propre aujourd'hui » sur une observation de 24 h, ce que le produit
refuse explicitement. Changer la SLA ou le rythme du cron est une **décision
produit** (fenêtre de vérité), pas un correctif technique : elle est laissée à la
validation du fondateur, avec l'option triviale de décaler le cron `0 0/0 6/0 12/0 18`
vers la fenêtre 00:00Z–03:00Z.

#### État de la production au moment de la rédaction

`https://sargasses-martinique.com/` sert encore le **build précédent** (chunk eager
`assets/index-cLn0Pipx.js`, `version.json` = `{"v":"v221","date":"2026-10-12","b":"df18df5d"}`).
Contrôle en production des surfaces corrigées :

| Surface | `4,99 €` | `7,99 €` | `14,99 €` | `19,99 €` | `24,99 €` | `/mois` | `?pass=` |
|---|---|---|---|---|---|---|---|
| `/offres/` (live) | oui | **oui** | oui | non | **oui** | non | **non** |
| `/premium/` (live) | oui | non | oui | non | non | **oui** | non |

→ les divergences D1/D2/D3/D4 sont **bien présentes en production** et seront
corrigées dès que le déploiement passera la porte. `/api/mollie.php` répond `405` en
GET (POST-only, inchangé) et `/api/create-checkout.php` répond `404` en GET : aucune
écriture de paiement n'a été tentée pour cette vérification.

#### Rollback

`git revert 22ff4d8b` (repli du contenu) ou redéploiement d'un SHA antérieur — les
déploiements Cloudflare précédents sont conservés. Aucun changement de prix serveur,
de montant accepté, de remboursement ni d'email client n'est inclus dans ce
correctif : le rollback n'a donc aucun impact métier à défendre.
