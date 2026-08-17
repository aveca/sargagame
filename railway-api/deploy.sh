#!/bin/bash
# Deploy script for Railway API

set -e

echo "🚀 Deploying Sargasse API to Railway..."

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Login check
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway:"
    railway login
fi

# Deploy
echo "📦 Deploying to Railway..."
railway up

# Get deployment URL
echo ""
echo "✅ Deployment complete!"
echo "📝 Next steps:"
echo "1. Go to Railway dashboard → Variables → Add all from .env.example"
echo "2. Go to Cloudflare → Workers → Deploy worker.js"
echo "3. Add custom domains: sargasses-guadeloupe.com, sargasses-martinique.com"
echo "4. Test: curl https://sargasses-guadeloupe.com/api/_diag.php"
echo ""
echo "🔗 Railway dashboard: https://railway.app/dashboard"

# Show current status
railway status