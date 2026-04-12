(async function initFeaturedListing() {
  if (typeof CONFIG === 'undefined') {
    console.error('Project Builder: CONFIG object is missing on this page.');
    return;
  }

  // 1. UPDATED RENDER MAP (Now includes the Map section)
  const renderMap = [
    {
      templateUrl: CONFIG.HTML_HERO_TEMPLATE,
      targetId: 'renoProjectHeroContent'
    },
    {
      templateUrl: CONFIG.HTML_BODY_TEMPLATE,
      targetId: 'renoProjectContent'
    },
    {
      templateUrl: CONFIG.HTML_MAP_TEMPLATE,
      targetId: 'renoProjectMapContent' // Targets the new div
    }
  ];

  try {
    const jsonUrl = `${CONFIG.JSON_BASE_URL}/DSMReno-project-${CONFIG.ID}.json`;

    // 2. Fetch JSON and all HTML Templates concurrently
    const fetchPromises = [fetch(jsonUrl)];
    renderMap.forEach(section => {
      if (section.templateUrl) {
        fetchPromises.push(fetch(section.templateUrl));
      }
    });

    const responses = await Promise.all(fetchPromises);

    responses.forEach(res => {
      if (!res.ok) throw new Error(`Fetch failed for ${res.url}: ${res.statusText}`);
    });

    // 3. Extract JSON Data
    const jsonResponse = responses.shift(); 
    const jsonDataArray = await jsonResponse.json();
    const projectData = jsonDataArray[0];

    if (!projectData) {
      throw new Error('Project Builder: JSON data is empty or malformed.');
    }

    // Helper: Token Replacer
    const processTemplate = (htmlMarkup, data) => {
      let processed = htmlMarkup;
      for (const [key, value] of Object.entries(data)) {
        const tokenRegex = new RegExp(`\\[${key}\\]`, 'gi');
        const safeValue = (value !== null && value !== undefined) ? value : '';
        processed = processed.replace(tokenRegex, safeValue);
      }
      return processed.replace(/\[.*?\]/g, '');
    };

    // 4. Inject HTML Templates
    for (let i = 0; i < renderMap.length; i++) {
      const section = renderMap[i];
      const targetDiv = document.getElementById(section.targetId);
      
      if (targetDiv && section.templateUrl) {
        const htmlMarkup = await responses[i].text();
        targetDiv.innerHTML = processTemplate(htmlMarkup, projectData);
      }
    }

    // ==========================================
    // 5. NEW: INITIALIZE LEAFLET MAP
    // ==========================================
    
    // We use a brief timeout to guarantee the browser has finished "painting" 
    // the injected HTML to the screen before Leaflet tries to calculate its height.
    setTimeout(() => {
      const mapContainer = document.getElementById('projectLeafletMap');
      
      // Only proceed if the map div exists AND we have coordinate data
      if (mapContainer && projectData.Latitude && projectData.Longitude) {
        
        // Convert strings to decimals
        const lat = parseFloat(projectData.Latitude);
        const lng = parseFloat(projectData.Longitude);

        // Initialize the Map
        const map = L.map('projectLeafletMap').setView([lat, lng], 15);

        // Load the map tiles (Standard OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Add the Marker Pin
        const marker = L.marker([lat, lng]).addTo(map);

        // If there is a quote, bind it to the popup
        if (projectData.ericQuote) {
          const popupContent = `<div style="font-size:14px;"><strong>Eric's Note:</strong><br/>${projectData.ericQuote}</div>`;
          
          // .bindPopup() handles click-to-open automatically
          marker.bindPopup(popupContent);

          // Add hover behavior to open the popup automatically
          marker.on('mouseover', function () {
            this.openPopup();
          });
          
          // Optional: close it when the mouse leaves. 
          // If you want it to stay open after hovering, just delete these next 3 lines.
          marker.on('mouseout', function () {
            this.closePopup();
          });
        }
      }
    }, 100); 

  } catch (error) {
    console.error('Project Builder Error:', error);
    renderMap.forEach(section => {
      const targetDiv = document.getElementById(section.targetId);
      if (targetDiv) {
        targetDiv.innerHTML = `<p style="text-align:center; color: red;">Content could not be loaded at this time.</p>`;
      }
    });
  }
})();
