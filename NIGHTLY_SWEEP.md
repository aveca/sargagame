# NIGHTLY_SWEEP — Correctness Sweep Ledger

> Ledger du démon nocturne autonome (CORRECTNESS SWEEP). Mémoire entre itérations.
> Statuts : `todo` · `fixed` (commit) · `handoff` (besoin décision/monolithe) · `wontfix` (réfuté/non-bug).
> Garde-fous : push seulement si build vert + smoke funnel/Stripe OK · jamais de refactor du monolithe · funnel/Stripe gated+réversible.

## État de départ (itération 1 — 2026-06-21 nuit)
- Branch `main` @ `63189eb1` · CI green · MRR €69.86 (14 actifs, 1 pastDue) · pipeline erddap-live 8.1h OK · leads 216.
- Build baseline : _en cours de vérification_.
- Shabbat : OK (dimanche), pas de conflit planning.

## Backlog trié (sévérité × confiance × risque-de-fix)

Source : audit manuel + workflow `sarga-correctness-audit` (8 bruts → 4 confirmés adverse) + ma trace indépendante.

| # | Sév | Conf | Dimension | Bug | Statut | Commit |
|---|-----|------|-----------|-----|--------|--------|
| 1 | sev-1 | 1.0 | hardcoded-live | `methodeBeats` lisait `__REL.calmRate/.highRate` (champs disparus) → `/methode-carte/` rendait **"fiabilité de undefined%"** + anneau 48px "undefined%" pour l'arm A/B `story` (~50% des visiteurs station) sur 2 domaines prod | **fixed** | `34416612` |
| 2 | sev-2 | 1.0 | dead-links | Sitemap GP exclut les pages `/pro/*` qui existent physiquement dans `guadeloupe-ftp/pro/` (gate `isGP` vite.config.js:984) → orphelines/non-découvrables | **fixed** | `6da4aa9b` |
| 3 | sev-2 | 0.92 | dead-links | Sitemap GP exclut `/a-propos/ /recherche/ /research/ /investigacion/` qui existent dans `guadeloupe-ftp/` avec canonical self-GP (vite.config.js:994-997) | **fixed** | `6da4aa9b` |
| 4 | sev-3 | 0.85 | hardcoded-live | `src/ArenaOnboarding.jsx:33` hardcode `fiabilité ~79%` (fr/en/es, rendu l.150) au lieu de lire `__REL` ; QA-only (`showArenaOnb` défaut false, `?onb=1`). Fix = retirer le chiffre figé (qualitatif honnête) | **fixed** | `919bf762` |
| 5 | sev-3 | 0.85 | json-integrity | `levels.status` (satellite brut, ex. diamant/gp-caravelle = clean) ≠ `weekly.forecast[0].status` (satellite+community = moderate). Tracé `forecast.cjs:359-392` = **séparation INTENTIONNELLE** (community bias appliqué au weekly seulement). Cohérent avec décision S3 "NE PAS TOUCHER LE MODÈLE" | **wontfix** (intentionnel) | — |

**Garde-fou #2/#3** : avant de toucher le générateur de sitemap (impacte 5 domaines), VÉRIFIER que les fichiers GP déployés canonical bien vers **GP-self** (et non cross-domain→MQ) ; sinon les ajouter au sitemap GP créerait du duplicate-content.

## Journal des itérations

