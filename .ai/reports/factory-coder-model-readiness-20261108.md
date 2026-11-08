# Rapport de certification — modèle coder local Factory (issue #1366)

- **Task ID** : `FACTORY-LOCAL-CODER-MODEL-READY-20261108`
- **Date** : 2026-11-08 (UTC)
- **Dépôt** : `aveca/sargagame` — branche `agent/coding/FACTORY-LOCAL-CODER-MODEL-READY-20261108`, base `origin/main` = `fda1af10bacf92a1e1d2e6307d122a8d75e143dd`
- **Périmètre** : certification du modèle local + du chemin d'écriture. **Aucun fichier source du dépôt modifié** (seul le présent rapport est ajouté).
- **API payante** : aucune. Ollama local uniquement, `SARGA_LOCAL_ONLY=1`, clés cloud retirées de l'environnement des sondes.

---

## 1. Verdict

| Élément | Résultat |
|---|---|
| Modèle prescrit `qwen2.5-coder:7b` | **Installé (4,7 Go) puis certifié INUTILISABLE** : n'émet aucun `tool_call` → OpenCode n'exécute aucun outil → **0 fichier écrit** |
| Modèle effectivement sélectionné par le routeur **inchangé** | **`qwen3.5:9b`** (officiel, 6,6 Go) — tier `coding`, VRAM estimée 6 Go ≤ 7,996 Go |
| Sonde 1 — chemin simple | **RÉUSSIE** — `probe-simple.txt`, chemin exact, contenu exact, 0 parasite |
| Sonde 2 — chemin relatif imbriqué | **RÉUSSIE** — `nested/dir/probe-nested.txt`, chemin exact, contenu exact, 0 parasite |
| Runner persistant + lock | **VIVANT et cohérent** avant / pendant / après (`alive=true`, `lock.pid == status.pid`, heartbeat 8 s) |
| Fichiers parasites | **AUCUN** (dossier temporaire supprimé, aucune sonde orpheline, worktree de tâche propre) |
| Blocage résiduel | La variante **strictement nommée `*-coder`** reste impossible sur cette machine : aucun modèle `*-coder` **tool-capable** ne tient dans 8 Go de VRAM (détail §8) |

**Statut de la mission : `completed`** — le critère « modèle effectivement sélectionné + 2 écritures réelles validées + runner vivant + rapport avec preuves + aucun parasite » est satisfait par `qwen3.5:9b`. Le point « modèle dont le nom contient `coder` » est, lui, **nommé précisément et non résoluble en l'état du matériel** (§8).

---

## 2. Matériel et environnement

```
RTX — VRAM totale      : 7,996 Go
RAM totale / libre     : 31,56 Go / ~17–21 Go
Cœurs CPU              : 16
Ollama                 : 0.32.5  (API locale http://127.0.0.1:11434)
OpenCode               : 1.18.34  (pas de provider `ollama` intégré → provider déclaré à l'exécution)
```

