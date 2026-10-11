# .ai/certification-report-template.md — Modèle de rapport de certification

> Ce modèle s'applique à TOUT projet utilisant la Factory V3.
> Chaque rapport doit contenir les trois statuts indépendants et ne jamais
> promouvoir global si l'un d'eux vaut NOT_PROVEN ou FAIL.

## Valeurs autorisées (règle absolue)

Les SEULES valeurs de statut autorisées sont : `PASS`, `FAIL`, `NOT_PROVEN`.

- Toute autre valeur (`OK`, `DONE`, `SUCCESS`, `GREEN`, vide, absente, casse
  différente…) est **inconnue/ambiguë** et **bloque la promotion**.
- **GLOBAL = PASS** uniquement si les trois certifications indépendantes
  valent `PASS` **et** que leurs preuves sont vérifiées pour le commit contrôlé.
- Un statut `PASS` écrit ici ou dans `.ai/current_state.md` ne suffit **jamais** :
  il doit être confirmé par le contrat machine `.ai/certification/status.json`
  (preuves sha256 scellées au commit) et valider
  `node scripts/CHECK_certification_status.cjs` (exit 0).

---

## Format du rapport

Chaque rapport doit commencer par le **Résumé global** suivi des trois certificats détaillés.

---

### 1. Résumé global

| Certification | Statut | Preuve | Commit | Date |
| ------------ | ------ | ------ | ------ | ---- |
| TECHNICAL    | PASS / FAIL / NOT_PROVEN | | | |
| PRODUCTION   | PASS / FAIL / NOT_PROVEN | | | |
| BUSINESS     | PASS / FAIL / NOT_PROVEN | | | |
| **GLOBAL**   | **PASS** uniquement si les trois valent **PASS** | Preuves croisées | | |

- Si l'un des trois statuts vaut `NOT_PROVEN` ou `FAIL`, la ligne **GLOBAL** doit valoir `FAIL` ou `NOT_PROVEN`.
- **GLOBAL PASS** n'est autorisé que lorsque les trois cases sont `PASS` et que les preuves sont vérifiées.

---

### 2. Certification TECHNICAL

**Preuve exigée :**

- Build réussi (`npm run build → exit 0`)
- Budget bundle ≤ 210 Ko gzip eager (`check-bundle-budget.cjs`)
- PHP syntaxe (`php -l` sur tous endpoints touchés)
- CI/tests unitaires verts (liste)
- Absence de mocks interdits
- Commit identifié dans `package.json` / git log

**Preuves conservées :**

- `dist/` généré (non validé en direct, mais conservé pour audit)
- Logs CI (GitHub Actions ou équivalent)
- `npm ls` des dépendances
- `git log --oneline -1` (commit head)

**Réserve(s) le cas échéant :**

- *[ex: "Bundle juste sous limite, surveiller grossissement futur"]*

**Verdict :**

- `PASS` → global autorisé si les deux autres aussi.
- `FAIL` / `NOT_PROVEN` → global bloqué.

---

### 3. Certification PRODUCTION

**Preuve exigée :**

- Parcours complet testé sur site public (navigateur réel ou headless authentique)
- Version déployée vérifiée (commit → déploiement → health-check)
- Parcours SOS Plage 24H (si applicable) : `?sos=1 → beach select → CTA → Mollie checkout`
- Pour tout paiement : transaction LIVE confirmée de bout en bout
  - Création commande → confirmation Mollie → webhook reçu → validation side
- Preuves horodatées : captures navigateur, journaux serveur (secrets masqués), IDs transaction (expirés)
- Service/rapport réellement délivré au client

**Preuves conservées :**

- Captures d'écran du parcours complet (avant/après paiement)
- Journaux serveur expurgés des secrets (clés, tokens)
- Receipts Mollie / PayPal (masqués)
- Identifiants de transaction (lien avec le client, masqués)
- URL de déploiement et date/heure

**Réserve(s) le cas échéant :**

- *[ex: "Délai de 24h observé entre paiement et déverrouillage du rapport"]*

**Verdict :**

- `PASS` → global autorisé si les deux autres aussi.
- `FAIL` / `NOT_PROVEN` → global bloqué.

**Note cruciale :** Un test Mollie **TEST** ne prouve **jamais** un paiement **LIVE**. Un endpoint HTTP 200 ne prouve pas qu'une commande a été correctement traitée.

---

### 4. Certification BUSINESS

**Preuve exigée :**

