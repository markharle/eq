// KPI Tokenizer (Revised for Robustness 02-AUG-2025)

async function fetchAndDisplayTokens() {
  // Updated URL to fetch KPI data from the Google Apps Script web app
  const url = 'https://script.google.com/macros/s/AKfycbwOWyF6xrdhVAfTzNFF_K_7UzrmUkypkekl6EmnqyEXGjEbsaPOKc18QZ6SsrIl9-5J/exec?function=doGetKPI';
  
  // An object to hold our target elements. This makes the code cleaner.
  const elements = {
    yearsExperience: document.getElementById('yearsExperience'),
    totalClients: document.getElementById('totalClients'),
    totalSalesVolume: document.getElementById('totalSalesVolume'),
    averageSalesPrice: document.getElementById('averageSalesPrice')
  };

  // Create spinner HTML
  const spinnerHTML = '<div class="spinner" style="width: 50px; height: 50px; display: inline-block; border: 3px solid rgba(0,0,0,0.1); border-radius: 50%; border-top-color: #007bff; animation: spin 1s ease-in-out infinite;"></div>';

  // Add the animation style if it doesn't exist
  if (!document.getElementById('spinner-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'spinner-style';
    styleEl.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(styleEl);
  }

  // Show spinners only in elements that actually exist on the page
  for (const key in elements) {
    if (elements[key]) {
      elements[key].innerHTML = spinnerHTML;
    }
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // --- Data Processing with Validation ---

    // Years of Experience
    const yearsExperience = (data.YearsExperience || 0) + ' yrs';

    // Total Clients
    const totalClients = data.TotalClients || 0;

    // Total Sales Volume
    const totalSalesVolume = '$' + Math.floor((data.TotalSalesVolume || 0) / 1000000) + 'm';

    // Average Sales Price (with check for non-numeric values)
    let averageSalesPrice;
    if (typeof data.AverageSalesPrice === 'number' && !isNaN(data.AverageSalesPrice)) {
      averageSalesPrice = '$' + Math.floor(data.AverageSalesPrice / 1000) + 'k';
    } else {
      averageSalesPrice = 'N/A'; // Display 'N/A' for invalid data like "#DIV/0!"
    }

    // Replace spinners with actual values after a short delay
    setTimeout(() => {
      if (elements.yearsExperience) elements.yearsExperience.innerHTML = yearsExperience;
      if (elements.totalClients) elements.totalClients.innerHTML = totalClients;
      if (elements.totalSalesVolume) elements.totalSalesVolume.innerHTML = totalSalesVolume;
      if (elements.averageSalesPrice) elements.averageSalesPrice.innerHTML = averageSalesPrice;
    }, 1000);

  } catch (error) {
    console.error('Error fetching or processing data:', error);
    // Handle errors by displaying a message in existing elements
    for (const key in elements) {
      if (elements[key]) {
        elements[key].innerHTML = 'Error';
      }
    }
  }
}

// It's good practice to wait for the DOM to be fully loaded,
// though using 'defer' on the script tag is the modern way to achieve this.
// If you can't use defer, you can wrap the call in this event listener.
document.addEventListener('DOMContentLoaded', fetchAndDisplayTokens);

// If you are using <script defer>, you can just call it directly:
// fetchAndDisplayTokens();
