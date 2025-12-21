// ============================================================================
// HERO TEXT RENDERER
// Renders the heroText field from JSON data into the hero markup
// ============================================================================

// NOTE: CONFIG is defined in the Squarespace code block before this script loads

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

function renderHeroText() {
  // Step 1: Fetch the JSON data from GitHub
  fetch(CONFIG.JSON_URL)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      // Step 2: Find the matching entity in the JSON data
      const entityData = data.find(item => item.entity === CONFIG.ENTITY);

      // Step 3: Check if entity was found
      if (!entityData) {
        console.error(`Entity "${CONFIG.ENTITY}" not found in JSON data.`);
        document.getElementById("heroText").textContent = "Data not available";
        return;
      }

      // Step 4: Extract the heroText text
      const heroTextString = entityData.heroText;

      // Step 5: Render the value into the DOM
      document.getElementById("heroText").textContent = heroTextString;

      console.log(`Successfully rendered hero text for ${CONFIG.ENTITY}: ${heroText}`);
    })
    .catch(error => {
      console.error("Error fetching or rendering hero text:", error);
      document.getElementById("heroText").textContent = "Error loading data";
    });
}

// ============================================================================
// INITIALIZE ON PAGE LOAD
// ============================================================================

// Run the render function when the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderHeroText);
} else {
  // DOM is already loaded
  renderHeroText();
}
