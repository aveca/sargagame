# GROWTH-SEO-STRATEGY — Réseau Sargasses/Sargassum (5 domaines)

> Généré 2026-06-28 par orchestration multi-agents (analystes SEO + data + maillage + netlinking),
> **grounded sur la donnée GSC réelle** (`audit-full.json`, 188+219+54+43+202 requêtes/site).
> Objectif fondateur : **être #1 et faire ×10** sur la longue traîne ET les têtes de requêtes,
> **en automatisé** (GitHub Actions), sans interaction. Artefacts machine : `scripts/automation/data/seo-growth/`.

## Thèse

Le playbook est **déjà prouvé côté FR** : `sargasses-martinique.com` est pos ~1.7–3 sur « sargasse martinique
en temps réel » et **convertit à 21,7 % de CTR** sur sa home (+15 pts vs la courbe attendue à sa position).
Ce n'est pas de la chance — c'est de l'**autorité + un intent-match parfait**. **Le ×10 n'est PAS dans les
têtes FR matures** (quasi-saturées) : il est dans les **sites EN/ES**, coincés en *striking-distance purgatory*
(Florida pos 21.7, Punta Cana 13.4, Cancún 51) sur une **demande réelle et quasi-inexploitée** — le pool
espagnol « sargazo » seul = **202 requêtes presque toutes à zéro clic**.

Le vecteur agressif **défendable** : du **programmatique adossé à la donnée live unique** (Beach Score +
statut + prévision 7 j par plage, rafraîchis 4×/j). C'est ce que les concurrents statiques (NOAA/USF,
blogs) ne peuvent pas suivre — donc volume massif **sans** être thin, et **sans risquer une pénalité** qui
tuerait les sites FR rentables (l'asymétrie de risque qui borne notre agressivité).

## Modèle ×10 (honnête, chiffré)

Le ×10 est un **multiple réseau sur EN/ES**, pas sur les têtes FR. Trois leviers qui se composent :

1. **Striking-distance** (l'allumage) — remonter les pages EN/ES existantes (Florida 21.7→3, PuntaCana 13.4→3,
   Cancún 51→~10) fait passer le CTR de ~0,5–1 % à ~5–12 % = **6–12× sur les mêmes impressions**. Gros en %,
   petit en absolu aujourd'hui : c'est l'ignition, pas le moteur.
2. **Nouvelle offre d'impressions** (le moteur réel) — pages programmatiques longue-traîne : ~12 plages × 3
   régions EN/ES × ~4 templates d'intention (today/season/best/this-week) + cluster info ES « sargazo » ≈
   **150–300 pages**. Si 60 % atteignent le top-10 (crédible : concurrence institutionnelle faible + données
   live uniques) à ~120 impr/page/mois et ~5 % CTR ≈ **~900+ clics/mois incrémentaux** sur une base EN/ES
   actuelle de quelques dizaines. **C'est le gros du ×10.**
3. **Transfert d'autorité + backlinks** — liens internes depuis les pages FN FR gagnantes + hreflang sœurs
   relèvent le ranking EN/ES de quelques positions ; dans la zone raide de la courbe (pos 8→4) ça **double**
   encore le CTR. Les backlinks accélèrent l'indexation et défendent les gains.

**Ce qui peut faire échouer (honnête)** : (a) latence d'indexation (le flood peut prendre des semaines →
×10 au-delà de 90 j) ; (b) pages thin filtrées si la différenciation data n'est pas *visible* par page
(mitigé : Score + forecast par plage = contenu unique) ; (c) saisonnalité (pic avr–sep ; lancer en basse
saison réduit le pool) ; (d) cannibalisation today/this-week (mitigé : scanner cannibalization) ; (e) base
actuelle bruitée (petit n). **Plancher réaliste si 2-3 mordent : ×3–5. Plafond si on bat la courbe comme MQ : >×10.**

## Plan par site

| Site | État | Grands moves | Mots-clés cibles |
|------|------|--------------|------------------|
| **sargasses-martinique.com** (FR, ancre mature) | pos 1.7–4 têtes | défendre têtes ; longue-traîne communes ; carte/meteo temps réel | `sargasse martinique` 3.5→1 · `meteo sargasse martinique` 2.7→1 · `sargasse [commune] martinique` (pages neuves) |
| **sargasses-guadeloupe.com** (FR, ancre mature) | pos 2.6–4.6 ; **GSC query-map vide** à corriger | longue-traîne communes ; meilleures plages | `sargasses guadeloupe` 4.6→top3 · `sargasses [commune] guadeloupe` · `meteo sargasses guadeloupe` |
| **sargassummiami.com** (EN, Floride — la voie ×10 la plus claire) | pos 6–25, ~0 clic | porter les archétypes FR ; villes satellites ; questions | `sargassum miami today` 21.7→top3 · `south beach/key west/fort lauderdale today` · `is there seaweed in miami right now` |
| **sargassumpuntacana.com** (EN+ES, Rép. Dom.) | pos 9–50 | today/right-now ; ES `sargazo hoy` ; plages | `sargassum punta cana today` 13.4→top3 · `sargazo punta cana hoy` · `bavaro/macao/cap cana today` |
| **sargassumcancun.com** (ES-primary, Cancún/Riviera Maya — **plus gros pool**) | pos 8–65, 202 req. ES quasi 0 clic | flood ES `sargazo` ; villes ; sécurité | `sargazo cancun hoy` 51→top5 · `sargazo playa del carmen/tulum hoy` · `mejores playas sin sargazo riviera maya` · `pronóstico/temporada sargazo 2026` |