### Itération 1 — 2026-06-21 (nuit)
- Startup OK (pipeline 8.1h, MRR €69.86, 14 actifs). Ledger créé. Build baseline vert.
- Audit Phase 1 (workflow 6 dim × verify adverse) → backlog ci-dessus.
- **Trace manuelle indépendante** = sev-1 `methodeBeats` (le workflow ne l'a PAS attrapé seul) : prouvé via `node` (RELIABILITY réel = `{regime:calm,cleanPct:100,...}`, pas de `.calmRate`), mappé les 12 usages `__REL.*` (les `.global` sont gardés `typeof==="number"` → dead, OK ; seuls 1015-1016 non gardés → undefined rendu), prouvé reachable (`/methode-carte/` page SEO générée+déployée, gated A/B `stations` story 50%).
- **FIX #1 shippé** (`34416612`, push main) : `methodeBeats` → `__REL.cleanPct`+`__REL.regime` (pattern canonique). Vérifié : build vert · `/methode-carte/?stations=1` rend "fiabilité de 100%…" 0 "undefined" 0 err JS · smoke comic `ERRORS=[]` · paywall+CTA intacts. Diff 4 lignes, non-funnel, réversible.
- **FIX #2+#3 shippé** (`6da4aa9b`, push main) : retiré le gate `isGP ? '' :` sur `/pro/*` (10) + `/a-propos|recherche|research|investigacion/` (4) du builder sitemap (vite.config.js). Vérifié pré-commit : canonicals GP = self-GP (pas cross→MQ), pages DIFFÈRENT de MQ (localisées GP), 14/14 fichiers existent, hreflang clusters séparés (pas de duplicate). Vérifié post-build : `dist/sitemap-guadeloupe.xml` liste les 14 (155 urls, XML équilibré), MQ sitemap inchangé (10 /pro/), gates MQ-slug intacts, 0 fuite martinique-slug. Sitemap-only, bundle byte-identique.
- ⚠️ **Session concurrente détectée** sur le monolithe (commit `7ef7209e` capture/exit-intent, landé entre mes 2 pushes, sans conflit). → je m'abstiens d'autres édits de `Sargasses_PROD.jsx` ce run (sérialisation). Le reste du backlog sûr (#4) est hors-monolithe.
- **FIX #4 shippé** (`919bf762`, push main) : `ArenaOnboarding.jsx:33` hardcode `~79%` → descriptif qualitatif honnête ("données Copernicus Marine"). Vérifié : build vert · `/?onb=1` rend la nouvelle chaîne, 0 "~79%", 0 err JS. Hors-monolithe, QA-only.

### Vérifs de clôture (risque zéro — déjà OK, NE PAS refaire)
- **Cascade SEO = TOUTE shippée** (re-validée contre le code/ftp déployé) : sitemap commune GP ✓ (+ étendu /pro/+research ce run) · dédup EN ✓ (GP `/en/sargassum-map/` canonical→**martinique.com**, GP `/en/` self) · /pro/en hub ✓ · schema Article ✓ (pages santé) · **schema /pro Service ✓ PRÉSENT** (`/pro/` + `/pro/hotels/`). Reste SEO = enhancement marginal (FAQPage dupliquée global+page sur pages santé — déprio fondateur), PAS un bug.
- **« Onglet Premium jamais surligné » = DÉJÀ RÉSOLU** : `BottomNav` l.2728/2754 `active = t.id==="premium" ? premiumOpen : view===t.id` (câblé l.14148). Pas un bug.
- **Defines build (`__REL`, `__R`)** : tous les conscommateurs lisent des champs valides (seul `methodeBeats` driftait → fixé). `__R` n'accède que `.id` (présent partout).
- **JSON-LD** : 0 malformé sur 6 pages échantillon (MQ/GP home, /pro/, /a-propos/, santé, /pro/hotels/).
- **Données honnêteté** : track-record.json bien formé/auditable · reliability.json `statusHitRate:77` cohérent sur 5 régions.
- **Runtime** : 14 routes clés = **0 erreur console/page** · 15 routes = **0 texte `undefined`/`NaN`/`null`/`${`** (classe de bug methodeBeats éliminée partout).

### Handoff (hors-scope ce run)
- **Bugs monolithe** : aucun connu en attente (methodeBeats fixé, Premium-tab déjà OK). Un nouvel audit logique profond de `Sargasses_PROD.jsx` (read-only) reste possible → fixes à faire en **session fraîche** quand la session concurrente a libéré le monolithe (cf. AUTONOMOUS_BUILD.md « 1 écran = 1 session »).
- **Décision fondateur** : les 3 régions USD (florida/puntacana/rivieramaya) affichent le hit-rate **Antilles 77%** dans `reliability.json` (afaiMAE diffère par région, donc backtest tourne, mais le 77% global vient des Antilles). Honnête ? = arbitrage moat « track record Antilles » vs claim par-région. À trancher, pas un bug net.
