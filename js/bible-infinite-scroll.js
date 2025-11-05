/**
 * Bible Infinite Scroll - BIBLICALLY-ACCURATE SCROLLING
 *
 * Enables infinite horizontal scrolling across Bible books and chapters
 * Dynamically loads chapters as the user scrolls
 * Updates URL based on the currently visible chapter
 */

(function() {
    'use strict';

    // Only run on Bible boards
    if (!document.querySelector('.thread.bible')) {
        return;
    }

    const thread = document.querySelector('.thread.bible');
    const boardURI = thread.dataset.board;

    // Configuration
    const config = {
        columnsToLoad: 3,  // Load approximately this many columns worth of content
        loadThreshold: 2,  // Start loading when within this many columns of edge
        urlUpdateDelay: 500  // Delay before updating URL (ms)
    };

    // State
    let currentChapter = 1;
    let loading = false;
    let urlUpdateTimer = null;

    /**
     * Get the width of a single column
     */
    function getColumnWidth() {
        const computedStyle = window.getComputedStyle(thread);
        return parseFloat(computedStyle.columnWidth) || 208; // 13em ≈ 208px fallback
    }

    /**
     * Calculate how many columns away from the edge we are
     */
    function getColumnsFromEdge() {
        const scrollLeft = thread.scrollLeft;
        const scrollWidth = thread.scrollWidth;
        const clientWidth = thread.clientWidth;
        const columnWidth = getColumnWidth();

        const columnsFromLeft = scrollLeft / columnWidth;
        const columnsFromRight = (scrollWidth - scrollLeft - clientWidth) / columnWidth;

        return {
            left: columnsFromLeft,
            right: columnsFromRight
        };
    }

    /**
     * Load additional chapters
     * @param {string} direction - 'before' or 'after'
     */
    async function loadMoreChapters(direction) {
        if (loading) return;
        loading = true;

        try {
            // TODO: Implement AJAX loading of chapters
            // For now, this is a placeholder
            console.log(`Loading more chapters ${direction}...`);

            // Example AJAX call (to be implemented):
            // const response = await fetch(`/bible/load/${boardURI}/${direction}/${currentChapter}`);
            // const html = await response.text();
            //
            // if (direction === 'before') {
            //     thread.insertAdjacentHTML('afterbegin', html);
            // } else {
            //     thread.insertAdjacentHTML('beforeend', html);
            // }

        } catch (error) {
            console.error('Error loading chapters:', error);
        } finally {
            loading = false;
        }
    }

    /**
     * Get the chapter number from the leftmost visible post
     */
    function getLeftmostVisibleChapter() {
        const scrollLeft = thread.scrollLeft;
        const posts = thread.querySelectorAll('.post.bible');

        for (let post of posts) {
            const postLeft = post.offsetLeft;
            const postRight = postLeft + post.offsetWidth;

            // Check if this post is visible in the leftmost part of the viewport
            if (postRight > scrollLeft && postLeft <= scrollLeft + 50) {
                // Extract chapter from the verse link
                const chapterLink = post.querySelector('.post_no.chapter');
                if (chapterLink) {
                    const chapter = parseInt(chapterLink.textContent);
                    if (!isNaN(chapter)) {
                        return chapter;
                    }
                }
            }
        }

        return currentChapter; // Return current if not found
    }

    /**
     * Update the URL to reflect the current chapter
     */
    function updateURL() {
        const chapter = getLeftmostVisibleChapter();

        if (chapter !== currentChapter) {
            currentChapter = chapter;
            const newURL = `/${boardURI}/${chapter}/`;

            // Use History API to update URL without reload
            if (window.history && window.history.pushState) {
                window.history.pushState(
                    { chapter: chapter },
                    '',
                    newURL
                );
            }
        }
    }

    /**
     * Handle scroll events
     */
    function onScroll() {
        const { left, right } = getColumnsFromEdge();

        // Load more content if nearing edges
        if (left < config.loadThreshold) {
            loadMoreChapters('before');
        }
        if (right < config.loadThreshold) {
            loadMoreChapters('after');
        }

        // Update URL (debounced)
        if (urlUpdateTimer) {
            clearTimeout(urlUpdateTimer);
        }
        urlUpdateTimer = setTimeout(updateURL, config.urlUpdateDelay);
    }

    /**
     * Scroll to a specific chapter
     */
    function scrollToChapter(chapter) {
        const chapterPost = thread.querySelector(`.post.bible .post_no.chapter:contains("${chapter}")`);
        if (chapterPost) {
            const post = chapterPost.closest('.post.bible');
            if (post) {
                // Calculate scroll position to put this at the left edge
                thread.scrollLeft = post.offsetLeft;
            }
        }
    }

    /**
     * Initialize infinite scroll
     */
    function init() {
        // Add scroll listener
        thread.addEventListener('scroll', onScroll);

        // Get initial chapter from URL
        const match = window.location.pathname.match(/\/([A-Za-z0-9]+)\/(\d+)\//);
        if (match) {
            currentChapter = parseInt(match[2]);
            // Scroll to this chapter if needed
            setTimeout(() => scrollToChapter(currentChapter), 100);
        }

        console.log('Bible infinite scroll initialized');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
