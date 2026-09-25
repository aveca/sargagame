const fs = require('fs')
const h = fs.readFileSync('dist/aujourdhui/index.html', 'utf8')
for (const k of ['?trip=1', '?exp=', 'Voir mon meilleur plan', 'Ouvrir la plage du jour']) {
  console.log(k + ':', h.includes(k))
}
const m = h.match(/href\S?\S*?exp=([a-z0-9-]+)/i)
console.log('exp target:', m ? m[1] : null)
