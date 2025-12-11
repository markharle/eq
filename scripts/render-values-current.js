// ============================================================================
// CURRENT RENDERER (render-values-current.js)
// Renders currentValue, change, and date fields from JSON
// Supports multiple occurrences using CLASSES (js-currentValue, js-change, js-date)
// ============================================================================

// NOTE: CONFIG is defined in the Squarespace code block before this script loads

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Formats a YYYY-MM-DD date string based on the provided format pattern
 * Supported tokens: YYYY, MMMM, MMM, MM, DD
 */
function formatDate(dateString, formatPattern) {
  if (!dateString) return "N/A";

  // Parse YYYY-MM-DD carefully to avoid timezone issues
  // We split the string rather than using new Date() directly to ensure we stay on the correct day
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString; // Return original if not in YYYY-MM-DD format

  const year = parts[0];
  const monthIndex = parseInt(parts[1]) - 1; // JS months are 0-11
  const day = parts[2];

  // Create date object for extracting names
  const dateObj = new Date(year, monthIndex, day);
  
  // Define month names
  const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthsLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Default to YYYY-MM-DD if no format provided
  let output = formatPattern || "YYYY-MM-DD";

  // Replace tokens with actual values
  output = output.replace("YYYY", year);
  output = output.replace("MMMM", monthsLong[monthIndex]);
  output = output.replace("MMM", monthsShort[monthIndex]);
  output = output.replace("MM", parts[1]); // Use original 0-padded string
  output = output.replace("DD", day);      // Use original 0-padded string

  return output;
}

/**
 * Formats currentValue based on ROUND_CURRENTVALUE setting
 */
function formatCurrentValue(value, roundToThousands) {
  if (value === null || value === undefined || isNaN(value)) {
    return "N/A";
  }
  
  const numValue = parseFloat(value);

  if (roundToThousands) {
    const rounded = Math.round(numValue / 1000);
    return `$${rounded}k`;
  } else {
    const intValue = Math.round(numValue);
    return `$${intValue.toLocaleString()}`;
  }
}

/**
 * Formats change value with arrow icon, percentage, and color
 */
function formatChange(changeValue) {
  if (changeValue === null || changeValue === undefined) {
    return "N/A";
  }

  let numValue = parseFloat(changeValue) * 100;
  numValue = Math.round(numValue * 100) / 100;

  let arrow = "";
  let color = "#0000FF";

  if (numValue < 0) {
    arrow = '<i class="fa fa-arrow-down fa-fw"></i>';
    color = "#FF0000";
  } else if (numValue > 0) {
    arrow = '<i class="fa fa-arrow-up fa-fw"></i>';
    color = "#00FF00";
  }

  const formattedValue = Math.abs(numValue).toFixed(2);
  const html = `<span style="color: ${color};">${arrow}${formattedValue}% 1-yr</span>`;
  return html;
}

/**
 * Helper function to update ALL elements with a specific class
 */
function updateAllElements(className, content, isHTML = false) {
  const elements = document.querySelectorAll(`.${className}`);
  
  if (elements.length === 0) {
    // Optional: console.warn(`No elements found with class "${className}"`);
    return;
  }

  elements.forEach(el => {
    if (isHTML) {
      el.innerHTML = content;
    } else {
      el.textContent = content;
    }
  });
}

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

function renderCurrent() {
  fetch(CONFIG.JSON_URL)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      const entityData = data.find(item => item.entity === CONFIG.ENTITY);

      if (!entityData) {
        console.error(`Entity "${CONFIG.ENTITY}" not found.`);
        updateAllElements("js-currentValue", "Data not available");
        updateAllElements("js-change", "Data not available");
        updateAllElements("js-date", "");
        return;
      }

      // 1. Process Current Value
      const shouldRound = CONFIG.ROUND_CURRENTVALUE === true || CONFIG.ROUND_CURRENTVALUE === "true";
      const formattedCurrentValue = formatCurrentValue(entityData.currentValue, shouldRound);
      updateAllElements("js-currentValue", formattedCurrentValue);

      // 2. Process Change Value
      const formattedChange = formatChange(entityData.change);
      updateAllElements("js-change", formattedChange, true);

      // 3. Process Date
      // Use configured format or default to YYYY-MM-DD
      const dateFormat = CONFIG.DATE_FORMAT || "YYYY-MM-DD";
      const formattedDate = formatDate(entityData.date, dateFormat);
      updateAllElements("js-date", formattedDate);

      console.log(`Rendered ${CONFIG.ENTITY}: Value=${formattedCurrentValue}, Date=${formattedDate}`);
    })
    .catch(error => {
      console.error("Error fetching or rendering data:", error);
      updateAllElements("js-currentValue", "Error");
      updateAllElements("js-change", "Error");
    });
}

// ============================================================================
// INITIALIZE ON PAGE LOAD
// ============================================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderCurrent);
} else {
  renderCurrent();
}
