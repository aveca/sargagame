const https = require('https');
const domains = ['sargasses-martinique.com', 'sargasses-guadeloupe.com', 'sargassummiami.com', 'sargassumpuntacana.com', 'sargassumcancun.com', 'sargazotulum.com'];
const routes = ['/', '/beach/test', '/poi/test', '/region/test', '/activity/test', '/nimporte-quoi', '/api/health'];

function check(domain, path) {
  return new Promise((resolve) => {
    const req = https.request('https://' + domain + path, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve(0));
    req.end();
  });
}

async function main() {
  for (const d of domains) {
    console.log('=== ' + d + ' ===');
    for (const r of routes) {
      const code = await check(d, r);
      console.log('  ' + r + ': ' + code);
    }
  }
}

main();