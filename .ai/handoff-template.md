# Template de Handoff — Passation entre agents

> **Utilisation** : Copier ce template, remplir, ajouter au DÉBUT de `.ai/current_state.md`
> Format strict — lisible par script `scripts/agent-handoff.cjs`

---

## YYYY-MM-DD HH:MM UTC · Agent: <NOM_AGENT> (<TYPE_AGENT>)

### Travail effectué
- **Résumé 1 ligne** : <ce qui a été fait>
- **Détails** :
  - <point 1>
  - <point 2>
  - <point 3>

### Fichiers modifiés
- `<chemin/fichier1.ext>` — <description courte>
- `<chemin/fichier2.ext>` — <description courte>
- `<chemin/fichier3.ext>` — <description courte>

### Tests réalisés
- [ ] `npm run build` → exit 0
- [ ] `node scripts/check-bundle-budget.cjs` → ≤ 210 Ko
- [ ] `php -l` sur fichiers PHP touchés → OK
- [ ] `node scripts/ux-smoke.mjs` → 4 tokens OK
- [ ] `npx playwright test` → <résultat>
- [ ] Autre : <description>

### Problèmes restants / Blockers
- [ ] <ID> : <description> — <sévérité> — <prochaine action>
- [ ] <ID> : <description> — <sévérité> — <prochaine action>

### Prochaine action recommandée
1. <Action prioritaire 1> — Rôle suggéré : <type_agent>
2. <Action prioritaire 2> — Rôle suggéré : <type_agent>
3. <Action prioritaire 3> — Rôle suggéré : <type_agent>

### Branche / PR
- Branche : `agent/<type>/<tache-id>`
- PR : #<numéro> (si créé)
- Commit head : `<hash court>`

---

## Exemple rempli

## 2026-07-31 19:30 UTC · Agent: CTO Architect (OpenCode)

### Travail effectué
- **Résumé 1 ligne** : Transformation AI-native complète du repo (mémoire partagée, rôles, CI, handoff auto)
- **Détails** :
  - Créé 7 fiches rôles dans `.ai/roles/`
  - Créé template handoff + boucle autonome + workflow GH Actions
  - Créé script handoff automatisé
  - Mis à jour AGENTS.md avec architecture complète

### Fichiers modifiés
- `.ai/roles/product-agent.md` — rôle Product Agent
- `.ai/roles/architect-agent.md` — rôle Architect Agent
- `.ai/roles/coding-agent.md` — rôle Coding Agent
- `.ai/roles/qa-agent.md` — rôle QA Agent
- `.ai/roles/ui-ux-agent.md` — rôle UI/UX Agent
- `.ai/roles/security-agent.md` — rôle Security Agent
- `.ai/roles/devops-agent.md` — rôle DevOps Agent
- `.ai/roles/data-agent.md` — rôle Data Agent
- `.ai/roles/growth-agent.md` — rôle Growth Agent
- `.ai/handoff-template.md` — ce fichier
- `.ai/autonomous-loop.md` — boucle de travail 24/7
- `.github/workflows/agent-handoff.yml` — workflow CI handoff
- `scripts/agent-handoff.cjs` — script automatisé
- `tests/README.md` — stratégie de tests
- `AGENTS.md` — contrat universel enrichi

### Tests réalisés
- [ ] `npm run build` → exit 0 (à vérifier post-création)
- [ ] `node scripts/check-bundle-budget.cjs` → ≤ 210 Ko (à vérifier)
- [ ] `php -l` sur fichiers PHP touchés → N/A (pas de PHP)
- [ ] `node scripts/ux-smoke.mjs` → 4 tokens OK (à vérifier)
- [ ] `npx playwright test` → pending

### Problèmes restants / Blockers
- [ ] Build verification : confirmer que `npm run build` passe après tous les nouveaux fichiers
- [ ] Webhook secret Mollie : toujours non configuré sur FTP (BUG-2026-001)

### Prochaine action recommandée
1. Vérifier `npm run build` + smoke tests — Rôle : coding_agent
2. Configurer webhook secret Mollie en prod — Rôle : devops_agent + coding_agent
3. Purger A/B tests morts (TASK-P1-001) — Rôle : coding_agent

### Branche / PR
- Branche : `agent/architect/ai-native-setup`
- PR : #<à créer>
- Commit head : `<à remplir>`