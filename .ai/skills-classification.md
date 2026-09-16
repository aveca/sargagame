# Classification des Skills — Sargagame

> Audit effectué 2026-09-16. Basé sur l'existant vérifié dans le repo.
> Catégories standardisées : READ-ONLY / WRITE-LOCAL / GIT / DEPLOY / DATA / PAYMENT / BUSINESS / ORCHESTRATION

---

## Skills Globales (`.opencode/skill/` + `~/.agents/skills/` + `~/.claude/skills/`)

| Skill | Source | Catégorie | Trigger | Offline | Modifie Code | Déploie | Accès Externe |
|-------|--------|-----------|---------|---------|--------------|---------|---------------|
| agents-sdk | `~/.agents/skills/` | ORCHESTRATION | Création agent stateful | ✅ | ✅ | ❌ | Cloudflare |
| cloudflare | `~/.agents/skills/` | ORCHESTRATION/DEPLOY | Travail Workers/Pages/KV/D1/R2 | ❌ | ✅ | ✅ | Cloudflare API |
| cloudflare-email-service | `~/.agents/skills/` | BUSINESS | Envoi/réception email | ❌ | ✅ | ❌ | Cloudflare Email |
| cloudflare-one | `~/.agents/skills/` | ORCHESTRATION | Zero Trust/SASE | ❌ | ✅ | ✅ | Cloudflare One |
| cloudflare-one-migrations | `~/.agents/skills/` | ORCHESTRATION | Migration Zscaler/Palo Alto | ❌ | ✅ | ✅ | Cloudflare One |
| durable-objects | `~/.agents/skills/` | ORCHESTRATION | État coordination (chat, booking) | ✅ | ✅ | ❌ | Cloudflare |
| sandbox-migrate-to-next | `~/.agents/skills/` | WRITE-LOCAL | Portage @cloudflare/sandbox@next | ✅ | ✅ | ❌ | Non |
| sandbox-next | `~/.agents/skills/` | WRITE-LOCAL | Apps Sandbox SDK 1.0 preview | ✅ | ✅ | ❌ | Non |
| sandbox-stable | `~/.agents/skills/` | WRITE-LOCAL | Apps Sandbox stable | ✅ | ✅ | ❌ | Non |
| turnstile-spin | `~/.agents/skills/` | DEPLOY | Setup Turnstile CAPTCHA | ❌ | ✅ | ✅ | Cloudflare API |
| web-perf | `~/.agents/skills/` | READ-ONLY | Audit Core Web Vitals | ❌ | ❌ | ❌ | Chrome DevTools MCP |
| workers-best-practices | `~/.agents/skills/` | READ-ONLY | Review Workers code | ✅ | ❌ | ❌ | Non |
| wrangler | `~/.agents/skills/` | DEPLOY | CLI Workers/KV/R2/D1/Queues | ❌ | ❌ | ✅ | Cloudflare API |
| sargasses | `~/.claude/skills/` | BUSINESS/DATA | Projet sargasses (pipeline, métriques, deploy) | ❌ | ✅ | ✅ | GH Actions, FTP, Supabase |
| trading | `~/.claude/skills/` | BUSINESS | Bot trading Hyperliquid/Polymarket | ❌ | ✅ | ❌ | Railway, APIs trading |
| funnel-review | `.opencode/skill/` | READ-ONLY/BUSINESS | Review funnel conversion | ✅ | ❌ | ❌ | Non |

---

## Skills Repo (`.claude/skills/` — chargées à la demande)

| Skill | Fichier | Catégorie | Trigger | Offline | Modifie Code | Déploie | Accès Externe |
|-------|---------|-----------|---------|---------|--------------|---------|---------------|
| sg-design-system | `sg-design-system/SKILL.md` | READ-ONLY | Toute création/modif visuelle | ✅ | ❌ | ❌ | Non |
| sg-session-startup | `sg-session-startup/SKILL.md` | ORCHESTRATION | Début session (`npm run session`) | Partiel | ❌ | ❌ | GH Actions (gh) |
| sg-svg-scene | `sg-svg-scene/SKILL.md` | WRITE-LOCAL | Code SVG/animation/Le Veilleur | ✅ | ✅ | ❌ | Non (serveur local 8799) |
| sg-ux-audit | `sg-ux-audit/SKILL.md` | READ-ONLY | Audit UX Playwright/screenshots | ❌ | ❌ | ❌ | Playwright/Chromium |
| video-brief | `video-brief/SKILL.md` | WRITE-LOCAL/BUSINESS | Génération vidéo quotidienne | ✅ | ✅ | ❌ | ffmpeg, edge-tts, Playwright |

---

## Légende des Catégories

