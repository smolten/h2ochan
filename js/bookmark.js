function setBookmark(postLink, postId) {
    fetch('/inc/bookmark.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'action=set&post_id=' + encodeURIComponent(postId) + '&post_link=' + encodeURIComponent(postLink)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // ALSO set with JS for iOS
            var bookmarkData = JSON.stringify(data.bookmark);
            document.cookie = 'vichan_bookmark=' + encodeURIComponent(bookmarkData) + 
                            '; path=/; max-age=31536000; secure; samesite=lax';
            
            console.log('Bookmarked:', postLink);
            var boardMatch = postLink.match(/\/([^\/]+)\//);
            var boardUri = boardMatch ? boardMatch[1] : null;
            updateBookmarkCheckboxes(postId, boardUri);
        }
    })
    .catch(error => console.error('Bookmark error:', error));
}

function deleteBookmark() {
    fetch('/inc/bookmark.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'action=delete'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // ALSO delete with JS
            document.cookie = 'vichan_bookmark=; path=/; max-age=0; secure; samesite=lax';
            
            console.log('Removed bookmark');
            updateBookmarkCheckboxes(null, null);
        }
    })
    .catch(error => console.error('Bookmark error:', error));
}

function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) {
        try {
            return JSON.parse(decodeURIComponent(match[2]));
        } catch(e) {
            return null;
        }
    }
    return null;
}

function updateBookmarkCheckboxes(bookmarkedPostId, bookmarkedBoardUri) {
    var checkboxes = document.querySelectorAll('.bookmark');
    checkboxes.forEach(function(checkbox) {
        var postId = checkbox.getAttribute('data-post-id');
        var boardUri = checkbox.getAttribute('data-board-uri');
        checkbox.checked = (postId === bookmarkedPostId && boardUri === bookmarkedBoardUri);
    });
}

document.addEventListener('change', function(e) {
    if (e.target.classList.contains('bookmark')) {
        var postId = e.target.getAttribute('data-post-id');
        var postLink = e.target.getAttribute('data-post-link');

        if (!postLink) {
            console.error('No data-post-link attribute found');
            e.target.checked = false;
            return;
        }

        if (e.target.checked) {
            var currentBookmark = getCookie('vichan_bookmark');

            if (currentBookmark && (currentBookmark.id !== postId || currentBookmark.link !== postLink)) {
                if (confirm('Replace existing bookmark (>>>' + currentBookmark.link + ') with this post?')) {
                    setBookmark(postLink, postId);
                } else {
                    e.target.checked = false;
                }
            } else {
                setBookmark(postLink, postId);
            }
        } else {
            deleteBookmark();
        }
    }
});

function displayBookmarkOnIndex() {
    var bookmark = getCookie('vichan_bookmark');

    if (bookmark) {
        var boardMatch = bookmark.link.match(/\/([^\/]+)\//);
        var boardUri = boardMatch ? boardMatch[1] : null;
        updateBookmarkCheckboxes(bookmark.id, boardUri);
    }

    if (!window.location.pathname.match(/\/(index\.html)?$/)) {
        return;
    }

    if (!bookmark) {
        return;
    }

    var section = document.getElementById('bookmark-section');
    var content = document.getElementById('bookmark-content');

    if (!section || !content) {
        return;
    }

    section.style.display = 'block';

    var linkMatch = bookmark.link.match(/\/([^\/]+)\/res\/(\d+)\.html#[q]?(\d+)/);
    if (!linkMatch) {
        content.innerHTML = '<p><a href="' + bookmark.link + '">Go to bookmarked post</a></p>';
        return;
    }

    var boardUri = linkMatch[1];
    var threadId = linkMatch[2];
    var postId = linkMatch[3];

    var boardsData = [];
    try {
        boardsData = JSON.parse(document.body.getAttribute('data-boards') || '[]');
    } catch(e) {}

    var boardTitle = boardUri;
    var board = boardsData.find(function(b) { return b.uri === boardUri; });
    if (board) {
        boardTitle = board.title;
    }

    var boardLink = '<li class="boardlinksurl"><a href="' + bookmark.link + '">' + boardTitle + '</a></li>';

    fetch('/' + boardUri + '/res/' + threadId + '.html')
        .then(response => response.text())
        .then(html => {
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');

            var postElement = doc.getElementById('reply_' + postId);
            if (!postElement) {
                postElement = doc.getElementById('op_' + postId);
            }

            if (!postElement) {
                content.innerHTML = '<ul style="margin:0.3em;">' + boardLink + '</ul><br>' +
                                  '<p><a href="' + bookmark.link + '">Go to bookmarked post #' + postId + '</a></p>';
                return;
            }

            var clonedPost = postElement.cloneNode(true);

            var repliesDiv = clonedPost.querySelector('.post.reply');
            if (repliesDiv && clonedPost.classList.contains('op')) {
                var replies = clonedPost.querySelectorAll('.post.reply');
                replies.forEach(function(reply) {
                    reply.remove();
                });
            }

            var checkbox = clonedPost.querySelector('.bookmark');
            if (checkbox) {
                checkbox.checked = true;
            }

            content.innerHTML = '<ul style="margin:0.3em;">' + boardLink + '</ul><br>';
            content.appendChild(clonedPost);
            content.appendChild(document.createElement('br'));
        })
        .catch(error => {
            console.error('Error fetching bookmark:', error);
            content.innerHTML = '<ul style="margin:0.3em;">' + boardLink + '</ul>' +
                              '<p><a href="' + bookmark.link + '">Go to bookmarked post</a></p>';
        });
}

document.addEventListener('DOMContentLoaded', displayBookmarkOnIndex);

document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        displayBookmarkOnIndex();
    }
});
