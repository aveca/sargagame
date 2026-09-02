# 09 — P1 CLOUDFLARE SSL FULL AGENT

Tu es le release/SRE agent responsable de la configuration TLS des 6 zones Cloudflare Sargagame.

## Mission

Faire passer les 6 zones Cloudflare du mode SSL/TLS **Flexible** au mode **Full**, puis prouver que les six domaines restent accessibles en HTTPS sans boucle de redirection.

Domaines :

```text
sargasses-martinique.com
sargasses-guadeloupe.com
sargassumpuntacana.com
sargassummiami.com
sargassumcancun.com
sargazotulum.com
```

Le dépôt documente que les boucles 308 historiques ont déjà été traitées côté `_redirects`; le passage Flexible → Full reste une action d'infrastructure séparée. Ne réintroduis pas `_redirects` SPA et ne touche pas au routing applicatif sauf preuve nécessaire.

## Précondition

Utiliser `CLOUDFLARE_API_TOKEN` déjà provisionné dans l'environnement de l'agent.

**Ne jamais afficher la valeur du token.**

Si le token est absent ou insuffisant : arrêter proprement, identifier la permission manquante, ne pas contourner avec une autre méthode et ne pas inventer un résultat.

## Méthode

### 1. Découverte

Identifier pour chaque domaine :
- zone ID ;
- mode SSL/TLS actuel ;
- éventuelles règles qui forcent HTTPS ;
- statut DNS/proxy pertinent.

### 2. Pré-check

Avant toute modification :

```bash
curl -I http://<domain>
curl -I https://<domain>
```

Tester les chaînes de redirection et noter l'état initial.

### 3. Modification

Via l'API Cloudflare, modifier uniquement le paramètre de chiffrement requis pour obtenir **Full**.

- aucune autre setting de zone ;
- aucune modification DNS ;
- aucune règle de cache ;
- aucun changement Pages/Workers.

La modification doit être idempotente : une zone déjà en `full` est considérée comme OK.

### 4. Vérification

Pour les 6 domaines :

```bash
curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://<domain>/
curl -I http://<domain>/
curl -I https://<domain>/
```

Vérifier :
- HTTPS = 200/301 attendu ;
- HTTP converge vers HTTPS sans boucle ;
- maximum raisonnable de redirections ;
- aucun 308 répété ;
- pas de `ERR_TOO_MANY_REDIRECTS` simulable via curl.

Tester aussi une URL cœur du funnel sur au moins MQ et une région USD :

```text
https://sargasses-martinique.com/beach/anse-charpentier/
https://sargassumpuntacana.com/beach/bavaro-beach/
```

## Garde-fous

- Ne modifie **aucun code produit** pour compenser une mauvaise configuration TLS.
- Ne baisse jamais le niveau de sécurité pour faire passer un test.
- Ne touche pas aux certificats manuellement si l'objectif peut être atteint par le réglage de zone.
- Si une zone n'est pas proxyfiée, documenter le cas au lieu de modifier DNS sans mandat.
- Pas de commit de secrets ou de sorties contenant les tokens.

## Definition of Done

- [ ] 6/6 zones en mode `full`
- [ ] 6/6 HTTPS fonctionnent
- [ ] 6/6 HTTP → HTTPS sans boucle
- [ ] 2 deep-links cœur testés
- [ ] aucune modification applicative parasite
- [ ] preuve API avant/après conservée sans secret

## Rapport imposé

```text
TASK: Cloudflare SSL Flexible → Full
ZONES: 6/6

BEFORE:
- MQ: [mode]
- GP: [mode]
- Punta Cana: [mode]
- Miami: [mode]
- Riviera Maya: [mode]
- Tulum: [mode]

AFTER:
- MQ: [full + verification]
- GP: [full + verification]
- Punta Cana: [full + verification]
- Miami: [full + verification]
- Riviera Maya: [full + verification]
- Tulum: [full + verification]

HTTP→HTTPS: [6/6 PASS]
HTTPS ROOT: [6/6 PASS]
DEEP LINKS: [PASS/FAIL]
CODE CHANGES: [NONE | exact files]
BLOCKER: [none | exact]
ROLLBACK: [exact API action]
```

La mission n'est terminée qu'après vérification **live** des six domaines.