| Catégorie | Description | Exemples d'actions |
|-----------|-------------|-------------------|
| **READ-ONLY** | Inspection, audit, lecture seule | Audit UX, review code, analyse perf, lecture docs |
| **WRITE-LOCAL** | Modification fichiers locaux uniquement | Création composants, edit CSS, scripts locaux |
| **GIT** | Opérations git (commit, branch, PR) | `agent-handoff.cjs --ship`, commit conventionnel |
| **DEPLOY** | Déploiement production / infra | `wrangler deploy`, `daily-copernicus.yml`, FTP |
| **DATA** | Pipeline données, Supabase, analytics | `fetch-sargassum-live.cjs`, `daily-metrics.json` |
| **PAYMENT** | Flux paiement (Mollie, PayPal, Stripe) | `mollie.php`, `mollie-webhook.php`, paylinks |
| **BUSINESS** | Funnel, CRO, SEO, outreach, pricing | `b2b-cold-outreach.cjs`, `verdict-du-jour.cjs` |
| **ORCHESTRATION** | Coordination agents, CI/CD, loops | `agent-handoff.yml`, `release-serialize.cjs` |

---

## Règles de Chargement

1. **Globales** : Disponibles partout, chargées via `skill <name>` (opencode) ou auto (Claude Code)
2. **Repo (`.claude/skills/`)** : Spécifiques Sargagame, chargées **à la demande** selon le contexte :
   - `sg-session-startup` : **Obligatoire** au début de CHAQUE session (règle CLAUDE.md)
   - `sg-design-system` : **Obligatoire** avant TOUTE modif visuelle
   - `sg-svg-scene` : Quand on code SVG/animation/Le Veilleur
   - `sg-ux-audit` : Demande audit UX, "vérifie le site", travail funnel/paywall
   - `video-brief` : Demande vidéo quotidienne, brief Reels/TikTok
3. **Pas de chargement automatique global** — lazy-loading uniquement (économie contexte)

---

## Compétences par Rôle Agent (mapping AGENTS.md)

| Rôle | Skills Requises | Skills Optionnelles |
|------|-----------------|---------------------|
| Product Agent | `sg-session-startup`, `sargasses` | `funnel-review`, `sg-design-system` |
| Architect Agent | `cloudflare`, `workers-best-practices`, `agents-sdk` | `durable-objects`, `wrangler` |
| Coding Agent | `sg-design-system`, `sg-svg-scene`, `workers-best-practices` | `sg-session-startup`, `video-brief` |
| QA Agent | `sg-ux-audit`, `web-perf` | `sg-session-startup` |
| UI/UX Agent | `sg-design-system`, `sg-svg-scene`, `sg-ux-audit` | `video-brief` |
| Security Agent | `workers-best-practices`, `cloudflare-one` | `turnstile-spin` |
| DevOps Agent | `wrangler`, `cloudflare`, `cloudflare-email-service` | `agents-sdk` |
| Data Agent | `sargasses`, `web-perf` | `durable-objects` |
| Growth Agent | `sargasses`, `funnel-review`, `video-brief` | `sg-design-system` |
| Release Agent | `sg-session-startup`, `wrangler`, `workers-best-practices` | `cloudflare` |
| Univers & Motion Agent | `sg-design-system`, `sg-svg-scene`, `video-brief` | `sargasses` |

---

## Vérification Offline/Online

| Skill | Peut fonctionner 100% offline | Nécessite GitHub | Nécessite Cloudflare | Nécessite Supabase | Nécessite Internet |
|-------|------------------------------|------------------|---------------------|-------------------|-------------------|
| sg-design-system | ✅ | ❌ | ❌ | ❌ | ❌ |
| sg-session-startup | ⚠️ (gh absent) | ✅ (check 4) | ❌ | ❌ | ✅ (gh) |
| sg-svg-scene | ✅ (serveur local) | ❌ | ❌ | ❌ | ❌ |
| sg-ux-audit | ❌ (Playwright) | ❌ | ❌ | ❌ | ❌ (Chromium) |
| video-brief | ✅ (ffmpeg local) | ❌ | ❌ | ❌ | ❌ |
| sargasses | ❌ | ✅ | ✅ | ✅ | ✅ |
| wrangler | ❌ | ❌ | ✅ | ❌ | ✅ |
| agents-sdk | ❌ | ❌ | ✅ | ❌ | ✅ |

---

## Notes Importantes

1. **sg-session-startup** : Le script `npm run session` (`scripts/cursor-session-startup.cjs`) exécute 7 checks. Si `gh` absent (container web), checks 4 et 6 sont sautés ou fallback MCP.
2. **sg-ux-audit** : Nécessite Playwright + Chromium installé. Ne fonctionne pas en mode headless pur sans browser.
3. **video-brief** : 100% local (ffmpeg + edge-tts + Playwright pour capture). Aucun service cloud.
4. **sargasses** : Skill "mère" qui orchestre pipeline, métriques, deploy. Accède à tout (GH, CF, Supabase, FTP, Mollie).
5. **Aucune skill ne modifie `dist/`** — build généré uniquement.
6. **Money-path** : Seul `sargasses` et les scripts `public/api/mollie*.php` touchent au paiement. Skills globales n'ont pas accès.