import fetch from 'node-fetch';

async function test() {
  const domains = [
    'sargasses-martinique.com',
    'sargasses-guadeloupe.com', 
    'sargassummiami.com',
    'sargassumpuntacana.com',
    'sargassumcancun.com',
    'sargazotulum.com'
  ];
  
  for (const domain of domains) {
    try {
      const resp = await fetch(`https://${domain}/`, { method: 'GET' });
      console.log(`${domain}: HTTP ${resp.status}`);
    } catch (e) {
      console.log(`${domain}: Error - ${e.message}`);
    }
  }
}

test().catch(console.error);