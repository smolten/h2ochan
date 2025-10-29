function setBookmark(postLink, postId) {
    fetch('/inc/bookmark.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'action=set&post_id=' + encodeURIComponent(postId) + '&post_link=' + encodeURIComponent(postLink)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Bookmarked:', postLink);
            updateBookmarkCheckboxes(postId);
        }
    })
    .catch(error => console.error('Bookmark error:', error));
}

function deleteBookmark() {
    fetch('/inc/bookmark.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'action=delete'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Removed bookmark');
            updateBookmarkCheckboxes(null);
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

// Update all bookmark checkboxes to reflect current state
function updateBookmarkCheckboxes(bookmarkedPostId) {
    var checkboxes = document.querySelectorAll('.bookmark');
    checkboxes.forEach(function(checkbox) {
        var postId = checkbox.getAttribute('data-post-id');
        checkbox.checked = (postId === bookmarkedPostId);
    });
}

// Event delegation - listens on document for all bookmark checkboxes
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

            if (currentBookmark && currentBookmark.id !== postId) {
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

    // Update checkboxes to reflect current bookmark
    if (bookmark) {
        updateBookmarkCheckboxes(bookmark.id);
    }

    // Only run index display on index page
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
                content.innerHTML = '<ul style="margin:0;">' + boardLink + '</ul><br>' +
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

            content.innerHTML = '<ul style="margin:0;">' + boardLink + '</ul><br>';
            content.appendChild(clonedPost);
            content.appendChild(document.createElement('br'));
        })
        .catch(error => {
            console.error('Error fetching bookmark:', error);
            content.innerHTML = '<ul style="margin:0;">' + boardLink + '</ul>' +
                              '<p><a href="' + bookmark.link + '">Go to bookmarked post</a></p>';
        });
}

document.addEventListener('DOMContentLoaded', displayBookmarkOnIndex);

document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        displayBookmarkOnIndex();
    }
});
