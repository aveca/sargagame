# TYPESAFE / JEV — ARCHITECTURE (2026-09-22)

## Principe impératif

```
USER STATE/TEXT → JEV (jugement typé) → RÉSULTAT TYPÉ → CODE DÉTERMINISTE → ACTION
```

Jev ne touche JAMAIS : prix, montants, paiement, Mollie, webhook, entitlement, auth, sécurité.
Le produit fonctionne intégralement sans Jev (fallback déterministe partout).

## Ce qui est en prod (v1)

**Routeur d'intention landing** — quand la recherche par nom de plage échoue :

```
texte libre → POST /api/jev-intent.php → Choice (7 classes) → routage code
  today_verdict / when_later / which_beach / avoid_seaweed / trip_planning → fiche du meilleur spot
  b2b → /sargasses-pour-hotels/ (EUR seulement)
  off_topic / échec → comportement d'avant (carte)
```

PROBLEM : recherche sans résultat = sortie silencieuse (relevé champ, emmêlé au funnel).
EVIDENCE : modal→CTA réel 4 %, trafic micro — chaque visiteur qualifié perdu est coûteux.
METRIC : `sg_jev_intent_ask` / `sg_jev_intent` (par classe) / `sg_jev_intent_fallback` dans le funnel Supabase. Décision à 4 semaines.

## Garde-fous en place

| Risque | Contrôle |
|---|---|
| Clé exposée | server-side uniquement (`TYPESAFE_API_KEY` env ou `typesafe-config.php` gitignored) |
| Jev down/lent | timeout dur 4 s + client retourne à l'état d'avant en silence |
| Coût | rate-limit 12/h/IP + input 6–220 chars + 1 seule question |
| Décision fausse | jamais d'action destructive : le routage mène toujours à de la valeur gratuite |
| Dérive | kill switch client `?jev=0` + serveur `TYPESAFE_JEV=off` |
| Mesure | contrat `scripts/tests/jev-intent-contract.test.cjs` (21 audits) |

## Prochains cas pertinents (file, non implémentés)

1. **B2B qualification** (script offline) : scorer la cohorte prospects (15→100) sur fit/impact — choix Score. Décision d'implémenter quand la 1re vague d'envois existe.
2. **Journey routing chat** (SargaChat) : classifier les questions chat → VERDICT/FORECAST/ALTERNATIVE/TRUST. Jev évite les règles-regex fragiles. Attendre volume chat mesuré d'abord.
3. **Reranking des alternatives :** « quelle plage alternative pour CET effort » — Score jugé par distance+état, déjà déterministe aujourd'hui ; Jev ajouterait la logique « family-friendly/parking » si données disponibles. DEFER (données insuffisantes).

## Non-cas exclus (par principe)

- Verdict plage (calcul déterministe existant, obligation de transparence).
- Prix/offres.
- Copywriting (contenu généré opaque = hors moat « mesuré pas deviné »... sauf labellisé comme tel).

## HUMAN ACTION REQUIRED

`TYPESAFE_API_KEY` absente de l'environnement (process/user/machine/.env vérifiés 2026-09-22).
Action : placer la clé dans `public/api/typesafe-config.php` sur le serveur (copier `typesafe-config.example.php`) OU en variable d'environnement serveur. Tant qu'elle manque : l'endpoint répond `fallback:true` en <50 ms — produit intact, feature silencieusement inactive.
