const fetch = require('node-fetch');
fetch('https://sargasses-martinique.com/api/mollie', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'create_payment', amount: { value: '0.01', currency: 'EUR' }, description: 'Test SG', redirectUrl: 'https://sargasses-martinique.com/payment/good.html', metadata: { source: 'test' } })
}).then(r => r.json()).then(console.log).catch(console.error);