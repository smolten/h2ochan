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
    let bibleNav = null;  // Bible navigation data scraped from page
    let currentBook = null;  // Currently displayed book URI

    // Configuration
    const config = {
        columnsToLoad: 2,  // Load this many chapters at a time
        loadThreshold: 2,  // Start loading when within this many columns of edge (want 2+ cols outside view)
        urlUpdateDelay: 250,  // Delay before updating URL (ms)
        sentryDistance: '200px'  // Distance for IntersectionObserver sentries
    };

    // State
    let currentChapter = 1;
    let loading = false;
    let urlUpdateTimer = null;
    let scrollTimer = null;
    let userHasScrolled = false;
    let loadingEnabled = false;  // Don't load until user scrolls
    let initialPreloadDone = false;  // Track if we've done initial preload
    let isAdjustingScroll = false;  // Track programmatic scroll adjustments to prevent scrollbar fighting

    // Sentry elements and observer for detecting when to load content
    let leftSentry = null;
    let rightSentry = null;
    let sentryObserver = null;

    // Cache for book metadata (title, subtitle, prev/next, chapters)
    const bookMetadataCache = new Map();

    // Track which chapters have been loaded and failed
    const loadedChapters = new Set();
    const failedChapters = new Set();
    const loadedCrossBookChapters = new Set();  // Track cross-book chapters like "Exod:1", "Gen:50"
    let minLoadedChapter = Infinity;
    let maxLoadedChapter = -Infinity;

    /**
     * Get the width of a single column (including gap)
     */
    function getColumnWidth() {
        const computedStyle = window.getComputedStyle(thread);
        const columnWidth = parseFloat(computedStyle.columnWidth) || 208; // 13em ≈ 208px fallback
        const columnGap = parseFloat(computedStyle.columnGap) || 16; // Default gap
        return columnWidth + columnGap; // Total width per column including gap
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
     * Create or update sentry elements for IntersectionObserver
     * These sentries sit at the edges and trigger loading when they become visible
     */
    function updateSentries() {
        if (!thread) return;

        // Remove existing sentries
        if (leftSentry) leftSentry.remove();
        if (rightSentry) rightSentry.remove();

        // Create left sentry (at the beginning)
        leftSentry = document.createElement('div');
        leftSentry.className = 'scroll-sentry left-sentry';
        leftSentry.style.cssText = 'position: absolute; left: 0; top: 0; width: 1px; height: 1px; pointer-events: none;';

        // Create right sentry (at the end)
        rightSentry = document.createElement('div');
        rightSentry.className = 'scroll-sentry right-sentry';
        rightSentry.style.cssText = 'position: absolute; right: 0; top: 0; width: 1px; height: 1px; pointer-events: none;';

        // Insert sentries
        const firstPost = thread.querySelector('.post.bible');
        const lastPost = thread.querySelectorAll('.post.bible');

        if (firstPost) {
            firstPost.parentNode.insertBefore(leftSentry, firstPost);
        }

        if (lastPost.length > 0) {
            lastPost[lastPost.length - 1].parentNode.appendChild(rightSentry);
        }
    }

    /**
     * Initialize IntersectionObserver for sentries
     */
    function initSentryObserver() {
        if (!('IntersectionObserver' in window)) {
            console.log('IntersectionObserver not supported, falling back to scroll detection only');
            return;
        }

        const options = {
            root: thread,
            rootMargin: config.sentryDistance,
            threshold: 0
        };

        sentryObserver = new IntersectionObserver((entries) => {
            if (!loadingEnabled || loading) return;

            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    if (entry.target.classList.contains('left-sentry')) {
                        console.log('Left sentry visible, loading previous chapters');
                        loadMoreChapters('before');
                    } else if (entry.target.classList.contains('right-sentry')) {
                        console.log('Right sentry visible, loading next chapters');
                        loadMoreChapters('after');
                    }
                }
            });
        }, options);

        // Observe sentries
        if (leftSentry) sentryObserver.observe(leftSentry);
        if (rightSentry) sentryObserver.observe(rightSentry);
    }

    /**
     * Scrape Bible navigation data from the page
     */
    function scrapeBibleNav() {
        const nav = {
            current: {
                osisID: boardURI,
                chapters: 1  // Default, will be updated
            },
            previous: null,
            next: null
        };

        // Get max chapter from page navigation
        const pageLinks = document.querySelectorAll('.pages a');
        let maxChapter = 1;
        pageLinks.forEach(link => {
            const chapterNum = parseInt(link.textContent.trim());
            if (!isNaN(chapterNum) && chapterNum > maxChapter) {
                maxChapter = chapterNum;
            }
        });
        nav.current.chapters = maxChapter;

        // Get prev/next books from subtitle links
        const subtitleLinks = document.querySelectorAll('.subtitle a');
        subtitleLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;

            const match = href.match(/^\/([A-Za-z0-9]+)\//);
            if (!match) return;

            const bookURI = match[1];
            const text = link.textContent.trim();

            // Check if this is a prev link (has <<) or next link (has >>)
            if (text.includes('<<') || link.style.cssFloat === 'left') {
                nav.previous = {
                    osisID: bookURI,
                    short: text.replace('<<', '').trim()
                };
            } else if (text.includes('>>') || link.style.cssFloat === 'right') {
                nav.next = {
                    osisID: bookURI,
                    short: text.replace('>>', '').trim()
                };
            }
        });

        console.log('Scraped Bible navigation:', nav);
        return nav;
    }

    /**
     * Extract and cache book metadata from a document
     */
    function extractBookMetadata(doc, bookURI) {
        const metadata = {
            osisID: bookURI,
            title: '',
            subtitle: '',
            chapters: 1,
            previous: null,
            next: null
        };

        // Extract title
        const h1 = doc.querySelector('header h1');
        if (h1) {
            metadata.title = h1.textContent.trim();
        }

        // Extract subtitle
        const subtitleDiv = doc.querySelector('.subtitle');
        if (subtitleDiv) {
            // Get just the text node (without the links)
            const textNode = Array.from(subtitleDiv.childNodes)
                .find(node => node.nodeType === Node.TEXT_NODE);
            if (textNode) {
                metadata.subtitle = textNode.textContent.trim();
            }
        }

        // Get max chapter and prev/next from page
        const pageLinks = doc.querySelectorAll('.pages a');
        let maxChapter = 1;
        pageLinks.forEach(link => {
            const chapterNum = parseInt(link.textContent.trim());
            if (!isNaN(chapterNum) && chapterNum > maxChapter) {
                maxChapter = chapterNum;
            }
        });
        metadata.chapters = maxChapter;

        const subtitleLinks = doc.querySelectorAll('.subtitle a');
        console.log(`Found ${subtitleLinks.length} subtitle links for ${bookURI}`);
        subtitleLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;

            const match = href.match(/^\/([A-Za-z0-9]+)\//);
            if (!match) return;

            const linkedBookURI = match[1];
            const text = link.textContent.trim();
            const styleAttr = link.getAttribute('style') || '';
            const hasFloatLeft = styleAttr.includes('float') && styleAttr.includes('left');
            const hasFloatRight = styleAttr.includes('float') && styleAttr.includes('right');

            console.log(`  Link: text="${text}", href="${href}", style="${styleAttr}"`);

            if (text.includes('<<') || hasFloatLeft) {
                metadata.previous = {
                    osisID: linkedBookURI,
                    short: text.replace('<<', '').replace('«', '').trim()
                };
                console.log(`  -> Set as previous: ${metadata.previous.osisID} (${metadata.previous.short})`);
            } else if (text.includes('>>') || hasFloatRight) {
                metadata.next = {
                    osisID: linkedBookURI,
                    short: text.replace('>>', '').replace('»', '').trim()
                };
                console.log(`  -> Set as next: ${metadata.next.osisID} (${metadata.next.short})`);
            }
        });

        console.log(`Cached metadata for ${bookURI}:`, metadata);
        return metadata;
    }

    /**
     * Detect which book is currently most visible in the viewport
     */
    function detectVisibleBook() {
        const scrollLeft = thread.scrollLeft;
        const viewportWidth = thread.clientWidth;
        const viewportCenter = scrollLeft + (viewportWidth / 2);

        // Find all chapter markers
        const chapterMarkers = thread.querySelectorAll('.post_no.chapter');

        // Track which books have chapters visible and their proximity to center
        const bookProximity = new Map();

        for (let marker of chapterMarkers) {
            const post = marker.closest('.post.bible');
            if (!post) continue;

            const postLeft = post.offsetLeft;
            const postRight = postLeft + post.offsetWidth;

            // Check if visible in viewport
            if (postRight > scrollLeft && postLeft < scrollLeft + viewportWidth) {
                const chapter = parseInt(marker.textContent);
                if (isNaN(chapter)) continue;

                // Determine which book this chapter belongs to
                let belongsToBook = null;

                // Check if post has data-book attribute (cross-book chapter)
                if (post.hasAttribute('data-book')) {
                    belongsToBook = post.getAttribute('data-book');
                } else {
                    // No data-book attribute means it's from the current book
                    belongsToBook = boardURI;
                }

                if (belongsToBook) {
                    const postCenter = postLeft + (post.offsetWidth / 2);
                    const distanceFromCenter = Math.abs(postCenter - viewportCenter);

                    if (!bookProximity.has(belongsToBook) || distanceFromCenter < bookProximity.get(belongsToBook)) {
                        bookProximity.set(belongsToBook, distanceFromCenter);
                    }
                }
            }
        }

        // Return the book closest to viewport center
        let closestBook = currentBook || boardURI;
        let minDistance = Infinity;

        for (let [book, distance] of bookProximity) {
            if (distance < minDistance) {
                minDistance = distance;
                closestBook = book;
            }
        }

        return closestBook;
    }

    /**
     * Update the page UI to reflect the current book
     */
    function updateBookUI(newBookURI) {
        if (newBookURI === currentBook) return;

        console.log(`Switching UI from ${currentBook} to ${newBookURI}`);
        currentBook = newBookURI;

        // Get metadata for new book
        let metadata = bookMetadataCache.get(newBookURI);
        if (!metadata) {
            console.warn(`No metadata cached for ${newBookURI}`);
            return;
        }

        console.log(`Using metadata:`, metadata);

        // Update h1 title
        const h1 = document.querySelector('header h1');
        if (h1) {
            h1.textContent = metadata.title;
            console.log(`Updated h1 to: ${metadata.title}`);
        }

        // Update subtitle
        const subtitleDiv = document.querySelector('.subtitle');
        if (subtitleDiv) {
            // Clear and rebuild subtitle
            subtitleDiv.innerHTML = '';

            // Add text
            subtitleDiv.appendChild(document.createTextNode(metadata.subtitle));

            // Add previous book link
            if (metadata.previous) {
                const prevLink = document.createElement('a');
                prevLink.href = `/${metadata.previous.osisID}/`;
                prevLink.setAttribute('style', 'float:left');
                prevLink.textContent = `<< ${metadata.previous.short}`;
                subtitleDiv.insertBefore(prevLink, subtitleDiv.firstChild);
                console.log(`Added previous link: << ${metadata.previous.short}`);
            } else {
                console.log(`No previous book in metadata`);
            }

            // Add next book link
            if (metadata.next) {
                const nextLink = document.createElement('a');
                nextLink.href = `/${metadata.next.osisID}/`;
                nextLink.setAttribute('style', 'float:right');
                nextLink.textContent = `${metadata.next.short} >>`;
                subtitleDiv.appendChild(nextLink);
                console.log(`Added next link: ${metadata.next.short} >>`);
            } else {
                console.log(`No next book in metadata`);
            }
        }

        // Update pages navigation
        const pagesDivs = document.querySelectorAll('.pages');
        pagesDivs.forEach(pagesDiv => {
            // Remove all existing chapter number links (keep prev/next and catalog)
            const allLinks = Array.from(pagesDiv.querySelectorAll('a'));
            allLinks.forEach(link => {
                const linkText = link.textContent.trim();
                // Remove if it's a number (chapter link)
                if (!isNaN(parseInt(linkText)) && linkText === String(parseInt(linkText))) {
                    // Find and remove surrounding brackets
                    let node = link.previousSibling;
                    while (node && node.nodeType === Node.TEXT_NODE) {
                        const prev = node.previousSibling;
                        if (node.textContent.includes('[')) {
                            node.remove();
                            break;
                        }
                        node = prev;
                    }
                    node = link.nextSibling;
                    while (node && node.nodeType === Node.TEXT_NODE) {
                        const next = node.nextSibling;
                        if (node.textContent.includes(']')) {
                            node.remove();
                            break;
                        }
                        node = next;
                    }
                    link.remove();
                }
            });

            // Find insertion point (after prev/next buttons, before catalog)
            const prevNextButtons = pagesDiv.querySelector('span');
            const catalogLink = pagesDiv.querySelector('a[href*="catalog"]');

            // Build chapter links HTML
            let chaptersHTML = '';
            for (let i = 1; i <= metadata.chapters; i++) {
                const url = i === 1 ? `/${newBookURI}/` : `/${newBookURI}/res/${i}.html`;
                chaptersHTML += ` [<a href="${url}">${i}</a>]`;
            }

            // Insert the chapter links
            if (catalogLink) {
                catalogLink.insertAdjacentHTML('beforebegin', chaptersHTML + ' ');
            } else if (prevNextButtons) {
                prevNextButtons.insertAdjacentHTML('afterend', chaptersHTML);
            } else {
                pagesDiv.insertAdjacentHTML('afterbegin', chaptersHTML);
            }

            console.log(`Updated page navigation with ${metadata.chapters} chapters`);
        });

        console.log(`UI updated to ${newBookURI}`);
    }

    /**
     * Get chapter number from a post element
     */
    function getChapterFromPost(postElement) {
        const chapterMarker = postElement.querySelector('.post_no.chapter');
        if (chapterMarker) {
            return parseInt(chapterMarker.textContent);
        }
        return null;
    }

    /**
     * Find the correct insertion point for a chapter based on chapter number
     * Returns the post element to insert before, or null to append at end
     */
    function findInsertionPoint(chapterNum) {
        const allPosts = thread.querySelectorAll('.post.bible');

        for (let post of allPosts) {
            const postChapter = getChapterFromPost(post);
            if (postChapter !== null && postChapter > chapterNum) {
                return post;
            }
        }

        return null; // Insert at end
    }

    /**
     * Load a specific chapter and extract its posts
     */
    async function loadChapter(chapterNum) {
        if (loadedChapters.has(chapterNum)) {
            console.log(`Chapter ${chapterNum} already loaded`);
            return null;
        }

        if (failedChapters.has(chapterNum)) {
            console.log(`Chapter ${chapterNum} previously failed, skipping`);
            return null;
        }

        // Chapter 1 is at index.html, other chapters are at /N.html
        const url = chapterNum === 1 ? `/${boardURI}/` : `/${boardURI}/${chapterNum}.html`;
        console.log(`Fetching chapter ${chapterNum} from ${url}`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`Chapter ${chapterNum} not found (${response.status})`);
                failedChapters.add(chapterNum);
                return null;
            }

            const html = await response.text();

            // Parse the HTML to extract the posts
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Extract all Bible posts from the chapter
            const posts = doc.querySelectorAll('.post.bible');
            if (posts.length === 0) {
                console.warn(`No posts found in chapter ${chapterNum}`);
                failedChapters.add(chapterNum);
                return null;
            }

            // Convert to HTML string
            let postsHTML = '';
            posts.forEach(post => {
                postsHTML += post.outerHTML;
            });

            // Mark as loaded
            loadedChapters.add(chapterNum);
            minLoadedChapter = Math.min(minLoadedChapter, chapterNum);
            maxLoadedChapter = Math.max(maxLoadedChapter, chapterNum);

            return postsHTML;

        } catch (error) {
            console.error(`Error loading chapter ${chapterNum}:`, error);
            failedChapters.add(chapterNum);
            return null;
        }
    }

    /**
     * Load more chapters in the specified direction
     */
    async function loadMoreChapters(direction) {
        if (loading) {
            console.log('Already loading, skipping...');
            return;
        }

        loading = true;

        try {
            const chaptersToLoad = [];
            let crossBook = null;

            if (direction === 'before') {
                // Load previous chapters from current book
                for (let i = 1; i <= config.columnsToLoad; i++) {
                    const chapterNum = minLoadedChapter - i;
                    if (chapterNum >= 1 && !loadedChapters.has(chapterNum) && !failedChapters.has(chapterNum)) {
                        chaptersToLoad.push(chapterNum);
                    }
                }

                // If no more chapters in current book, check cross-book chapters
                if (chaptersToLoad.length === 0) {
                    // Check if we have cross-book chapters loaded before current book
                    if (minLoadedChapter === 1 && bibleNav && bibleNav.previous) {
                        // Get all chapters loaded from previous book
                        const prevBookChapters = Array.from(loadedCrossBookChapters)
                            .filter(key => key.startsWith(`${bibleNav.previous.osisID}:`))
                            .map(key => parseInt(key.split(':')[1]))
                            .filter(num => !isNaN(num));

                        if (prevBookChapters.length > 0) {
                            // Continue loading from previous book
                            const minPrevBookChapter = Math.min(...prevBookChapters);
                            console.log(`Continuing backward from ${bibleNav.previous.osisID} chapter ${minPrevBookChapter}`);

                            if (minPrevBookChapter > 1) {
                                crossBook = {
                                    uri: bibleNav.previous.osisID,
                                    chapter: minPrevBookChapter - 1
                                };
                            }
                        } else {
                            // First time loading from previous book
                            console.log(`Reached start of ${boardURI}, loading previous book: ${bibleNav.previous.osisID}`);
                            crossBook = {
                                uri: bibleNav.previous.osisID,
                                chapter: 'last'
                            };
                        }
                    }
                }
            } else {
                // Load next chapters
                const maxChapter = bibleNav ? bibleNav.current.chapters : Infinity;
                console.log(`Loading 'after': maxLoadedChapter=${maxLoadedChapter}, maxChapter=${maxChapter}, bibleNav=`, bibleNav);

                if (maxLoadedChapter < maxChapter) {
                    // Load next chapters in current book
                    for (let i = 1; i <= config.columnsToLoad; i++) {
                        const chapterNum = maxLoadedChapter + i;
                        if (chapterNum <= maxChapter && !loadedChapters.has(chapterNum) && !failedChapters.has(chapterNum)) {
                            chaptersToLoad.push(chapterNum);
                        }
                    }
                } else if (bibleNav && bibleNav.next) {
                    // Reached end of current book
                    // Check if we've already loaded chapters from next book
                    const nextBookChapters = Array.from(loadedCrossBookChapters)
                        .filter(key => key.startsWith(`${bibleNav.next.osisID}:`))
                        .map(key => parseInt(key.split(':')[1]))
                        .filter(num => !isNaN(num));

                    if (nextBookChapters.length > 0) {
                        // Continue loading from next book
                        const maxNextBookChapter = Math.max(...nextBookChapters);
                        console.log(`Continuing to load from ${bibleNav.next.osisID}, currently at chapter ${maxNextBookChapter}`);

                        // Try to load next chapter in that book
                        // We'll need the next book's max chapter count - for now just try loading
                        crossBook = {
                            uri: bibleNav.next.osisID,
                            chapter: maxNextBookChapter + 1
                        };
                    } else {
                        // First time loading from next book
                        console.log(`Reached end of ${boardURI}, loading next book: ${bibleNav.next.osisID}`);
                        crossBook = {
                            uri: bibleNav.next.osisID,
                            chapter: 1
                        };
                    }
                }
            }

            // Handle cross-book loading
            if (crossBook) {
                try {
                    console.log(`Loading cross-book chapter: ${crossBook.uri} chapter ${crossBook.chapter}`);

                    // Cache book metadata if not already cached - always fetch from index page
                    if (!bookMetadataCache.has(crossBook.uri)) {
                        console.log(`Fetching metadata for ${crossBook.uri} from index page`);
                        const indexUrl = `/${crossBook.uri}/`;
                        const indexResponse = await fetch(indexUrl);
                        if (indexResponse.ok) {
                            const indexHtml = await indexResponse.text();
                            const parser = new DOMParser();
                            const indexDoc = parser.parseFromString(indexHtml, 'text/html');
                            const metadata = extractBookMetadata(indexDoc, crossBook.uri);
                            bookMetadataCache.set(crossBook.uri, metadata);
                        } else {
                            console.warn(`Failed to fetch metadata from ${indexUrl}: ${indexResponse.status}`);
                        }
                    }

                    // Fetch the cross-book chapter's HTML to extract posts
                    const url = crossBook.chapter === 'last'
                        ? `/${crossBook.uri}/`
                        : `/${crossBook.uri}/res/${crossBook.chapter}.html`;

                    const response = await fetch(url);
                    if (!response.ok) {
                        console.warn(`Failed to load ${url}: ${response.status}`);
                        loading = false;
                        return;
                    }

                    const html = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');

                    // If loading 'last' chapter, find the highest chapter number
                    let targetChapter = crossBook.chapter;
                    if (targetChapter === 'last') {
                        const pageLinks = doc.querySelectorAll('.pages a');
                        let maxChapter = 1;
                        pageLinks.forEach(link => {
                            const chapterNum = parseInt(link.textContent.trim());
                            if (!isNaN(chapterNum) && chapterNum > maxChapter) {
                                maxChapter = chapterNum;
                            }
                        });
                        targetChapter = maxChapter;
                        console.log(`Last chapter of ${crossBook.uri} is ${targetChapter}`);

                        // Check if already loaded before fetching
                        const crossBookKey = `${crossBook.uri}:${targetChapter}`;
                        if (loadedCrossBookChapters.has(crossBookKey)) {
                            console.log(`Already loaded ${crossBookKey}, skipping`);
                            loading = false;
                            return;
                        }

                        // Now fetch that specific chapter
                        const chapterUrl = `/${crossBook.uri}/res/${targetChapter}.html`;
                        const chapterResponse = await fetch(chapterUrl);
                        if (!chapterResponse.ok) {
                            console.warn(`Failed to load ${chapterUrl}: ${chapterResponse.status}`);
                            loading = false;
                            return;
                        }
                        const chapterHtml = await chapterResponse.text();
                        const chapterDoc = parser.parseFromString(chapterHtml, 'text/html');

                        // Extract posts from this chapter
                        const posts = chapterDoc.querySelectorAll('.post.bible');
                        if (posts.length === 0) {
                            console.warn(`No posts found in ${crossBook.uri} chapter ${targetChapter}`);
                            loading = false;
                            return;
                        }

                        let postsHTML = '';
                        posts.forEach(post => {
                            postsHTML += post.outerHTML;
                        });

                        // Mark posts with book identifier before inserting
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = postsHTML;
                        tempDiv.querySelectorAll('.post.bible').forEach(post => {
                            post.setAttribute('data-book', crossBook.uri);
                        });
                        postsHTML = tempDiv.innerHTML;

                        // Insert based on direction
                        if (direction === 'before') {
                            // Prepend to current view
                            const firstPost = thread.querySelector('.post.bible');
                            if (firstPost) {
                                console.log(`Prepending ${crossBook.uri} chapter ${targetChapter}`);

                                // Record scrollWidth before insertion
                                const scrollWidthBefore = thread.scrollWidth;

                                firstPost.insertAdjacentHTML('beforebegin', postsHTML);

                                // Adjust scroll position to maintain view
                                requestAnimationFrame(() => {
                                    if (!initialPreloadDone) {
                                        // During initial preload, scroll to show current chapter
                                        isAdjustingScroll = true;
                                        scrollToChapter(currentChapter);
                                        setTimeout(() => { isAdjustingScroll = false; }, 100);
                                    } else {
                                        // Wait for columns to recalculate
                                        requestAnimationFrame(() => {
                                            const scrollWidthAfter = thread.scrollWidth;
                                            const scrollWidthDifference = scrollWidthAfter - scrollWidthBefore;

                                            isAdjustingScroll = true;
                                            thread.scrollLeft += scrollWidthDifference;
                                            setTimeout(() => { isAdjustingScroll = false; }, 100);

                                            console.log(`Adjusted scroll by ${scrollWidthDifference}px to maintain position after cross-book prepend`);
                                        });
                                    }
                                });
                            }
                        } else {
                            // Append to current view
                            const lastPost = thread.querySelectorAll('.post.bible');
                            if (lastPost.length > 0) {
                                console.log(`Appending ${crossBook.uri} chapter ${targetChapter}`);
                                lastPost[lastPost.length - 1].insertAdjacentHTML('afterend', postsHTML);
                            }
                        }
                    } else {
                        // Loading numbered chapter (not 'last')
                        // Check if already loaded
                        const crossBookKey = `${crossBook.uri}:${targetChapter}`;
                        if (loadedCrossBookChapters.has(crossBookKey)) {
                            console.log(`Already loaded ${crossBookKey}, skipping`);
                            loading = false;
                            return;
                        }

                        const posts = doc.querySelectorAll('.post.bible');
                        if (posts.length === 0) {
                            console.warn(`No posts found in ${crossBook.uri} chapter ${targetChapter}`);
                            loading = false;
                            return;
                        }

                        let postsHTML = '';
                        posts.forEach(post => {
                            postsHTML += post.outerHTML;
                        });

                        // Mark posts with book identifier before inserting
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = postsHTML;
                        tempDiv.querySelectorAll('.post.bible').forEach(post => {
                            post.setAttribute('data-book', crossBook.uri);
                        });
                        postsHTML = tempDiv.innerHTML;

                        // Insert based on direction
                        if (direction === 'before') {
                            // Prepend to current view
                            const firstPost = thread.querySelector('.post.bible');
                            if (firstPost) {
                                console.log(`Prepending ${crossBook.uri} chapter ${targetChapter}`);

                                // Record scrollWidth before insertion
                                const scrollWidthBefore = thread.scrollWidth;

                                firstPost.insertAdjacentHTML('beforebegin', postsHTML);

                                // Adjust scroll position to maintain view
                                requestAnimationFrame(() => {
                                    if (!initialPreloadDone) {
                                        scrollToChapter(currentChapter);
                                    } else {
                                        // Wait for columns to recalculate
                                        requestAnimationFrame(() => {
                                            const scrollWidthAfter = thread.scrollWidth;
                                            const scrollWidthDifference = scrollWidthAfter - scrollWidthBefore;
                                            thread.scrollLeft += scrollWidthDifference;
                                            console.log(`Adjusted scroll by ${scrollWidthDifference}px to maintain position after cross-book prepend`);
                                        });
                                    }
                                });
                            }
                        } else {
                            // Append to current view
                            const lastPost = thread.querySelectorAll('.post.bible');
                            if (lastPost.length > 0) {
                                console.log(`Appending ${crossBook.uri} chapter ${targetChapter}`);
                                lastPost[lastPost.length - 1].insertAdjacentHTML('afterend', postsHTML);
                            }
                        }
                    }

                    // Mark this cross-book chapter as loaded
                    const crossBookKey = `${crossBook.uri}:${targetChapter}`;
                    loadedCrossBookChapters.add(crossBookKey);
                    console.log(`Loaded cross-book chapter: ${crossBook.uri} ${targetChapter}`);

                    // Update sentries after cross-book loading
                    updateSentries();
                } catch (error) {
                    console.error(`Error loading cross-book chapter:`, error);
                }
                loading = false;
                return;
            }

            if (chaptersToLoad.length === 0) {
                console.log(`No chapters to load in direction '${direction}'`);
                loading = false;
                return;
            }

            console.log(`Loading chapters ${direction}:`, chaptersToLoad);

            // Get the reference element for insertion
            const allPosts = thread.querySelectorAll('.post.bible');
            const referenceElement = allPosts[allPosts.length - 1];
            const firstElement = allPosts[0];

            // Only scroll to chapter during initial preload, not during user scrolling
            const shouldScrollToChapter = !initialPreloadDone && direction === 'before';

            for (const chapterNum of chaptersToLoad) {
                const postsHTML = await loadChapter(chapterNum);
                if (postsHTML) {
                    // Find the correct sorted position for this chapter
                    const insertionPoint = findInsertionPoint(chapterNum);
                    const scrollWidthBefore = thread.scrollWidth;

                    if (insertionPoint) {
                        // Insert before the insertion point
                        console.log(`Inserting chapter ${chapterNum} in sorted order before chapter ${getChapterFromPost(insertionPoint)}`);
                        insertionPoint.insertAdjacentHTML('beforebegin', postsHTML);
                    } else {
                        // Append at end
                        console.log(`Appending chapter ${chapterNum} at end`);
                        const lastPost = thread.querySelectorAll('.post.bible');
                        if (lastPost.length > 0) {
                            lastPost[lastPost.length - 1].insertAdjacentHTML('afterend', postsHTML);
                        } else {
                            thread.insertAdjacentHTML('beforeend', postsHTML);
                        }
                    }

                    // Adjust scroll position if loading before current view
                    if (direction === 'before') {
                        requestAnimationFrame(() => {
                            if (shouldScrollToChapter) {
                                isAdjustingScroll = true;
                                scrollToChapter(currentChapter);
                                setTimeout(() => { isAdjustingScroll = false; }, 100);
                            } else {
                                requestAnimationFrame(() => {
                                    const scrollWidthAfter = thread.scrollWidth;
                                    const scrollWidthDifference = scrollWidthAfter - scrollWidthBefore;

                                    isAdjustingScroll = true;
                                    thread.scrollLeft += scrollWidthDifference;
                                    setTimeout(() => { isAdjustingScroll = false; }, 100);

                                    console.log(`Adjusted scroll by ${scrollWidthDifference}px to maintain position`);
                                });
                            }
                        });
                    }
                }
            }

            console.log(`Loaded ${chaptersToLoad.length} chapter(s) ${direction}`);

            // Update sentries after loading new content
            updateSentries();

            loading = false;

        } catch (error) {
            console.error('Error loading chapters:', error);
            loading = false;
        }
    }

    /**
     * Get the chapter number from the leftmost visible post
     * Only considers chapters from the current book (not cross-book chapters)
     */
    function getLeftmostVisibleChapter() {
        const scrollLeft = thread.scrollLeft;
        const viewportWidth = thread.clientWidth;

        // Find all chapter markers (first verse of each chapter)
        const chapterMarkers = thread.querySelectorAll('.post_no.chapter');

        // Determine valid chapter range for current book
        const maxChapter = bibleNav ? bibleNav.current.chapters : Infinity;

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
                    // Only consider chapters that belong to the current book
                    if (!isNaN(chapter) && chapter >= 1 && chapter <= maxChapter) {
                        closestChapter = chapter;
                        closestDistance = distance;
                    }
                }
            }
        }

        return closestChapter;
    }

    /**
     * Update the URL to reflect the current chapter and book
     */
    function updateURL() {
        // Detect which book is currently visible
        const visibleBook = detectVisibleBook();

        // Update UI if book changed
        if (visibleBook !== currentBook) {
            updateBookUI(visibleBook);
        }

        // Now get the chapter (respecting the current book's range)
        const chapter = getLeftmostVisibleChapter();

        if (chapter !== currentChapter || visibleBook !== currentBook) {
            currentChapter = chapter;
            const effectiveBook = currentBook || boardURI;
            const newURL = `/${effectiveBook}/${chapter}/`;

            // Use History API to update URL without reload
            // Use replaceState so we don't spam the browser history with every chapter scrolled
            if (window.history && window.history.replaceState) {
                window.history.replaceState(
                    { book: effectiveBook, chapter: chapter },
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
        // Skip if this is a programmatic scroll adjustment
        if (isAdjustingScroll) {
            return;
        }

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
            const columnWidth = getColumnWidth();

            console.log(`Scroll check: left=${left.toFixed(2)} cols, right=${right.toFixed(2)} cols, threshold=${config.loadThreshold}, columnWidth=${columnWidth.toFixed(0)}px`);

            // Load more content if nearing edges
            // Check right edge first (more specific condition)
            if (right < config.loadThreshold) {
                console.log('Near right edge, loading next chapters');
                loadMoreChapters('after');
            } else if (left < config.loadThreshold && (initialPreloadDone || thread.scrollLeft > 50)) {
                // Only check left edge if NOT near right edge
                console.log('Near left edge, loading previous chapters');
                loadMoreChapters('before');
            }

            // Update URL after scrolling stops
            if (urlUpdateTimer) {
                clearTimeout(urlUpdateTimer);
            }

            urlUpdateTimer = setTimeout(function() {
                updateURL();
            }, config.urlUpdateDelay);

        }, 150);  // Debounce scroll handling to reduce overhead
    }

    /**
     * Scroll to a specific chapter
     */
    function scrollToChapter(chapter) {
        // For the first chapter of any book, find and scroll to the OP with the book title
        // (The OP has the h2 title, not a chapter marker)
        const firstChapter = bibleNav ? Math.min(1, bibleNav.current.chapters) : 1;

        if (chapter === firstChapter || chapter === 1) {
            // Find the OP with h2 (book title)
            const opWithTitle = thread.querySelector('.post.op.bible:has(h2)');
            if (opWithTitle) {
                thread.scrollLeft = opWithTitle.offsetLeft;
                console.log(`Scrolled to chapter ${chapter} OP at position ${opWithTitle.offsetLeft}`);
                return;
            }
        }

        // For other chapters, find the first post with the chapter marker
        const chapterMarkers = thread.querySelectorAll('.post_no.chapter');
        for (let marker of chapterMarkers) {
            if (parseInt(marker.textContent) === chapter) {
                const post = marker.closest('.post.bible');
                if (post) {
                    // Scroll to show this post at the left edge
                    thread.scrollLeft = post.offsetLeft;
                    console.log(`Scrolled to chapter ${chapter} at position ${post.offsetLeft}`);
                    return;
                }
            }
        }
        console.warn(`Could not find chapter ${chapter} to scroll to`);
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

        // Scrape Bible navigation data from the page
        bibleNav = scrapeBibleNav();

        // Cache initial book metadata
        currentBook = boardURI;
        const initialMetadata = extractBookMetadata(document, boardURI);
        bookMetadataCache.set(boardURI, initialMetadata);

        // Get initial chapter from URL or DOM
        // Try URL patterns: /Book/res/123.html or /Book/123.html
        let urlMatch = window.location.pathname.match(/\/([A-Za-z0-9]+)\/res\/(\d+)\.html/);
        if (!urlMatch) {
            urlMatch = window.location.pathname.match(/\/([A-Za-z0-9]+)\/(\d+)\.html/);
        }

        if (urlMatch) {
            currentChapter = parseInt(urlMatch[2]);
        } else {
            // Try to get from DOM - look for chapter marker in first post
            const chapterMarker = thread.querySelector('.post_no.chapter');
            if (chapterMarker) {
                currentChapter = parseInt(chapterMarker.textContent);
            } else {
                // No chapter marker means we're on the OP of chapter 1 (has h2 title instead)
                currentChapter = 1;
            }
        }

        // Mark initial chapter as loaded
        loadedChapters.add(currentChapter);
        minLoadedChapter = currentChapter;
        maxLoadedChapter = currentChapter;

        // Add scroll listener
        thread.addEventListener('scroll', onScroll);

        // Initialize sentries for IntersectionObserver
        updateSentries();
        initSentryObserver();

        console.log(`Bible infinite scroll initialized on ${boardURI}, chapter ${currentChapter}`);

        // Enable loading immediately for sentries, but delay aggressive preloading
        loadingEnabled = true;

        // Delay preloading until page is fully loaded and idle (3 seconds)
        setTimeout(function() {

            // Check if content is too short (no scrollbar)
            const scrollWidth = thread.scrollWidth;
            const clientWidth = thread.clientWidth;
            const hasScrollbar = scrollWidth > clientWidth;

            if (!hasScrollbar) {
                console.log('No scrollbar detected, auto-loading adjacent chapters');

                // Load previous chapter if we're not on chapter 1
                if (currentChapter > 1) {
                    loadMoreChapters('before').then(() => {
                        // After loading previous, try loading next
                        if (bibleNav && currentChapter < bibleNav.current.chapters) {
                            loadMoreChapters('after').then(() => {
                                // Only mark preload done after BOTH operations complete
                                initialPreloadDone = true;
                            });
                        } else if (bibleNav && bibleNav.next) {
                            // At end of book, load next book
                            loadMoreChapters('after').then(() => {
                                initialPreloadDone = true;
                            });
                        } else {
                            initialPreloadDone = true;
                        }
                    });
                } else if (bibleNav && bibleNav.previous) {
                    // On chapter 1, try loading previous book's last chapter
                    loadMoreChapters('before').then(() => {
                        // Then load next chapter
                        if (bibleNav && currentChapter < bibleNav.current.chapters) {
                            loadMoreChapters('after').then(() => {
                                // Only mark preload done after BOTH operations complete
                                initialPreloadDone = true;
                            });
                        } else {
                            initialPreloadDone = true;
                        }
                    });
                } else {
                    // Just load next chapter
                    if (bibleNav && currentChapter < bibleNav.current.chapters) {
                        loadMoreChapters('after').then(() => {
                            initialPreloadDone = true;
                        });
                    }
                }
            } else if (currentChapter > 1) {
                // Has scrollbar, just preload previous chapter
                console.log('Preloading previous chapter to enable leftward scrolling');
                loadMoreChapters('before').then(() => {
                    initialPreloadDone = true;
                });
            } else if (currentChapter === 1 && bibleNav && bibleNav.previous) {
                // Chapter 1, preload previous book
                console.log('Preloading previous book to enable leftward scrolling');
                loadMoreChapters('before').then(() => {
                    initialPreloadDone = true;
                });
            } else {
                initialPreloadDone = true;
            }
        }, 100);  // Wait 100ms before preloading (non-blocking)
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
