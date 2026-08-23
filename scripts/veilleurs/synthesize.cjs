#!/usr/bin/env node
/**
 * synthesize.cjs — LA SYNTHÈSE (job série final).
 * Rapatrie les briefs des artifacts (un par worker parallèle), reconstruit
 * out/<id>/, puis compose DIGEST.md + latest-digest.json (commité par le workflow).
 *
 * En CI : actions/download-artifact dépose scripts/veilleurs/_artifacts/veilleur-<id>/.
 * En local : lit directement out/<id>/latest.json (pas d'artifacts).
 */
const { registry, rel, today, fs, path, loadJSON } = require('./lib.cjs')

// 1. Rapatrier les artifacts (CI) vers out/<id>/
const artRoot = rel('scripts', 'veilleurs', '_artifacts')
if (fs.existsSync(artRoot)) {
  for (const d of fs.readdirSync(artRoot)) {
    const m = d.match(/^veilleur-(.+)$/)
    if (!m) continue
    const id = m[1]
    const src = path.join(artRoot, d)
    if (!fs.statSync(src).isDirectory()) continue
    const dst = rel('scripts', 'veilleurs', 'out', id)
    fs.mkdirSync(dst, { recursive: true })
    for (const f of fs.readdirSync(src)) {
      try { fs.copyFileSync(path.join(src, f), path.join(dst, f)) } catch {}
    }
  }
}

// 2. Collecter les latest.json dans l'ordre de profondeur (rivage → abysse)
const outRoot = rel('scripts', 'veilleurs', 'out')
const rows = []
for (const v of registry()) {
  const latest = loadJSON(path.join(outRoot, v.id, 'latest.json'), null)
  if (latest) rows.push(latest)
}
rows.sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))

// 3. Composer le digest
const tbody = rows.map(r => `| ${r.name} | ${r.market} | ${r.status} | ${r.mode} | ${r.date} | ${r.headline} |`).join('\n')
const digest = `# Digest des Veilleurs — ${today()}

${rows.length} veilleur(s) ont rapporté aujourd'hui (du rivage à l'abysse).

| Veilleur | Marché | Statut | Mode | Date | Headline |
|---|---|---|---|---|---|
${tbody}

> Généré par \`scripts/veilleurs/synthesize.cjs\` — orchestrateur cloud GitHub Actions (\`.github/workflows/veilleurs.yml\`).
`
fs.writeFileSync(rel('scripts', 'veilleurs', 'DIGEST.md'), digest)
fs.writeFileSync(rel('scripts', 'veilleurs', 'latest-digest.json'), JSON.stringify({ date: today(), count: rows.length, veilleurs: rows }, null, 2))
console.log(`[synthèse] ${rows.length} veilleur(s) → DIGEST.md`)
