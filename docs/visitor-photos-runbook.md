# Photos visiteurs — runbook (backend Supabase, 100 % mobile)

> **⛔ FRONT RETIRÉ le 2026-07-02 (décision fondateur + panel adverse) — backend DORMANT.**
> L'upload photo, la galerie `BeachPhotos` et la récompense « Éclaireur » 24 h ont été
> retirés du front (`PHOTO_UPLOAD_ENABLED=false`, `BeachPhotos.jsx` supprimé). Direction :
> « on ne fait pas d'image, le SVG de NOTRE donnée satellite est le produit » → la surface
> est réinvestie dans la data-viz du verdict (**Cadran du Veilleur**, `?cadran=0`). Le
> backend Supabase (bucket `beach-photos`, table `photos`, Edge Function `moderate`,
> workflow `notify-photos.yml`) est **conservé intact et DORMANT** (mobile ne peut pas
> toucher le serveur ; rebranchable en re-montant `BeachPhotos` + `PHOTO_UPLOAD_ENABLED`).
> `supabasePhotos.js` reste VIVANT (`submitBeachReport`/`fetchApprovedReports`/
> `logAnalyticsEvent` alimentent encore le vote SVG + l'odeur + les événements terrain).
> Le reste de ce runbook décrit la fonctionnalité telle qu'elle était (archive).

Fonctionnalité : un visiteur ajoute une photo de la plage depuis `BeachReport` →
stockée + modérée → affichée dans `BeachPhotos` (galerie « preuve du présent »).
Marche sur **toutes les plages** (contrairement aux webcams, limitées à 9).

**Pourquoi Supabase** : le fondateur est 100 % mobile et `clasp push` (Apps Script)
exige un ordinateur. Supabase se gère **entièrement au dashboard web** (mobile) et
l'app lui parle en HTTP direct — zéro CLI, zéro ordinateur. Le reste de la stack
(static-bake + Apps Script pour reports/emails/paiements) **ne change pas** : c'est
chirurgical, pas une migration globale.

## Architecture

```
App (BeachReport)                     Supabase                       App (BeachPhotos)
 photo → resize 1280px,    HTTP POST   Storage bucket beach-photos     HTTP GET (REST)
 EXIF/GPS strippée  ───────────────▶   + table `photos` (pending)  ──▶ status=approved
 (imageResize.js)                      RLS protège (clé anon publique)  → galerie
                                       Modération : status→approved
                                       (Table Editor, mobile)
```

- Code : `src/supabasePhotos.js` (upload + lecture, `fetch` brut, **aucune dépendance**),
  `src/BeachPhotos.jsx` (galerie), capture dans `BeachReport` (`src/Sargasses_PROD.jsx`).
- S'active **automatiquement** dès que `SUPABASE_URL` + `SUPABASE_ANON_KEY` sont
  renseignés dans `src/supabasePhotos.js` (sinon no-op : bouton masqué, galerie vide).

## Mise en LIVE (≈10 min, 100 % au téléphone)

1. **Créer un projet Supabase** : [supabase.com](https://supabase.com) → *New project*
   (navigateur mobile). Région : Europe (proche MQ/GP/clients).
2. **Coller le schéma** : dashboard → *SQL Editor* → coller tout `supabase/schema.sql`
   → *Run*. (Crée la table `photos`, les policies RLS, le bucket public `beach-photos`.)
3. **Récupérer les 2 clés** : *Project Settings → API* → copier **Project URL** et la clé
   **anon public**. Me les donner ici → je les colle dans `src/supabasePhotos.js`,
   commit → auto-deploy. (Ces valeurs sont **publiques** par design ; la sécurité vient
   du RLS — l'anon ne peut qu'INSÉRER en `pending` et LIRE les `approved`.)

→ Dès le déploiement, le bouton « Ajoute une photo » apparaît sur les fiches plage.

## Modération (avant affichage public)

Les photos arrivent en `status='pending'`. **Seules les `approved` sont affichées**
(garanti par RLS). Deux façons de modérer, **100 % depuis le téléphone** :

### A. Alerte email + validation 1-tap (recommandé)

Tu reçois un email à **chaque** nouvelle photo, avec l'image + boutons **✅ Approuver /
❌ Rejeter** qui s'appliquent **directement depuis l'email** (sans ouvrir l'app).
Pièces : Edge Function `moderate` (`supabase/functions/moderate/`) + GitHub Action
`notify-photos.yml` (poll toutes les 30 min) + `notify-new-photos.cjs`.

**Setup (une fois, au téléphone) :**
1. **Colonne de suivi** : SQL Editor → lancer
   `alter table public.photos add column if not exists notified boolean not null default false;`
   (déjà inclus si tu relances `supabase/schema.sql`).
2. **Jeton** : choisis une chaîne aléatoire (= `MODERATE_TOKEN`, ex. 20+ caractères).
3. **Edge Function** : dashboard → *Edge Functions* → *Create function* `moderate` →
   coller le contenu de `supabase/functions/moderate/index.ts` → **Deploy**.
   - ⚠️ **Désactiver « Verify JWT »** (le lien email n'a pas de JWT ; on protège par le jeton).
   - *Function secret* : `MODERATE_TOKEN` = ta chaîne.
4. **Clé secrète Supabase** : dashboard → *Project Settings → API* → copier la clé
   **`secret`** (`sb_secret_…`, NE PAS la mettre dans le code).
5. **Secrets GitHub** : repo → *Settings → Secrets and variables → Actions* → ajouter
   `SUPABASE_SERVICE_KEY` = la clé secrète, et `MODERATE_TOKEN` = la même chaîne qu'en (2/3).

→ Dès qu'un visiteur poste une photo, tu reçois l'email dans ≤30 min et tu valides en 1 tap.
(Test immédiat : onglet *Actions* → *Notify new visitor photos* → *Run workflow*.)

### B. À la main (toujours dispo)

Dashboard → *Table Editor* → table `photos` → vérifier la photo (colonne `url`) →
passer `status` de `pending` à `approved` (ou `rejected`). Suppression : `rejected`
+ supprimer l'objet dans *Storage* si besoin.

## Privacy / légal

- EXIF (dont GPS) **retirée côté client** au ré-encodage JPEG (`src/imageResize.js`).
- Photos **consenties** (uploadées volontairement) et **modérées** → on a le droit de les
  afficher (≠ photos FB scrapées, que `FbPostsStrip` n'affiche volontairement pas).

## Coût

Free tier Supabase : 1 Go storage + 5 Go egress/mois ≈ plusieurs milliers de photos.
Au-delà (succès), passer en Pro (~25 $/mois). À surveiller dans le dashboard *Usage*.

## Note

Le backend photo **Apps Script** (handler Drive) a été **retiré** au profit de Supabase
(une seule voie, mobile-friendly). Le reste de `scripts/appscript/Code.js` (reports,
emails, paiements) est inchangé.
