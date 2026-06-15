# Générateurs de cartes de partage social

Mécaniques virales **double-emploi** (acquérir + amorcer la capture ground-truth),
construites en avance. **On construit maintenant, on branche quand le funnel
convertira** (plan 90 j #5).

Ces générateurs sont **autonomes** : ils lisent la donnée déjà publiée
(`public/api/copernicus/sargassum.json`, `scripts/automation/data/backtest-results.json`)
et produisent des images PNG prêtes à publier. **Ils ne touchent jamais l'app**
(`Sargasses_PROD.jsx`, `src/`) ni le build Vite.

Rendu : SVG → PNG via `sharp` (devDependency, aucun navigateur, déterministe,
CI-friendly). Socle commun : [`../lib/share-card.cjs`](../lib/share-card.cjs).

## Garde-fous (non négociables)

- **Aucun lien sortant** dans les cartes — le domaine est gravé DANS l'image.
  Un lien tue le partage natif et la portée organique. La légende FB mentionne
  le domaine en texte, jamais en URL cliquable.
- **Aucun chiffre inventé.** Toute stat vient de la donnée réelle. Donnée
  absente → l'élément saute.
- **Streak / fiabilité affichés UNIQUEMENT sur les plages au backtest ≥ 85 %**
  (`share-card.SEUIL_FIABILITE`). Broadcaster une fiabilité sur une plage qu'on
  prévoit mal = fausse info = risque réputation.
- **Déploiement verrouillé** : la publication FB est câblée mais `DEPLOY_LOCKED`.
  Même `--publish --go` ne poste rien sans `SARGA_DEPLOY_UNLOCK=1`. Délais
  anti-spam et session `.fb-session` repris de `fb-post-video.cjs`.

## Les 3 générateurs

### 1. Beach Wrapped — `gen-beach-wrapped.cjs`
« Mon été Sargasses », carte perso de fin de saison (façon Spotify Wrapped),
1080×1350 (4:5).

```bash
node scripts/automation/gen-beach-wrapped.cjs --region=mq
node scripts/automation/gen-beach-wrapped.cjs --profile=chemin/profil.json
```

**Contrat profil** (rempli plus tard par le first-party `collect.php`/`stats.php` ;
sans `--profile`, un profil de démo est dérivé de la donnée réelle des plages) :

```json
{
  "region": "mq",
  "season": "Été 2026",
  "daysChecked": 47,
  "favoriteBeachSlug": "anse-madame",
  "cleanDaysFound": 38,
  "alertsAvoided": 9
}
```

### 2. Sargadle — `gen-beach-wordle.cjs`
Devine-puis-révèle quotidien : « Quelle plage est LE meilleur spot aujourd'hui ? »
4 options seedées par la date (stables 24 h), réponse = meilleur Beach Score réel.

```bash
node scripts/automation/gen-beach-wordle.cjs --region=mq
```

Sorties : carte énigme (`-q.png`, à poster le matin), carte réponse (`-a.png`,
le soir) + `data/wordle-today.json` (le moteur, consommable par l'app au
déploiement).

### 3. Verdict du Veilleur — `gen-verdict-veilleur.cjs`
Image carrée 1080×1080 du verdict le plus tranché du jour (meilleur spot propre,
ou alerte « à éviter » s'il y en a une). Ligne de crédibilité (taux backtest +
streak) seulement sur les plages ≥ 85 %.

```bash
node scripts/automation/gen-verdict-veilleur.cjs --region=mq            # image + légende + file d'attente
node scripts/automation/gen-verdict-veilleur.cjs --region=mq --publish  # publication (verrouillée par défaut)
```

Écrit `data/verdict-queue.json` (contrat pour le branchement `fb-post-groups`
au déploiement) et, à la publication réelle, `data/verdict-sent.json`
(anti-spam : un post / région / jour).

## Sorties

Tout ce qui est généré (`share-cards/out/*.png`, `wordle-today.json`,
`verdict-queue.json`, `verdict-sent.json`) est **gitignoré** — régénéré à chaque
run. Seul le code des générateurs est versionné.
