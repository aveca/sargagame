# NEW_VERTICAL_PLAYBOOK — Lancer une nouvelle géo sargasses

Procédure exacte et reproductible pour ajouter une verticale (un domaine = une région = un dossier FTP).
Modèle de référence : les régions USD (`regions/puntacana.json`, `regions/rivieramaya.json`, `regions/florida.json`).
Source de vérité unique = `regions/<id>.json` validé par `regions/_schema.json` et chargé par `regions/index.cjs`.

> Région candidate déjà préparée par ce playbook : **`regions/barbados.json`** (Barbados, USD, prête à brancher — voir §0).

---

## 0. Choix de la destination (pourquoi Barbados)

Grille de décision pour la « meilleure » prochaine géo sargasses :

| Critère | Poids | Tulum | Rép. Dom. (autre que PC) | **Barbados** |
|---|---|---|---|---|
| Volume de recherche sargassum/sargazo | fort | déjà couvert par `rivieramaya` (beach `rm004` Tulum) | en partie couvert par `puntacana` | **non couvert, demande réelle US/UK/CA** |
| Exposition sargasses (intensité) | fort | forte | forte | **forte côte est/sud, ouest abritée → split per-beach à forte valeur** |
| Langue de paiement | moyen | es/en | en/es | **EN natif** (US/UK/CA) → moins de friction copy |
| Devise / ARPU | moyen | USD | USD | **USD $5.99/$11.99/$19.99** (mirror US existant, pass-only) |
| Cannibalisation interne | fort | OUI (chevauche rivieramaya) | OUI (chevauche puntacana) | **NON (île distincte, bbox isolée)** |
| Concurrent branded daily | bonus | existant (howisthesargassum) | faible | **aucun branded daily consumer** |

