# UI-TEST — thèmes (WebKit = moteur Safari)

Test visuel reproductible : `node scripts/ui-test-themes.cjs` (sert un build via `vite preview`
ou un BASE distant, capture chaque thème + galeries dans `/tmp/ui-test/`, écrit `report.json`).

## Couverture
- **5 thèmes in-app** appliqués via `?theme=<id>` sur iPhone 13 (WebKit) : golden (contrôle),
  comic, manga, arcade, sticker. On vérifie `body.theme-*`, présence du picker `.sg-theme-fab`,
  et l'absence d'erreurs JS.
- **3 galeries concept** (32 écrans chacune) : `themes-lab/arena.html` (comic v1),
  `themes-lab/arena-v2.html` (refonte illustrée SVG), `themes-lab/neon.html` (arcade).

## Dernier run (2026-06-19, build local servi en statique)
| Cible | Résultat |
|---|---|
| theme golden | ✅ picker présent (body sans classe = app d'origine) |
| theme comic | ✅ `body.theme-comic`, picker, 0 erreur |
| theme manga | ✅ `body.theme-manga`, picker, 0 erreur |
| theme arcade | ✅ `body.theme-arcade`, picker |
| theme sticker | ✅ `body.theme-sticker`, picker |
| arena.html | ✅ 32 écrans |
| arena-v2.html | ✅ 32 écrans illustrés SVG |
| neon.html | ✅ 32 écrans |

**Note** : les `pageerror` remontés sur certains runs proviennent UNIQUEMENT du conflit
d'origine iframe Stripe (`http://localhost` vs `https://js.stripe.com`) — artefact de la
preview locale en HTTP ; en prod (tout HTTPS) il n'existe pas. Aucun lien avec les thèmes.

## Itérations corrigées suite aux tests
- Soleil golden-hour gris sur iOS → cercles pleins (v206).
- Thème comic : lignes/boutons génériques ne virent plus tous au rouge (rouge = CTA only).
- ARENA v1 (CSS plat) → ARENA v2 (illustré SVG) après retour « refonte totale SVG ».
