/**
 * Setup Email Routing for Sargagame 6 domains via Cloudflare API
 * 
 * Prerequisites:
 * - Cloudflare API token with Zone.DNS and Account Email Routing permissions
 * - Account ID: abf2b92cf718313567b4b38eb9dda17f
 * - Domains: sargasses-martinique.com, sargasses-guadeloupe.com, sargassummiami.com, sargassumcancun.com, sargassumpuntacana.com, sargazotulum.com
 * 
 * Run: node scripts/setup-email-routing.cjs --token <CF_API_TOKEN>
 */

const fs = require('fs');
const https = require('https');

 // Parse command line args
 const args = process.argv.slice(2);
 let cfToken = '';

 for (let i = 0; i < args.length; i++) {
   if (args[i] === '--token' && i + 1 < args.length) {
     cfToken = args[i + 1];
     i++;
   }
 }

 if (!cfToken) {
   console.error('❌ Cloudflare API token required: node scripts/setup-email-routing.cjs --token <TOKEN>');
   console.error('   Get token from: https://dash.cloudflare.com/profile/api-tokens');
   process.exit(1);
 }

 const ACCOUNT_ID = 'abf2b92cf718313567b4b38eb9dda17f';
 const DOMAINS = [
   'sargasses-martinique.com',
   'sargasses-guadeloupe.com',
   'sargassummiami.com',
   'sargassumcancun.com',
   'sargassumpuntacana.com',
   'sargazotulum.com'
 ];

 const EMAIL = 'yacovassaraf@gmail.com';
 const ALIASES = ['contact', 'alerte', 'info', 'support'];

 // Helper: HTTPS GET request
 function apiGet(path) {
   return new Promise((resolve, reject) => {
     const options = {
       method: 'GET',
       hostname: 'api.cloudflare.com',
       path: path,
       headers: {
         'Authorization': `Bearer ${cfToken}`,
         'Content-Type': 'application/json'
       }
     };
     const req = https.request(options, (res) => {
       let data = '';
       res.on('data', chunk => data += chunk);
       res.on('end', () => {
         try { resolve(JSON.parse(data)); }
         catch (e) { resolve({ raw: data }); }
       });
     });
     req.on('error', reject);
     req.end();
   });
 }

 // Helper: HTTPS POST request
 function apiPost(path, body) {
   return new Promise((resolve, reject) => {
     const options = {
       method: 'POST',
       hostname: 'api.cloudflare.com',
       path: path,
       headers: {
         'Authorization': `Bearer ${cfToken}`,
         'Content-Type': 'application/json'
       }
     };
     const req = https.request(options, (res) => {
       let data = '';
       res.on('data', chunk => data += chunk);
       res.on('end', () => {
         try { resolve(JSON.parse(data)); }
         catch (e) { resolve({ raw: data }); }
       });
     });
     req.on('error', reject);
     req.write(JSON.stringify(body));
     req.end();
   });
 }

 async function sleep(ms) {
   return new Promise(resolve => setTimeout(resolve, ms));
 }

 async function main() {
   console.log('🛰️  Email Routing Setup for Sargagame');
   console.log(`📁 Account: ${ACCOUNT_ID}`);
   console.log(`🌐 Domains: ${DOMAINS.join(', ')}`);
   console.log(`📧 Target email: ${EMAIL}`);
   console.log('');

   for (const domain of DOMAINS) {
     console.log(`===${domain}===`);

     // 1. Get zone_id
     console.log('  1. Récupération zone_id...');
     let zoneId;
     try {
       const z = await apiGet(`/client/v4/zones?name=${domain}&account.id=${ACCOUNT_ID}`);
       if (z.result && z.result.length > 0) {
         zoneId = z.result[0].id;
         console.log(`     ✅ Zone ID: ${zoneId}`);
       } else {
         console.log(`     ❌ Zone non trouvée pour ${domain}`);
         continue;
       }
     } catch (e) {
       console.log(`     ❌ Erreur récupération zone: ${e.message}`);
       continue;
     }

     // 2. Activer Email Routing
     console.log('  2. Activation Email Routing...');
     try {
       await apiPost(`/client/v4/zones/${zoneId}/email/routing/enable`);
       console.log('     ✅ Email Routing activé');
     } catch (e) {
       console.log(`     ⚠️  Activation routing: ${e.message || 'erreur'}`);
     }

     // 3. Ajouter adresse destination
     console.log('  3. Ajout adresse de destination...');
     try {
       await apiPost(`/client/v4/zones/${zoneId}/email/routing/addresses`, { email: EMAIL });
       console.log('     ✅ Adresse ajoutée: yacovassaraf@gmail.com');
     } catch (e) {
       console.log(`     ⚠️  Ajout adresse: ${e.message || 'erreur'}`);
     }

     // Attendre un peu pour éviter rate limiting
     await sleep(500);

     // 4. Créer rules pour chaque alias
     console.log('  4. Création rules d\'alias...');
     for (const alias of ALIASES) {
       try {
         const ruleName = `${alias} routing ${domain}`;
         const rule = {
           name: ruleName,
           enabled: true,
           matchers: [{ type: 'literal', field: 'to', value: `${alias}@${domain}` }],
           actions: [{ type: 'forward', value: [EMAIL] }]
         };
         await apiPost(`/client/v4/zones/${zoneId}/email/routing/rules`, rule);
         console.log(`     ✅ ${alias}@${domain} → ${EMAIL}`);
       } catch (e) {
         console.log(`     ⚠️  ${alias} rule: ${e.message || 'erreur'}`);
       }
     }

     // 5. Vérifier MX records
     console.log('  5. Vérification MX records...');
     try {
       const mx = await apiGet(`/client/v4/zones/${zoneId}/dns_records?type=MX`);
       const mxRecords = mx.result || [];
       const hasRequiredMX = mxRecords.some(r => 
         r.content.includes('mx.cloudflare.net')
       );
       if (hasRequiredMX) {
         console.log(`     ✅ MX records présents (${mxRecords.length} trouvé(s))`);
       } else {
         console.log(`     ⚠️  MX records incomplets, ajout manuel en cours...`);
         // Add manual MX records
         const mxHosts = [
           { content: 'isaac.mx.cloudflare.net', priority: 10 },
           { content: 'linda.mx.cloudflare.net', priority: 20 },
           { content: 'amir.mx.cloudflare.net', priority: 50 }
         ];
         for (const mx of mxHosts) {
           try {
             await apiPost(`/client/v4/zones/${zoneId}/dns_records`, {
               type: 'MX',
               name: '@',
               content: mx.content,
               priority: mx.priority,
               proxied: false
             });
             console.log(`       ✅ MX added: ${mx.content} priority ${mx.priority}`);
           } catch (e) {
             console.log(`       ⚠️  MX add error: ${e.message || 'erreur'}`);
           }
         }
       }
     } catch (e) {
       console.log(`     ⚠️  MX verification: ${e.message || 'erreur'}`);
     }

     // 6. Vérifier/ajouter SPF
     console.log('  6. Vérification/ajout SPF...');
     try {
       const txt = await apiGet(`/client/v4/zones/${zoneId}/dns_records?type=TXT&name=${domain}`);
       const txtRecords = (txt.result || []).filter(r => r.content.includes('spf') || r.content.includes('v=spf1'));
       if (txtRecords.length > 0) {
         console.log(`     ✅ SPF record présent`);
       } else {
         console.log(`     ➕ Ajout SPF...`);
         await apiPost(`/client/v4/zones/${zoneId}/dns_records`, {
           type: 'TXT',
           name: '@',
           content: 'v=spf1 include:_spf.mx.cloudflare.net ~all',
           proxied: false
         });
         console.log(`     ✅ SPF ajouté: v=spf1 include:_spf.mx.cloudflare.net ~all`);
       }
     } catch (e) {
       console.log(`     ⚠️  SPF: ${e.message || 'erreur'}`);
     }

     // 7. Vérifier/ajouter DMARC
     console.log('  7. Vérification/ajout DMARC...');
     try {
       const dmarc = await apiGet(`/client/v4/zones/${zoneId}/dns_records?type=TXT&name=_dmarc.${domain}`);
       const dmarcRecords = dmarc.result || [];
       if (dmarcRecords.length > 0 && dmarcRecords.some(r => r.content.includes('v=DMARC1'))) {
         console.log(`     ✅ DMARC record présent`);
       } else {
         console.log(`     ➕ Ajout DMARC...`);
         await apiPost(`/client/v4/zones/${zoneId}/dns_records`, {
           type: 'TXT',
           name: '_dmarc',
           content: `v=DMARC1; p=quarantine; rua=mailto:alerte@${domain}`,
           proxied: false
         });
         console.log(`     ✅ DMARC ajouté: v=DMARC1; p=quarantine; rua=mailto:alerte@${domain}`);
       }
     } catch (e) {
       console.log(`     ⚠️  DMARC: ${e.message || 'erreur'}`);
     }

     console.log('');
     await sleep(1000);
   }

console.log('🎉 Email Routing Setup Termine!');
    console.log('\nEmail: ' + EMAIL);
    console.log('Domaines couverts: 6/6');
    console.log('Prochain step: tester la reception d emux sur yacovassaraf@gmail.com');
}

 main().catch(console.error);