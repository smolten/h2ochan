/**
 * Bible Infinite Scroll - BIBLICALLY-ACCURATE SCROLLING
 *
 * Enables infinite horizontal scrolling across Bible books and chapters
 * Dynamically loads chapters as the user scrolls
 * Updates URL based on the currently visible chapter
 */

(function() {
    'use strict';

    let thread = null;
    let boardURI = null;
    let bibleNav = null;  // Bible navigation data from XML

    // Configuration
    const config = {
        columnsToLoad: 1,  // Load this many chapters at a time
        loadThreshold: 3,  // Start loading when within this many columns of edge
        urlUpdateDelay: 500  // Delay before updating URL (ms)
    };

    // State
    let currentChapter = 1;
    let loading = false;
    let urlUpdateTimer = null;
    let scrollTimer = null;
    let userHasScrolled = false;
    let loadingEnabled = false;  // Don't load until user scrolls

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

        const url = `/${boardURI}/${chapterNum}.html`;
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
            let crossBook = null;

            if (direction === 'before') {
                // Check if we can go back
                if (minLoadedChapter > 1) {
                    // Load previous chapters in current book
                    for (let i = 1; i <= config.columnsToLoad; i++) {
                        const chapterNum = minLoadedChapter - i;
                        if (chapterNum >= 1 && !loadedChapters.has(chapterNum)) {
                            chaptersToLoad.push(chapterNum);
                        }
                    }
                    chaptersToLoad.sort((a, b) => a - b); // Ascending order
                } else if (bibleNav && bibleNav.previous) {
                    // At chapter 1, try to load previous book's last chapter
                    console.log(`Reached beginning of ${boardURI}, loading previous book: ${bibleNav.previous.osisID}`);
                    crossBook = {
                        uri: bibleNav.previous.osisID,
                        chapter: bibleNav.previous.chapters
                    };
                }
            } else {
                // Check if we've reached the end of current book
                const maxChapter = bibleNav ? bibleNav.current.chapters : Infinity;

                console.log(`Loading 'after': maxLoadedChapter=${maxLoadedChapter}, maxChapter=${maxChapter}, bibleNav=`, bibleNav);

                if (maxLoadedChapter < maxChapter) {
                    // Load next chapters in current book
                    for (let i = 1; i <= config.columnsToLoad; i++) {
                        const chapterNum = maxLoadedChapter + i;
                        if (chapterNum <= maxChapter && !loadedChapters.has(chapterNum)) {
                            chaptersToLoad.push(chapterNum);
                        }
                    }
                } else if (bibleNav && bibleNav.next) {
                    // Reached end of book, try to load next book's first chapter
                    console.log(`Reached end of ${boardURI}, loading next book: ${bibleNav.next.osisID}`);
                    crossBook = {
                        uri: bibleNav.next.osisID,
                        chapter: 1
                    };
                } else {
                    console.log(`Cannot load more: at end of book, bibleNav.next=`, bibleNav ? bibleNav.next : 'no bibleNav');
                }
            }

            if (chaptersToLoad.length === 0 && !crossBook) {
                console.log('No more chapters to load in this direction');
                return;
            }

            if (crossBook) {
                console.log(`Loading cross-book: ${crossBook.uri} chapter ${crossBook.chapter}`);
                // For cross-book, we'll load the chapter but not track it (different book)
                const url = `/${crossBook.uri}/${crossBook.chapter}.html`;
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        const html = await response.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');
                        const chapterThread = doc.querySelector('.thread.bible');

                        if (chapterThread) {
                            const posts = chapterThread.querySelectorAll('.post.bible');
                            const postsHTML = Array.from(posts).map(post => post.outerHTML + '<br>').join('');

                            const referenceElement = thread.querySelector('.post.bible:last-child');
                            const firstElement = thread.querySelector('.post.bible:first-child');

                            if (direction === 'before' && firstElement) {
                                firstElement.insertAdjacentHTML('beforebegin', postsHTML);
                            } else if (referenceElement) {
                                referenceElement.insertAdjacentHTML('afterend', postsHTML);
                            }
                            console.log(`Loaded ${crossBook.uri} chapter ${crossBook.chapter}`);
                        }
                    }
                } catch (error) {
                    console.error(`Error loading cross-book chapter:`, error);
                }
                return;
            }

            console.log(`Loading chapters ${direction}:`, chaptersToLoad);

            // Get the reference element for insertion
            const allPosts = thread.querySelectorAll('.post.bible');
            const referenceElement = allPosts[allPosts.length - 1];
            const firstElement = allPosts[0];

            for (const chapterNum of chaptersToLoad) {
                const postsHTML = await loadChapter(chapterNum);
                if (postsHTML) {
                    // Get fresh reference to first element for each chapter
                    const currentAllPosts = thread.querySelectorAll('.post.bible');
                    const currentFirstElement = currentAllPosts[0];

                    if (direction === 'before' && currentFirstElement) {
                        // Save scroll position before inserting
                        const oldScrollLeft = thread.scrollLeft;
                        const oldScrollWidth = thread.scrollWidth;

                        console.log(`Inserting chapter ${chapterNum} BEFORE first element. scrollLeft=${oldScrollLeft}, scrollWidth=${oldScrollWidth}`);

                        // Insert before first post
                        currentFirstElement.insertAdjacentHTML('beforebegin', postsHTML);

                        // Restore scroll position (adjust for new content added to left)
                        const newScrollWidth = thread.scrollWidth;
                        const scrollAdjustment = newScrollWidth - oldScrollWidth;
                        thread.scrollLeft = oldScrollLeft + scrollAdjustment;

                        console.log(`After insert: scrollLeft=${thread.scrollLeft}, scrollWidth=${newScrollWidth}, adjustment=${scrollAdjustment}`);
                    } else if (direction === 'after' && referenceElement) {
                        console.log(`Inserting chapter ${chapterNum} AFTER last element`);
                        // Insert after last post (no scroll adjustment needed)
                        referenceElement.insertAdjacentHTML('afterend', postsHTML);
                    } else {
                        console.log(`${direction === 'before' ? 'Prepending' : 'Appending'} chapter ${chapterNum} to thread (fallback)`);
                        // Fallback: prepend or append based on direction
                        if (direction === 'before') {
                            thread.insertAdjacentHTML('afterbegin', postsHTML);
                        } else {
                            thread.insertAdjacentHTML('beforeend', postsHTML);
                        }
                    }
                }
            }

            console.log(`Loaded ${chaptersToLoad.length} chapter(s) ${direction}`);

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
        const viewportWidth = thread.clientWidth;

        // Find all chapter markers (first verse of each chapter)
        const chapterMarkers = thread.querySelectorAll('.post_no.chapter');

        let closestChapter = currentChapter;
        let closestDistance = Infinity;

        for (let marker of chapterMarkers) {
            const post = marker.closest('.post.bible');
            if (!post) continue;

            const postLeft = post.offsetLeft;
            const postRight = postLeft + post.offsetWidth;

            // Check if this post is visible in the viewport
            if (postRight > scrollLeft && postLeft < scrollLeft + viewportWidth) {
                // Calculate distance from left edge of viewport
                const distance = Math.abs(postLeft - scrollLeft);

                // Find the chapter marker closest to the left edge
                if (distance < closestDistance) {
                    const chapter = parseInt(marker.textContent);
                    if (!isNaN(chapter)) {
                        closestChapter = chapter;
                        closestDistance = distance;
                    }
                }
            }
        }

        return closestChapter;
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

            // Update page navigation to reflect current chapter
            updatePageNavigation(chapter);
        }
    }

    /**
     * Update the page navigation to mark the current chapter as selected
     */
    function updatePageNavigation(chapter) {
        // Find all page navigation divs (top and bottom)
        const pagesDivs = document.querySelectorAll('.pages');

        pagesDivs.forEach(pagesDiv => {
            // Remove selected class from all links
            const allLinks = pagesDiv.querySelectorAll('a');
            allLinks.forEach(link => {
                link.classList.remove('selected');

                // Add selected class to the link matching current chapter
                if (link.textContent.trim() === String(chapter)) {
                    link.classList.add('selected');
                }
            });
        });
    }

    /**
     * Handle scroll events (debounced)
     */
    function onScroll() {
        if (!userHasScrolled) {
            userHasScrolled = true;
            // Enable loading after a short delay (user has intentionally scrolled)
            setTimeout(function() {
                loadingEnabled = true;
                console.log('Infinite scroll loading enabled');
            }, 1000);
        }

        // Don't do anything if loading not yet enabled
        if (!loadingEnabled) {
            return;
        }

        // Debounce the actual scroll handling
        if (scrollTimer) {
            clearTimeout(scrollTimer);
        }

        scrollTimer = setTimeout(function() {
            const { left, right } = getColumnsFromEdge();

            console.log(`Scroll position: ${left.toFixed(2)} columns from left, ${right.toFixed(2)} columns from right`);

            // Load more content if nearing edges
            // Only load 'before' if we have room to scroll left (not at position 0)
            if (left < config.loadThreshold && thread.scrollLeft > 50) {
                console.log('Near left edge, loading previous chapters');
                loadMoreChapters('before');
            }
            if (right < config.loadThreshold) {
                console.log('Near right edge, loading next chapters');
                loadMoreChapters('after');
            }
        }, 150); // Wait 150ms after scrolling stops

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
        // Only run on Bible boards
        thread = document.querySelector('.thread.bible');
        if (!thread) {
            console.log('Not a Bible board, skipping infinite scroll');
            return;
        }

        boardURI = thread.dataset.board;
        if (!boardURI) {
            console.warn('Bible board missing data-board attribute');
            return;
        }

        // Parse Bible navigation data
        if (thread.dataset.bibleNav) {
            try {
                bibleNav = JSON.parse(thread.dataset.bibleNav);
                console.log('Bible navigation:', bibleNav);
            } catch (e) {
                console.warn('Failed to parse Bible navigation data:', e);
            }
        }

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

        // Preload previous chapter so user can scroll left immediately
        setTimeout(function() {
            if (currentChapter > 1) {
                console.log('Preloading previous chapter to enable leftward scrolling');
                loadingEnabled = true;
                loadMoreChapters('before').then(() => {
                    // Check if we need to fill empty columns to the right
                    const scrollWidth = thread.scrollWidth;
                    const clientWidth = thread.clientWidth;

                    if (scrollWidth < clientWidth * 2 && bibleNav) {
                        const maxChapter = bibleNav.current.chapters;
                        if (currentChapter < maxChapter) {
                            console.log('Initial content is short, loading next chapter');
                            loadMoreChapters('after');
                        } else if (bibleNav.next) {
                            console.log('At last chapter, preloading next book');
                            loadMoreChapters('after');
                        }
                    }
                    loadingEnabled = false;  // Disable until user scrolls
                });
            } else if (bibleNav && bibleNav.previous) {
                // At chapter 1, preload previous book's last chapter
                console.log('At chapter 1, preloading previous book');
                loadingEnabled = true;
                loadMoreChapters('before').then(() => {
                    loadingEnabled = false;
                });
            }
        }, 500);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
