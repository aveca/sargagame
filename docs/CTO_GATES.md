# CTO_GATES.md — Garde-fous permanents pour tout agent travaillant sur Sargagame

> Ce fichier fait autorité pour toute modification touchant le money-path, le
> funnel, la donnée scientifique, le moat honnêteté, le bundle, et les paiements.
> Il complète AGENTS.md (interdictions produit) et CLAUDE.md (doctrine exécution).
> En cas de conflit : AGENTS.md gagne pour les interdictions produit, CLAUDE.md
> pour les choix d'exécution, **ce fichier pour les gate de ship technique**.
>
> Tous les agents (coding, growth, ui, qa, devops, data, release) DOIVENT lire
> ce fichier avant toute modification des zones sensibles listées ci-dessous.
> Aucune PR mergeée sans respecter ces règles.

---

## G1 — Aucun paiement sans tests E2E

**Zone** : `public/api/mollie*.php`, `public/api/paypal*.php`, `public/api/create-checkout.php`, `public/api/stripe-*`, `src/PremiumModal.jsx`, `src/Sargasses_PROD.jsx` (sections paiement).

**Règle** :
- Toute nouvelle voie de paiement, statut webhook, ou branche de grant/revoke
  DOIT être couverte par un test E2E Playwright (`tests/e2e/funnel-payment.spec.ts`)
  avec un mock Mollie quirenvoie le statut concerné (`paid`, `failed`, `canceled`,
  `expired`, `authorized`, `pending`, `subscription.charge_failed`).
- Aucun merge d'un nouveau profil de paiement récurrent (`*_monthly`, `*_annual`,
  `b2c_alerts_*`, etc.) sans test E2E explicite pour `subscription.charge_failed`
  B2C ET B2B.
- Le webhook Mollie DOIT répondre `503` (et non `200`) si l'écriture miroir
  Supabase échoue — c'est l'équivalent d'une retry queue sans infra. Mollie
  re-tentera. **Ne jamais `200` si le grant serveur a échoué**.

**Anti-pattern** (vu dans le repo, à éviter) :
- Déplacer un bloc `payment.failed` dans la branche `payment` mais laisser le
  webhook répondre `200` avant le grant — si le grant lève, l'argent est perdu
  silencieusement.

---

## G2 — Aucun abonnement sans webhook stable

**Zone** : `public/api/mollie-webhook.php` (bloc `subscription`), `public/api/mollie-lib.php` (`mol_b2b_plans`, future `mol_b2c_plans`), `public/api/mollie.php` (`create_subscription`).

**Règle** :
- Aucun nouveau plan récurrent (B2C `c_monthly`/`c_annual`, B2B tiers
  intermédiaire) ne peut être ship-pé tant que le webhook ne gère pas
  **explicitement** `subscription.charge_failed` pour ce plan.
- Le webhook DOIT distinguer `pro_monthly`, `brief_monthly`, `c_monthly`,
  `c_annual` dans une allowlist — pas de branchement générique "tout
  subscription.paid grant Pro".
- Le mandat Mollie (SEPA mandate) doit être vérifié pour tout nouveau plan
  récurrent B2C (sandbox : créer abo → attendre J+30 charge → vérifier grant
  renew). **Sans test sandbox J+30, no-ship.**
- `mol_b2b_plans()` et `mol_b2c_plans()` doivent être décorrelés (deux
  fonctions séparées). Ne jamais étendre une fonction `mol_b2b_*` pour porter
  du B2C — dette architecture + reviewer involuntary scope.

**Interdit** (AGENTS.md rappel) :
- Toute migration d'abos Stripe legacy vers Mollie sans tâche release-agent
  dédiée, dry-run, et bascule progressive. **Jamais en semaine 4 d'un plan
  growth.**

---

## G3 — Aucune donnée périmée affichée

**Zone** : `public/api/copernicus/**`, `scripts/lib/forecast-gate.cjs`, `scripts/automation/fetch-sargassum-live.cjs`, tout endpoint servant du `forecast-full.json` à un payeur.

**Règle** :
- Tout endpoint servant des prévisions > 2 jours (J+3 à J+7) à un payeur DOIT
  vérifier `erddapTimestamp` et `stale` avant envoi.
- Si `stale=true` : renvoyer **HTTP 503** + corps `{"error":"erddap_unavailable","fallback":"2days"}`. Ne JAMAIS servir 7 jours de données périmées à un payeur sans signal clair côté front ("ERDDAP injoignable, prévisions limitées à 2 jours").
- Le front premium DOIT afficher le freshness (`updatedAt`, `erddapTimestamp`)
  à côté de la prévision J+7. Aucune "fausse fraîcheur".
