/* Start token replacement */

// Hide body immediately before any content renders
document.documentElement.style.visibility = 'hidden';

function processTokens() {
  /* console.log('Token replacement started'); */
  
  // Define your tokens
  const tokens = {
    '[PAGE_TITLE]': document.title.split(' — ')[0],
    '[AGENT_NAME]': 'Eric Quiner',
    '[SITE_NAME]': document.title.split(' — ')[1] || 'Eric Quiner Realtor'
  };
  
  /* console.log('Available tokens:', tokens); */
  
  function replaceTokens(text) {
    let result = text;
    Object.keys(tokens).forEach(token => {
      const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(regex, tokens[token]);
    });
    return result;
  }
  
  // Find all text nodes that contain tokens
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const textNodes = [];
  let node;
  
  while (node = walker.nextNode()) {
    if (node.textContent.includes('[') && node.textContent.includes(']')) {
      textNodes.push(node);
      
      // Add token-content class to the parent element
      let parent = node.parentElement;
      if (parent && !parent.classList.contains('token-content')) {
        parent.classList.add('token-content');
        /* console.log('Added token-content class to:', parent.tagName); */
      }
    }
  }
  
  /* console.log('Found', textNodes.length, 'text nodes with tokens'); */
  
  // Replace tokens in all found text nodes
  textNodes.forEach(node => {
    const originalText = node.textContent;
    const newText = replaceTokens(originalText);
    
    if (originalText !== newText) {
      node.textContent = newText;
      /* console.log('Replaced:', originalText, '→', newText); */
    }
    
    // Mark parent element as processed
    let parent = node.parentElement;
    if (parent) {
      parent.classList.add('processed');
    }
  });
  
  // Mark any remaining token-content elements as processed
  const remainingElements = document.querySelectorAll('.token-content:not(.processed)');
  remainingElements.forEach(element => {
    element.classList.add('processed');
  });
  
  // Show content after processing is complete
  document.documentElement.style.visibility = 'visible';
  document.body.classList.add('tokens-processed');
  
  /* console.log('Token replacement completed'); */
}

// Run processing as early as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processTokens);
} else {
  // DOM is already loaded, process immediately
  processTokens();
}

/* End token replacement */

