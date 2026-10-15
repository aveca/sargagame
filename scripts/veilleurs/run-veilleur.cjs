#!/usr/bin/env node
/**
 * run-veilleur.cjs <id> — UN Veilleur (job de la matrix, tourne en parallèle).
 * Produit un brief d'intelligence daté pour SON marché. LECTURE SEULE + génération.
 * NE DÉCLENCHE JAMAIS d'envoi (outreach/drip/dunning restent aux workflows dédiés).
 *
 * mode "script"  : brief déterministe depuis la donnée repo (jamais de LLM).
 * mode "hybrid"  : LLM si ANTHROPIC_API_KEY **et** SARGA_PAID_LLM=1, sinon brief déterministe.
 * mode "agent"   : LLM si clé + opt-in, sinon recon déterministe + note.
 *
 * MODE GRATUIT (2026-10-15, directive direction) : aucun appel de modèle payant.
 * Le chemin LLM est OFF par défaut ; il n'est utilisé que si l'opt-in explicite
 * SARGA_PAID_LLM=1 est posé dans le workflow (défaut absent = zéro appel paid,
 * même si le secret ANTHROPIC_API_KEY existe). Sans ce flag → recon déterministe.
 *
 * Sortie : scripts/veilleurs/out/<id>/<date>.md + latest.json
 */
const { registry, situation, rel, today, fs, path } = require('./lib.cjs')

const id = process.argv[2]
if (!id) { console.error('usage: run-veilleur.cjs <id>'); process.exit(1) }
const v = registry().find(x => x.id === id)
if (!v) { console.error(`veilleur inconnu: ${id}`); process.exit(1) }

const sit = situation()
const outDir = rel('scripts', 'veilleurs', 'out', id)
fs.mkdirSync(outDir, { recursive: true })

async function llmBrief() {
  if (v.mode === 'script') return null
  // Garde-fou zero-credit : sans opt-in explicite, le chemin payant est fermé
  // même si ANTHROPIC_API_KEY est provisionné (le routé n'essaie pas d'appeler).
  if (process.env.SARGA_PAID_LLM !== '1') return null
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const mod = require('@anthropic-ai/sdk')
    const Anthropic = mod.Anthropic || mod.default || mod
    const client = new Anthropic()
    const sys = `Tu es « ${v.name} — ${v.role} », le Veilleur du marché « ${v.market} » pour Sargasses (intelligence côtière par plage, univers « Le Veilleur »). Règles dures : honnêteté 100 % data ERDDAP (jamais de chiffre inventé), français, concret, self-serve zéro appel, zéro survente. Tu produis de l'INTELLIGENCE et des actions réversibles — tu n'envoies rien toi-même.`
    const user = `Situation du jour (donnée repo) :\n${JSON.stringify(sit, null, 2)}\n\nMission : ${v.focus}\nLeviers connus : ${(v.levers || []).join(' · ')}\n\nRends un brief court en markdown, EXACTEMENT ces sections :\n## Lecture du jour\n(3 lignes max, ancrées sur la situation)\n## 3 actions cette semaine\n(self-serve, réversibles, concrètes)\n## Angle mort\n(1 risque)\n\nTermine par une seule ligne : "HEADLINE: <8 mots max>".`
    const r = await client.messages.create({
      model: v.model || 'claude-sonnet-5',
      max_tokens: 900,
      system: sys,
      messages: [{ role: 'user', content: user }],
    })
    return (r.content || []).map(b => b.text || '').join('').trim() || null
  } catch (e) {
    console.error(`[${id}] LLM indisponible: ${e.message}`)
    return null
  }
}

function templateBrief() {
  const lev = (v.levers || []).map(l => `- ${l}`).join('\n')
  const p = sit.pipeline || {}
  const mrr = sit.mrr ? `MRR €${sit.mrr.eur} · ${sit.mrr.active} actifs.` : ''
  const firstAction = v.status === 'greenfield'
    ? "Cadrer l'offre v0 (une phrase) + lister 5 prospects cibles nommés"
    : 'Avancer un levier de conversion réversible (avec son flag rollback)'
  const nokey = (v.mode === 'agent' && !process.env.ANTHROPIC_API_KEY)
    ? "\n\n> _Recon déterministe : ajoute le secret `ANTHROPIC_API_KEY` au repo pour activer le raisonnement agent sur cette verticale._"
    : ''
  return `## Lecture du jour
Marché « ${v.market} » — statut ${v.status}. Pipeline : ${p.source || '?'} (maj ${p.updatedAt || '?'}${p.stale ? ' · STALE' : ''}). ${mrr}

## Mission
${v.focus}

## Leviers
${lev}

## 3 actions cette semaine
- [ ] ${firstAction}
- [ ] Relier la preuve /fiabilite/ à ce marché (crédibilité data)
- [ ] Produire 1 asset (page/brief/prototype) — génération seule, aucun envoi${nokey}

HEADLINE: ${v.name} en veille sur ${v.market}`
}

;(async () => {
  const llm = await llmBrief()
  const body = llm || templateBrief()
  const mode = llm ? (v.mode === 'agent' ? 'agent' : 'hybrid') : (v.mode === 'script' ? 'script' : 'recon')
  const headMatch = body.match(/HEADLINE:\s*(.+?)\s*$/m)
  const headline = headMatch ? headMatch[1].trim() : `${v.name} — ${v.market}`
  const md = `# ${v.name} · ${v.role}
> Marché : ${v.market} · profondeur ${v.depth}m · ${today()} · mode ${mode}

${body}
`
  fs.writeFileSync(path.join(outDir, `${today()}.md`), md)
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify({
    id, name: v.name, role: v.role, market: v.market, depth: v.depth,
    status: v.status, date: today(), mode, headline,
  }, null, 2))
  console.log(`[${id}] brief écrit (${mode}) — ${headline}`)
})()
