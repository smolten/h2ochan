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

    // Track which chapters have been loaded
    const loadedChapters = new Set();
    let minLoadedChapter = currentChapter;
    let maxLoadedChapter = currentChapter;

    /**
     * Load a specific chapter and extract its posts
     */
    async function loadChapter(chapterNum) {
        if (loadedChapters.has(chapterNum)) {
            console.log(`Chapter ${chapterNum} already loaded`);
            return null;
        }

        const url = `/${boardURI}/res/${chapterNum}.html`;
        console.log(`Fetching chapter ${chapterNum} from ${url}`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`Chapter ${chapterNum} not found (${response.status})`);
                return null;
            }

            const html = await response.text();

            // Parse HTML to extract posts
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const chapterThread = doc.querySelector('.thread.bible');

            if (!chapterThread) {
                console.warn(`No .thread.bible found in chapter ${chapterNum}`);
                return null;
            }

            // Extract all posts (both OP and replies)
            const posts = chapterThread.querySelectorAll('.post.bible');
            const postsHTML = Array.from(posts).map(post => post.outerHTML + '<br>').join('');

            loadedChapters.add(chapterNum);

            if (chapterNum < minLoadedChapter) minLoadedChapter = chapterNum;
            if (chapterNum > maxLoadedChapter) maxLoadedChapter = chapterNum;

            return postsHTML;
        } catch (error) {
            console.error(`Error fetching chapter ${chapterNum}:`, error);
            return null;
        }
    }

    /**
     * Load additional chapters
     * @param {string} direction - 'before' or 'after'
     */
    async function loadMoreChapters(direction) {
        if (loading) return;
        loading = true;

        try {
            const chaptersToLoad = [];

            if (direction === 'before') {
                // Load previous chapters (don't go below 1)
                for (let i = 1; i <= config.columnsToLoad; i++) {
                    const chapterNum = minLoadedChapter - i;
                    if (chapterNum >= 1 && !loadedChapters.has(chapterNum)) {
                        chaptersToLoad.push(chapterNum);
                    }
                }
                chaptersToLoad.sort((a, b) => a - b); // Ascending order
            } else {
                // Load next chapters
                for (let i = 1; i <= config.columnsToLoad; i++) {
                    const chapterNum = maxLoadedChapter + i;
                    if (!loadedChapters.has(chapterNum)) {
                        chaptersToLoad.push(chapterNum);
                    }
                }
            }

            if (chaptersToLoad.length === 0) {
                console.log('No more chapters to load in this direction');
                return;
            }

            console.log(`Loading chapters ${direction}:`, chaptersToLoad);

            // Get the reference element for insertion
            const referenceElement = thread.querySelector('.post.bible:last-child');
            const firstElement = thread.querySelector('.post.bible:first-child');

            for (const chapterNum of chaptersToLoad) {
                const postsHTML = await loadChapter(chapterNum);
                if (postsHTML) {
                    if (direction === 'before' && firstElement) {
                        // Insert before first post
                        firstElement.insertAdjacentHTML('beforebegin', postsHTML);
                    } else if (referenceElement) {
                        // Insert after last post
                        referenceElement.insertAdjacentHTML('afterend', postsHTML);
                    } else {
                        // Fallback: append to thread
                        thread.insertAdjacentHTML('beforeend', postsHTML);
                    }
                }
            }

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
        // Get initial chapter from URL or thread ID
        const match = window.location.pathname.match(/\/([A-Za-z0-9]+)\/(\d+)\//);
        if (match) {
            currentChapter = parseInt(match[2]);
        } else {
            // Try to get from thread ID
            const threadId = thread.id;
            const threadMatch = threadId.match(/thread_(\d+)/);
            if (threadMatch) {
                currentChapter = parseInt(threadMatch[1]);
            }
        }

        // Mark initial chapter as loaded
        loadedChapters.add(currentChapter);
        minLoadedChapter = currentChapter;
        maxLoadedChapter = currentChapter;

        // Add scroll listener
        thread.addEventListener('scroll', onScroll);

        console.log(`Bible infinite scroll initialized on ${boardURI}, chapter ${currentChapter}`);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
