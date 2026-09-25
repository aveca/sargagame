const { execFileSync } = require('child_process')
const fs = require('fs')
const names = ['Plage_de_Deshaies.jpg', 'Anse_Mitan.jpg', 'Les_Salines.jpg', 'Anse_Noire.jpg']
for (const f of names) {
  const p = 'public/beaches/' + f
  if (!fs.existsSync(p)) { console.log(f + ' => MISSING'); continue }
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p]).toString().trim()
    console.log(f + ' => ' + out + ' (' + Math.round(fs.statSync(p).size / 1024) + ' Ko)')
  } catch (e) { console.log(f + ' => probe-error ' + e.message.slice(0, 80)) }
}
