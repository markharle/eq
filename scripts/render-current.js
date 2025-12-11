// ============================================================================
// CURRENT RENDERER
// Renders the currentValue and change fields from JSON data into the current markup
// ============================================================================

// NOTE: CONFIG is defined in the Squarespace code block before this script loads

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Formats currentValue to nearest thousand with $ and k suffix
 * Example: 573890 → $574k
 */
function formatCurrentValue(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return "N/A";
  }
  
  const numValue = parseFloat(value);
  const rounded = Math.round(numValue / 1000);
  return `$${rounded}k`;
}

/**
 * Formats change value with arrow icon, percentage, and color
 * Multiplies by 100, rounds to 2 decimal places, removes % and - characters, applies formatting rules
 */
function formatChange(changeValue) {
  if (changeValue === null || changeValue === undefined) {
    return "N/A";
  }

  // Convert to number and multiply by 100
  let numValue = parseFloat(changeValue) * 100;
  
  // Round to 2 decimal places
  numValue = Math.round(numValue * 100) / 100;

  // Determine arrow direction and color based on value
  let arrow = "";
  let color = "#0000FF"; // Default blue for 0

  if (numValue < 0) {
    arrow = '<i class="fa fa-arrow-down fa-fw"></i>';
    color = "#FF0000"; // Red for negative
  } else if (numValue > 0) {
    arrow = '<i class="fa fa-arrow-up fa-fw"></i>';
    color = "#00FF00"; // Green for positive
  }

  // Format the number to always show 2 decimal places
  const formattedValue = Math.abs(numValue).toFixed(2);

  // Build the HTML with color styling
  const html = `<span style="color: ${color};">${arrow}${formattedValue}% 1-yr</span>`;
  return html;
}

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

function renderCurrent() {
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
        document.getElementById("currentValue").textContent = "Data not available";
        document.getElementById("change").textContent = "Data not available";
        return;
      }

      // Step 4: Extract and format currentValue
      const formattedCurrentValue = formatCurrentValue(entityData.currentValue);
      document.getElementById("currentValue").textContent = formattedCurrentValue;

      // Step 5: Extract and format change
      const formattedChange = formatChange(entityData.change);
      document.getElementById("change").innerHTML = formattedChange;

      console.log(`Successfully rendered current data for ${CONFIG.ENTITY}`);
      console.log(`  Current Value: ${formattedCurrentValue}`);
      console.log(`  Change: ${formattedChange}`);
    })
    .catch(error => {
      console.error("Error fetching or rendering current data:", error);
      document.getElementById("currentValue").textContent = "Error loading data";
      document.getElementById("change").textContent = "Error loading data";
    });
}

// ============================================================================
// INITIALIZE ON PAGE LOAD
// ============================================================================

// Run the render function when the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderCurrent);
} else {
  // DOM is already loaded
  renderCurrent();
}
