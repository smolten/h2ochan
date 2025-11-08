/*
 * post-preview.js
 * Hover/tap previews for quoted posts
 *
 * Features:
 * - Desktop: hover to preview
 * - Mobile: tap to preview, tap outside to dismiss, tap again to follow
 * - Cross-board links require double-tap on mobile
 * - Same-thread links keep default behavior (highlightReply)
 */

(function() {
    'use strict';

    let currentPreview = null;
    let previewCache = new Map();
    let tapTimeout = null;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    /**
     * Check if a link is a same-thread quote (>>123)
     */
    function isSameThreadLink(link) {
        const href = link.getAttribute('href');
        const onclick = link.getAttribute('onclick');

        // Check if it has highlightReply in onclick (same-thread link)
        if (onclick && onclick.includes('highlightReply')) {
            return true;
        }

        // Check if href is just #123 or similar (same page anchor)
        if (href && (href.startsWith('#') || href.match(/^#q?\d+$/))) {
            return true;
        }

        return false;
    }

    /**
     * Check if link is a cross-board quote (>>>/board/123)
     */
    function isCrossBoardLink(link) {
        const text = link.textContent.trim();
        return text.startsWith('>>>');
    }

    /**
     * Parse link to extract board, thread, and post info
     */
    function parseLinkInfo(link) {
        const href = link.getAttribute('href');
        const text = link.textContent.trim();

        // Cross-board: >>>/board/123
        if (text.startsWith('>>>')) {
            const match = href.match(/\/([^\/]+)\/res\/(\d+)\.html(?:#(\d+))?/);
            if (match) {
                return {
                    type: 'cross-board',
                    board: match[1],
                    thread: match[2],
                    post: match[3] || match[2]
                };
            }
        }

        // Same-board but different thread: >>123 with href to res/X.html
        const sameBoard = href.match(/\/res\/(\d+)\.html#(\d+)/);
        if (sameBoard) {
            return {
                type: 'cross-thread',
                board: board_name || '',
                thread: sameBoard[1],
                post: sameBoard[2]
            };
        }

        return null;
    }

    /**
     * Fetch and extract post HTML
     */
    async function fetchPost(board, thread, postId) {
        const cacheKey = `${board}:${thread}:${postId}`;

        if (previewCache.has(cacheKey)) {
            return previewCache.get(cacheKey);
        }

        try {
            const url = `/${board}/res/${thread}.html`;
            const response = await fetch(url);
            if (!response.ok) return null;

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Try to find the post
            let postElement = doc.getElementById('reply_' + postId);
            if (!postElement) {
                postElement = doc.getElementById('op_' + postId);
            }

            if (!postElement) return null;

            // Clone and clean up
            const cloned = postElement.cloneNode(true);

            // Remove nested replies if it's an OP
            if (cloned.classList.contains('op')) {
                const replies = cloned.querySelectorAll('.post.reply');
                replies.forEach(reply => reply.remove());
            }

            // Remove checkboxes
            const checkboxes = cloned.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => cb.remove());

            const result = cloned.outerHTML;
            previewCache.set(cacheKey, result);
            return result;

        } catch (error) {
            console.error('Error fetching post preview:', error);
            return null;
        }
    }

    /**
     * Show preview popup
     */
    function showPreview(link, postHTML) {
        // Remove existing preview
        hidePreview();

        // Create preview container
        const preview = document.createElement('div');
        preview.className = 'post-preview-popup';
        preview.innerHTML = `
            <div class="post-preview-content">
                ${postHTML}
            </div>
        `;

        // Position near the link
        const rect = link.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        document.body.appendChild(preview);

        // Position to the right of link if space, otherwise to the left
        const previewRect = preview.getBoundingClientRect();
        let left = rect.right + scrollLeft + 10;
        let top = rect.top + scrollTop;

        // Check if it goes off-screen to the right
        if (left + previewRect.width > window.innerWidth + scrollLeft) {
            left = rect.left + scrollLeft - previewRect.width - 10;
        }

        // Check if it goes off-screen at bottom
        if (top + previewRect.height > window.innerHeight + scrollTop) {
            top = window.innerHeight + scrollTop - previewRect.height - 10;
        }

        // Ensure it doesn't go off top
        if (top < scrollTop) {
            top = scrollTop + 10;
        }

        preview.style.left = left + 'px';
        preview.style.top = top + 'px';

        currentPreview = preview;

        // On mobile, clicking outside dismisses
        if (isMobile) {
            setTimeout(() => {
                document.addEventListener('click', onOutsideClick);
            }, 100);
        }
    }

    /**
     * Hide preview popup
     */
    function hidePreview() {
        if (currentPreview) {
            currentPreview.remove();
            currentPreview = null;
            document.removeEventListener('click', onOutsideClick);
        }
    }

    /**
     * Handle clicks outside preview on mobile
     */
    function onOutsideClick(e) {
        if (currentPreview && !currentPreview.contains(e.target) &&
            !e.target.closest('a[onclick*="citeReply"]')) {
            hidePreview();
        }
    }

    /**
     * Handle link hover (desktop)
     */
    function onLinkHover(e) {
        if (isMobile) return;

        const link = e.currentTarget;
        if (isSameThreadLink(link)) return;

        const info = parseLinkInfo(link);
        if (!info) return;

        fetchPost(info.board, info.thread, info.post).then(postHTML => {
            if (postHTML && link.matches(':hover')) {
                showPreview(link, postHTML);
            }
        });
    }

    /**
     * Handle link tap (mobile)
     */
    function onLinkTap(e) {
        if (!isMobile) return;

        const link = e.currentTarget;
        if (isSameThreadLink(link)) return;  // Let default behavior work

        const info = parseLinkInfo(link);
        if (!info) return;

        // If preview is already showing for this link, follow it
        if (currentPreview && link.dataset.previewShown === 'true') {
            return true;  // Allow link to be followed
        }

        // Prevent default and show preview first
        e.preventDefault();
        e.stopPropagation();

        fetchPost(info.board, info.thread, info.post).then(postHTML => {
            if (postHTML) {
                showPreview(link, postHTML);
                link.dataset.previewShown = 'true';

                // After 10 seconds, reset so tap will follow link
                setTimeout(() => {
                    link.dataset.previewShown = 'false';
                }, 10000);
            }
        });

        return false;
    }

    /**
     * Initialize preview system on quote links
     */
    function initializePreviewLinks() {
        // Find all quote links
        const quoteLinks = document.querySelectorAll('a[onclick*="citeReply"]');

        quoteLinks.forEach(link => {
            // Skip same-thread links
            if (isSameThreadLink(link)) return;

            // Desktop: hover
            link.addEventListener('mouseenter', onLinkHover);
            link.addEventListener('mouseleave', hidePreview);

            // Mobile: tap
            link.addEventListener('click', onLinkTap);
        });
    }

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePreviewLinks);
    } else {
        initializePreviewLinks();
    }

    // Re-initialize when new posts are added (for AJAX/auto-reload)
    if (typeof $ !== 'undefined') {
        $(document).on('new_post', function(e, post) {
            const links = post.querySelectorAll('a[onclick*="citeReply"]');
            links.forEach(link => {
                if (!isSameThreadLink(link)) {
                    link.addEventListener('mouseenter', onLinkHover);
                    link.addEventListener('mouseleave', hidePreview);
                    link.addEventListener('click', onLinkTap);
                }
            });
        });
    }

})();