## Roadmap 90 jours

- **Phase 0 — Instrumenter & débloquer** (S1) : corriger le trou de couverture GSC GP/EN-ES (query-maps vides
  = on ne peut pas optimiser ce qu'on ne voit pas) ; titres/meta EN/ES avec **date live + nb de plages propres
  du jour** (le plus gros levier CTR sur l'intention « today/hoy ») ; soumettre toutes les URLs EN/ES +
  plages via `seo-submit-urls.cjs` + `submit-indexnow.cjs` ; **de-orphan** `sargassumcancun.com/sargazo-salud-riesgos/`
  (pos 8.1, **0 clic capté** — trafic top-10 gratuit dès qu'il est maillé).
- **Phase 1 — Lift striking-distance EN/ES** (S2-5) : porter les archétypes FR (season/best/this-week) en
  vraies pages sur Florida/PuntaCana/Cancún ; câbler le **maillage d'autorité inter-sites** (FR→EN/ES) dans
  les templates en un build.
- **Phase 2 — Flood longue-traîne programmatique** (S5-9) : pages `today`/question/sécurité par plage et par
  ville (Miami Beach, Bávaro/Macao/Cap Cana, Cancún/Playa del Carmen/Tulum), adossées à la plage trackée la
  plus proche ; pages-questions FAQ-schema (« is there sargassum… / porque hay sargazo / es peligroso »).
- **Phase 3 — Composer l'autorité & récolter la conversion** (S9-13) : netlinking curé (80 prospects,
  `backlink-prospects.json`) ; widget embeddable + rapport data hebdo (link-bait) ; harvest conversion
  PASS sur le trafic EN/ES.

## KPIs (mesurables via GSC/GA4, automatisés)

1. **Clics organiques réseau/mois** (GSC), **segmentés FR / EN / ES** — la cible ×10 vit sur EN+ES.
2. **Position moyenne** têtes par site (`seo-position-tracker.cjs`) : Florida 21.7→≤3, PuntaCana 13.4→≤3,
   Cancún 51→≤10, sargazo-salud 8.1→≤5.
3. **Nb de requêtes EN/ES avec ≥1 clic/mois** (dé-zéroter le pool « sargazo » 202).
4. **Pages indexées/domaine** (GSC Coverage) — suivre que le flood est *crawlé*, pas juste *buildé*.
5. **Écart CTR vs courbe attendue** par page top-10 (`seo-ctr-diagnostic.cjs`) — répliquer le +15 pts de MQ.
6. **Nb de pages striking-distance** (pos 4-15) qui montent en top-3, semaine/semaine.
7. **Part de clics longue-traîne** (% hors top-10 têtes) — prouve que la traîne tire.
8. **Conversion organique → PASS** par site (GA4 + Mollie) — le trafic qui ne convertit pas est vanité.
9. **Compteurs orphelines + cannibalisation** → doivent tendre vers ~0 à mesure que le volume monte.

## Netlinking (80 prospects curés, réels)

Par marché (`backlink-prospects.json`) : DMO/offices de tourisme (Visit Florida, Miami&Beaches, fla-keys,
DMO Punta Cana, Quintana Roo), municipalités (miamibeachfl.gov, miamidade.gov/seaweed), médias locaux
(Local10, WSVN, NBC6), groupes hôteliers, agrégateurs météo/plage, forums voyageurs.
**Angle value-first** (jamais une mendicité de lien) : on offre une **ressource gratuite, toujours à jour,
citable** — widget live embeddable (iframe 1 ligne, auto-refresh 4×/j), **rapport sargasses hebdo** que
journalistes/DMO peuvent citer, **kit presse/data** (méthodo Copernicus/NOAA AFAI + backtests par régime).
Envoi **progressif et sûr** (faible volume/run, dédup à vie, List-Unsubscribe, depuis le domaine réchauffé)
pour **ne pas cramer la délivrabilité**.

## Garde-fous

- **Ne JAMAIS faire ce qui tue les sites FR** : pas de doorway thin dupliqué, pas de link-scheme, pas de
  cloaking. L'agressivité passe par le **volume data-backed** + la **vélocité d'indexation** + le **maillage**.
- **Honnêteté** : zéro chiffre/témoignage inventé ; fiabilité par régime ; placeholders live remplis au build.
- **Pipeline live** : l'engine **génère du contenu/maillage et ouvre des PR / commit** ; il ne touche ni au
  paiement, ni aux envois en mode `--send` non-autorisés. CI verte avant tout merge.
