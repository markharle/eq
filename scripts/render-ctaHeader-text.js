// ============================================================================
// WELCOME TEXT RENDERER
// Renders the ctaHeader field from JSON data into the Hook markup
// ============================================================================

// NOTE: CONFIG is defined in the Squarespace code block before this script loads

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

function renderctaHeader() {
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
        document.getElementById("ctaHeader").textContent = "Data not available";
        return;
      }

      // Step 4: Extract the ctaHeader text
      const ctaHeaderString = entityData.ctaHeader;

      // Step 5: Render the value into the DOM
      document.getElementById("ctaHeader").textContent = ctaHeaderString;

      console.log(`Successfully rendered cta Header for ${CONFIG.ENTITY}: ${ctaHeaderString}`);
    })
    .catch(error => {
      console.error("Error fetching or rendering cta Header:", error);
      document.getElementById("ctaHeader").textContent = "Error loading data";
    });
}

// ============================================================================
// INITIALIZE ON PAGE LOAD
// ============================================================================

// Run the render function when the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderctaHeader);
} else {
  // DOM is already loaded
  renderctaHeader();
}
