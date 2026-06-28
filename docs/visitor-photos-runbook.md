# Photos visiteurs — runbook (backend Apps Script)

Fonctionnalité : un visiteur ajoute une photo de la plage depuis `BeachReport` →
stockée + modérée → affichée dans `BeachPhotos` (galerie « preuve du présent »).
Marche sur **toutes les plages** (contrairement aux webcams, limitées à 9).

## Architecture (telle qu'implémentée)

```
App (BeachReport)                 Apps Script (Code.js)            CI (daily)            App (BeachPhotos)
 photo → resize 1280px,    POST   doPost type:"beach_photo"        build-community-       lit
 EXIF/GPS strippée  ─────────────▶ → Drive (dossier auto-créé)      photos.cjs  ─────────▶ /api/community/
 (imageResize.js)         no-cors  → sheet beach_photos (pending)   ?action=beach_photos   photos.json
                                                                    (approved only) →
                                                                    photos.json (statique)
```

- Frontend déjà mergé. Garde-fou : `PHOTO_UPLOAD_ENABLED=false` dans `Sargasses_PROD.jsx`
  (le bouton « Ajoute une photo » est masqué) **tant que le backend n'est pas déployé**.
- Affichage `BeachPhotos` actif dès que `photos.json` contient des entrées approuvées.

## Pour passer en LIVE (≈5 min, côté fondateur)

1. **Déployer le backend** : `clasp push` du dossier `scripts/appscript/` (handler
   `type:"beach_photo"` + `?action=beach_photos` + helper `getPhotoFolder_`).
   Le dossier Drive `sargasses_photos` est **auto-créé** au 1er upload (aucun setup manuel).
2. **Activer le bouton** : passer `PHOTO_UPLOAD_ENABLED=true` (`src/Sargasses_PROD.jsx`),
   commit/push → auto-deploy. Le bouton capture apparaît dans la fiche plage.

## Modération (obligatoire avant affichage public)

Les photos arrivent en `status="pending"` dans la sheet `beach_photos`. **Seules les
lignes passées à `approved` sont servies** par `?action=beach_photos` puis bakées dans
`photos.json` par la CI quotidienne.

- **Manuel (v1)** : ouvrir la sheet `beach_photos`, vérifier la photo (colonne `url`),
  passer la colonne `status` de `pending` à `approved` (ou `rejected`).
- **Auto (v2, optionnel)** : un script de modération vision (on a déjà `@anthropic-ai/sdk`
  + clé `ANTHROPIC_API_KEY` en CI) peut pré-trier pending→approved/rejected. Non implémenté
  pour garder v1 simple et sûr — à brancher avant le bake si le volume le justifie.

## Colonnes sheet `beach_photos`

`date | beach_id | beach_name | island | level | file_id | url | status`

- `url` = `https://lh3.googleusercontent.com/d/<file_id>` (image directe, embeddable).
- `status` ∈ `pending | approved | rejected`.

## Privacy / légal

- EXIF (dont GPS) **retirée côté client** au ré-encodage JPEG (`imageResize.js`).
- Photos **consenties** (uploadées volontairement) et **modérées** → on a le droit de les
  afficher (≠ photos FB scrapées, que `FbPostsStrip` n'affiche volontairement pas).
- Suppression : passer `status` à `rejected` (retirée au prochain bake) + supprimer le
  fichier Drive si demandé.
