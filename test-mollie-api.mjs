const body = {
  action: 'create_payment',
  pass: 'sos',
  cents: 100,
  cur: 'eur',
  email: '',
  source: 'sos_plage',
  lang: 'fr',
  metadata: { beach: 'mq001', beachName: 'Plage des Salines' },
  redirectUrl: 'https://sargasses-martinique.com/?sos_success=1'
};

const response = await fetch('https://sargasses-martinique.com/api/mollie.php', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const data = await response.json();
console.log('Status:', response.status);
console.log('Response:', JSON.stringify(data, null, 2));