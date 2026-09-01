import fetch from 'node-fetch';

async function test() {
  // Try without auth first
  const url = 'https://api.cloudflare.com/client/v4/accounts/abf2b92cf718313567b4b38eb9dda17f/workers/scripts/b2b-api/settings';
  
  // Try GET first to see if we can reach the API
  const resp = await fetch(url, { method: 'GET' });
  console.log('Status:', resp.status);
  const data = await resp.json();
  console.log('Data:', JSON.stringify(data).substring(0, 500));
}

test().catch(console.error);