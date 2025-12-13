/**
 * Auto-Link Text Strings in Modal Link Divs
 * Hosted on GitHub and injected via Squarespace Code Injection
 * 
 * This script automatically wraps predefined text strings with anchor tags
 * in divs with the class "js-modal-link"
 */

(function() {
  'use strict';

  // Define the text strings to find and the link URL
  const linkConfig = {
    textStrings: ['Contact me', 'Call me', 'Reach out', "Let's discuss"],
    href: '#wm-popup=/contact-us-popup'
  };

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
    const targetDivs = document.querySelectorAll('div.js-modal-link');
    
    if (targetDivs.length > 0) {
      targetDivs.forEach(div => {
        wrapTextWithLink(div, linkConfig.textStrings, linkConfig.href);
      });
      console.log(`✓ Auto-Link script processed ${targetDivs.length} div(s) with class "js-modal-link"`);
    }
  }

  // Run when DOM is ready
  function initScript() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', processModalLinkDivs);
    } else {
      processModalLinkDivs();
    }
  }

  // Initialize the script
  initScript();
})();