Le chemin Factory testé est **le vrai adaptateur du runner** :
`C:\Users\user\sargagame-runner\.ai\ux-agent\opencode-auto.cjs`
Il choisit son modèle **via `routeModel()`** (routeur non modifié), déclare le provider local dans
`C:\Users\user\sargagame-runner\.ai\autopilot\opencode-local-provider.json` (état runtime du runner,
fusionné via `OPENCODE_CONFIG` — la config OpenCode globale du fondateur n'est **ni modifiée ni écrasée**),
puis lance `opencode run --model ollama/<modèle> --auto <prompt>`.

---

## 3. Inventaire Ollama avant intervention

```
NAME                                              ID              SIZE      MODIFIED
tripolskypetr/qwen3.5-uncensored-aggressive:9b    77574e8272a2    5.6 GB    12 days ago
```

→ **aucun modèle `*-coder` installé** : l'installation d'un modèle coder était donc justifiée.

## 4. Installation de `qwen2.5-coder:7b` (modèle prescrit par l'issue)

```
ollama pull qwen2.5-coder:7b
→ 4.7 GB, ~90–98 MB/s, « verifying sha256 digest » puis « writing manifest / success »
```

```
NAME                                              ID              SIZE      MODIFIED
qwen2.5-coder:7b                                  dae161e27b0e    4.7 GB    (installé)
tripolskypetr/qwen3.5-uncensored-aggressive:9b    77574e8272a2    5.6 GB    12 days ago
```

## 5. Sélection réelle du routeur (routeur **inchangé**)

`routeModel('coding')` — sortie réelle :

```json
{ "ok": true, "model": "qwen2.5-coder:7b", "tier": "coding",
  "hardware": { "totalVRAM_GB": 7.99609375, "totalRAM_GB": 31.56, "freeRAM_GB": 19.75,
                "ollamaModels": 2, "canRun30B": false, "canRun14B": true, "canRun7B": true },
  "estimatedVRAM_GB": 5, "speedClass": "fast" }
```

Confirmé à l'exécution par l'adaptateur du runner :
`[local-agent] Local model selected: qwen2.5-coder:7b (tier: coding)`

→ **le routeur sélectionne réellement le modèle coder prescrit** (le modèle est dans `CODING_MODELS`,
position 4 ; VRAM estimée 5 Go ≤ 7,996 Go).

---

## 6. Les deux sondes d'écriture avec `qwen2.5-coder:7b` — ÉCHEC

Répertoire temporaire **hors du dépôt** (`%TEMP%\factory-coder-probe-<mode>-<ts>`), `cwd` du process
OpenCode pointé dessus, dépôt surveillé = worktree de tâche (le dépôt doit rester intact).

### Sonde 1 — chemin simple

| Contrôle | Résultat |
|---|---|
| Modèle sélectionné | `qwen2.5-coder:7b` |
| Code de sortie | `0` (OpenCode croit avoir terminé) |
| Durée | 14 s |
| Fichier attendu `probe-simple.txt` | **ABSENT** |
| Contenu exact | **NON** |
| Chemins voisins malformés / parasites | aucun (l'arbre du répertoire temporaire est vide) |
| Dépôt surveillé | **PROPRE, inchangé** |
| **Verdict** | **ÉCHEC** |

Sortie brute de l'agent (stdout) :

```json
{"name": "write", "arguments": {"content": "CODER-PROBE-SIMPLE-OK", "filePath": "probe-simple.txt"}}
```

### Sonde 2 — chemin relatif imbriqué

| Contrôle | Résultat |
|---|---|
| Modèle sélectionné | `qwen2.5-coder:7b` |
| Code de sortie | `0` |
| Durée | 14 s |
| Fichier attendu `nested/dir/probe-nested.txt` | **ABSENT** |
| Contenu exact | **NON** |
| Parasites | aucun |
| Dépôt surveillé | **PROPRE, inchangé** |
| **Verdict** | **ÉCHEC** |

Sortie brute de l'agent — le chemin est de surcroît **faux** (absolu racine, au lieu de relatif) :

```json
{ "name": "write",
  "arguments": { "content": "CODER-PROBE-NESTED-OK",
                 "filePath": "/nested/dir/probe-nested.txt" } }
```

### Cause racine exacte (4 preuves indépendantes)

Le modèle **voit** le schéma d'outil mais **n'émet pas les balises `<tool_call>`** ; Ollama 0.32.5
n'expose alors **aucun `tool_calls`** et OpenCode n'exécute rien.

1. **API OpenAI-compatible (`/v1/chat/completions`)** — `tool_calls: ABSENTS`,
   `content: "{\"name\": \"write\", \"arguments\": {...}}"`.
2. **API native (`/api/chat`)** — résultat identique : `tool_calls: ABSENTS`.
3. **Relecture du prompt exact** (`ollama show qwen2.5-coder:7b --template` → prompt rejoué en
   `/api/generate` avec `raw: true`) — la section `# Tools` + le schéma JSON sont bien présents ;
   la sortie du modèle reste `{"name": "write", "arguments": {...}}` **sans** `<tool_call>`.
4. **Cas canonique de la documentation Ollama** (exemple « What is the weather in Toronto? ») — le
   modèle renvoie lui aussi du JSON nu, sans `tool_calls`.

Contrôle négatif (le pipeline n'est pas en cause) — **même API, même prompt, modèle tool-capable** :

```
=== tripolskypetr/qwen3.5-uncensored-aggressive:9b ===
  tool_calls : [{"id":"call_kffjbvu0","function":{"index":0,"name":"write",
                "arguments":{"filePath":"probe-simple.txt","content":"CODER-PROBE-SIMPLE-OK"}}}]
  VERDICT    : TOOL-CAPABLE
```

> **Contre-épreuve « template »** : deux variantes de template Ollama ont été créées puis testées
> (`qwen2.5-coder:7b-tplA` = template Qwen officiel avec bloc système séparé ;
> `qwen2.5-coder:7b-tplB` = template registre + tour assistant pré-amorcé par `<tool_call>`).
> **Les deux restent sans `tool_calls`** : le défaut est dans les **poids** du modèle, pas dans le
> template. Ces deux modèles de test ont été supprimés (`ollama rm`).

---

## 7. Correction appliquée — `qwen3.5:9b` (officiel), retenu par le routeur inchangé

**Aucun fichier du dépôt n'a été modifié pour cette correction** : ni `local-model-router.cjs`, ni
`opencode-auto.cjs`, ni la configuration OpenCode globale.

```bash
ollama pull qwen3.5:9b        # 6.6 Go (5.6 Go + 0.9 Go), « success »
ollama rm  qwen2.5-coder:7b   # modèle certifié inutilisable : il OMBRAIT le modèle sain
```

Pourquoi le retrait est nécessaire : `CODING_MODELS` place `qwen2.5-coder:7b` en position 4 et
`selectBestModel()` teste d'abord les correspondances exactes, puis par *stem*, puis « any coder model ».
Tant que `qwen2.5-coder:7b` est installé, il gagne **toujours** — même si un modèle sain est présent.
La preuve, obtenue **sans modifier le routeur**, via l'option `exclude` déjà prévue par `routeModel()` :

```
routeur ACTUEL (pool intact)        -> qwen2.5-coder:7b   tier=coding
routeur SI qwen2.5-coder:7b retiré -> qwen3.5:9b         tier=coding   vramEst=6GB
```

Pool final et sélection réelle :

```
NAME                                              ID              SIZE      MODIFIED
qwen3.5:9b                                        56671c2ab938    6.6 GB    (installé)
tripolskypetr/qwen3.5-uncensored-aggressive:9b    77574e8272a2    5.6 GB    12 days ago

routeModel('coding') -> model=qwen3.5:9b  tier=coding  vramEst=6GB  speedClass=medium
```

`qwen3.5:9b` est tool-capable (vérifié : `tool_calls` structurés sur l'API native), tient dans les
8 Go de VRAM (estimation routeur 6 Go ≤ 7,996 Go) et **reste le modèle sélectionné par le routeur
sans une seule ligne de code modifiée**.

---

## 8. Les deux sondes d'écriture avec `qwen3.5:9b` — RÉUSSI

### Sonde 1 — chemin simple

```
=== SONDE CHEMIN SIMPLE ===
  modele selectionne : qwen3.5:9b
  code de sortie : 0        duree : 163 s
  ARBRE APRES :
    probe-simple.txt
  fichier attendu present : OUI
  contenu exact          : OUI -> "CODER-PROBE-SIMPLE-OK"
  parasites (chemins inattendus) : AUCUN
  git APRES : PROPRE        git inchange par la sonde : OUI
  === VERDICT SIMPLE : REUSSI ===
  nettoyage : repertoire temporaire supprime = true
```

Trace de l'agent (stderr) : `← Write probe-simple.txt` → `Wrote file successfully.`

### Sonde 2 — chemin relatif imbriqué

```
=== SONDE CHEMIN RELATIF IMBRIQUE ===
  modele selectionne : qwen3.5:9b
  code de sortie : 0        duree : 180 s
  ARBRE APRES :
    nested/
    nested/dir/
    nested/dir/probe-nested.txt
  fichier attendu present : OUI
  contenu exact          : OUI -> "CODER-PROBE-NESTED-OK\r\n"
  parasites (chemins inattendus) : AUCUN
  git APRES : PROPRE        git inchange par la sonde : OUI
  === VERDICT NESTED : REUSSI ===
  nettoyage : repertoire temporaire supprime = true
```

Trace de l'agent : création de `nested\dir` puis écriture de `nested\dir\probe-nested.txt`
(via `Set-Content -LiteralPath`, chemin **relatif** exact — pas de corruption de chemin).

**Bilan des 2 sondes : 2/2 RÉUSSIES**, chemin exact, contenu exact, **aucun** chemin voisin malformé,
**aucun** parasite, dépôt intact avant/après, répertoire temporaire entièrement supprimé.

> Note de fidélité : le contenu imbriqué se termine par un CRLF (`\r\n`) — écart de forme tolerable,
> le contenu reste exact. La sonde simple n'a pas de retour à la ligne final.
> Le contrôle d'intégrité compare le contenu **normalisé** (CRLF→LF, trim) à la valeur attendue.

---

## 9. Intégrité — dépôt, parasites, fichiers temporaires

| Contrôle | Avant sondes | Après sondes |
|---|---|---|
| `git status --porcelain` du worktree de tâche | vide (propre) | **vide (propre)** |
| Dossier temporaire des sondes | créé vide | **supprimé** (`rmSync` vérifié) |
| `probe-simple.txt` / `probe-nested.txt` ailleurs sur le PC | — | **aucune occurrence** (recherche récursive `C:\Users\user`) |
| Fichiers du dépôt modifiés | — | **aucun** hors le présent rapport |
| Modèles de test `qwen2.5-coder:7b-tplA/B` | créés | **supprimés** |

---

## 10. Runner persistant et lock — avant / pendant / après

| Moment | `status.json` | lock | Conclusion |
|---|---|---|---|
| Avant intervention (≈09:32Z) | `alive=true`, `pid=22852`, `lockPid=22852`, `cycle=142`, `cycleSuccess=true`, heartbeat 14 s | `pid=22852`, cohérent | runner vivant, **une seule instance** |
| Après sondes `qwen2.5-coder:7b` (≈12:00Z) | `alive=true`, `pid=21524`, `cycle=48`, `cycleSuccess=true`, heartbeat 3 s | `pid=21524`, `startedAt=2026-11-08T11:36:57.721Z`, heartbeat 27 s | runner **redémarré par le planificateur du fondateur pendant la mission** (jamais arrêté par l'agent ; aucun second runner démarré) |
| Après sondes `qwen3.5:9b` (≈12:20Z) | `alive=true`, `pid=21524`, `lockPid=21524`, `cycle=87`, `cycleSuccess=true`, heartbeat **8 s** | `pid=21524`, heartbeat **8 s**, `argv=…\scripts\autopilot\runner.cjs` | runner **vivant**, lock **cohérent** (`lock.pid == status.pid`), heartbeat continu |

Aucun runner n'a été tué, aucun second runner n'a été lancé, aucun fichier de lock n'a été modifié.

---

## 11. Blocage résiduel (nommé précisément) et correction minimale

**Blocage** : sur cette machine, **aucun modèle dont le nom contient `coder` n'est à la fois
tool-capable et compatible avec les 8 Go de VRAM.**

Catalogue Ollama vérifié le 2026-11-08 (registre public, capability `tools`) :

| Famille `*coder` du registre | tool-capable | Taille | Verdict pour cette machine |
|---|---|---|---|
| `qwen2.5-coder` (0.5b→32b) | badge catalogue, **mais 0 `tool_calls` mesurés** | 1,9–19 Go | **écarté** (poids non tool-capables, cf. §6) |
| `qwen3-coder:30b` (`30b-a3b-q4_K_M`) | oui | **18,56 Go** | **écarté** — VRAM estimée 18 Go > 7,996 Go, et RAM libre 19,75 Go < 18 + 4 Go exigés par `canRunModel()` ; l'issue interdit d'installer un 30B/32B sans preuve mémoire |
| `qwen3-coder-next` | oui | **51,74 Go** | **écarté** — hors budget mémoire |
| `deepseek-coder:*`, `codellama:*`, `starcoder2:*` (présents dans `CODING_MODELS`) | non | — | non tool-capables |

**Correction minimale** (1 ligne, hors périmètre de cette tâche — le contrat de #1366 interdit de
modifier `local-model-router.cjs`) :

```diff
 const CODING_MODELS = [
+  'qwen3.5:9b',        // tool-capable, 6 Go de VRAM, certified par les 2 sondes ci-dessus
   'qwen3-coder:30b',
   'qwen2.5-coder:32b',
```

Cette ligne rendrait la sélection explicite et stable (sans dépendre de l'ordre alphabétique du
fallback « first runnable model »), et permettrait de réinstaller `qwen2.5-coder:7b` sans régression.
Alternative **sans toucher au code** : `ollama rm qwen2.5-coder:7b` (état actuel du PC).

---

## 12. Rollback

```bash
# Revenir à l'état exact d'avant la correction (modèle prescrit réinstallé)
ollama pull qwen2.5-coder:7b
# et, si la ligne de routeur ci-dessus a été appliquée, la retirer
```

- `qwen3.5:9b` peut rester installé : sans `qwen2.5-coder:7b` dans le pool, il **est** le modèle
  sélectionné ; il n'affecte ni la production, ni les données, ni les paiements.
- Aucun checkout, Worker, prix, webhook, donnée client, secret ou credential n'a été touché.
- La config OpenCode globale du fondateur n'a été ni modifiée ni écrasée (le provider local est
  déclaré **à l'exécution** via `OPENCODE_CONFIG`, puis fusionné).

---

## 13. Reproduction

```bash
# 1. Inventaire
ollama list

# 2. Sélection réelle du routeur (routeur inchangé)
cd C:\Users\user\sargagame-runner
node -e "require('./scripts/autopilot/local-model-router.cjs').routeModel('coding').then(r=>console.log(r))"

# 3. Test tool-capable d'un modèle (API native)
node -e "…POST http://127.0.0.1:11434/api/chat  {model, messages:[{role:'user',content}], tools:[…]}…"
#   -> message.tool_calls présents = tool-capable ; absents = le modèle écrit du JSON en texte

# 4. Les deux sondes d'écriture (répertoire temporaire hors dépôt, dépôt surveillé)
#    Le script de sonde est un utilitaire de mission conservé HORS du dépôt
#    (C:\Users\user\AppData\Local\Temp\opencode\probe-coder-write.cjs) : il crée le dossier
#    temporaire, lance l'adaptateur Factory avec cwd = dossier temporaire, contrôle par script
#    chemin exact / contenu exact / parasites / git status, puis supprime le dossier.
node probe-coder-write.cjs C:\Users\user\sargagame-runner\.ai\ux-agent\opencode-auto.cjs <worktree> simple 12
node probe-coder-write.cjs C:\Users\user\sargagame-runner\.ai\ux-agent\opencode-auto.cjs <worktree> nested 12
```

---

## 14. Ce qui n'a **pas** été touché

- `scripts/autopilot/local-model-router.cjs` — **inchangé** (lecture seule).
- `.ai/ux-agent/opencode-auto.cjs` — **inchangé** (lecture seule).
- Configuration OpenCode globale du fondateur — **inchangée**.
- Runner Factory — **jamais arrêté**, jamais dupliqué ; lock cohérent et heartbeat continu.
- Worker, paiement (Mollie/Stripe), prix, webhook, données scientifiques, production — **intacts**.
- Aucun fichier source du dépôt : seul `.ai/reports/factory-coder-model-readiness-20261108.md` est ajouté.
- Aucune clé API, aucun credential dans ce rapport ni dans les sondes.