→ **Barbados** : marché anglophone solide, sargasses sévères, AUCUN chevauchement avec une région existante (Tulum et la R.D. le sont déjà), et un angle produit fort (ouest abrité vs est/sud exposé qui varie au jour le jour). Le pricing reprend le modèle PASS-ONLY (paiement unique, pas d'abonnement) du miroir USD à 3 paliers : $5.99 / $11.99 / $19.99 (géo EUR : 7,99 / 14,99 / 24,99 €).

---

## 1. Fichiers à créer / modifier (checklist par ordre)

### 1.1 La config région (FAIT pour Barbados)
- **`regions/<id>.json`** — miroir d'une région USD. C'est le SEUL fichier strictement requis pour que le build fonctionne.
  - `id` : `^[a-z]{2,12}$`, sert de clé `island` sur chaque plage + clé funnel Apps Script. Ex. `barbados`.
  - Doit respecter `regions/_schema.json` (champs requis : `id, name, country, domain, ftpDir, primaryLang, currency, timezone, bbox, center, emails, beachFilter, routes`).
  - **Invariants `index.cjs` (fail-fast au build)** : chaque `beaches[].island === id`, chaque plage DANS la `bbox` `[lngMin, latMin, lngMax, latMax]`, et `beachFilter.island === id`.
  - Valider avant tout :
    ```bash
    node -e "const c=require('./regions/index.cjs');console.log(Object.keys(c.loadAll()))"  # ne doit PAS throw
    ```

### 1.2 Brancher la région (étape volontairement NON faite ici)
- **`regions/index.cjs`** : aucune modif de code requise — `loadAll()` scanne tout `*.json` non préfixé `_`. Déposer le fichier suffit. (Ce playbook livre le JSON SANS l'activer ailleurs ; le brancher = simplement laisser le fichier en place + faire les étapes ci-dessous.)

### 1.3 Backend paiement (Mollie on-site, pass-only)
- **`public/api/mollie.php`** — SYNC MANUEL obligatoire (PHP ne lit pas le CJS) :
  - Ajouter le domaine dans `$allowed` (CORS).
  - Ajouter `'https://<domain>' => '<id>'` dans `$ISLAND_BY_ORIGIN`.
  - Ajouter `'<id>' => 'USD'` (ou `'EUR'`) dans `$CUR_BY_ISLAND`.
  - L'allowlist anti-tampering des cents est `$allowedByCur` dans `mollie.php` : vérifier que les paliers de la devise (USD `599/1199/1999`, EUR `799/1499/2499`) y figurent ; aucune valeur par région à ajouter, c'est par devise.
- **`public/api/mollie-config.php`** (gitignored, DÉJÀ déployé par FTP, voir `mollie-config.example.php`) :
  - Les passes one-time sont définis dans le bloc `passes` du config (`cents` = allowlist + `days` = durée d'accès). Pas de `stripe-config.php` ni de `prices_by_region` à toucher : le pass-only ne crée aucun prix Stripe.
- **Cohérence** : la voie LIVE est Mollie ; vérifier après modif l'alignement domaines ↔ régions ↔ devises directement dans `mollie.php` (`$allowed` / `$ISLAND_BY_ORIGIN` / `$CUR_BY_ISLAND` cohérents). `scripts/test-stripe-webhook.cjs` ne valide QUE l'attribution Stripe legacy, PAS le checkout Mollie actif — ne pas s'y fier pour la nouvelle géo.

### 1.4 Analytics / push (actions fondateur)
- OneSignal : créer l'app → `onesignalAppId`.
- GA4 : nouvelle propriété → `ga4Id`.
- Microsoft Clarity : nouveau projet → `clarityProjectId`.

### 1.5 SEO & contenu
- `routes` : 3 slugs canoniques (`season`, `best`, `weekly`) — voir miroir EN de `puntacana.json`.
- `seo.homeTitle` / `seo.homeDesc` : titre live + desc orientés intention pré-voyage. Garder `freshTitles:true` et `dateModifiedFromPipeline:true`.
- Les 136+ pages plage SEO sont générées par `vite.config.js` à partir des `beaches` inline de la région ; aucun fichier à écrire à la main.
- `competitors` / `differentiators` : alimentent le copy de confiance.

---

## 2. Domaine & DNS (actions fondateur)

1. Acheter le domaine `sargassum<geo>.com` (cohérent avec les domaines USD existants).
2. Pointer le DNS vers l'hébergement FTP (même infra que les autres domaines USD).
3. Le domaine DOIT correspondre EXACTEMENT à `domain` dans le JSON (utilisé par `getRegionByDomain`, sitemaps, robots, canonicals).
4. HTTPS : certificat sur le nouveau domaine (sinon CORS `$allowed` échoue).

---

## 3. Build & déploiement

```bash
# 1) Build ciblé sur la nouvelle région (n'émet QUE <ftpDir>/, zéro artefact MQ/GP)
VITE_REGION=<id> npm run build
VITE_REGION=<id> node scripts/prepare-ftp.cjs
node scripts/verify-ftp-ready.cjs

# 2) Déploiement FTP du dossier <ftpDir>/
node scripts/manual-ftp-deploy.cjs --provision   # première fois (crée l'arbo)
node scripts/manual-ftp-deploy.cjs               # déploiements suivants
```

- `prepare-ftp.cjs` en mode région isolée ne ship QUE les plages de cette région (anti duplicate-content cross-domain).
- Vérifier `sitemap.xml`, `robots.txt`, canonicals pointent tous sur `<domain>`.
- Auto-deploy CI : `daily-copernicus.yml` fait le full build sur push main (repo full-static, pas de Railway). La nouvelle région entre dans le cycle data 4×/j automatiquement une fois le fichier sur main.

---

## 4. Pricing — règle business

- Modèle B2C = **PASS-ONLY** (paiement UNIQUE, AUCUN abonnement) via Mollie on-site partout.
- Régions USD : 3 paliers `$5.99 / $11.99 / $19.99`. C'est le standard à reprendre.
- Régions EUR (MQ/GP) : 3 paliers `7,99 / 14,99 / 24,99 €`.
- Pour une nouvelle géo USD : reprendre les 3 paliers pass-only dès le lancement.

---

## 5. Checklist GO-LIVE (à cocher)

- [ ] `regions/<id>.json` valide (`node -e "require('./regions/index.cjs').loadAll()"` sans throw).
- [ ] Toutes les plages : `island === id`, dans la bbox, `beachFilter.island === id`.
- [ ] `mollie.php` : domaine dans `$allowed` + `$ISLAND_BY_ORIGIN` + devise dans `$CUR_BY_ISLAND`.
- [ ] `mollie.php` : les 3 paliers de la devise (cents) sont dans `$allowedByCur` ; passes définis dans le bloc `passes` de `mollie-config.php`.
- [ ] `onesignalAppId`, `ga4Id`, `clarityProjectId` réels (plus de PLACEHOLDER).
- [ ] Domaine acheté, DNS + HTTPS OK, `domain` exact dans le JSON.
- [ ] `VITE_REGION=<id> npm run build` OK + `prepare-ftp` + `verify-ftp-ready`.
- [ ] Déploiement FTP `--provision` puis vérif live (carte, plages, paiement, push).
- [ ] Cohérence Mollie vérifiée dans `mollie.php` (`$allowed` ↔ `$ISLAND_BY_ORIGIN` ↔ `$CUR_BY_ISLAND`). (`test-stripe-webhook.cjs` ne couvre QUE le legacy Stripe, pas la voie Mollie active.)
- [ ] Pipeline data : la région apparaît dans le cycle Copernicus/ERDDAP 4×/j.
- [ ] Test paiement réel bout-en-bout (checkout Mollie on-site, pass-only) sur le nouveau domaine.

---

## 6. Pièges connus (post-mortems internes)

- **Bug Miami/Cancún 2026-06-10** : si `beaches[].island !== region.id`, le front filtre sur `b.island === REGION.id` → ZÉRO plage rendue. `index.cjs` throw maintenant au build, mais re-vérifier après toute édition.
- **bbox trop serrée** : si une plage sort de la bbox, `geoDetect` la rate et seule la marge data (+0.8°) la sauve. Garder une bbox qui englobe TOUTES les plages.
- **PHP ne lit pas le CJS** : tout ajout de région nécessite un sync MANUEL dans `mollie.php` (`$allowed` + `$ISLAND_BY_ORIGIN` + `$CUR_BY_ISLAND`). Oublier = CORS bloqué ou `region_not_supported`.
- **Cannibalisation SEO** : ne JAMAIS lancer une géo qui chevauche une région existante (Tulum ⊂ rivieramaya, R.D. ⊂ puntacana). Une île/zone distincte = une bbox isolée.
- **Ne jamais casser l'A/B** : ne pas toucher `abVariant()` ni le copy sous test dans `Sargasses_PROD.jsx` en branchant une région.
