
  (async function initFeaturedListing() {
    const targetDiv = document.getElementById('renoProjectContent');

    if (!targetDiv) {
      console.error('Target container #renoProjectContent not found.');
      return;
    }

    try {
      // Construct the JSON URL based on the ID
      const jsonUrl = `${CONFIG.JSON_BASE_URL}/DSMReno-project-${CONFIG.ID}.json`;

      // Fetch both the HTML Template and the JSON data AT THE SAME TIME for maximum speed
      const [templateResponse, dataResponse] = await Promise.all([
        fetch(CONFIG.HTML_TEMPLATE),
        fetch(jsonUrl)
      ]);

      // Check for 404s or network errors
      if (!templateResponse.ok) throw new Error(`Template fetch failed: ${templateResponse.statusText}`);
      if (!dataResponse.ok) throw new Error(`JSON fetch failed: ${dataResponse.statusText}`);

      // Parse the responses
      let htmlMarkup = await templateResponse.text();
      const jsonDataArray = await dataResponse.json();

      // Your JSON sample is an array containing one object. We need to extract that first object.
      const projectData = jsonDataArray[0]; 

      if (!projectData) {
        throw new Error('JSON data is empty or malformed.');
      }

      // Dynamically replace all [tokens] in the HTML with values from the JSON object
      for (const [key, value] of Object.entries(projectData)) {
        // We use a case-insensitive regular expression ('gi'). 
        // This is important because your HTML uses [city] but your JSON key is "City".
        const tokenRegex = new RegExp(`\\[${key}\\]`, 'gi');
        
        // If the value is null or undefined, replace with an empty string so "null" doesn't print on screen
        const safeValue = (value !== null && value !== undefined) ? value : '';
        
        htmlMarkup = htmlMarkup.replace(tokenRegex, safeValue);
      }

      // Cleanup any leftover tokens that existed in HTML but NOT in the JSON (optional but recommended)
      htmlMarkup = htmlMarkup.replace(/\[.*?\]/g, '');

      // Inject the processed HTML into the page
      targetDiv.innerHTML = htmlMarkup;

    } catch (error) {
      console.error('Error rendering featured listing:', error);
      targetDiv.innerHTML = `<p style="color: red;">We're sorry, project details could not be loaded at this time.</p>`;
    }
  })();
