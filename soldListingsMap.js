/**
 * Sold Listings Map JavaScript
 * Initializes and manages the Leaflet.js map for Eric's sold real estate listings
 */

// Global variables
let soldListingsMapInstance = null;
let soldListingsInitialized = false;

// Define priceRangeColors in the global scope
const priceRangeColors = {
    'Under $150k': { bg: '#A5D8FF', text: '#003366' },
    '$150 - $249k': { bg: '#82CAFA', text: '#002244' },
    '$250 - $499k': { bg: '#64B5F6', text: '#ffffff' },
    '$500 - $749k': { bg: '#42A5F5', text: '#FFFFFF' },
    '$750 - $999k': { bg: '#2980B9', text: '#FFFFFF' },
    '$1m and up': { bg: '#1560A0', text: '#FFFFFF' } 
};

/**
 * Main initialization function for the sold listings map
 */
function initializeSoldListingsMap() {
    // Check if already initialized to prevent multiple initializations
    if (soldListingsInitialized) {
        console.log('Sold listings map already initialized');
        return;
    }

    // Check if we're on the right page by looking for the map container
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        // Not on the sold listings page, exit silently
        return;
    }

    // Check if Leaflet is available
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        showErrorMessage('Map library not loaded. Please refresh the page.');
        return;
    }

    try {
        // Mark as initialized
        soldListingsInitialized = true;
        
        // Show loading spinner
        showSpinner();
        
        // Initialize the map
        initializeMapCore();
        
    } catch (error) {
        console.error('Error initializing sold listings map:', error);
        showErrorMessage('Failed to initialize map. Please refresh the page.');
        soldListingsInitialized = false;
    }
}

/**
 * Core map initialization logic
 */
function initializeMapCore() {
    // Initialize the map with zoomControl disabled
    soldListingsMapInstance = L.map('map', {
        center: [41.661315, -93.737999],
        zoom: 11,
        scrollWheelZoom: false,
        zoomControl: false  // Disable default zoom control
    });

    // Add custom zoom control positioned on the right
    L.control.zoom({
        position: 'topright'
    }).addTo(soldListingsMapInstance);

    // Store the original center
    const originalCenter = soldListingsMapInstance.getCenter();

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 14,
    }).addTo(soldListingsMapInstance);

    // Set up event listeners
    setupEventListeners();
    
    // Start filter position monitoring
    startFilterPositionMonitoring();
    
    // Fetch and load data
    loadSoldListingsData();
}

/**
 * Function to create custom icons based on listing price range
 */
