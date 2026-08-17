# Sargasse API on Railway

PHP 8.3 API deployment for Sargasse project. Proxied via Cloudflare Worker.

## Quick Deploy

### 1. Create Railway Project
```bash
railway login
railway init
railway up
```

### 2. Set Environment Variables in Railway Dashboard
Go to your project → Variables → Add all from `.env.example`

### 3. Deploy Cloudflare Worker
1. Cloudflare Dashboard → Workers & Pages → Create Worker
2. Paste `worker.js` content
3. Deploy → Add custom domains:
   - `sargasses-guadeloupe.com`
   - `sargasses-martinique.com`

### 4. Test
```bash
curl https://sargasses-guadeloupe.com/api/_diag.php
# {"php":"8.3.x",...}
```

## Structure
```
railway-api/
├── Dockerfile          # PHP 8.3 + Apache
├── railway.json        # Railway config
├── worker.js           # Cloudflare Worker
├── .env.example        # Environment variables
├── api/                # PHP API files (copied from main project)
│   ├── mollie.php
│   ├── create-checkout.php
│   ├── mollie-webhook.php
│   ├── _diag.php
│   └── ... (26 files)
└── README.md
```

## Environment Variables Required
See `.env.example` for full list. Key ones:
- `MOLLIE_API_KEY`
- `MOLLIE_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
- `RESEND_API_KEY`
- `JWT_SECRET`, `ENCRYPTION_KEY`

## Health Check
```bash
curl https://sargasses-guadeloupe.com/api/_diag.php
# {"ok":true,"php":"8.3.x",...}
```

## Troubleshooting
- **500 Error**: Check Railway logs (`railway logs`)
- **CORS issues**: Check `ALLOWED_ORIGINS` in env vars
- **Mollie webhook**: Update Mollie dashboard webhook URL to `https://sargasses-guadeloupe.com/api/mollie-webhook.php`