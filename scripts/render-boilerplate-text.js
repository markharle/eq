// ============================================================================
// SHARED TEXT RENDERER (render-boilerplate-text.js)
// Fetches JSON from GitHub and populates target divs
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
  const JSON_URL = 'https://raw.githubusercontent.com/markharle/eq/refs/heads/main/JSON/Shared/shared-text.json';
  
  // Fetch JSON from GitHub
  fetch(JSON_URL)
    .then(response => response.json())
    .then(data => {
      populateDivs(data);
    })
    .catch(error => {
      // Silently fail - no console errors or fallback messaging
    });
});

// ============================================================================
// POPULATE DIVS FUNCTION
// ============================================================================

function populateDivs(jsonData) {
  // Define target div IDs and their corresponding JSON item keys
  const targetDivs = [
    { divId: 'Market_Disclaimer', jsonKey: 'Market_Disclaimer' },
    { divId: 'Zillow_Attribution', jsonKey: 'Zillow_Attribution' }
  ];

  // Iterate through target divs
  targetDivs.forEach(target => {
    const divElement = document.getElementById(target.divId);
    
    if (divElement) {
      // Find the corresponding JSON object by matching the 'item' field
      const jsonObject = jsonData.find(obj => obj.item === target.jsonKey);
      
      if (jsonObject) {
        // Apply the raw text content from the 'content' field
        divElement.textContent = jsonObject.content;
      }
    }
  });
}
