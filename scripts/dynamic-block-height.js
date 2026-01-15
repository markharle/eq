/**
 * Dynamic Block Height Synchronizer (Updated for Combined Container)
 * Synchronizes the height of Code Block 2 to be 100px taller than Code Block 1
 * Monitors for resize events and content changes
 * 
 * Usage: Add data-block="code-block-1" and data-block="code-block-2" to target elements
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    block1Selector: '[data-block="code-block-1"]',
    block2Selector: '[data-block="code-block-2"]',
    heightOffset: 100, // Code Block 2 should be 100px taller
    defaultHeight: 600, // Default height for Code Block 2 before page loads
    debounceDelay: 150, // Debounce resize events (ms)
    mobileBreakpoint: 768 // Mobile breakpoint in pixels
  };

  let resizeTimeout;

  /**
   * Check if we're on mobile
   */
  function isMobile() {
    return window.innerWidth < CONFIG.mobileBreakpoint;
  }

  /**
   * Initialize the height synchronization
   */
  function init() {
    const block1 = document.querySelector(CONFIG.block1Selector);
    const block2 = document.querySelector(CONFIG.block2Selector);

    // Validate that both blocks exist
    if (!block1 || !block2) {
      console.warn('Dynamic Block Height: One or both target blocks not found in DOM');
      return;
    }

    // Set default height on Code Block 2 (desktop/tablet only)
    if (!isMobile()) {
      setBlockHeight(block2, CONFIG.defaultHeight);
    }

    // Initial height sync after a brief delay to allow content to render
    setTimeout(() => {
      syncHeights(block1, block2);
    }, 100);

    // Create ResizeObserver to monitor Code Block 1 for height changes
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        syncHeights(block1, block2);
      }, CONFIG.debounceDelay);
    });

    // Start observing Code Block 1
    resizeObserver.observe(block1);

    // Listen for window resize events (handles breakpoint changes)
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        syncHeights(block1, block2);
      }, CONFIG.debounceDelay);
    });
  }

  /**
   * Synchronize the heights of both blocks
   * @param {HTMLElement} block1 - The source block (Code Block 1)
   * @param {HTMLElement} block2 - The target block (Code Block 2)
   */
  function syncHeights(block1, block2) {
    // On mobile, Code Block 2 height is controlled by CSS (100px)
    if (isMobile()) {
      // Remove inline height style to let CSS control it
      block2.style.height = '';
      return;
    }

    // On desktop/tablet, sync heights
    const block1Height = block1.offsetHeight;
    const block2Height = block1Height + CONFIG.heightOffset;

    setBlockHeight(block2, block2Height);

    // Optional: Log for debugging (remove in production if desired)
    console.log(`Dynamic Block Height: Block 1 = ${block1Height}px, Block 2 = ${block2Height}px`);
  }

  /**
   * Set the height of a block via inline style
   * @param {HTMLElement} block - The block to style
   * @param {number} height - The height in pixels
   */
  function setBlockHeight(block, height) {
    block.style.height = `${height}px`;
  }

  /**
   * Wait for DOM to be ready, then initialize
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM is already ready
    init();
  }
})();
