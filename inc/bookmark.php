<?php
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$postId = isset($_POST['post_id']) ? $_POST['post_id'] : null;
$postLink = isset($_POST['post_link']) ? $_POST['post_link'] : null;
$action = isset($_POST['action']) ? $_POST['action'] : 'set';

$domain = $_SERVER['HTTP_HOST'];

if ($action === 'delete') {
    header('Set-Cookie: vichan_bookmark=; Domain=' . $domain . '; Path=/; Max-Age=0; Secure; SameSite=Lax', false);
    echo json_encode(['success' => true, 'action' => 'deleted']);
} else if ($postId && $postLink) {
    $bookmarkData = [
        'link' => $postLink,
        'id' => $postId,
        'timestamp' => time() * 1000
    ];
    $encoded = json_encode($bookmarkData);
    header('Set-Cookie: vichan_bookmark=' . urlencode($encoded) . '; Domain=' . $domain . '; Path=/; Max-Age=31536000; Secure; SameSite=Lax', false);
    echo json_encode(['success' => true, 'action' => 'set', 'bookmark' => $bookmarkData]);
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Missing parameters']);
}
