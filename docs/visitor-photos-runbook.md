# Photos visiteurs — runbook (backend Supabase, 100 % mobile)

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
(garanti par RLS). Pour modérer, **depuis le téléphone** :

- Dashboard Supabase → *Table Editor* → table `photos` → vérifier la photo (colonne
  `url`) → passer `status` de `pending` à `approved` (ou `rejected`).
- Suppression : `rejected` (disparaît aussitôt) + supprimer l'objet dans *Storage* si besoin.

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
