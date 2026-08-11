<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode([
    'ok' => true,
    'ts' => time(),
    'method' => $_SERVER['REQUEST_METHOD'] ?? '',
    'ct' => $_SERVER['CONTENT_TYPE'] ?? '',
    'cl' => $_SERVER['CONTENT_LENGTH'] ?? '',
    'raw_len' => strlen(file_get_contents('php://input') ?: ''),
    'raw_first' => substr((string)file_get_contents('php://input'), 0, 100),
    'php' => PHP_VERSION,
    'host' => $_SERVER['HTTP_HOST'] ?? '',
    'script' => __FILE__,
    'mtime' => filemtime(__FILE__),
]);
