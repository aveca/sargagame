<?php
// _deploy.php — extracteur de deploy côté serveur (chemin FTP rapide).
//
// Reçoit un _deploy.zip uploadé à la racine web (1 seul STOR FTP), l'extrait
// sur place, puis le supprime. Remplace ~500 STOR FTP fragmentés (l'hébergeur
// coupe la socket de contrôle tous les ~660 STOR) par 1 STOR + 1 appel HTTP.
//
// Actions (GET ou POST, ?action=) :
//   ping  → {ok, zip:<ZipArchive dispo>, ver}   (sanity check + capacité)
//   unzip → extrait <root>/_deploy.zip dans <root>, supprime le zip. {ok, files, ms}
//
// Sécurité (repo PUBLIC) : aucun secret ici. Le token est lu depuis
// _deploy-secret.php — fichier DÉDIÉ, gitignoré, bloqué par .htaccess, jamais
// servi en texte (return PHP). DÉCOUPLÉ de stripe-config.php : le provisioning
// du token ne touche donc jamais la config des paiements (zéro risque).
// Comparaison hash_equals (timing-safe). Fail-closed : pas de token configuré
// côté serveur ⇒ 403. Le client (fast-deploy.cjs) tombe alors en fallback FTP
// fichier-par-fichier, donc un serveur non provisionné ne casse jamais le deploy.
//
// Le zip est construit par nous depuis notre propre build (chemins relatifs,
// pas de '..'), donc pas de zip-slip ; le token verrouille déjà l'accès.

header('Content-Type: application/json');

$VER = '1';
$action = $_GET['action'] ?? ($_POST['action'] ?? '');
$token  = (string)($_GET['token'] ?? ($_POST['token'] ?? ''));

// Token depuis le fichier secret dédié (gitignoré, .htaccess deny, return PHP).
$expected = '';
$secretPath = __DIR__ . '/_deploy-secret.php';
if (is_file($secretPath)) {
    $s = @include $secretPath;
    if (is_array($s) && !empty($s['token'])) {
        $expected = (string)$s['token'];
    }
}

function deny() {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'forbidden']);
    exit;
}

// Toute action exige un token valide (évite aussi le fingerprinting via ping).
if ($expected === '' || !hash_equals($expected, $token)) {
    deny();
}

if ($action === 'ping') {
    echo json_encode(['ok' => true, 'zip' => class_exists('ZipArchive'), 'ver' => $VER]);
    exit;
}

// selftest : cycle ZipArchive create→extract→read→cleanup dans un sous-dossier
// de la racine web (mêmes droits que le vrai unzip), sans laisser d'artefact.
// Prouve que l'extraction marche sur cet hôte AVANT de s'y fier en CI.
if ($action === 'selftest') {
    if (!class_exists('ZipArchive')) {
        http_response_code(501);
        echo json_encode(['ok' => false, 'error' => 'no ZipArchive']);
        exit;
    }
    $base = realpath(__DIR__ . '/..');
    $dir = $base . '/.dpst_' . bin2hex(random_bytes(5));
    @mkdir($dir, 0755, true);
    $nonce = bin2hex(random_bytes(8));
    $zp = $dir . '/t.zip';
    $w = new ZipArchive();
    $okCreate = $w->open($zp, ZipArchive::CREATE) === true;
    if ($okCreate) { $w->addFromString('probe.txt', $nonce); $w->close(); }
    $okExtract = false;
    if ($okCreate) {
        $r = new ZipArchive();
        if ($r->open($zp) === true) { $okExtract = $r->extractTo($dir); $r->close(); }
    }
    $readBack = @file_get_contents($dir . '/probe.txt');
    @unlink($dir . '/probe.txt');
    @unlink($zp);
    @rmdir($dir);
    $ok = $okExtract && ($readBack === $nonce);
    echo json_encode(['ok' => $ok, 'create' => $okCreate, 'extract' => (bool)$okExtract, 'match' => ($readBack === $nonce)]);
    exit;
}

if ($action !== 'unzip') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'bad action']);
    exit;
}

if (!class_exists('ZipArchive')) {
    http_response_code(501);
    echo json_encode(['ok' => false, 'error' => 'no ZipArchive']);
    exit;
}

$root = realpath(__DIR__ . '/..');   // /api/.. = racine web
$zipPath = $root . '/_deploy.zip';
if (!is_file($zipPath)) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'no zip uploaded']);
    exit;
}

$t0 = microtime(true);
$zip = new ZipArchive();
if ($zip->open($zipPath) !== true) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'open failed']);
    exit;
}
$files = $zip->numFiles;
$extracted = $zip->extractTo($root);
$zip->close();
@unlink($zipPath);

if (!$extracted) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'extract failed', 'files' => $files]);
    exit;
}

echo json_encode([
    'ok' => true,
    'files' => $files,
    'ms' => (int)round((microtime(true) - $t0) * 1000),
]);
