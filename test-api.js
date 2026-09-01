const https = require('https');
const zones = [
  '0d79f522fecdc36cdd27d88c91acfaee',
  '5f9ea6d6042d60fb7b562bfe793e1a8c', 
  '7e4289282dcaffd5c65b9bac03c39bec',
  '181cc2861f83ce426c22c2a7fe275a96',
  'f83a729f298b70a42b0e41dbae8383ca',
  '89397490a67e4c69c1f788b6ad9ba164'
];

for (const id of zones) {
  const req = https.request({
    hostname: 'api.cloudflare.com',
    path: '/client/v4/zones/' + id + '/settings/ssl',
    method: 'GET',
    headers: {'Authorization': 'Bearer ' + process.env.CF_TOKEN || 'test'}
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const j = JSON.parse(body);
        console.log('Zone ' + id + ': ' + j.result_value);
      } catch(e) {
        console.log('Zone ' + id + ': parse error, body:', body.substring(0, 100));
      }
    });
  });
  req.on('error', e => console.log('Error zone ' + id + ':', e.message));
  req.setTimeout(5000);
  req.end();
}