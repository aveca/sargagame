<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { echo json_encode(['error'=>'POST only']); exit; }
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if ($auth !== 'Bearer sargagame-mail-2026') { echo json_encode(['error'=>'Unauthorized']); exit; }
$body = json_decode(file_get_contents('php://input'), true);
if (!$body || !$body['to'] || !$body['subject']) { echo json_encode(['error'=>'Missing fields']); exit; }
$to = $body['to'];
$subject = $body['subject'];
$html = $body['html'] ?? '';
$fromEmail = $body['from'] ?? 'alerte@sargasses-martinique.com';
$fromName = $body['fromName'] ?? 'SargaGame';
$headers = [
  'From' => $fromName . ' <' . $fromEmail . '>',
  'Reply-To' => $fromEmail,
  'MIME-Version' => '1.0',
  'Content-Type: text/html; charset=UTF-8'
];
$sent = mail($to, $subject, $html, implode("\r\n", $headers));
echo json_encode($sent ? ['success'=>true,'provider'=>'namecheap'] : ['error'=>'mail() failed']);
?>