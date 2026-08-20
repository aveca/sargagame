const https = require('https');

function checkSite(url, name) {
  return new Promise((resolve) => {
    https.get(url, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        const debloquer = (d.match(/D.bloquer/gi) || []).length;
        const unlock = (d.match(/Unlock/gi) || []).length;
        const desbloquear = (d.match(/Desbloquear/gi) || []).length;
        const lockedCount = (d.match(/lockedCount/gi) || []).length;
        const lockedDays = (d.match(/lockedDays/gi) || []).length;
        const lockedOverlay = (d.match(/linear-gradient\(90deg,transparent/gi) || []).length;
        const roleButton = (d.match(/role="button"/gi) || []).length;
        const lockedDaysVar = (d.match(/lockedDays/gi) || []).length;
        const lockedCountVar = (d.match(/lockedCount/gi) || []).length;
        
        console.log(`${name}:`);
        console.log(`  Débloquer: ${debloquer}, Unlock: ${unlock}, Desbloquear: ${desbloquear}`);
        console.log(`  lockedCount: ${lockedCountVar}, lockedDays: ${lockedDaysVar}`);
        console.log(`  lockedOverlay: ${lockedOverlay}`);
        console.log(`  role="button": ${roleButton}`);
        resolve();
      });
    });
  });
}

(async () => {
  await checkSite('https://sargasses-martinique.com/previsions/', 'MQ');
  await checkSite('https://sargasses-guadeloupe.com/previsions/', 'GP');
})();