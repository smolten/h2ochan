<?php

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$postId = isset($_POST['post_id']) ? $_POST['post_id'] : null;
$postLink = isset($_POST['post_link']) ? $_POST['post_link'] : null;
$action = isset($_POST['action']) ? $_POST['action'] : 'set';

if ($action === 'delete') {
    header('Set-Cookie: vichan_bookmark=; Path=/; Max-Age=0; Secure; SameSite=Lax', false);
    echo json_encode(['success' => true, 'action' => 'deleted']);
} else if ($postId && $postLink) {
    $bookmarkData = json_encode([
        'link' => $postLink,
        'id' => $postId,
        'timestamp' => time() * 1000
    ]);
    
    header('Set-Cookie: vichan_bookmark=' . urlencode($bookmarkData) . '; Path=/; Max-Age=31536000; Secure; SameSite=Lax; Partitioned', false);
    echo json_encode(['success' => true, 'action' => 'set', 'bookmark' => json_decode($bookmarkData)]);
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Missing parameters']);
}
