<?php
/**
 * widget-token.php — Jetons PRO du widget hôtel (HMAC signé).
 *
 * Deux usages :
 *  - INCLUS par create-checkout.php (require_once) → expose sg_widget_sign()/verify()
 *    pour générer le ?k= à la souscription PRO.
 *  - APPELÉ en HTTP par l'iframe widget (même-origine, servie depuis notre domaine) :
 *    GET /api/widget-token.php?k=<token> → {"pro":true,"host":...} | {"pro":false}.
 *
 * Le secret est DÉRIVÉ du webhook_secret (jamais la clé Stripe brute), stable, jamais exposé.
 * Le jeton encode {h:host, exp:timestamp} → non forgeable sans le secret, expirable.
 */
function sg_widget_secret() {
    $cfg = @include __DIR__ . '/stripe-config.php';
    $base = (is_array($cfg) && !empty($cfg['webhook_secret'])) ? $cfg['webhook_secret'] : 'sargasses-widget';
    return hash('sha256', $base . '|sgwidget-pro-v1');
}
function sg_widget_b64url($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function sg_widget_b64url_dec($s) { return base64_decode(strtr($s, '-_', '+/')); }

/** Génère un jeton PRO pour un host donné (ex. domaine de l'hôtel), valable $days jours. */
function sg_widget_sign($host, $days = 400) {
    $payload = sg_widget_b64url(json_encode(['h' => (string)$host, 'exp' => time() + (int)$days * 86400]));
    $sig = sg_widget_b64url(hash_hmac('sha256', $payload, sg_widget_secret(), true));
    return $payload . '.' . $sig;
}
/** Vérifie un jeton. Retourne le payload décodé {h,exp} si valide, false sinon. */
function sg_widget_verify($k) {
    $parts = explode('.', (string)$k);
    if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') return false;
    $expected = sg_widget_b64url(hash_hmac('sha256', $parts[0], sg_widget_secret(), true));
    if (!hash_equals($expected, $parts[1])) return false;
    $d = json_decode(sg_widget_b64url_dec($parts[0]), true);
    if (!is_array($d)) return false;
    if (!empty($d['exp']) && (int)$d['exp'] < time()) return false;
    return $d;
}

// ── Mode HTTP : appel direct (pas un require_once) → réponse JSON verify ──────
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath(__FILE__) === realpath($_SERVER['SCRIPT_FILENAME'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $d = sg_widget_verify($_GET['k'] ?? '');
    echo json_encode($d ? ['pro' => true, 'host' => $d['h'] ?? null] : ['pro' => false]);
}
