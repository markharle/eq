// leaflet-map-manager.js (Host this on GitHub)

(function() { // Keep the IIFE to encapsulate this script's scope


    // --- Main Map Initialization Function ---
    // Expose it globally so it can be called from Squarespace Code Blocks
    window.initializeLeafletMap = function(options) {
        // Default options for the map
        const defaultOptions = {
            mapId: 'map', // Default ID, but should be overridden
            jsonUrl: '', // Must be provided
            center: [41.661315, -93.737999], // Default center (Des Moines area)
            zoom: 11,
            scrollWheelZoom: false,
            markerStyles: {}, // Object mapping filter values to icon URLs/styles
            filterContainerId: null, // ID of the filter container (e.g., 'price-range-filters')
            filterCheckboxName: 'priceRange', // Name attribute of filter checkboxes
            spinnerId: null, // ID of the spinner container
            legendContainerId: null, // ID of the legend container
            legendIconsRowId: null, // ID of the legend icons row
            // Default data filter: only publish and sold listings
            dataFilter: (listing) => listing.Publish && listing.Status === 'Sold',
            // Default function to get the value for filtering/styling (e.g., 'priceRange', 'PropertyType')
            getFilterValue: (listing) => listing.priceRange,
            // Default function to generate popup content
            getPopupContent: (listing, formattedPrice) => `
                <a href="${listing.ZillowURL}" target="_blank">
                    <div class="listing-popup shadow-3" style="background-image: url('${listing.imageURL}')">
                        <div class="listing-popup-content">
                            <h4 class="text-white">${listing.streetAddress}, ${listing.City}, ${listing.State}</h4>
                            <div class="listing-details">
                                <p>Sold in ${listing.yearSold} for<br>${formattedPrice}</p>
                            </div>
                            <div class="listing-popup-button-row">
                                <a href="${listing.ZillowURL}" target="_blank" class="learn-more-button-zillow">View on Zillow</a>
                            </div>
                        </div>
                    </div>
                </a>
            `,
            // Default function to generate marker title (for tooltip)
            getMarkerTitle: (listing, formattedPrice) => `${listing.streetAddress}, ${listing.City}, ${listing.State} | Sold in ${listing.yearSold} for ${formattedPrice}`
        };

        const config = { ...defaultOptions, ...options };

        // Check if the map container exists on the current page. If not, exit.
        const mapContainer = document.getElementById(config.mapId);
        if (!mapContainer) {
            // console.log(`Map container #${config.mapId} not found on this page. Skipping initialization.`);
            return;
        }

/*         // Inject CSS (if not already in Squarespace Custom CSS)
        injectMapStyles(); */

        const map = L.map(config.mapId, {
            center: config.center,
            zoom: config.zoom,
            scrollWheelZoom: config.scrollWheelZoom
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        let allMarkers = [];
        let originalData = []; // Store original fetched data

        const spinner = config.spinnerId ? document.getElementById(config.spinnerId) : null;
        if (spinner) {
            spinner.style.display = 'block'; // Show spinner
        }

        function createMarkers(dataToRender) {
            // Clear existing markers
            allMarkers.forEach(marker => map.removeLayer(marker));
            allMarkers = [];

            let filteredData = dataToRender;

            // Apply filter based on checkboxes if filterContainerId is provided
            if (config.filterContainerId) {
                const selectedValues = Array.from(
                    document.querySelectorAll(`#${config.filterContainerId} input[name="${config.filterCheckboxName}"]:checked`)
                ).map(checkbox => checkbox.value);

                filteredData = dataToRender.filter(listing => {
                    const filterValue = config.getFilterValue(listing);
                    return selectedValues.includes(filterValue);
                });
            }

            filteredData.forEach(listing => {
                // Apply custom data filter (e.g., Publish && Status === 'Sold')
                if (config.dataFilter(listing)) {
                    const lat = parseFloat(listing.Latitude);
                    const lon = parseFloat(listing.Longitude);

                    const filterValue = config.getFilterValue(listing);
                    let style;
                    if (config.markerStyles.hasOwnProperty(filterValue)) {
                        style = config.markerStyles[filterValue];
                    } else {
                        // Fallback for listings without a matching style
                        style = {
                            bg: 'transparent',
                            text: '#000000',
                            icon: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/89a054d7-d05e-46dd-8cad-7976e8859ea7/1208040-A0E7E5.png' // Default icon
                        };
                    }

                    const customIcon = L.icon({
                        iconUrl: style.icon,
                        iconSize: [24, 36],
                        iconAnchor: [18, 36],
                        popupAnchor: [0, -36],
                        className: 'map-pin-shadow'
                    });

                    const formattedPrice = new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 0
                    }).format(listing.Price);

                    const marker = L.marker([lat, lon], {
                        icon: customIcon,
                        title: config.getMarkerTitle(listing, formattedPrice)
                    }).addTo(map);

                    allMarkers.push(marker);

                    marker.bindPopup(config.getPopupContent(listing, formattedPrice));
                }
            });

            recenterMap();
        }

        function recenterMap() {
            if (allMarkers.length > 0) {
                const markerGroup = L.featureGroup(allMarkers);
                const bounds = markerGroup.getBounds();
                map.fitBounds(bounds, {
                    padding: [20, 20]
                });
            }
        }

        // --- Filter Event Listeners (if filter container exists) ---
        if (config.filterContainerId) {
            const filterContainer = document.getElementById(config.filterContainerId);
            if (filterContainer) {
                filterContainer.addEventListener('change', function(event) {
                    if (event.target.type === 'checkbox' && event.target.name === config.filterCheckboxName) {
                        createMarkers(originalData);
                    }
                });

                const selectAllBtn = filterContainer.querySelector('button[id^="select-all-"]'); // Use starts-with selector
                const clearAllBtn = filterContainer.querySelector('button[id^="clear-all-"]'); // Use starts-with selector

                if (selectAllBtn) {
                    selectAllBtn.addEventListener('click', function() {
                        document.querySelectorAll(`#${config.filterContainerId} input[name="${config.filterCheckboxName}"]`).forEach(checkbox => {
                            checkbox.checked = true;
                        });
                        createMarkers(originalData);
                    });
                }

                if (clearAllBtn) {
                    clearAllBtn.addEventListener('click', function() {
                        document.querySelectorAll(`#${config.filterContainerId} input[name="${config.filterCheckboxName}"]`).forEach(checkbox => {
                            checkbox.checked = false;
                        });
                        createMarkers(originalData);
                    });
                }
            }
        }

        // --- Legend Generation (if legend container exists and styles are provided) ---
        if (config.legendIconsRowId && config.markerStyles && Object.keys(config.markerStyles).length > 0) {
            const legendIconsRow = document.getElementById(config.legendIconsRowId);
            if (legendIconsRow) {
                legendIconsRow.innerHTML = ''; // Clear existing legend
                for (const value in config.markerStyles) {
                    const style = config.markerStyles[value];
                    const legendItem = document.createElement('div');
                    legendItem.className = 'legend-item';
                    legendItem.innerHTML = `
                        <img src="${style.icon}" alt="${value} icon">
                        <span>${value}</span>
                    `;
                    legendIconsRow.appendChild(legendItem);
                }
            }
        }

        // --- Data Fetching ---
        if (config.jsonUrl) {
            fetch(config.jsonUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                })
                .then(data => {
                    originalData = data; // Store original data
                    if (spinner) {
                        spinner.style.display = 'none'; // Hide spinner
                    }
                    createMarkers(originalData);
                })
                .catch(error => {
                    console.error('Error fetching the JSON data:', error);
                    if (spinner) {
                        spinner.style.display = 'none'; // Hide spinner
                    }
                    alert('Failed to load map data. Please try again later.');
                });
        } else {
            console.warn('No JSON URL provided for map initialization.');
            if (spinner) {
                spinner.style.display = 'none';
            }
        }
    };

})(); // End of IIFE
