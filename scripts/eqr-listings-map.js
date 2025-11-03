// sold-listings-map.js - Unified version for all pages (with optional neighborhood filtering)
(function(config = {}) {
    // Declare sidebar variable at a higher scope so it's accessible to closeSidebar
    let sidebar;
    
    // Wait for the DOM to be fully loaded before running the script
    document.addEventListener('DOMContentLoaded', function() {

        // --- CONFIGURATION & CONSTANTS ---
        const MAP_ID = config.mapId || 'listings-map-eqr';
        const JSON_URL = config.jsonUrl || 'https://raw.githubusercontent.com/markharle/eq/refs/heads/main/JSON/listingsMaster.json';
        const SPINNER_ID = config.spinnerId || 'sold-map-spinner';
        const NEIGHBORHOOD_FILTER = config.neighborhood || 'All'; // Default to 'All' for backward compatibility
        const STATUS_FILTER = config.statusFilter || 'Sold'; // NEW: Configurable status filter
        const DEFAULT_CENTER = config.defaultCenter || [41.661315, -93.737999];
        const DEFAULT_ZOOM = config.defaultZoom || 11; // NEW: Configurable default zoom
        const USE_AUTO_BOUNDS = config.useAutoBounds !== false; // NEW: Option to disable auto-fit to bounds
        const MAP_PADDING = [24, 24];

        // --- DOM ELEMENT SELECTORS ---
        const spinner = document.getElementById(SPINNER_ID);
        const filterCheckboxes = document.querySelectorAll('#price-range-filter-container input[name="soldPriceRange"]');
        const selectAllBtn = document.getElementById('select-all-btn');
        const clearAllBtn = document.getElementById('clear-all-btn');

        // --- HELPER FUNCTIONS ---

        /**
         * Filters listings based on the configured status filter.
         * @param {Array} listings - Array of all listings.
         * @returns {Array} - Filtered listings based on status.
         */
        function filterByStatus(listings) {
            if (STATUS_FILTER === 'All') {
                return listings.filter(listing => listing.Publish === true);
            } else {
                return listings.filter(listing => 
                    listing.Publish === true && listing.Status === STATUS_FILTER
                );
            }
        }

        /**
         * Formats a number as a US dollar currency string.
         * @param {number} price - The price to format.
         * @returns {string} - The formatted price string or 'Not Available'.
         */
        function formatPrice(price) {
            if (typeof price !== 'number' || isNaN(price)) {
                return 'Not Available';
            }
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(price);
        }

        /**
         * Formats price for display on the pill marker.
         * @param {number} price - The price to format.
         * @returns {string} - The shortened price string for display on pin.
         */
        function formatPriceForPin(price) {
            if (typeof price !== 'number' || isNaN(price)) {
                return 'N/A';
            }
            
            if (price >= 1000000) {
                // For prices 1M and above, show as millions with 2 decimal places
                // Round up to nearest 10k
                const roundedPrice = Math.ceil(price / 10000) * 10000;
                const millions = roundedPrice / 1000000;
                return millions.toFixed(2) + 'm';
            } else {
                // For prices under 1M, show as thousands, rounded up
                const thousands = Math.ceil(price / 1000);
                return thousands + 'k';
            }
        }

        /**
         * Creates a custom pill-style divIcon for displaying price.
         * @param {number} price - The price to display on the pin.
         * @returns {L.DivIcon} - A Leaflet DivIcon object.
         */
        function createPillIcon(price) {
            const priceText = formatPriceForPin(price);
            
            return L.divIcon({
                html: `<div style="
                    background-color: #000;
                    color: #fff;
                    font-family: Arial, sans-serif;
                    font-size: 8px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    white-space: nowrap;
                    font-weight: bold;
                    text-align: center;
                    border: 1px solid #333;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                ">${priceText}</div>`,
                className: 'custom-pill-marker',
                iconSize: [null, null], // Let the content determine the size
                iconAnchor: [null, null], // Will be centered automatically
                popupAnchor: [0, -10] // Popup appears above the pill
            });
        }

        /**
         * Creates appropriate popup content based on listing status.
         * @param {Object} listing - The listing object.
         * @param {string} formattedPrice - The formatted price string.
         * @returns {string} - HTML string for popup content.
         */
        function createPopupContent(listing, formattedPrice) {
            const baseContent = `
                <div class="map-listing-popup">
                    <div class="map-listing-popup-content" style="background-image: url('${listing.imageURL}'); background-size: cover; background-position: center;">
                        <div class="map-listing-popup-content-overlay"></div>
                        <h4 class="text-white center">${listing.streetAddress}, ${listing.City}, ${listing.State}</h4>`;

            if (listing.Status === 'Sold') {
                return baseContent + `
                        <div class="map-listing-details">
                            <p>Sold in ${listing.yearSold} for<br>${formattedPrice}</p>
                        </div>
                        <div class="map-listing-popup-button-container">
                            <button><a href="#wm-popup=/contact-us-popup">Inquire</a></button>
                            <button><a href="${listing.ZillowURL}" target="_blank" rel="noopener noreferrer">View Listing</a></button>
                        </div>
                    </div>
                </div>`;
            } else {
                return baseContent + `
                        <div class="map-listing-details">
                            <p>Listed at<br>${formattedPrice}</p>
                        </div>
                        <div class="map-listing-popup-button-container">
                            <button><a href="#wm-popup=/contact-us-popup">Contact Agent</a></button>
                            <button><a href="${listing.ZillowURL}" target="_blank" rel="noopener noreferrer">View Listing</a></button>
                        </div>
                    </div>
                </div>`;
            }
        }

        /**
         * Creates appropriate tooltip content based on listing status.
         * @param {Object} listing - The listing object.
         * @param {string} formattedPrice - The formatted price string.
         * @returns {string} - Tooltip content string.
         */
        function createTooltipContent(listing, formattedPrice) {
            if (listing.Status === 'Sold') {
                return `${listing.streetAddress}, ${listing.City}, ${listing.State} | Sold in ${listing.yearSold} for ${formattedPrice}`;
            } else {
                return `${listing.streetAddress}, ${listing.City}, ${listing.State} | Listed at ${formattedPrice}`;
            }
        }

        // --- CUSTOM CLOSE FUNCTIONALITY ---
        function closeSidebar() {
            if (sidebar && typeof sidebar.close === 'function') {
                sidebar.close();
            } else {
                // Alternative method
                const sidebarElement = document.getElementById('sidebar');
                if (sidebarElement) {
                    sidebarElement.classList.add('collapsed');
                    
                    // Remove active states from tabs
                    const activeTabs = document.querySelectorAll('.leaflet-sidebar-tabs .active');
                    activeTabs.forEach(tab => tab.classList.remove('active'));
                    
                    // Hide active panes
                    const activePanes = document.querySelectorAll('.leaflet-sidebar-pane.active');
                    activePanes.forEach(pane => pane.classList.remove('active'));
                }
            }
        }

        // --- MAP INITIALIZATION & LOGIC ---

        async function initializeMap() {
            try {
                spinner.style.display = 'flex';

                // 1. Fetch and filter data
                const response = await fetch(JSON_URL);
                if (!response.ok) throw new Error('Network response was not ok.');
                const allListings = await response.json();

                // Apply base filters (published and status)
                let filteredListings = filterByStatus(allListings);

                // Apply neighborhood filter if specified (and not 'All')
                if (NEIGHBORHOOD_FILTER && NEIGHBORHOOD_FILTER !== 'All') {
                    const originalCount = filteredListings.length;
                    filteredListings = filteredListings.filter(listing => 
                        listing.Neighborhood === NEIGHBORHOOD_FILTER
                    );
                    
                    // Log for debugging
                    console.log(`Filtering by neighborhood: ${NEIGHBORHOOD_FILTER}`);
                    console.log(`Filtered from ${originalCount} to ${filteredListings.length} listings`);
                } else {
                    console.log(`Showing all neighborhoods (${filteredListings.length} listings total)`);
                }

                console.log(`Status filter: ${STATUS_FILTER}, Total listings: ${filteredListings.length}`);

                // 2. Initialize Leaflet Map with configured zoom and center
                const map = L.map(MAP_ID, {
                    scrollWheelZoom: false // Good default for embedded maps
                }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
                
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);

                // 3. Initialize Sidebar - ASSIGN TO THE HIGHER SCOPE VARIABLE
                sidebar = L.control.sidebar('sidebar').addTo(map);

                // 4. Calculate counts and update UI
                const priceRangeCounts = {};
                filterCheckboxes.forEach(cb => priceRangeCounts[cb.value] = 0);
                filteredListings.forEach(listing => {
                    if (priceRangeCounts.hasOwnProperty(listing.priceRange)) {
                        priceRangeCounts[listing.priceRange]++;
                    }
                });

                filterCheckboxes.forEach(cb => {
                    const countSpan = cb.parentElement.querySelector('.listing-count');
                    if (countSpan) {
                        countSpan.textContent = `(${priceRangeCounts[cb.value] || 0})`;
                    }
                });

                // 5. Create markers - store all markers in an array for filtering
                const allMarkers = [];
                const markersLayer = L.featureGroup().addTo(map);

                filteredListings.forEach(listing => {
                    if (listing.Latitude && listing.Longitude) {
                        const formattedPrice = formatPrice(listing.Price);
                        const icon = createPillIcon(listing.Price);

                        const marker = L.marker([listing.Latitude, listing.Longitude], {
                            icon: icon,
                            alt: `${listing.streetAddress}, ${listing.City}` // Accessibility
                        });

                        // Store price range as a custom property
                        marker.priceRange = listing.priceRange;

                        // Create Popup Content (status-aware)
                        const popupContent = createPopupContent(listing, formattedPrice);
                        marker.bindPopup(popupContent);

                        // Create Tooltip Content (status-aware)
                        const tooltipContent = createTooltipContent(listing, formattedPrice);
                        marker.bindTooltip(tooltipContent);

                        allMarkers.push(marker);
                    }
                });

                // 6. Filtering Logic
                const updateMarkers = () => {
                    const selectedPriceRanges = Array.from(filterCheckboxes)
                        .filter(cb => cb.checked)
                        .map(cb => cb.value);

                    // Clear all markers from the map
                    markersLayer.clearLayers();

                    // Add only the filtered markers back to the map
                    const visibleMarkers = allMarkers.filter(marker => 
                        selectedPriceRanges.includes(marker.priceRange)
                    );

                    visibleMarkers.forEach(marker => {
                        markersLayer.addLayer(marker);
                    });

                    updateMapBounds(visibleMarkers.length > 0);
                };

                // 7. Map Bounds and Centering Logic
                const updateMapBounds = (hasVisibleMarkers) => {
                    if (hasVisibleMarkers && markersLayer.getLayers().length > 0) {
                        if (USE_AUTO_BOUNDS) {
                            // Get the bounds of the currently visible markers
                            const bounds = markersLayer.getBounds();
                            // Fit the map to the bounds with padding
                            map.fitBounds(bounds, { padding: MAP_PADDING });
                        }
                        // If USE_AUTO_BOUNDS is false, keep the current zoom/center
                    } else {
                        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
                    }
                };

                // 8. Add Custom Controls (Re-center only)
                // Re-center Control
                const RecenterControl = L.Control.extend({
                    onAdd: function(map) {
                        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-recenter');
                        container.innerHTML = '<i class="fa fa-crosshairs" aria-hidden="true"></i>';
                        container.title = 'Re-center the map';
                        container.setAttribute('role', 'button');
                        container.setAttribute('aria-label', 'Re-center the map');

                        L.DomEvent.on(container, 'click', (e) => {
                            L.DomEvent.stop(e);
                            if (USE_AUTO_BOUNDS && markersLayer.getLayers().length > 0) {
                                updateMapBounds(true);
                            } else {
                                map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
                            }
                        });
                        return container;
                    },
                    onRemove: function(map) {
                        L.DomEvent.off();
                    }
                });
                new RecenterControl({ position: 'topleft' }).addTo(map);

                // 9. Attach Event Listeners
                filterCheckboxes.forEach(cb => cb.addEventListener('change', updateMarkers));

                selectAllBtn.addEventListener('click', () => {
                    filterCheckboxes.forEach(cb => cb.checked = true);
                    updateMarkers();
                });

                clearAllBtn.addEventListener('click', () => {
                    filterCheckboxes.forEach(cb => cb.checked = false);
                    updateMarkers();
                });

                // 10. ADD CUSTOM CLOSE BUTTON EVENT LISTENERS
                const customCloseButtons = document.querySelectorAll('.sidebar-body-close');
                customCloseButtons.forEach(button => {
                    button.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        closeSidebar();
                    });
                });

                // Initial map load - show all markers by default
                updateMarkers();
                spinner.style.display = 'none';

            } catch (error) {
                // --- ERROR HANDLING ---
                spinner.style.display = 'none';
                console.error('Error fetching the JSON data:', error);
                alert('Sorry, we are unable to display the map. Please try again later and contact Us if this error persists.');
            }
        }

        // Run the initialization function
        initializeMap();
    });

    // Return the config for potential debugging
    return config;
})(window.SoldListingsMapConfig);
