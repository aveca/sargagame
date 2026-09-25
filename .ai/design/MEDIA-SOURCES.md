# MEDIA SOURCES — matrice + règles vérifiées (2026-09-25K)

> Vérifié contre les sources officielles le 2026-09-25 (voir excerpts en
> annexe du rapport). Ne jamais supposer une licence — revérifier avant
> tout nouveau prélèvement.

## A. Google Places (legacy — GELÉ, cf. cycle H)
- Photo : legacy `place/photo?maxwidth=1600`, `photos[0]` (pas de comparaison).
- Vidéo : aucune. Exact-place : 300 m nearbysearch (collisions résiduelles
  prouvées : gp024~gp119, gp019~gp118).
- Résolution : max 1600 (legacy) ; New API 4800 (non migré).
- Commercial : **stockage permanent NON conforme** (ToS §3.2.3 no
  rehost/caching ; photos non listées aux exceptions). Attribution absente.
- Statut : **BLOCKED static bulk** — script gelé (garde testée), aucune
  nouvelle acquisition statique. Migration = proxy ≤30 j + attributions
  (décision + clé fondateur).

## B. Wikimedia Commons (CANDIDAT PLACE MEDIA — API sans clé)
- API : MediaWiki `action=query` (search + imageinfo + extmetadata),
  **sans clé**, User-Agent requis, usage raisonnable (1 req/s).
  Vérifié live 2026-09-25 depuis ce poste (search OK).
- Photo : oui (haute résolution, originaux). Vidéo : oui (WebM/OGV).
- Exact-place : titres + descriptions + catégories + (souvent) coords ;
  validation multi-signaux dans `discover-assets.cjs`.
- Résolution : originaux (souvent ≥3000px). Commercial : **oui** (tout
  Commons est libre commercial + dérivés + redistribution).
- Attribution : **OBLIGATOIRE pour CC BY / CC BY-SA** (auteur + licence +
  source + lien). PD : aucune. CC BY-NC / BY-ND : **absents de Commons**
  (rejetés à l'upload) — mais revérifier chaque fichier (responsabilité
  du réutilisateur).
- Caching/stockage : **autorisé** (licences libres, pas de ToS plateforme).
  Dérivés (WebP/AVIF, crops) : autorisés (CC BY-SA = repartager pareil).
- Rate limit : courtoisie ~1 req/s + User-Agent.
- Stratégie : PLACE MEDIA prioritaire (noms exacts + géo).

## C. Openverse (CANDIDAT PLACE/ATMOSPHÈRE — adapter prêt, quotas à confirmer)
- API : `api.openverse.org` (search image/audio). Anonyme très limité ;
  clé OAuth pour usage sérieux (non provisionnée → adapter + skip).
- Licence : agrège CC + PD avec métadonnées d'attribution (à lire par
  fichier, comme Wikimedia). Règles : attribution selon licence source.
- Statut : **adapter prêt, non exécuté** (pas de clé). Ne pas inventer
  de résultats.

## D. Pexels (CANDIDAT ATMOSPHÈRE UNIQUEMENT — clé requise)
- Licence : Pexels License — gratuit commercial, **attribution non
  requise** (appréciée), modifs OK. Interdits : personnes sous mauvais
  jour, revente non modifiée, endorsement, redistribution stock.
- API : **clé requise** (200 req/h, 20k/mois ; lien Pexels prominent
  requis pour usage API). Pas de clé → adapter + skip, zéro invention.
- Stratégie : **ATMOSPHÈRE UNIQUEMENT** (vagues, sunset, palmiers —
  jamais un lieu). Jamais de Pexels comme preuve de lieu.

## E. Autres
- Aucune source ajoutée sans licence écrite vérifiable. Propositions
  futures : Flickr Commons (PD/vérifié), Unsplash (API = attribution
  requise — noter la différence avec Pexels).
