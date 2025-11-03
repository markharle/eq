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
        const DEFAULT_ZOOM = config.defaultZoom || 11;
        const MAP_PADDING = [24, 24];

        const ICON_CONFIG = {
            'Under $150k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/89a054d7-d05e-46dd-8cad-7976e8859ea7/1208040-A0E7E5.png',
            '$150k - $249k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/6242ece6-b2d8-4aba-9701-bf61cf062ee3/1208040-76D7C4.png',
            '$250k - $499k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/e3172350-8018-4d9b-b810-a61640ec9732/1208040-AED581.png',
            '$500k - $749k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/dc14b087-873b-4017-9d73-f70573139805/1208040-FFD54F.png',
            '$750k - $999k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/85122a0d-6caf-4b33-be07-8a3806cda25e/1208040-F48132.png',
            '$1m and up': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/c553d3bf-9d91-4cb5-94e8-9579d1bd3011/1208040-7E57C2b.png',
            'OTHER': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/89a054d7-d05e-46dd-8cad-7976e8859ea7/1208040-A0E7E5.png'
        };

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
         * Creates a Leaflet Icon object for a given price range.
         * @param {string} priceRange - The price range category.
         * @returns {L.Icon} - A Leaflet Icon object.
         */
        function getIconForPriceRange(priceRange) {
            const iconUrl = ICON_CONFIG[priceRange] || ICON_CONFIG['OTHER'];
            return L.icon({
                iconUrl: iconUrl,
                iconSize: [24, 36], // width, height
                iconAnchor: [12, 36], // point of the icon which will correspond to marker's location
                popupAnchor: [0, -36], // point from which the popup should open relative to the iconAnchor
                className: 'leaflet-marker-icon  map-pin-shadow' // drop shadow class  map-pin-shadow
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

                // 2. Initialize Leaflet Map
                const map = L.map(MAP_ID, {
                    scrollWheelZoom: false // Good default for embedded maps
                });
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
                        const icon = getIconForPriceRange(listing.priceRange);

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
                        // Get the bounds of the currently visible markers
                        const bounds = markersLayer.getBounds();
                        // Fit the map to the bounds with padding
                        map.fitBounds(bounds, { padding: MAP_PADDING });
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
                            updateMapBounds(markersLayer.getLayers().length > 0);
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
