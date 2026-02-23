// sold-listings-map.js - Unified version for all pages (with optional neighborhood filtering)
(function(config = {}) {
    // Declare sidebar variable at a higher scope so it's accessible to closeSidebar
    let sidebar;
    
    // Wait for the DOM to be fully loaded before running the script
    document.addEventListener('DOMContentLoaded', function() {

        // --- CONFIGURATION & CONSTANTS ---
        const MAP_ID = config.mapId || 'listings-map-eqr-PAA';
        //const JSON_URL = config.jsonUrl || 'https://raw.githubusercontent.com/markharle/eq/refs/heads/main/JSON/listingsMaster.json';
        const JSON_URL = config.jsonUrl || 'https://cdn.jsdelivr.net/gh/markharle/eq@main/JSON/listingsMaster.json';
        const SPINNER_ID = config.spinnerId || 'sold-map-spinner';
        const STATUS_FILTER = config.statusFilter || 'Sold';
        const DEFAULT_ZOOM = config.defaultZoom || 11;
        const MAP_TITLE = config.mapTitle || '';
        const MAP_PADDING = [24, 24];

        // --- NEW: Location Filter Configuration ---
        const NEIGHBORHOOD_FILTER = config.neighborhood || 'All';
        const CITY_FILTER = config.city || 'All'; // NEW: Add city filter config

        // --- DOM ELEMENT SELECTORS ---
        const spinner = document.getElementById(SPINNER_ID);
        const filterCheckboxes = document.querySelectorAll('#price-range-filter-container input[name="soldPriceRange"]');
        const selectAllBtn = document.getElementById('select-all-btn');
        const clearAllBtn = document.getElementById('clear-all-btn');

        // --- HELPER FUNCTIONS ---

        /**
         * Creates and adds a title overlay to the map.
         * @param {L.Map} map - The Leaflet map instance.
         */
        function addMapTitle(map) {
            if (!MAP_TITLE || MAP_TITLE.trim() === '') {
                return; // Don't add title if none is specified
            }

            // Get the map container
            const mapContainer = map.getContainer();
            
            // Create title element
            const titleContainer = document.createElement('div');
            titleContainer.className = 'map-title-overlay';
            titleContainer.style.cssText = `
                position: absolute;
                top: 12px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 1000;
                pointer-events: none;
            `;
            
            const titleElement = document.createElement('h4');
            titleElement.className = 'map-title';
            titleElement.innerHTML = MAP_TITLE;
            titleElement.style.cssText = `
                margin: 0;
                padding: 8px 16px;
                background-color: rgba(255, 255, 255, 0.78);
                border: 1px solid #ccc;
                border-radius: 4px;
                font-family: Karla, Arial, sans-serif!important;
                font-size: 14px;
                font-weight: 600;
                color: #666666;
                text-align: center;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                white-space: nowrap;
            `;
            
            titleContainer.appendChild(titleElement);
            mapContainer.appendChild(titleContainer);
        }

        /**
         * Filters listings based on the configured status filter.
         * @param {Array} listings - Array of all listings.
         * @returns {Array} - Filtered listings based on status.
         */
        function filterByStatus(listings) {
            if (STATUS_FILTER === 'All') {
                return listings.filter(listing => listing.Publish === '"true"');
            } else {
                return listings.filter(listing => 
                    listing.Publish === '"true"' && listing.Status === STATUS_FILTER
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
         * @param {string} status - The listing status ('Sold', 'Available', etc.).
         * @returns {L.DivIcon} - A Leaflet DivIcon object.
         */
        function createPillIcon(price, status) {
            const priceText = formatPriceForPin(price);
            
            // Determine background color based on status
            const backgroundColor = status === 'Available' ? '#008000' : '#808080';
            
            return L.divIcon({
                html: `<div style="
                    background-color: ${backgroundColor};
                    color: #fff;
                    font-family: Arial, sans-serif;
                    font-size: 8px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    white-space: nowrap;
                    font-weight: bold;
                    text-align: center;
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

                // --- MODIFIED: Location Filtering Logic ---
                const originalCount = filteredListings.length;

                // Prioritize Neighborhood filter first
                if (NEIGHBORHOOD_FILTER && NEIGHBORHOOD_FILTER !== 'All') {
                    filteredListings = filteredListings.filter(listing => 
                        listing.Neighborhood === NEIGHBORHOOD_FILTER
                    );
                    console.log(`Filtering by neighborhood: ${NEIGHBORHOOD_FILTER}`);
                } 
                // If no neighborhood filter, check for a city filter
                else if (CITY_FILTER && CITY_FILTER !== 'All') {
                    filteredListings = filteredListings.filter(listing => 
                        listing.City === CITY_FILTER
                    );
                    console.log(`Filtering by city: ${CITY_FILTER}`);
                } 
                // If neither is specified, show all
                else {
                    console.log(`Showing all neighborhoods and cities.`);
                }
                
                console.log(`Filtered from ${originalCount} to ${filteredListings.length} listings`);
                console.log(`Status filter: ${STATUS_FILTER}, Total listings: ${filteredListings.length}`);
                // --- END MODIFICATION ---

                // 2. Initialize Leaflet Map
                const map = L.map(MAP_ID, {
                    scrollWheelZoom: false // Good default for embedded maps
                });

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);

                // 3. Initialize markers layer
                const markersLayer = L.featureGroup().addTo(map);

                // 4. Create markers and add to the markers layer
                const allMarkers = [];
                filteredListings.forEach(listing => {
                    if (listing.Latitude && listing.Longitude) {
                        const formattedPrice = formatPrice(listing.Price);
                        const icon = createPillIcon(listing.Price, listing.Status);

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
                        markersLayer.addLayer(marker); // Add marker to the layer
                    }
                });

                // 5. Auto-center the map to the bounds of the markers
                if (allMarkers.length > 0) {
                    const bounds = markersLayer.getBounds();
                    map.fitBounds(bounds, { padding: MAP_PADDING });
                } else {
                    // If no markers, set to a default center
                    map.setView([41.661315, -93.737999], DEFAULT_ZOOM);
                }

                // 6. Add map title - Wait for map to be ready
                map.whenReady(() => {
                    addMapTitle(map);
                });

                // 7. Initialize Sidebar
                sidebar = L.control.sidebar('sidebar').addTo(map);

                // 8. Calculate counts and update UI
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

                // 9. Filtering Logic
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

                    // Auto-center the map to the bounds of the visible markers
                    if (visibleMarkers.length > 0) {
                        const bounds = markersLayer.getBounds();
                        map.fitBounds(bounds, { padding: MAP_PADDING });
                    } else {
                        // If no visible markers, set to default center
                        map.setView([41.661315, -93.737999], DEFAULT_ZOOM);
                    }
                };

                // 10. Add Custom Controls (Re-center only)
                const RecenterControl = L.Control.extend({
                    onAdd: function(map) {
                        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-recenter');
                        container.innerHTML = '<i class="fa fa-crosshairs" aria-hidden="true"></i>';
                        container.title = 'Re-center the map';
                        container.setAttribute('role', 'button');
                        container.setAttribute('aria-label', 'Re-center the map');

                        L.DomEvent.on(container, 'click', (e) => {
                            L.DomEvent.stop(e);
                            if (markersLayer.getLayers().length > 0) {
                                const bounds = markersLayer.getBounds();
                                map.fitBounds(bounds, { padding: MAP_PADDING });
                            } else {
                                map.setView([41.661315, -93.737999], DEFAULT_ZOOM);
                            }
                        });
                        return container;
                    },
                    onRemove: function(map) {
                        L.DomEvent.off();
                    }
                });
                new RecenterControl({ position: 'topleft' }).addTo(map);

                // 11. Attach Event Listeners
                filterCheckboxes.forEach(cb => cb.addEventListener('change', updateMarkers));

                selectAllBtn.addEventListener('click', () => {
                    filterCheckboxes.forEach(cb => cb.checked = true);
                    updateMarkers();
                });

                clearAllBtn.addEventListener('click', () => {
                    filterCheckboxes.forEach(cb => cb.checked = false);
                    updateMarkers();
                });

                // 12. ADD CUSTOM CLOSE BUTTON EVENT LISTENERS
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