function createCustomIcon(priceRange) {
    const colors = priceRangeColors[priceRange] || { bg: '#404040', text: '#FFFFFF' };
    
    return L.divIcon({
        className: 'custom-price-icon',
        html: `<div class="price-marker"><i class="fa fa-map-marker" style="color: ${colors.bg};"></i></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30]
    });
}

/**
 * Function to count listings by price range
 */
function countListingsByPriceRange(listings) {
    const counts = {
        'Under $150k': 0,
        '$150 - $249k': 0,
        '$250 - $499k': 0,
        '$500 - $749k': 0,
        '$750 - $999k': 0,
        '$1m and up': 0
    };
    
    listings.forEach(listing => {
        const priceRange = listing[12];
        if (counts.hasOwnProperty(priceRange)) {
            counts[priceRange]++;
        }
    });
    
    return counts;
}

/**
 * Function to update listing counts in the UI
 */
function updateListingCounts(counts) {
    const countElements = {
        'Under $150k': document.getElementById('count-under-150k'),
        '$150 - $249k': document.getElementById('count-150-249k'),
        '$250 - $499k': document.getElementById('count-250-499k'),
        '$500 - $749k': document.getElementById('count-500-749k'),
        '$750 - $999k': document.getElementById('count-750-999k'),
        '$1m and up': document.getElementById('count-1m-above')
    };

    Object.entries(counts).forEach(([range, count]) => {
        const element = countElements[range];
        if (element) {
            element.textContent = ` ${count}`;
        }
    });
}

/**
 * Function to show the loading spinner
 */
function showSpinner() {
    const overlay = document.getElementById('map-loading-overlay');
    const spinner = document.getElementById('spinner');
    
    if (overlay) {
        overlay.style.display = 'block';
    }
    if (spinner) {
        spinner.style.display = 'block';
    }
}

/**
 * Function to hide the loading spinner
 */
function hideSpinner() {
    const overlay = document.getElementById('map-loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Function to show error messages
 */
function showErrorMessage(message) {
    hideSpinner();
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        mapContainer.appendChild(errorDiv);
    }
}

/**
 * Function to create markers and adjust map view
 */
function createMarkers(listings, selectedRanges) {
    if (!soldListingsMapInstance) {
        console.error('Map instance not available');
        return;
    }

    // Clear existing markers
    soldListingsMapInstance.eachLayer(function (layer) {
        if (layer instanceof L.Marker) {
            soldListingsMapInstance.removeLayer(layer);
        }
    });

    // Filter listings based on selected price ranges
    const filteredListings = listings.filter(listing => selectedRanges.includes(listing[12]));

    // Create markers for filtered listings
    const markers = [];
    filteredListings.forEach(listing => {
        // Convert to numbers and check validity
        const lat = parseFloat(listing[2]);
        const lng = parseFloat(listing[3]);
        
        // Verify we have valid numbers
        if (!isNaN(lat) && !isNaN(lng)) {
            const priceRange = listing[12];
            
            // Create custom icon
            const customIcon = createCustomIcon(priceRange);
            
            // Create marker with custom icon
            const marker = L.marker([lat, lng], { 
                icon: customIcon,
                title: `${listing[1]} - Sold for $${Number(listing[4]).toLocaleString()} in ${listing[13]}`
            }).addTo(soldListingsMapInstance);
            markers.push(marker);
            
            const popupContent = `
                <a href="${listing[9]}" target="_blank"><div class="listing-popup shadow-3">
                <div class="listing-popup-content"  style="background-image: url('${listing[8]}');">
                    <h4>${listing[1]}!!</h4>
                    <div class="listing-details">
                    <p>Sold in ${listing[13]} for<br>
                    $${Number(listing[4]).toLocaleString()}</p>
                    </div>
                    <div class="listing-popup-button-row">
                    <a href="${listing[9]}" target="_blank" class="learn-more-button-zillow">View on Zillow</a>
                    </div>
                </div>
                </div></a>
            `;
            marker.bindPopup(popupContent, { maxWidth: 250 });

            // Add hover event listeners
            marker.on('mouseover', function (e) {
                this.openTooltip();
            });
            marker.on('mouseout', function (e) {
                this.closeTooltip();
            });
        }
    });

    // Adjust map view based on markers
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        soldListingsMapInstance.fitBounds(group.getBounds());
    } else {
        const originalCenter = [41.661315, -93.737999];
        soldListingsMapInstance.setView(originalCenter, soldListingsMapInstance.getZoom());
    }
}

/**
 * Render map legend
 */
function createLegend() {
    const legendContent = document.getElementById('legend-content');
    if (!legendContent) return;
    
    // Clear existing content
    legendContent.innerHTML = '';
    
    Object.entries(priceRangeColors).forEach(([range, colors]) => {  
        const item = document.createElement('div');
        item.innerHTML = `<div class="map-legend-item">
            <span class="legend-color mr-2"><i class="fa fa-map-marker fa-2x" style="color: ${colors.bg};"></i></span>
            <span class="legend-label">${range}</span>
        </div>`;
        legendContent.appendChild(item);
    });
}

/**
 * Function to update map based on checkbox changes
 */
function updateMap(soldListings) {
    const checkboxes = document.querySelectorAll('input[name="priceRange"]:checked');
    const selectedRanges = Array.from(checkboxes).map(cb => cb.value);
    createMarkers(soldListings, selectedRanges);
}

/**
 * Function to handle filter options positioning
 */
function updateFilterPosition() {
    const mapElement = document.getElementById('map');
    const filterOptions = document.getElementById('filter-options');
    
    if (!mapElement || !filterOptions) return;
    
    const mapRect = mapElement.getBoundingClientRect();

    if (mapRect.top <= 0 && mapRect.bottom >= 0) {
        const topPosition = Math.max(10, -mapRect.top + 10);
        filterOptions.style.top = `${topPosition}px`;
        filterOptions.style.display = 'block';
    } else if (mapRect.top > 0) {
        filterOptions.style.top = '10px';
        filterOptions.style.display = 'block';
    } else {
        filterOptions.style.display = 'none';
    }
}

/**
 * Start monitoring filter position
 */
function startFilterPositionMonitoring() {
    window.addEventListener('scroll', updateFilterPosition);
    window.addEventListener('resize', updateFilterPosition);
    updateFilterPosition();
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    const resetButton = document.getElementById('reset-button');
    if (resetButton) {
        resetButton.addEventListener('click', function() {
            if (soldListingsMapInstance) {
                const originalCenter = [41.661315, -93.737999];
                soldListingsMapInstance.setView(originalCenter, soldListingsMapInstance.getZoom());
            }
        });
    }
}

/**
 * Load sold listings data from Google Apps Script
 */
async function loadSoldListingsData() {
    try {
        const response = await fetch('https://script.google.com/macros/s/AKfycbwZdrv8c3ydzjAq6N7c65PwdLij_HVi7xLN3rD3gqI5lkOC3hIvfahost2qyEQWNPpF/exec');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
            const soldListings = data.filter(listing => listing[6] && listing[6].toLowerCase() === 'sold');
            
            const counts = countListingsByPriceRange(soldListings);
            updateListingCounts(counts);
            
            // Get initially checked ranges
            const initialSelectedRanges = Array.from(document.querySelectorAll('input[name="priceRange"]:checked'))
                .map(cb => cb.value);
            
            // Initialize markers with only the selected range(s)
            createMarkers(soldListings, initialSelectedRanges);

            // Setup checkbox event listeners
            document.querySelectorAll('input[name="priceRange"]').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    showSpinner();
                    setTimeout(() => {
                        updateMap(soldListings);
                        hideSpinner();
                    }, 10);
                });
            });

            // Setup Select All button
            const selectAllBtn = document.getElementById('select-all-btn');
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => {
                    document.querySelectorAll('input[name="priceRange"]').forEach(cb => cb.checked = true);
                    updateMap(soldListings);
                });
            }

            // Setup Deselect All button
            const deselectAllBtn = document.getElementById('deselect-all-btn');
            if (deselectAllBtn) {
                deselectAllBtn.addEventListener('click', () => {
                    document.querySelectorAll('input[name="priceRange"]').forEach(cb => cb.checked = false);
                    updateMap(soldListings);
                });
            }
            
            hideSpinner();
            createLegend();
        } else {
            console.error('Data format unexpected:', data);
            showErrorMessage('Unexpected data format received from server.');
        }
    } catch (error) {
        console.error('Error loading the JSON file:', error);
        let errorMessage = 'Failed to load map data. ';
        
        if (error.message.includes('HTTP error')) {
            errorMessage += 'Server error occurred. ';
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage += 'Network connection error. ';
        } else {
            errorMessage += 'An unexpected error occurred. ';
        }
        
        errorMessage += 'Please check your network connection and try again.';
        showErrorMessage(errorMessage);
    }
}

/**
 * Initialize sold listings map when DOM is fully loaded
 */
function initializeListings() {
    // Check if required elements exist before proceeding
    if (document.getElementById('map') && document.getElementById('map-loading-overlay')) {
        initializeSoldListingsMap();
    }
}

// Call the function to initialize the map when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeListings);
} else {
    initializeListings();
}
