/**
 * Auto-Link Text Strings in Modal Link Divs (auto-link-modal.js)
 This script converts selected text strings into clickable 'contact us' links. We use this to enable these links on raw text injected to our pages.
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION SECTION - EDIT THESE VALUES
  // ============================================
  const AUTO_LINK_CONFIG = {
    // CSS class to target
    targetClass: 'js-modal-link',
    
    // Text strings to find and wrap (case-insensitive)
    textStrings: ['Contact me', 'Call me', 'Reach out', "Let's discuss"],
    
    // URL/anchor for the links
    href: '#wm-popup=/contact-us-popup',
    
    // Retry delays (in milliseconds) for dynamically loaded content
    retryDelays: [1500, 3000],
    
    // Enable console logging
    enableLogging: true
  };

  // ============================================
  // CORE SCRIPT - Uses config values above
  // ============================================

  // Function to wrap text strings with anchor tags
  function wrapTextWithLink(node, textStrings, href) {
    // Skip if node is already an anchor tag or script/style element
    if (node.nodeType === 1 && (node.tagName === 'A' || node.tagName === 'SCRIPT' || node.tagName === 'STYLE')) {
      return;
    }

    // Process text nodes
    if (node.nodeType === 3) { // Text node
      let text = node.textContent;
      let hasMatch = false;

      // Check if any of our target strings exist in this text node
      for (let textString of textStrings) {
        if (text.toLowerCase().includes(textString.toLowerCase())) {
          hasMatch = true;
          break;
        }
      }

      if (hasMatch) {
        // Create a temporary container to hold our new HTML
        const tempDiv = document.createElement('div');
        let html = text;

        // Replace each text string with wrapped version (case-insensitive)
        for (let textString of textStrings) {
          const regex = new RegExp(`(${textString})`, 'gi');
          html = html.replace(regex, `<a href="${href}">$1</a>`);
        }

        tempDiv.innerHTML = html;

        // Replace the text node with the new HTML content
        node.parentNode.replaceChild(tempDiv, node);

        // Recursively process the new nodes
        for (let child of tempDiv.childNodes) {
          wrapTextWithLink(child, textStrings, href);
        }
      }
    } else if (node.nodeType === 1) { // Element node
      // Recursively process child nodes
      const children = Array.from(node.childNodes);
      for (let child of children) {
        wrapTextWithLink(child, textStrings, href);
      }
    }
  }

  // Main function to process all divs with the target class
  function processModalLinkDivs() {
    // Use config value for target class selector
    const targetDivs = document.querySelectorAll(`div.${AUTO_LINK_CONFIG.targetClass}`);
    
    if (targetDivs.length > 0) {
      let processedCount = 0;
      targetDivs.forEach(div => {
        // Only process if div has text content
        if (div.textContent.trim().length > 0) {
          // Pass config values to the wrapping function
          wrapTextWithLink(div, AUTO_LINK_CONFIG.textStrings, AUTO_LINK_CONFIG.href);
          processedCount++;
        }
      });
      
      // Use config value for logging preference
      if (AUTO_LINK_CONFIG.enableLogging) {
        if (processedCount === 0) {
          console.warn('⚠ Auto-Link script: No divs with text content found');
        } else {
          console.log(`✓ Auto-Link script processed ${processedCount} div(s) with class "${AUTO_LINK_CONFIG.targetClass}"`);
        }
      }
    } else {
      if (AUTO_LINK_CONFIG.enableLogging) {
        console.warn(`⚠ No divs found with class "${AUTO_LINK_CONFIG.targetClass}"`);
      }
    }
  }

  // Run when DOM is ready
  function initScript() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', processModalLinkDivs);
    } else {
      processModalLinkDivs();
    }

    // Run after delays to catch dynamically loaded content
    // Use config values for retry delays
    AUTO_LINK_CONFIG.retryDelays.forEach(delay => {
      setTimeout(processModalLinkDivs, delay);
    });
  }

  // Initialize the script
  initScript();
})();
