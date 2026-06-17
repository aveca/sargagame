<?php
// _deploy-secret.example.php — modèle. Copier en _deploy-secret.php et remplir.
// Le vrai fichier est gitignoré (**/_deploy-secret.php) et bloqué par .htaccess.
//
// Le token doit être IDENTIQUE à trois endroits :
//   1. ce fichier sur chaque serveur (provisionné via `npm run deploy-provision`)
//   2. le secret GitHub  DEPLOY_TOKEN  (gh secret set DEPLOY_TOKEN ...)
//   3. le .env local      DEPLOY_TOKEN=...
// Générer : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
return [
    'token' => 'REPLACE_ME_64_HEX',
];