- La copy marketing ET produit ("Prévision 14 jours", "Prévision 7 jours")
  doit coller à la donnée réellement servie. Toute discordance copy/data =
  bug P0 doctrine (moat honnêteté).

**Anti-pattern** :
- Servir `_private/forecast-full.json` via un endpoint `/api/forecast-full.php`
  sans gate staleness = enfreint le moat. Toujours wrapper derrière
  `forecast-gate.cjs`.

---

## G4 — Jamais de Push avant le paywall

**Zone** : `src/Sargasses_PROD.jsx` (service worker registration, push subscription), `public/sw.js`, `scripts/automation/push-*.cjs`, `supabase/schema.sql` (table `planner_alerts.push_subscription`).

**Règle** :
- Aucun prompt de permission Push ne peut être déclenché avant
  `localStorage.getItem("sg_premium") === "1"` (grant payeur vérifié).
- La table `push_subscription` ne doit être écrite QUE si `sg_premium=1` est
  présent. Pas de stockage d'endpoint push pour un non-payeur.
- Le permission prompt DOIT être opt-in explicite (CTA clair dans
  `WelcomePoste.jsx` ou `PaidOnboarding.jsx`), jamais automatique au load.
- Rollback `?push=0` obligatoire stocké enQueryParamètre et testé en smoke.

**Risque** (documenté) : permission fatigue tue 5-10% conversion paywall si le
prompt apparaît avant le checkout. Push = levier retention post-paiement,
jamais levier acquisition.

