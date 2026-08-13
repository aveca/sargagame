<?php
// _deploy-secret.php — token du deploy rapide. GITIGNORÉ, ne JAMAIS committer.
// Bloqué par .htaccess + jamais servi en texte (return PHP). Doit être identique
// au secret GH DEPLOY_TOKEN et au DEPLOY_TOKEN du .env local.
// Provisionné sur chaque serveur via : npm run deploy-provision
return [
    'token' => 'f03ac58554850ad434f8d223a8c7e484ae4969546f4363244fa1b8056b91889b',
];
