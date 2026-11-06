# .ai/bugs.md — Bugs connus avec reproduction

> Les agents QA et Coding se réfèrent à ce fichier.
> Format : ID-YYYY-NNN (année + num auto). Bug fixé → [x] et reste en mémoire.

---

## 🟥 Non résolus

### BUG-2026-007 — CTA mensuel USD mort sur les 4 domaines USD (« Plan mensuel inconnu »)

- **Date** : 2026-11-06 · **Sévérité** : HIGH (conversion B2B)
- **Fichier** : `public/api/mollie-lib.php` (`mol_b2b_plans()`)
- **Description** : les pages commerciales EN/ES affichaient « Subscribe — $89/mo » et `/pro/espace/` envoyait `plan=pro_monthly_usd`, mais ce plan **n'existait pas** côté serveur → réponse « Plan mensuel inconnu ». Le CTA mensuel était donc mort sur Miami, Punta Cana, Cancún et Tulum.
- **Reproduction** : POST `/api/mollie.php` `{action:"create_subscription", plan:"pro_monthly_usd", hosted:1}` → refus plan inconnu (avant correctif).
- **Correctif** : plan `pro_monthly_usd` ajouté (89.00 USD — montant déjà affiché publiquement, parité d'affichage). **PR #1310 (draft, non mergée)** → le correctif n'est pas encore en prod.
- **Plan** : merger #1310 après revue, puis vérifier la création d'abonnement sur un domaine USD (sans paiement réel en test).
- **Statut** : [ ] correctif en PR Draft #1310, non mergé

### BUG-2026-008 — Données live périmées : `stale:false` contredit l'âge réel de l'observation

- **Date** : 2026-11-06 · **Sévérité** : HIGH (honnêteté produit = moat)
- **Fichier** : `public/api/copernicus/sargassum.json` (généré), `scripts/build-sargassum-json.cjs`
- **Description** : le payload publie `stale:false` alors que `updatedAt`/`erddapTimestamp` dépassent le SLA de 900 min (mesuré ~5 300 min le 2026-11-06). Un client qui lit `stale` peut afficher un verdict sur une observation périmée.
- **Reproduction** : lire `updatedAt` + `erddapTimestamp` du payload public et comparer à `Date.now()` → l'âge dépasse 900 min malgré `stale:false`.
- **Correctif déjà en place dans #1310** : la démo `/pro/demo/` **recalcule** la fraîcheur à l'affichage (fail-closed) au lieu de croire `stale` ; `b2b-segment.dataHook()` renvoie `null` si l'historique dépasse le SLA (aucune affirmation de donnée périmée dans les emails). Le **pipeline** reste à relancer.
- **Plan** : data_agent — relancer le pipeline ERDDAP, ne jamais abaisser le SLA de 900 min.
- **Statut** : [ ] pipeline de fraîcheur à relancer (dépendance data, hors périmètre de #1310)

### BUG-2026-009 — Hubs `/pro/` FR servis sur les 4 domaines USD (canonical Martinique)

- **Date** : 2026-11-06 · **Sévérité** : HIGH (SEO + crédibilité commerciale)
- **Fichier** : `public/pro/index.html` (+ variantes `public/pro/en|es/index.html`), `scripts/lib/b2b-commercial-pages.cjs`
- **Description** : le build régional ne substituait pas le hub `/pro/` → Miami, Punta Cana, Cancún et Tulum servaient le hub FR Martinique (canonical, og:url, hreflang et CTA absolus vers la Martinique). Défaut mesuré en prod le 2026-11-05 sur les 6 domaines.
- **Reproduction** : `GET https://sargassummiami.com/pro/` → `<link rel="canonical" href="https://sargasses-martinique.com/pro/">` (avant correctif).
- **Correctif** : `scripts/lib/b2b-commercial-pages.cjs` (nouveau) regionalise langue + canonical + liens + CTA démo ; hooké dans `vite.config.js` (`closeBundle`). Vérifié sur les builds mq / florida / puntacana / rivieramaya / tulum.
- **Statut** : [ ] correctif en PR Draft #1310, non mergé

### BUG-2026-010 — Aucun prospect B2B contacté sur les 4 marchés USD

- **Date** : 2026-11-06 · **Sévérité** : HIGH (croissance)
- **Fichier** : `scripts/automation/data/b2b-us-enriched.json` (absent), `scripts/automation/b2b-cold-outreach.cjs`
- **Description** : la base enrichie versionnée ne couvre que **Martinique + Guadeloupe** (108 contacts). Miami, Punta Cana, Cancún et Tulum n'ont **aucun** prospect contacté → le canal B2B est absent de 4 des 6 destinations. `b2b-us-enriched.json` n'a jamais été généré (clé `GOOGLE_PLACES_KEY` absente). Le segment/outreach ne gérait pas Tulum (`localeFor`/`domainFor`) → corrigé dans #1310.
- **Reproduction** : `scripts/automation/b2b-registry.cjs` → par destination, les lignes USD sont à 0 contacté.
- **Plan** : growth_agent — générer `b2b-us-enriched.json` (Places API) puis relancer l outreach cold avec les garde-fous de délivrabilité existants (cap d'envoi, 1 email/établissement/run).
- **Statut** : [ ] clé API manquante — hors périmètre de #1310

### BUG-2026-001 Webhook secret Mollie pas configuré

- **Date** : 2026-07-30 · **Sévérité** : HIGH
- **Fichier** : `public/api/mollie-config.php`
- **Description** : `webhook_secret` est commenté/absent → `mollie-webhook.php` accepte n'importe quel appel sans vérifier le hash. À configurer manuellement sur chaque serveur FTP.
- **Reproduction** : Envoyer un POST à `/api/mollie-webhook.php` avec un `id` aléatoire → accepté.
- **Plan** : Ajouter le secret dans le flux de déploiement FTP (`prepare-ftp.cjs`).
- **Statut** : [ ] En attente provisioning serveur

### BUG-2026-002 — Florida + US builds incomplets unique

- **Date** : 2026-07-17 **Sévérité** : MEDIUM
- **Fichier** : `prepare-ftp.cjs`
- **Description** : Les US (Florida, Punta Cana, Riviera Maya) ne sont pas buildés comme région fullavant ; leur FTO-na schedule une route shallow.
- **Reproduction** : lancer `prepare-ftp.cjs` with `--regions florida` — plusieurs pages manquants.
- **Statut** : [ ] Dans le pipe

### BUG-2026-003 — Trop de flags A/B (>50) — dilue significativité

- **Date** : 2026-07-31 · **Sévérité** : LOW (pas visible/ser propose)
- **Fichier** : `src/Sargasses_PROD.jsx`
- **Description** : 50+ `abVariant()` dans la source créént un montage Statistical à mesure, à remettre UTILE que version pour obtenir un signal dans une évaluation valide; cela ralentit also les nouveaux
- **Plan** : `à résoudre comme partie` du Nettle P1 purge précnom.

---

## 🟩 Résolus

### BUG-2026-004 Paiement Mollie monte fail (nothing"

- **Date** : 2026-07-29 done · **Fix** : soft via l'effet `preaurer

### BUG-2026-005 Error : msg nul; en bloc frib(La protection!)

- **Date** : 2026-07-31 done : réparé → `errMsg` au lieu de `msg` qui était undefined.    

### BUG-2026-006. terminé en regrouper: Mol duplicates et status.

- **Date** : 2026-07-30 done → and field to web.

---

## Flux agent

1. Bug détecté → ajouter au plan (haut faite)
2. Assigner → [coding_agent] or relevant
3. Fix → lien PR / commit → @move to résolu().

---

> ***Début de session : toujours scanner ce fichier.***