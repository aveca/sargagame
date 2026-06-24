# NEW_VERTICAL_PLAYBOOK — Lancer une nouvelle géo sargasses

Procédure exacte et reproductible pour ajouter une verticale (un domaine = une région = un dossier FTP).
Modèle de référence : les régions USD (`regions/puntacana.json`, `regions/rivieramaya.json`, `regions/florida.json`).
Source de vérité unique = `regions/<id>.json` validé par `regions/_schema.json` et chargé par `regions/index.cjs`.

> Régrégion candidate déjà préparée par ce playbook : **`regions/barbados.json`** (Barbados, USD, prête à brancher — voir §0).

---

## 0. Choix de la destination (pourquoi Barbados)

Grille de décision pour la « meilleure » prochaine géo sargasses :

| Critère | Poids | Tulum | Rép. Dom. (autre que PC) | **Barbados** |
|---|---|---|---|---|
| Volume de recherche sargassum/sargazo | fort | déjà couvert par `rivieramaya` (beach `rm004` Tulum) | en partie couvert par `puntacana` | **non couvert, demande réelle US/UK/CA** |
| Exposition sargasses (intensité) | fort | forte | forte | **forte côte est/sud, ouest abritée → split per-beach à forte valeur** |
| Langue de paiement | moyen | es/en | en/es | **EN natif** (US/UK/CA) → moins de friction copy |
| Devise / ARPU | moyen | USD | USD | **USD $9.99/$79/$5.99** (mirror US existant) |
| Cannibalisation interne | fort | OUI (chevauche rivieramaya) | OUI (chevauche puntacana) | **NON (île distincte, bbox isolée)** |
| Concurrent branded daily | bonus | existant (howisthesargassum) | faible | **aucun branded daily consumer** |

→ **Barbados** : marché anglophone solide, sargasses sévères, AUCUN chevauchement avec une région existante (Tulum et la R.D. le sont déjà), et un angle produit fort (ouest abrité vs est/sud exposé qui varie au jour le jour). Le pricing reprend le miroir USD à 3 niveaux (mensuel + annuel + trip-pass) — ce qui est justement le « trou » à combler côté EUR, mais ici on lance directement avec les 3 offres.

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

### 1.3 Backend paiement
- **`public/api/create-checkout.php`** — SYNC MANUEL obligatoire (PHP ne lit pas le CJS) :
  - Ajouter le domaine dans `$allowed` (CORS).
  - Ajouter `'https://<domain>' => '<id>'` dans `$ISLAND_BY_ORIGIN`.
- **`public/api/stripe-config.php`** (non versionné, voir `.example.php`) :
  - Ajouter le bloc `prices_by_region['<id>'] = ['monthly'=>'price_…','yearly'=>'price_…','tripPass'=>'price_…']`.
  - Devise gérée par le flag USD côté PHP (`$isUsd`) selon la région.
- **Cohérence** : `scripts/test-stripe-webhook.cjs` vérifie l'alignement domaines ↔ régions ; le lancer après modif.

### 1.4 Stripe (dashboard — actions fondateur)
- Créer 3 prix (monthly/yearly/tripPass) en USD, reporter les `price_…` dans `stripeProducts` du JSON **et** dans `stripe-config.php`.
- Créer 3 Payment Links correspondants, reporter dans `paymentLinks` du JSON.
- Vérifier que `stripe-webhook.php` attribue bien `metadata.island = <id>` (lifecycle invoice/subscription).

### 1.5 Analytics / push (actions fondateur)
- OneSignal : créer l'app → `onesignalAppId`.
- GA4 : nouvelle propriété → `ga4Id`.
- Microsoft Clarity : nouveau projet → `clarityProjectId`.

### 1.6 SEO & contenu
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

- Régions USD : 3 niveaux (`$9.99/mo` + `$79/an` + `$5.99 trip-pass`). C'est le standard à reprendre.
- Régions EUR (MQ/GP) : aujourd'hui mensuel seul (`4,99€`). Le trou identifié = annuel EUR + trip-pass EUR — à combler séparément, PAS dans ce playbook.
- Pour une nouvelle géo USD : reprendre le triple niveau dès le lancement (ARPU + offre annuelle = rétention).

---

## 5. Checklist GO-LIVE (à cocher)

- [ ] `regions/<id>.json` valide (`node -e "require('./regions/index.cjs').loadAll()"` sans throw).
- [ ] Toutes les plages : `island === id`, dans la bbox, `beachFilter.island === id`.
- [ ] `create-checkout.php` : domaine dans `$allowed` + `$ISLAND_BY_ORIGIN`.
- [ ] `stripe-config.php` : `prices_by_region['<id>']` rempli (monthly/yearly/tripPass).
- [ ] 3 `price_…` Stripe + 3 Payment Links créés et reportés (JSON + PHP).
- [ ] `onesignalAppId`, `ga4Id`, `clarityProjectId` réels (plus de PLACEHOLDER).
- [ ] Domaine acheté, DNS + HTTPS OK, `domain` exact dans le JSON.
- [ ] `VITE_REGION=<id> npm run build` OK + `prepare-ftp` + `verify-ftp-ready`.
- [ ] Déploiement FTP `--provision` puis vérif live (carte, plages, paiement, push).
- [ ] `scripts/test-stripe-webhook.cjs` passe (cohérence domaines ↔ régions).
- [ ] Pipeline data : la région apparaît dans le cycle Copernicus/ERDDAP 4×/j.
- [ ] Test paiement réel bout-en-bout (checkout on-site + Payment Link) sur le nouveau domaine.

---

## 6. Pièges connus (post-mortems internes)

- **Bug Miami/Cancún 2026-06-10** : si `beaches[].island !== region.id`, le front filtre sur `b.island === REGION.id` → ZÉRO plage rendue. `index.cjs` throw maintenant au build, mais re-vérifier après toute édition.
- **bbox trop serrée** : si une plage sort de la bbox, `geoDetect` la rate et seule la marge data (+0.8°) la sauve. Garder une bbox qui englobe TOUTES les plages.
- **PHP ne lit pas le CJS** : tout ajout de région nécessite un sync MANUEL dans `create-checkout.php` (+ `stripe-config.php`). Oublier = CORS bloqué ou « no price configured ».
- **Cannibalisation SEO** : ne JAMAIS lancer une géo qui chevauche une région existante (Tulum ⊂ rivieramaya, R.D. ⊂ puntacana). Une île/zone distincte = une bbox isolée.
- **Ne jamais casser l'A/B** : ne pas toucher `abVariant()` ni le copy sous test dans `Sargasses_PROD.jsx` en branchant une région.
