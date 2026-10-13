# Contrat du manifeste de contenu public — Sargagame (v1)

> **Statut : CONTRAT SEUL (Phase C.1).** Aucun générateur, aucune donnée de
> production, aucun usage MCP à cette étape. Ce document + `scripts/lib/
> content-manifest-validate.cjs` + `tests/content-manifest-contract.test.cjs`
> définissent le format que le futur générateur devra produire, pour les six
> domaines, à partir des dossiers réellement prêts à déployer (post-
> `prepare-ftp.cjs`, donc après réécritures propres à chaque domaine).

## 1. Objet et non-objectifs

- **Objet** : décrire, par domaine, l'ensemble des URL publiques publiées
  (pages + assets de données indexables), avec canonical, langue, catégorie,
  titres, dates réelles et assets référencés — même source pour les audits
  SEO et (plus tard, après validation du contrat) pour le MCP.
- **Non-objectifs** : générer quoi que ce soit ; modifier un canonical ;
  créer des pages ; prédire l'indexation Google ; exposer quoi que ce soit
  de privé, payant ou interne.

## 2. Forme

- Fichier : `data/content-manifest.json` (futur, un par dossier déployé).
- JSON UTF-8, clés triées, tableau `pages` trié par `url`. Même état Git →
  octets identiques (devoir du **générateur**, Phase C.2 — le validateur
  n'impose **aucun ordre** et accepte tout ordre en entrée).
- `version` : `"1"`. Évolutions additives seulement en v1.
- Clés racine strictes : `version`, `domain`, `region`, `pages`,
  `generatedAt` (optionnelle, ISO-8601, méta du fichier uniquement).
  Structures imbriquées strictes : `hreflang[]` = `{lang, href}` exactement,
  `images[]` = `{src, alt}` exactement.

## 3. Schéma d'une entrée `pages[]`

| Champ | Type | Obligatoire | Règle |
|---|---|---|---|
| `url` | string, URL absolue `https://` | oui | URL finale publiée (forme servie 200, sans slash sauf racine `/`) |
| `canonical` | string, URL absolue, ou `null` | oui (nullable) | Canonical **extrait** de la page, tel quel (jamais réécrit, jamais inventé ; `null` si absent) |
| `domain` | string (host nu) | oui | Doit appartenir aux 6 domaines produit |
| `region` | string | oui | `mq\|gp\|florida\|puntacana\|rivieramaya\|tulum` |
| `lang` | string \| `null` | oui (nullable) | `fr\|en\|es` (balise `<html lang>` puis heuristique de préfixe ; `null` si indéterminé) |
| `hreflang` | `[{lang, href}]` | non (défaut `[]`) | Alternates extraits, `href` absolus |
| `kind` | enum | oui | `home\|beach\|hub\|editorial\|legal\|pro\|tool\|data\|other` |
| `title` | string \| `null` | oui (nullable) | `<title>` extrait, `null` si absent |
| `description` | string \| `null` | oui (nullable) | `meta[name=description]` extraite, `null` si absente |
| `lastmod` | string `AAAA-MM-JJ` calendaire strict | oui | **Date réelle du contenu dans Git** (`git log -1 --format=%cs -- <source>`) ; pages générées : date de contenu connue du générateur. **INTERDIT : date de build/génération.** Validité calendaire réelle exigée (mois 01–12, jour existant, 29/02 uniquement bissextile — `2026-02-30` invalide). Plage d'années non bornée (un contenu légal peut prédater le site). |
| `images` | `[{src, alt}]`, `src` absolus | non (défaut `[]`) | `<img src>` + `og:image` dédupliqués ; `alt` `null` si absent |
| `ogImage` | string \| `null` | oui (nullable) | `meta[property=og:image]` extraite |
| `videos` | `[string]` (URL absolues) | non (défaut `[]`) | `<video src>` / `<source>` extraits |
| `indexable` | boolean | oui | Voir §4 (déclaré par le site, pas par Google) |
| `indexableReason` | enum | oui si `indexable:false` | `noindex\|redirect\|private\|canonical-externe\|excluded` |
| `listedInSitemap` | boolean | oui | Présence dans le `sitemap.xml` du domaine (fait, pas jugement) |
| `inlinks` | int ≥ 0 \| `null` | oui (nullable) | Compte `in` de `scripts/automation/data/link-graph.json` (même domaine, même chemin), seule source admise ; `null` si graphe absent |

## 4. Règle `indexable` (déclarative, conservative)

`indexable === true` **SSI** : pas de `noindex` (ni meta ni `X-Robots-Tag`
connu) ET pas de redirection connue ET chemin non privé (voir §6) ET
(`canonical === null` OU `canonical == url` après normalisation §5).

- `canonical` externe ou différent (ex. Tulum `/confidentialite/` →
  canonical MQ) : `indexable: false`, `indexableReason: "canonical-externe"`.
  **Signalement uniquement : le générateur ne touche jamais aux canonicals.**
- `listedInSitemap: true` + `indexable: false` = anomalie à corriger côté
  génération (ex. `/comic-cartes.html` noindex listé sur Tulum) — le contrat
  l'interdit : **une URL `indexable:false` ne doit pas être listée** (le
  validateur échoue).