- Trafic acquis mesuré (sessions réelles, pas d'essais internes)
- Utilisateurs / prospects / clients réels (cohorte distincte)
- Conversions payantes mesurées (nombre, taux, CA)
- Chiffre d'affaires et dépenses d'acquisition budgétisées
- Période d'observation définie à l'avance (ex: 30 jours, 90 jours)
- Échantillon statistiquement significatif (ou mention "échantillon pilot")

**Données exclues des résultats :**

- Paiements de test (Mollie TEST, Stripe sandbox)
- Propres essais de l'équipe
- Simulations ou données synthétiques

**Réserve(s) le cas échéant :**

- *[ex: "Échantillon n=12 sur 30 jours — insuffisant pour BUSINESS PASS, statut NOT_PROVEN"]*

**Verdict :**

- `PASS` → global autorisé si les deux autres aussi.
- `FAIL` / `NOT_PROVEN` → global bloqué.

---

### 5. Pièges à éviter

| Situation | Que faire |
| --------- | --------- |
| Un seul statut `PASS`, les deux autres `NOT_PROVEN` | Global = `NOT_PROVEN`. Aucune promotion. |
| Test Mollie TEST affiché comme preuve LIVE | Déclarer `NOT_PROVEN` pour PRODUCTION, ne jamais promouvoir. |
| HTTP 200 sur un endpoint | Suffit pour TECHNICAL seulement, jamais pour PRODUCTION ou BUSINESS. |
| Preuves anciennes de > 30 jours sans nouvelle mesure | Repasser en `NOT_PROVEN` si période expirée. |
| Pas de période d'observation définie | Déclarer `NOT_PROVEN` pour BUSINESS. |

---

### 6. Exemple de remplissage complet

```markdown
## 2026-10-05 — coding_agent (OpenCode)

### Résumé global

| Certification | Statut | Preuve | Commit | Date |
| ------------ | ------ | ------ | ------ | ---- |
| TECHNICAL    | PASS   | Build OK, bundle 178KB, CI 15/15 Mollie TEST | e232b8b1 | 2026-10-05 |
| PRODUCTION   | NOT_PROVEN | Aucun paiement LIVE attesté, pas de navigateur réel | — | — |
| BUSINESS     | NOT_PROVEN | Pas de mesures commerciales récentes (seulement données historiques) | — | — |
| **GLOBAL**   | **NOT_PROVEN** | Toutes les conditions verrouillées | — | — |

### Certification TECHNICAL

- Build OK, bundle 178.34 KB ≤ 210 KB
- PHP lint OK sur 5 endpoints
- 15/15 scénarios Mollie TEST passés
- Commit : e232b8b1

### Certification PRODUCTION

- Aucun paiement LIVE enregistré durant cette campagne
- Pas de navigateur réel ayant effectué le parcours `?sos=1 → report unlock`
- Statut : **NOT_PROVEN**

### Certification BUSINESS

- Données : 16 260ouvertures → 251clics → 14paiements (historique, > 6 mois)
- Période d'observation non définie pour ce rapport
- Statut : **NOT_PROVEN** (échantillon trop ancien / pas d'acquisition récente)

### Pièges évités

- Test Mollie TEST affiché comme preuve LIVE → corrected → NOT_PROVEN
- HTTP 200 surférgé comme preuve PRODUCTION → corrigé → NOT_PROVEN

---

**Vérification du verrouillage :** Tous les chemins de promotion (agent → orchestrator → Git → GitHub Actions → merge → déploiement → vérification LIVE) ont été analysés. Aucun chemin ne contourne les trois barrières indépendantes.

**Prochaine étape :** nouvel audit après insertion de preuves PRODUCTION et BUSINESS en temps réel.
```

---

### 7. Contrat machine associé

Le rapport humain (ce modèle) DOIT être cohérent avec les fichiers machine :

**Déclaration roulante** — `.ai/certification/status.json` : `version: 1`,
une entrée par certification avec `status` (`PASS`/`FAIL`/`NOT_PROVEN`).
C'est une déclaration, pas une preuve.

**Attestations opposables** — `.ai/certification/attestations/<sha>.json` :
`version: 2`, `target` = sha40 du **commit produit** attesté (== nom du
fichier), une entrée par certification, et pour tout `PASS` : `commit` =
cible, `certifiedAt`, `expiresAt` (≤ 31 jours), `evidence[]` (`path` +
`sha256`, contenu du fichier scellé au sha de la cible).

- Résolution de l'autoréférence : un manifeste versionné ne peut pas contenir
  le SHA de son propre commit. L'attestation pour le commit produit P est
  donc portée par un ou plusieurs commits ultérieurs **ne touchant que
  `.ai/certification/`**. Le contrôle de déploiement remonte HEAD en sautant
  ces commits-là pour trouver le commit produit effectif ; toute modification
  de code non attestée change ce commit et **bloque** le déploiement.
- `PRODUCTION: PASS` exige de plus `paymentMode: "live"` et aucune preuve
  contenant `tr_test_` (Mollie TEST).
- `BUSINESS: PASS` exige `observationPeriod {from,to}` close il y a ≤ 31
  jours, `attributedToCommit` = cible, jamais `historical: true`.
- Une preuve marquée `simulated: true` disqualifie immédiatement.
- **Contrôle A (CI des PR)** : `node scripts/CHECK_certification_status.cjs --mode pr`
  — vocabulaire strict + cohérence des attestations ; tolère `NOT_PROVEN`.
- **Contrôle B (avant déploiement/promotion)** : `--mode deploy` — trois PASS
  + preuves vérifiées pour le commit produit effectif ; exit 0 ou blocage.
  Aucune option (`--commit`, `--now`, variable d'env) ne contourne ce verdict.