**VAPID** (AGENTS.md §5) :
- `VAPID_PUBLIC_KEY` peut être publique (côté client).
- `VAPID_PRIVATE_KEY` DOIT être GitHub Secret, jamais lue/affichée par un
  agent, jamais loggée. Utiliser le pattern `scripts/write-mollie-config.cjs`
  (lit `process.env`, n'expose jamais la valeur).
- `VAPID_PRIVATE_KEY=REPLACE_ME` placeholder en `.env.example`.

---

## G5 — Jamais d'UGC seul pour un client B2B

**Zone** : `scripts/automation/daily-brief.cjs`, `scripts/automation/region-brief.cjs` (à créer comme extension de `drip-email.cjs buildDaily`, **pas ex nihilo**), `supabase/schema.sql` (table `partner_briefs`), `public/api/copernicus/community/**`.

**Règle** :
- Aucun brief envoyé à un payeur B2B (Pro 79€, Brief 29€, Gîte, Resort) ne
  peut être basé sur **un seul** `beach_report` UGC non corroboré.
- Seuil de qualification UGC pour brief B2B :
  - `>= 2 reporters distincts en 24h ET au moins 1 photo`, OU
  - `>= 1 reporter + corroboration satellite (ERDDAP diff >= seuil region-config)`.
- En dessous du seuil : **fallback ERDDAP-only** avec label clair
  "non confirmé sur place, basé satellite seul".
- Aucune invention de donnée. Un report UGC isolé n'est jamais un signal
  fiable pour un hôtelier qui paie 79€/mois.
- Tout `beach_report` utilisé en brief doit être `status=approved` ET validé
  par modération (Edge Function `moderate` Supabase existante).

**Anti-pattern** :
- Créer `region-brief.cjs` ex nihilo alors que `drip-email.cjs buildDaily`
  existe déjà. Réutiliser + étendre, pas fork.

---

## G6 — Rollback obligatoire

**Zone** : toute modification de conversion, copy paywall, pricing, funnel CTA, push, novembre-dessus paywall.

**Règle** :
- Aucune modification de copy/paywall/pricing/CTA ne peut être ship-pée sans
  feature flag `?<feature>=0` documenté en commentaire du commit.
- Le flag DOIT être testé en smoke : `?<feature>=0` ramène l'état précédent.
- Pour les A/B tests, le flag `?<variant>=1` (opt-in) prime sur `?variant=0`
  (opt-out) — privilégier l'opt-in pour les variantes risquées.
- Tout rollback doit être documenté dans `.ai/changelog.md` (clé `rollback`).

**Conventions flags connues** : `?ga4_ecom=0`, `?push=0`, `?pro=0`,
`?wallet_gate=0`, `?tiers=old`, `?sub=0`, `?pwseason=0`, `?pw_comic=0`,
`?noindex=0`, `?flag=0` (générique pour tout nouvel ajout conversion/UI).

---

## G7 — Feature flag obligatoire

**Zone** : toute nouvelle feature utilisateur-facing (paywall, CTA, copy,Push, abo, tiers, schema, tracking).

**Règle** :
- Aucune nouvelle feature ne ship sans flag de désactivation.
- Le flag doit être lisible en clair dans l'URL (pas un hash obscurci).
- Le flag doit être testé en Q : `?<flag>=0`rende l'ancien état,`?<flag>=1` rend le nouveau.
- Toute feature analytics (events GA4, `sg_*`) doit avoir un flag
  `?<feature>=0` qui désactive l'envoi d'events sans casser le core funnel.

---

## G8 — Sécurité secrets (rappel AGENTS.md §1-8)

**Règle** :
- Aucun agent ne lit, affiche, copie, cite, résume, extrait le contenu de
  `.env`, `*-config.php` (hors `.example`), `_deploy-secret.php`, `*-sa.json`,
  `copernicustxt.txt`, `SECRETS-GITHUB.txt`, fichiers contenant `SECRET`,
  `TOKEN`, `PRIVATE_KEY`, `API_KEY` en valeur.
- Aucun `Get-Content .env`, `cat **/*-config.php`, `printenv`, `env`, `export`,
  `set` pour dump env. Jamais.
- En CI : toujours `${{ secrets.NOM }}`, jamais hardcoder.
- En local : scripts Node/PHP lisent `process.env` / `getenv()`. Jamais
  écrire un secret dans le code source.
- Fuite accidentelle → stop immédiat, `.ai/bugs.md` (sans recopier la valeur),
  rotation demande au fondateur, compteur dans `.ai/current_state.md`.

---

## G9 — Bundle budget (rappel AGENTS.md + CLAUDE.md)

**Règle** :
- Budget eager gzip ≤ 210 Ko (`scripts/check-bundle-budget.cjs` exit 0).
- `public/sw.js` ne compte pas si chargé async (hors eager).
- Toute lib ajoutée côté runtime (`src/`) DOIT être justifiée et pesée.
- VAPID `web-push` côté serveur (cron Node) n'impacte pas le budget browser,
  mais ne doit JAMAIS être importé par `src/` (runtime).

---

## G10 — Gate de ship (rappel CLAUDE.md)

**Séquence** : `php -l` sur chaque `.php` touché → `npx esbuild` sur chaque
`.jsx?/.mjs/.cjs` touché → `npm run build` exit 0 →
`node scripts/check-bundle-budget.cjs` exit 0 →
`node scripts/ux-smoke.mjs` produit les 4 tokens (`FUNNEL_REACHED`,
`ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`) →
`npx playwright test tests/e2e/funnel-payment.spec.ts` pour les PR touchant
le money-path.

**Aucun merge sur `main` sans Gate de ship vert.** Auto-deploy FTP part
directement après merge.

---

## Checklist avant PR (à coller dans chaque PR description)

```
- [ ] Fichier(s) touché(s) identifié(s) dans la zone sensible : OUI/NON
- [ ] Si OUI, gate correspondant respecté (G1-G10) : OUI/NON
- [ ] Rollback `?<flag>=0` documenté : OUI/NON
- [ ] Test E2E/unit ajouté pour la nouvelle branche : OUI/NON
- [ ] `php -l` OK sur tous les .php touchés : OUI/NON
- [ ] `npm run build` exit 0 : OUI/NON
- [ ] `check-bundle-budget.cjs` exit 0 : OUI/NON
- [ ] `ux-smoke.mjs` 4 tokens OK : OUI/NON
- [ ] Aucun secret dans le diff : OUI/NON
- [ ] `.ai/changelog.md` mis à jour : OUI/NON
- [ ] `.ai/current_state.md` mis à jour (handoff) : OUI/NON
- [ ] `.ai/tasks.md` tâche marquée [x] done : OUI/NON
```

---

## Sanctions (rappel AGENTS.md §6)

- Fuite secret → stop immédiat + rotation + compteur incident.
- Violation G1 (paiement sans test) ou G2 (abo sans webhook stable) ou G3
  (donnée périmée à payeur) ou G4 (push avant paywall) ou G5 (UGC seul B2B) =
  **PR refusée, rollback forcé, entrée `.ai/bugs.md`**.
- Violation G6/G7 (rollback/flag manquant) = **PR bloquée jusqu'à ajout**.
- Toute violation répétée par un agent = escalade `.ai/decisions.md`.

---

## Source de vérification outil

Pour prouver qu'un fichier respecte un gate, l'agent DOIT citer `fichier:ligne`
dans la PR description. Aucune affirmation sans preuve de lecture.

Exemple :
```
webhook Mollie renvoie 503 si Supabase KO
→ mollie-lib.php:274-277 log cURL error, ne répond pas 200
→ mollie-webhook.php:42-43 répond 503 si mirror échoue (à ajouter)
```

---

*Dernière révision : 2026-08-04 (CTO review du plan Growth consolidé).*
