const fs = require('fs');
const files = ['wrangler.toml', 'wrangler.jsonc', '.env', '.env.local'];
files.forEach(f => {
  try {
    const c = fs.readFileSync(f, 'utf8');
    if (c.includes('token') || c.includes('API') || c.includes('CF')) {
      console.log(f + ':', c.substring(0, 300));
    }
  } catch(e) {
    // skip
  }
});
// Also check .cf-token
try {
  const c = fs.readFileSync('.cf-token', 'utf8');
  console.log('.cf-token:', c.substring(0, 300));
} catch(e) { console.log('.cf-token: error', e.message); }
try {
  const c = fs.readFileSync('.cf-token.tmp', 'utf8');
  console.log('.cf-token.tmp:', c.substring(0, 300));
} catch(e) { console.log('.cf-token.tmp: error', e.message); }