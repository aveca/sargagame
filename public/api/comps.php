<?php
// ── Accès OFFERTS (cadeaux manuels) — cross-device, SANS paiement ─────────────
// FORMAT : sha1(strtolower(trim(email))) => pass_end (timestamp UNIX, secondes).
// PII-SAFE : QUE des hash, JAMAIS d'email en clair (repo public — voir CLAUDE.md
// « gitignore la PII »). Fichier .php → même servi en HTTP il n'expose aucune donnée.
//
// Offrir un accès :  node scripts/automation/gift-pass.cjs <email> [jours=30]
//   (l'email est hashé EN LOCAL ; seul le hash est committé → zéro PII).
// Restauration côté app : le bénéficiaire entre SON email dans « J'ai déjà un pass »
//   (ou « Mon accès ») → verify_subscription/mol_comp_lookup le débloque sur
//   N'IMPORTE QUEL appareil/navigateur (≠ lien ?pass= local à un navigateur).
//
// Une entrée expirée (valeur < maintenant) est ignorée ; gift-pass.cjs purge
// automatiquement les entrées expirées à chaque ajout.
return [
    '2e6ab039c64f4785d8521c172d9b71309edc431b' => 1785362714,
    'a29463e2f6dc145c89e4d7cf8b1e5a9b2005ffe0' => 1814374039,
];
