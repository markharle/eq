// listings-map-eqr.js

(function() {
    // Wait for the DOM to be fully loaded before running the script
    document.addEventListener('DOMContentLoaded', function() {

        // --- CONFIGURATION & CONSTANTS ---
        const MAP_ID = 'listings-map-eqr';
        const JSON_URL = 'https://cdn.jsdelivr.net/gh/markharle/eq@b100aa62b847aa6135f5e224120478b56d7447a6/JSON/listingsMaster.json';
        const SPINNER_ID = 'sold-map-spinner';
        const DEFAULT_CENTER = [41.661315, -93.737999];
        const DEFAULT_ZOOM = 11;
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
                className: 'leaflet-marker-icon' // Ensures default styling is applied
            });
        }

        // --- MAP INITIALIZATION & LOGIC ---

        async function initializeMap() {
            try {
                spinner.style.display = 'flex';

                // 1. Fetch and filter data
                const response = await fetch(JSON_URL);
                if (!response.ok) throw new Error('Network response was not ok.');
                const allListings = await response.json();

                const soldListings = allListings.filter(listing =>
                    listing.Publish === true && listing.Status === 'Sold'
                );

                // 2. Initialize Leaflet Map
                const map = L.map(MAP_ID, {
                    scrollWheelZoom: false // Good default for embedded maps
                });
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);

                // 3. Initialize Sidebar
                const sidebar = L.control.sidebar('sidebar').addTo(map);

                // 4. Calculate counts and update UI
                const priceRangeCounts = {};
                filterCheckboxes.forEach(cb => priceRangeCounts[cb.value] = 0);
                soldListings.forEach(listing => {
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

                // 5. Create markers and add to a FeatureGroup
                const markersLayer = L.featureGroup();
                soldListings.forEach(listing => {
                    if (listing.Latitude && listing.Longitude) {
                        const formattedPrice = formatPrice(listing.Price);
                        const icon = getIconForPriceRange(listing.priceRange);

                        const marker = L.marker([listing.Latitude, listing.Longitude], {
                            icon: icon,
                            priceRange: listing.priceRange, // Custom property for filtering
                            alt: `${listing.streetAddress}, ${listing.City}` // Accessibility
                        });

                        // Create Popup Content
                        const popupContent = `
                            <div class="map-listing-popup">
                                <div class="map-listing-popup-content" style="background-image: url('${listing.imageURL}'); background-size: cover; background-position: center;">
                                    <div class="map-listing-popup-content-overlay"></div>
                                    <h4 class="text-white center">${listing.streetAddress}, ${listing.City}, ${listing.State}</h4>
                                    <div class="map-listing-details">
                                        <p>Sold in ${listing.yearSold} for<br>${formattedPrice}</p>
                                    </div>
                                    <div class="map-listing-popup-button-container">
                                        <a href="#wm-popup=/contact-us-popup" role="button" class="map-popup-button">Inquire</a>
                                        <a href="${listing.ZillowURL}" target="_blank" rel="noopener noreferrer" role="button" class="map-popup-button">Learn More</a>
                                    </div>
                                </div>
                            </div>`;
                        marker.bindPopup(popupContent);

                        // Create Tooltip Content
                        const tooltipContent = `${listing.streetAddress}, ${listing.City}, ${listing.State} | Sold in ${listing.yearSold} for ${formattedPrice}`;
                        marker.bindTooltip(tooltipContent);

                        markersLayer.addLayer(marker);
                    }
                });
                markersLayer.addTo(map);

                // 6. Filtering Logic
                const updateMarkers = () => {
                    const selectedPriceRanges = Array.from(filterCheckboxes)
                        .filter(cb => cb.checked)
                        .map(cb => cb.value);

                    let visibleMarkersCount = 0;
                    markersLayer.eachLayer(marker => {
                        if (selectedPriceRanges.includes(marker.options.priceRange)) {
                            // This is a trick to show the marker without adding/removing from the map
                            marker.setOpacity(1);
                            marker.getElement().style.pointerEvents = 'auto';
                            visibleMarkersCount++;
                        } else {
                            marker.setOpacity(0);
                            marker.getElement().style.pointerEvents = 'none';
                        }
                    });
                    
                    updateMapBounds(visibleMarkersCount > 0);
                };

                // 7. Map Bounds and Centering Logic
                const updateMapBounds = (hasVisibleMarkers) => {
                    if (hasVisibleMarkers) {
                        const visibleMarkers = markersLayer.getLayers().filter(marker => marker.options.opacity === 1);
                        const visibleGroup = L.featureGroup(visibleMarkers);
                        if (visibleGroup.getLayers().length > 0) {
                            map.fitBounds(visibleGroup.getBounds(), { padding: MAP_PADDING });
                        }
                    } else {
                        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
                    }
                };

                // 8. Add Custom Controls (Legend and Re-center)
                // Legend Control
                const legend = L.control({ position: 'bottomright' });
                legend.onAdd = function(map) {
                    const div = L.DomUtil.get('sold-listings-map-legend-container');
                    div.style.display = 'block';
                    return div;
                };
                legend.addTo(map);

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
                            updateMapBounds(true); // Assume we want to fit all currently visible markers
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

                // Initial map load
                updateMarkers();
                spinner.style.display = 'none';

            } catch (error) {
                // --- ERROR HANDLING ---
                spinner.style.display = 'none';
                console.error('Error fetching the JSON data:', error);
                alert('Sorry, we are unable to display the map. Please try again later and Contact Us if this error persists.');
            }
        }

        // Run the initialization function
        initializeMap();
    });
})();
