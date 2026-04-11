(async function initFeaturedListing() {
  // 1. Failsafe: Ensure CONFIG was loaded on the page
  if (typeof CONFIG === 'undefined') {
    console.error('Project Builder: CONFIG object is missing on this page.');
    return;
  }

  // 2. THE RENDER MAP (This makes future expansion incredibly easy)
  // To add a 3rd section later, simply add another object to this array.
  const renderMap = [
    {
      templateUrl: CONFIG.HTML_HERO_TEMPLATE,
      targetId: 'renoProjectHeroContent'
    },
    {
      templateUrl: CONFIG.HTML_BODY_TEMPLATE,
      targetId: 'renoProjectContent'
    }
  ];

  try {
    const jsonUrl = `${CONFIG.JSON_BASE_URL}/DSMReno-project-${CONFIG.ID}.json`;

    // 3. Prepare all fetch requests to run concurrently
    // The first request in the array is ALWAYS the JSON data
    const fetchPromises = [fetch(jsonUrl)];
    
    // Add the template fetches based on the render map
    renderMap.forEach(section => {
      if (section.templateUrl) {
        fetchPromises.push(fetch(section.templateUrl));
      }
    });

    // Execute all fetches at exactly the same time for max speed
    const responses = await Promise.all(fetchPromises);

    // Check for any 404s or network errors
    responses.forEach(res => {
      if (!res.ok) throw new Error(`Fetch failed for ${res.url}: ${res.statusText}`);
    });

    // 4. Extract the JSON Data (It is always the first item we fetched)
    const jsonResponse = responses.shift(); // .shift() removes and returns the first item from the array
    const jsonDataArray = await jsonResponse.json();
    const projectData = jsonDataArray[0];

    if (!projectData) {
      throw new Error('Project Builder: JSON data is empty or malformed.');
    }

    // 5. Helper Function: Replaces tokens in HTML with JSON values
    const processTemplate = (htmlMarkup, data) => {
      let processed = htmlMarkup;
      for (const [key, value] of Object.entries(data)) {
        const tokenRegex = new RegExp(`\\[${key}\\]`, 'gi');
        const safeValue = (value !== null && value !== undefined) ? value : '';
        processed = processed.replace(tokenRegex, safeValue);
      }
      // Cleanup any unused tokens left in the markup
      return processed.replace(/\[.*?\]/g, '');
    };

    // 6. Process and Inject Templates into their respective DIVs
    // Since we removed the JSON response using .shift(), 'responses' now 
    // strictly contains the HTML template responses in the exact order of the renderMap.
    for (let i = 0; i < renderMap.length; i++) {
      const section = renderMap[i];
      const targetDiv = document.getElementById(section.targetId);
      
      // If the target container exists on the page and a template was configured
      if (targetDiv && section.templateUrl) {
        const htmlMarkup = await responses[i].text();
        targetDiv.innerHTML = processTemplate(htmlMarkup, projectData);
      } else if (!targetDiv) {
        // Silently warn in the console if the Content Manager forgot to add a target block
        console.warn(`Project Builder: Target container #${section.targetId} not found on the page.`);
      }
    }

  } catch (error) {
    console.error('Project Builder Error:', error);
    
    // Fallback error messaging for all target divs
    renderMap.forEach(section => {
      const targetDiv = document.getElementById(section.targetId);
      if (targetDiv) {
        targetDiv.innerHTML = `<p style="text-align:center; color: red;">Content could not be loaded at this time.</p>`;
      }
    });
  }
})();
