  // KPI Tokenizer (19-JUN-2025) 
  async function fetchAndDisplayTokens() {
    const url = 'https://script.google.com/macros/s/AKfycbwOWyF6xrdhVAfTzNFF_K_7UzrmUkypkekl6EmnqyEXGjEbsaPOKc18QZ6SsrIl9-5J/exec'; 
    
    // Create spinner HTML - a 50px x 50px spinner
    const spinnerHTML = '<div class="spinner" style="width: 50px; height: 50px; display: inline-block; border: 3px solid rgba(0,0,0,0.1); border-radius: 50%; border-top-color: #007bff; animation: spin 1s ease-in-out infinite;"></div>';
    
    // Add the necessary animation style
    if (!document.getElementById('spinner-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'spinner-style';
      styleEl.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(styleEl);
    }
    
    // Show spinners initially
    document.getElementById('yearsExperience').innerHTML = spinnerHTML;
    document.getElementById('totalClients').innerHTML = spinnerHTML;
    document.getElementById('totalSalesVolume').innerHTML = spinnerHTML;
    document.getElementById('averageSalesPrice').innerHTML = spinnerHTML;
    
    try {
      // Fetch data
      const response = await fetch(url);
      const data = await response.json();

      // Create tokens
      const yearsExperience = data.YearsExperience + ' yrs';
      const totalClients = data.TotalClients;
      const totalSalesVolume = '$' + Math.floor(data.TotalSalesVolume / 1000000) + 'm';
      const averageSalesPrice = '$' + Math.floor(data.AverageSalesPrice / 1000) + 'k';

      // Replace spinners with actual values after processing
      setTimeout(() => {
        document.getElementById('yearsExperience').innerHTML = yearsExperience;
        document.getElementById('totalClients').innerHTML = totalClients;
        document.getElementById('totalSalesVolume').innerHTML = totalSalesVolume;
        document.getElementById('averageSalesPrice').innerHTML = averageSalesPrice;
      }, 1000); // Same timing as original
    } catch (error) {
      console.error('Error fetching data:', error);
      // Handle errors by displaying a message
      ['yearsExperience', 'totalClients', 'totalSalesVolume', 'averageSalesPrice'].forEach(id => {
        document.getElementById(id).innerHTML = 'Data unavailable';
      });
    }
  }

  // Call the function to fetch and display tokens
  fetchAndDisplayTokens();
