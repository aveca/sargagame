# Publication FTP — données Copernicus du jour

> **2026-04-17** : Le deploy FTP est désormais **automatique** via `daily-copernicus.yml`
> (4×/jour, full build à 09h/21h UTC + push to main). Ce doc reste valable pour
> les deploys manuels de secours (FTP creds : `memory/reference_deploy.md`).

## Checklist avant mise en ligne

1. **Données du jour**
   - Lancer **`npm run daily`** :
     - Appel API Copernicus Marine (si `copernicustxt.txt` présent à la racine)
     - Génère `public/api/copernicus/sargassum.json` avec `source`, `updatedAt`, `levels`, `weekly`
     - Build Vite → `dist/`
     - Copie `dist/` vers `martinique-ftp/` et `guadeloupe-ftp/`
     - Vérification finale (`verify-ftp-ready.cjs`)
   - Sinon **`npm run build`** puis **`node scripts/prepare-ftp.cjs`** : données de référence uniquement.

2. **Vérification**
   - `npm run verify-ftp` : contrôle que `sargassum.json` existe, contient 20 plages, prévisions 7j, et que `updatedAt` est du jour.

3. **Fichiers à envoyer en FTP**
   - **Martinique** : contenu de `martinique-ftp/` (index.html, assets/, api/, …)
   - **Guadeloupe** : contenu de `guadeloupe-ftp/`
   - Le fichier **`api/copernicus/sargassum.json`** doit être présent (niveaux plages + prévisions 7 jours).

4. **Copernicus Marine (optionnel)**
   - Fichier **`copernicustxt.txt`** à la racine du projet (non versionné) :
     - Ligne 1 : identifiant Copernicus Marine
     - Ligne 2 : mot de passe
   - Si absent ou invalide, `scrape-copernicus.cjs` utilise les **données de référence** avec `source: "reference"`.
   - L’app affiche « Copernicus Marine » ou « Données de référence » selon `sargassumData.source`.

## Résumé des scripts

| Script | Rôle |
|--------|------|
| `npm run daily` | Données du jour (Copernicus ou référence) → build → FTP folders → vérif |
| `npm run build` | Données de référence → build |
| `npm run verify-ftp` | Vérifie que sargassum.json est prêt pour publication |
| `npm run martinique` | Build + préparation FTP (sans scrape Copernicus) |

## Structure attendue sur le serveur

```
/
  index.html
  assets/
    index-*.js
    index-*.css
  api/
    copernicus/
      sargassum.json   ← obligatoire (niveaux + weekly)
  sarg_carte_satellite_app.html   (si présent)
  neptunes_fury.html          (si présent)
  config/
    push.js                    ← App ID OneSignal (notifications push)
  OneSignalSDKWorker.js       ← worker push (racine du site)
```

L’app en production charge **`/api/copernicus/sargassum.json`** (statique, pas de serveur Node nécessaire).

## Notifications push (OneSignal)

- **Clés** : App ID et REST API Key sont dans **`C:\Users\user\Downloads\all\p\.env.local`** (ou `.env.example` du même dossier).
- L’App ID est intégré dans la page et dans `public/config/push.js` ; la **REST API Key** reste côté serveur pour envoyer les notifications (scripts type `send_push.py`).
- Sur le serveur FTP, publier **`OneSignalSDKWorker.js`** à la racine et **`config/push.js`** dans `config/` pour que les push fonctionnent.
