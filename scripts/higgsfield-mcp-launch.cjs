// Lanceur du serveur MCP Higgsfield — lit les clés depuis .env (convention repo,
// jamais de secret dans .mcp.json : repo public). Le serveur (communautaire
// geopopos, audité 2026-06-11 : un seul endpoint platform.higgsfield.ai) ne
// démarre utilement que si HIGGSFIELD_API_KEY/SECRET sont renseignées.
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

try {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  for (const k of ['HIGGSFIELD_API_KEY', 'HIGGSFIELD_SECRET']) {
    const m = env.match(new RegExp('^' + k + '=([^\\r\\n]+)', 'm'))
    if (m && m[1].trim()) process.env[k] = m[1].trim()
  }
} catch (e) { /* pas de .env : le serveur démarrera sans clés et le dira */ }

const p = spawn('python', ['-m', 'higgsfield_mcp.server'], { stdio: 'inherit', env: process.env })
p.on('exit', c => process.exit(c ?? 0))
