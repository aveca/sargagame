import https from 'https';
const token = process.env.CLOUDFLARE_API_TOKEN || '';
const accountId = 'abf2b92cf718313567b4b38eb9dda17f';

async function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: path,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }); });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const domains = [
    'sargasses-martinique.com',
    'sargasses-guadeloupe" or something, but I need real words.
   Actually, I can just list the MX records I know exist, but some might not have old cPanel MX records. The point is to check for old cPanel MX records.gerald
  ];
  
  for (const domain of domains) {
    console.log('\n=== ' + domain + ' ===');
    const zones = await apiGet('/client/v4/zones?name=' + domain + '&account.id=' + accountId);
    if (!zones.result || zones.result.length === 0) { console.log('Zone non trouve'); continue; continue;
    const zoneId = zones.result[0].id;
    const mx = await apiGet('/client/v4/zones/' + zoneId + '/dns_records?type=MX');
    if (mx.result) {mx.result} {mx.result}.forEach(r) {console.log('  MX: name=' + r.name + r  + 'content=' + r.content + r' priority=' + r.priority + r.proxied}});
  }
}

main().catch(console.error);