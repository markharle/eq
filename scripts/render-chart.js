// ============================================================================
// MARKET HISTORY CHART RENDERER (using Chart.js)
// Renders a 5-year historical line chartv(render-cart.js)
// ============================================================================

// NOTE: CONFIG is defined in the HTML before this script loads.
// CONFIG requires: ENTITY, JSON_URL, and CHART_CANVAS_ID

function renderHistoryChart() {
  // 1. Check if the canvas element exists
  const ctx = document.getElementById(CONFIG.CHART_CANVAS_ID);
  if (!ctx) {
    console.error(`Canvas element with ID '${CONFIG.CHART_CANVAS_ID}' not found.`);
    return;
  }

  // 2. Fetch Data
  fetch(CONFIG.JSON_URL)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      // 3. Find the specific Entity
      const entityData = data.find(item => item.entity === CONFIG.ENTITY);

      if (!entityData || !entityData.history) {
        console.error(`History data for "${CONFIG.ENTITY}" not found.`);
        return;
      }

      // 4. Parse History Data for Chart.js
      // We need two arrays: one for Labels (Years) and one for Data (Values)
      const labels = entityData.history.map(h => h.year);
      const values = entityData.history.map(h => h.value);

      // 5. Initialize Chart
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Market Value',
            data: values,
            borderColor: '#333333', // Line color (Dark Gray)
            backgroundColor: 'rgba(51, 51, 51, 0.1)', // Fill color (optional)
            borderWidth: 2,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#333333',
            pointRadius: 5,
            pointHoverRadius: 7,
            fill: true, // Set to false if you want just a line
            tension: 0.3 // 0 is straight lines, 0.4 is curvy
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false, // Allows height to be controlled by CSS
          plugins: {
            legend: {
              display: false // Hide the legend box since it's a single series
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  let label = context.dataset.label || '';
                  if (label) {
                    label += ': ';
                  }
                  if (context.parsed.y !== null) {
                    // Format tooltip as Currency ($540,000)
                    label += new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 0
                    }).format(context.parsed.y);
                  }
                  return label;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: false, // Start scale relative to data (better for real estate trends)
              ticks: {
                // Format Y-Axis as Currency
                callback: function(value, index, values) {
                  return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0,
                    notation: "compact", // Shows $500k instead of $500,000 (cleaner)
                    compactDisplay: "short"
                  }).format(value);
                }
              }
            },
            x: {
              grid: {
                display: false // Remove vertical grid lines for a cleaner look
              }
            }
          }
        }
      });
      
      console.log(`Chart rendered for ${CONFIG.ENTITY}`);

    })
    .catch(error => {
      console.error("Error rendering chart:", error);
    });
}

// ============================================================================
// INITIALIZE
// ============================================================================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderHistoryChart);
} else {
  renderHistoryChart();
}
