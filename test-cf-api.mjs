const accountId = 'abf2b92cf718313567b4b38eb9dda17f';
const token = process.env.CF_TOKEN || '';

async function main() {
  // First, let's test getting the settings
  const settingsResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/b2b-api/script-settings`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('GET settings status:', settingsResp.status);
  const settingsData = await settingsResp.json();
  console.log('GET settings result:', JSON.stringify(settingsData.result?.observability, null, 2));
  
  // Now try PATCH with script-settings endpoint
  const patchResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/b2b-api/script-settings`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      observability: {
        enabled: true,
        head_sampling_rate: 1,
        logs: {
          enabled: true,
          head_sampling_rate: 1,
          persist: true,
          invocation_logs: true
        }
      }
    })
  });
  console.log('PATCH script-settings status:', patchResp.status);
  const patchData = await patchResp.json();
  console.log('PATCH result:', JSON.stringify(patchData, null, 2));
  
  // Verify by getting settings again
  const verifyResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/b2b-api/script-settings`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Verify GET status:', verifyResp.status);
  const verifyData = await verifyResp.json();
  console.log('Verify observability.enabled:', verifyData.result?.observability?.enabled);
}

main().catch(console.error);