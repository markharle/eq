<script>
document.addEventListener('DOMContentLoaded', function() {
  // Get the card deck container and overlay
  const cardDeckContainer = document.getElementById('listing-card-deck');
  const cardDeckOverlay = document.getElementById('card-deck-overlay');
  
  // Ensure the overlay is visible while loading
  cardDeckOverlay.style.display = 'flex';
  
  // Function to format price
  function formatPrice(price) {
    // If price is already a formatted string that starts with $, return it as is
    if (typeof price === 'string' && price.trim().startsWith('$')) {
      return price;
    }
    
    // If price is a string with numbers and possibly commas, clean it for parsing
    if (typeof price === 'string') {
      price = price.replace(/[^0-9.-]+/g, '');
    }
    
    // Check if price exists and is a valid number
    if (price && !isNaN(price)) {
      // Format price as USD currency
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(price);
    }
    
    // Return placeholder if price is missing or invalid
    return 'Price upon request';
  }
  
  // Fetch the JSON data     
  fetch('https://script.google.com/macros/s/AKfycbzrauZh3iI4ZYGekexd9Z0sO0E1bpL34ohwOAM6TzrrEg-CMBg1oWpGE6SW4vsY-Q0x/exec?function=doGetListings')
  /* fetch('https://script.google.com/macros/s/AKfycbzaUVXyP2jt1eH7QQUt2pFlRE5b9jJVaqHC3d2TCuIyL58jDocQ5jWrUgd2m9OCEZbG/exec') */
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      // Ensure data is properly handled regardless of structure
      const listingsArray = Array.isArray(data) ? data : [data];
      
      // Filter for listings where Publish is TRUE and Status is Available
      const availableListings = listingsArray.filter(listing => {
        if (!listing) return false;
        
        // Handle both boolean and string values for Publish
        const isPublished = 
          listing.Publish === true || 
          listing.Publish === 'true' || 
          listing.Publish === 'TRUE';
        
        // Check Status (case-insensitive)
        const isAvailable = 
          listing.Status && 
          listing.Status.toUpperCase() === 'AVAILABLE';
        
        return isPublished && isAvailable;
      });
      
      // Clear any existing content
      cardDeckContainer.innerHTML = '';
      
      if (availableListings.length === 0) {
        cardDeckContainer.innerHTML = '<p class="no-listings">No available listings found.</p>';
      } else {
        // Create a card for each available listing
        availableListings.forEach(listing => {
          // Format the price - FIXED: using the correct field name "Price"
          const formattedPrice = formatPrice(listing.Price);
          
          // Create card element
          const card = document.createElement('div');
          card.className = 'current-listing-card bg-ghost-white shadow-1';
          
          // Set card HTML using the expanded template
          const cardHTML = `
             
                  <div class="current-listing-card-image">
                  <a href="${listing.ZillowURL || '#'}" target="_blank"><img src="${listing.imageURL || 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/62ec487e-7db0-45d8-8061-739ac5dfb857/listingNoImage3.png'}" alt="${listing.streetAddress || 'Property'}"></a>
                  <div class="current-listing-card-status fw-500">${listing.currentListingStatusLabel || 'Available'}</div>
                  </div>
                  <div class="current-listing-card-body">
                      <!--<div class="current-listing-card-status fw-500" style="margin-top:0px;background:blue;">${listing.currentListingStatusLabel || 'Available'}</div> -->
                      <h5 class="current-listing-card-title center">${listing.streetAddress || 'Address'}, ${listing.City || ''}, ${listing.State || ''}</h5>
                      <p class="current-listing-card-text">${listing.Summary}</p>
                      <p class="current-listing-card-price center fw-500">${formattedPrice}</p>
                      
                      <div class="listing-popup-button-row" style="justify-content: space-evenly;">
                          <a href="${listing.ZillowURL || '#'}" target="_blank" class="learn-more-button-zillow-blue">View on Zillow</a>
                          <a href="#wm-popup=/contact-us-popup" class="inquire-button">Inquire</a>
                          </div>
                       </div>
                  
          `;
          
          card.innerHTML = cardHTML;
          
          // Append the card to the card deck
          cardDeckContainer.appendChild(card);
        });
      }
      
      // Hide the loading spinner when done
      cardDeckOverlay.style.display = 'none';
    })
    .catch(error => {
      console.error('Error fetching or processing the listings:', error);
      
      // Display error message
      cardDeckContainer.innerHTML = '<p class="error-message">Unable to load listings. Please try again later.</p>';
      
      // Hide the loading spinner
      cardDeckOverlay.style.display = 'none';
    });
});
</script>

 
