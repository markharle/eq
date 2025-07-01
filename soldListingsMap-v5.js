// sold-listings-map.js

(function() {
    const cssStyles = `
        /* Your CSS styles here */
        #map {
            height: 970px;
            width: 100%;
            margin-top: -124px;
        }
        #sold-map-spinner {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            z-index: 1000;
            margin-top:-300px;
        }
        .sold-map-spinner {
            border: 8px solid rgba(255, 255, 255, 0.3); /* Light border */
            border-top: 8px solid #3498db; /* Blue color */
            border-radius: 50%;
            width: 50px;
            height: 50px;
            margin-left:150px;
            animation: spin 1s linear infinite; /* Spin animation */
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        #sold-map-spinner p {
            margin-top: 10px;
            font-size: 16px;
            font-weight:500
            color: #404040; 
        }
        /* Add any additional CSS styles you need */
    `;

    const styleElement = document.createElement('style');
    styleElement.type = 'text/css';
    if (styleElement.styleSheet) {
        styleElement.styleSheet.cssText = cssStyles; // For IE
    } else {
        styleElement.appendChild(document.createTextNode(cssStyles)); // For other browsers
    }
    document.head.appendChild(styleElement);

    document.addEventListener('DOMContentLoaded', function() {
        const map = L.map('map', {
            center: [41.661315, -93.737999],
            zoom: 11,
            scrollWheelZoom: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        const priceRangeStyles = {
            'Under $150k': {
                bg: 'transparent',
                text: '#A5D8FF',
                icon: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/89a054d7-d05e-46dd-8cad-7976e8859ea7/1208040-A0E7E5.png'
            },
            '$150k - $249k': {
                bg: 'transparent',
                text: '#82CAFA',
                icon: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/6242ece6-b2d8-4aba-9701-bf61cf062ee3/1208040-76D7C4.png'
            },
            '$250k - $499k': {
                bg: 'transparent',
                text: '#64B5F6',
                icon: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/e3172350-8018-4d9b-b810-a61640ec9732/1208040-AED581.png'
            },
            '$500k - $749k': {
                bg: 'transparent',
                text: '#42A5F5',
                icon: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/dc14b087-873b-4017-9d73-f70573139805/1208040-FFD54F.png'
            },
            '$750k - $999k': {
                bg: 'transparent',
                text: '#2980B9',
                icon: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/85122a0d-6caf-4b33-be07-8a3806cda25e/1208040-F48132.png'
            },
            '$1m and up': {
                bg: 'transparent',
                text: '#1560A0',
                icon: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/c553d3bf-9d91-4cb5-94e8-9579d1bd3011/1208040-7E57C2b.png'
            }
        };

        let allMarkers = []; // Store all markers globally

        function createMarkers(data) {
            // Clear existing markers
            allMarkers.forEach(marker => map.removeLayer(marker));
            allMarkers = [];

            // Get selected price ranges
            const selectedRanges = Array.from(
                document.querySelectorAll('input[name="priceRange"]:checked')
            ).map(checkbox => checkbox.value);

            data.forEach(listing => {
                if (listing.Publish && listing.Status === 'Sold') {
                    // Only create marker if price range is selected
                    if (selectedRanges.includes(listing.priceRange)) {
                        const lat = parseFloat(listing.Latitude);
                        const lon = parseFloat(listing.Longitude);

                        let style;
                        if (priceRangeStyles.hasOwnProperty(listing.priceRange)) {
                            style = priceRangeStyles[listing.priceRange];
                        } else {
                            style = {
                                bg: 'transparent',
                                text: '#000000',
                                icon: 'default-icon-url.png'
                            };
                        }
                        // Create custom icon with PNG
                        const customIcon = L.icon({
                            iconUrl: style.icon,
                            iconSize: [24, 36],     // Adjust size as needed
                            iconAnchor: [18, 36],   // Half of iconSize width, full height
                            popupAnchor: [0, -36],   // Positioned above the icon
                            className: 'map-pin-shadow'
                        });

                        // Format price for tooltip
                        const formattedPrice = new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            minimumFractionDigits: 0
                        }).format(listing.Price);

                        const marker = L.marker([lat, lon], {
                            icon: customIcon,
                            title: `${listing.streetAddress}, ${listing.City}, ${listing.State} | Sold in ${listing.yearSold} for ${formattedPrice}`
                        }).addTo(map);

                        allMarkers.push(marker);

                        marker.bindPopup(`
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
                        `);
                    }
                }
            });

            // Recenter the map after creating markers
            recenterMap();
        }

        function recenterMap() {
            if (allMarkers.length > 0) {
                // Create a featureGroup from all markers
                const markerGroup = L.featureGroup(allMarkers);

                // Get the bounds of the markers
                const bounds = markerGroup.getBounds();

                // Fit bounds with calculated zoom and some padding
                map.fitBounds(bounds, {
                    padding: [20, 20] // Adjust padding as needed
                });
            }
        }

        fetch('https://script.google.com/macros/s/AKfycbzaUVXyP2jt1eH7QQUt2pFlRE5b9jJVaqHC3d2TCuIyL58jDocQ5jWrUgd2m9OCEZbG/exec')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                document.getElementById('sold-map-spinner').style.display = 'none'; // Hide spinner on success
                createMarkers(data);
            })
            .catch(error => {
                console.error('Error fetching the JSON data:', error);
                document.getElementById('sold-map-spinner').style.display = 'none'; // Hide spinner on error
                alert('Failed to load data. Please try again later.'); // User feedback
            });
    }); // End of DOMContentLoaded listener

})(); // End of IIFE (Immediately Invoked Function Expression)