- `indexable` ne dit RIEN de l'indexation Google réelle.

## 5. Normalisation des URL et URL émises

1. **Émission** : `url`, `canonical`, `hreflang[].href`, `images[].src`,
   `ogImage`, `videos[]` ne doivent contenir **ni query string ni fragment**
   (`?`, `#` → rejet). Le manifeste ne décrit que des URL finales.
2. **Comparaisons** (doublons, clusters) : schéma + host en minuscules ;
   `www.` conservé tel que publié (pas de réécriture) ; requête/fragment
   ignorés par construction (voir 1) ; slash final ramené à la forme
   canonique de comparaison (`/x/` ≡ `/x`) ; encodage conservé.
3. **Cohérence** : chaque entrée doit porter exactement le `domain` et la
   `region` du manifeste qui la contient (canonicals croisés autorisés,
   champs `domain`/`region` croisés interdits).

## 6. Invariants de sécurité (validés, bloquants)

Le manifeste et ses entrées NE DOIVENT contenir :
- aucun secret/token/clé/mot de passe (motifs : `secret`, `token`, `api[_-]?key`,
  `BEGIN PRIVATE KEY`, `sk_live`, `sb_secret`) ;
- aucun chemin interne (système de fichiers, `/\_private/`, `.php`, `.htaccess`,
  `.env`, dotfiles) ;
- aucune route de paiement/compte (`/api/mollie`, `widget-token`, `b2b-trial`,
  `mollie_return`, `checkout`, `payment`, ainsi que tout segment de chemin
  exactement égal à `pass`, insensible à la casse). Volontairement étroit :
  `passe`, `passage`, `compass` restent valides (calibré : 0 occurrence de
  `pass` dans les 641 URL des sitemaps live le 2026-10-13) ;
- aucune donnée utilisateur (email, nom, id de suivi individuel).
- Champs strictement limités au schéma : toute clé inconnue = échec.

## 7. Doublons inter-domaines

Le manifeste global (6 fichiers concaténés) regroupe par `canonical`
normalisé : tout cluster > 1 URL est **signalé** (`canonical-cluster`), sans
consolidation automatique. Cas connu : `/confidentialite/` Tulum → canonical
MQ (décision humaine requise, inchangée par ce contrat).

## 8. Dates déterministes

`lastmod` Git-disponible, sinon date de contenu du générateur documentée par
entrée (champ futur `lastmodSource`, hors v1 stricte). Interdit : horodatage
de génération, date du jour par défaut. Test : deux validations du même objet
→ même sérialisation.

## 9. Exemples minimaux (voir test)

Home MQ indexable ; fiche plage avec images ; page légale extensionless ;
page `noindex` listée (INVALIDE — doit échouer) ; canonical externe
(`indexable:false`, `canonical-externe`).

## 10. Limites assumées de cette étape

- Contrat seul : aucun générateur, aucune donnée prod, aucun usage MCP.
- `inlinks` dépend du graphe existant (périmé = `null` + re-crawl, pas de
  second calcul).
- Redirections 307 Cloudflare/host hors repo : le générateur ne pourra
  exclure que ce qu'il connaît (noindex, règles `.htaccess` versionnées,
  paires 307 documentées) ; le crawl live reste l'arbitre final.
