// current-listings.js - Standalone JavaScript for Current Listings functionality

// Function to fetch JSON data and render the card deck
async function fetchListings() {
    try {
        const response = await fetch('https://script.google.com/macros/s/AKfycbwZdrv8c3ydzjAq6N7c65PwdLij_HVi7xLN3rD3gqI5lkOC3hIvfahost2qyEQWNPpF/exec');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();

        // Extract the listings from the JSON data
        const listings = data.slice(1); // Skip the header row
        const activeListings = listings.filter(listing => listing[6] === "Available");

        const cardDeck = document.getElementById('current-listing-card-deck');

        if (activeListings.length === 0) {
            cardDeck.innerHTML = '<p>Sorry, we could not find any active listings.</p>';
        } else {
            activeListings.forEach(listing => {
                const cardHTML = `
                    <div class="current-listing-card bg-ghost-white shadow-1">
                        <div class="current-listing-card-image">
                        <a href="${listing[9]}" target="_blank"><img src="${listing[8]}" alt="${listing[1]}"></a>
                        <div class="current-listing-card-status fw-500">${listing[11]}</div>
                        </div>
                        <div class="current-listing-card-body">
                            
                            <h5 class="current-listing-card-title center">${listing[1]}</h5>
                            <p class="current-listing-card-text">${listing[10]}</p>
                            <p class="current-listing-card-price center fw-500">$${listing[4].toLocaleString()}</p>
                            
                            <div class="listing-popup-button-row" style="justify-content: space-evenly;">
                                <a href="${listing[9]}" target="_blank" class="learn-more-button-zillow-blue">View on Zillow</a>
                                <a href="#wm-popup=/contact-us-popup" class="inquire-button">Inquire</a>
                                </div>
                             </div>
                    </div>
                `;
                cardDeck.innerHTML += cardHTML;
            });
        }
    } catch (error) {
        console.error('Error fetching listings:', error);
        document.getElementById('current-listing-card-deck').innerHTML = '<p>We\'re sorry, something went wrong. Please try again later.</p>';
    } finally {
        // Hide the loading spinner and show the card deck
        document.getElementById('card-deck-overlay').style.display = 'none';
        document.getElementById('current-listing-card-deck').style.display = 'block';
    }
}

// Initialize listings when DOM is fully loaded
function initializeListings() {
    // Check if required elements exist before proceeding
    if (document.getElementById('current-listing-card-deck') && document.getElementById('card-deck-overlay')) {
        fetchListings();
    }
}

// Call the function to fetch listings when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeListings);
} else {
    initializeListings();
}