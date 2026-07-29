const fs = require('fs')
const path = 'src/PremiumModal.jsx'
let content = fs.readFileSync(path, 'utf8')
let lines = content.split('\n')
let out = []
let skip = 0

for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  if (skip > 0) { skip--; continue }

  // Remove retryCtx declaration + useEffect block (lines 118-135 approximately)
  if (l.includes('// ── Retry mode : relance automatique')) {
    skip = 18
    continue
  }

  // Remove const isRetry=!!retryCtx line
  if (l.includes('const isRetry=!!retryCtx')) continue

  // Fix background:isRetry? → uniform error color
  if (l.includes('background:isRetry?')) {
    out.push(l.replace(/background:isRetry\?"[^"]*":"[^"]*"/, 'background:"rgba(232,82,42,.12)"'))
    continue
  }

  // Fix borderLeft:isRetry? → uniform border color
  if (l.includes('borderLeft:isRetry?')) {
    out.push('              borderLeft:"4px solid #E8522A"')
    continue
  }

  // Fix color:isRetry? → uniform text color
  if (l.includes('color:isRetry?')) {
    out.push(l.replace(/color:isRetry\?"[^"]*":"[^"]*"/, 'color:"#FFD9CC"'))
    continue
  }

  // Remove the isRetry SVG branch (retry icon + 6 lines)
  if (l.includes('{isRetry?(')) {
    skip = 6
    continue
  }

  out.push(l)
}

// Verify no retryCtx references remain (except in comments)
const hasRetryCtx = out.some(l => l.includes('retryCtx'))
fs.writeFileSync(path, out.join('\n'))
console.log('Done. retryCtx remaining in code:', hasRetryCtx)
console.log('Lines:', lines.length, '->', out.length)
