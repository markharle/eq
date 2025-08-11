// leaflet-map-manager.js (Host this on GitHub)

(function() { // Keep the IIFE to encapsulate this script's scope

    // --- CSS Injection Function (Consider moving this CSS to Squarespace's Custom CSS) ---
    function injectMapStyles() {
        const styleId = 'leaflet-map-styles';
        if (document.getElementById(styleId)) {
            return; // Styles already injected
        }

        const cssStyles = `
            /* General map container styles */
            .leaflet-map-container { /* Use a class for general styles */
                height: 970px;
                width: 100%;
                margin-top: -124px; /* Adjust as needed per page */
            }
            /* Map instance div */
            .leaflet-map-instance {
                height: 100%; /* Ensure map fills its container */
                width: 100%;
            }
            /* Spinner styles */
            .map-spinner { /* Use a class for general spinner styles */
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
                z-index: 1000;
                margin-top:-300px;
            }
            .map-spinner-animation { /* Use a class for the spinner animation */
                border: 8px solid rgba(255, 255, 255, 0.3);
                border-top: 8px solid #3498db;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                margin-left:150px;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .map-spinner p {
                margin-top: 10px;
                font-size: 16px;
                font-weight:500;
                color: #404040;
            }
            /* Popup styles */
            .listing-popup {
                background-size: cover;
                background-position: center;
                color: white;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
                border-radius: 8px;
                overflow: hidden;
                width: 250px; /* Adjust as needed */
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            }
            .listing-popup-content {
                padding: 15px;
                background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.8) 100%);
            }
            .listing-popup h4 {
                margin-top: 0;
                margin-bottom: 10px;
                font-size: 1.1em;
                line-height: 1.3;
            }
            .listing-details p {
                margin-bottom: 10px;
                font-size: 0.9em;
                line-height: 1.4;
            }
            .listing-popup-button-row {
                text-align: center;
                margin-top: 15px;
            }
            .learn-more-button-zillow {
                display: inline-block;
                padding: 8px 15px;
                background-color: #007bff; /* Zillow blue or similar */
                color: white;
                text-decoration: none;
                border-radius: 5px;
                font-size: 0.9em;
                transition: background-color 0.2s ease;
            }
            .learn-more-button-zillow:hover {
                background-color: #0056b3;
            }
            /* Filter styles */
            .filter-options {
                margin-bottom: 20px;
                padding: 15px;
                background-color: #f8f8f8;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .filter-options h4 {
                text-align: center;
                margin-bottom: 15px;
            }
            .checkbox-row {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 10px;
            }
            .checkbox-row label {
                display: flex;
                align-items: center;
                cursor: pointer;
                font-size: 0.9em;
                color: #333;
            }
            .checkbox-row input[type="checkbox"] {
                margin-right: 5px;
                transform: scale(1.1);
            }
            .select-all-container {
                text-align: center;
                margin-top: 15px;
            }
            .select-all-container button {
                padding: 8px 15px;
                margin: 0 5px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 0.9em;
                transition: background-color 0.2s ease;
            }
            .select-all-container button:first-of-type { /* Select All */
                background-color: #28a745; /* Green */
                color: white;
            }
            .select-all-container button:first-of-type:hover {
                background-color: #218838;
            }
            .select-all-container button:last-of-type { /* Clear All */
                background-color: #dc3545; /* Red */
                color: white;
            }
            .select-all-container button:last-of-type:hover {
                background-color: #c82333;
            }
            /* Legend styles */
            .map-legend-container {
                margin-top: 20px;
                padding: 15px;
                background-color: #f8f8f8;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                text-align: center;
            }
            .map-legend-container h4 {
                margin-top: 0;
                margin-bottom: 15px;
            }
            .legend-icons-row {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 15px;
            }
            .legend-item {
                display: flex;
                align-items: center;
                font-size: 0.9em;
                color: #333;
            }
            .legend-item img {
                width: 24px; /* Match icon size */
                height: 36px; /* Match icon size */
                margin-right: 8px;
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.id = styleId; // Add an ID to check for existence
        styleElement.type = 'text/css';
        if (styleElement.styleSheet) {
            styleElement.styleSheet.cssText = cssStyles;
        } else {
            styleElement.appendChild(document.createTextNode(cssStyles));
        }
        document.head.appendChild(styleElement);
    }

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

        // Inject CSS (if not already in Squarespace Custom CSS)
        injectMapStyles();

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
