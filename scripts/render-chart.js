// ============================================================================
// MARKET HISTORY CHART RENDERER (using Chart.js)
// Renders a historical line chart (render-chart.js)
// ============================================================================

// NOTE: We use CHART_CONFIG to avoid conflicts with other scripts on the page


function renderHistoryChart() {
  
  // Safety Check: Ensure the config exists before running
  if (typeof CHART_CONFIG === 'undefined') {
    console.error("CHART_CONFIG is not defined. Check your HTML script block.");
    return;
  }

  // 1. Check if the canvas element exists
  const ctx = document.getElementById(CHART_CONFIG.CHART_CANVAS_ID);
  if (!ctx) {
    console.error(`Canvas element with ID '${CHART_CONFIG.CHART_CANVAS_ID}' not found.`);
    return;
  }

  // 2. Fetch Data
  fetch(CHART_CONFIG.JSON_URL)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      // 3. Find the specific Entity
      const entityData = data.find(item => item.entity === CHART_CONFIG.ENTITY);

      // CHANGED: We now look for 'historicalData' instead of 'history'
      if (!entityData || !entityData.historicalData) {
        console.error(`History data (historicalData) for "${CHART_CONFIG.ENTITY}" not found.`);
        return;
      }

      // 4. Parse History Data for Chart.js
      // The JSON structure is an object: { "2020": 298165, "2021": 324099, ... }
      
      // We extract the keys (years) and sort them to ensure chronological order
      const labels = Object.keys(entityData.historicalData).sort();
      
      // We map those sorted years to their corresponding values
      const values = labels.map(year => entityData.historicalData[year]);

      // 5. Initialize Chart
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Market Value',
            data: values,
            borderColor: '#3181FF',
            backgroundColor: 'transparent',  
            borderWidth: 1,
            pointStyle: 'circle',
            pointBackgroundColor: '#3181FF',
            pointBorderColor: '#3181FF',
            pointRadius: 2,
            pointHoverRadius: 6,
            fill: true,
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  let label = context.dataset.label || '';
                  if (label) { label += ': '; }
                  if (context.parsed.y !== null) {
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
              beginAtZero: false,
              ticks: {
                callback: function(value) {
                  return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0,
                    notation: "compact",
                    compactDisplay: "short"
                  }).format(value);
                }
              }
            },
            x: {
              grid: { display: false }
            }
          }
        }
      });
      
      console.log(`Chart rendered for ${CHART_CONFIG.ENTITY}`);

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
