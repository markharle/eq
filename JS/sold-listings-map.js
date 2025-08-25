/**
 * Eric's Sold Listings Map - Phase 1
 * Configurable Leaflet.js implementation with sidebar-v2 integration
 */

// Configuration object for easy Phase 2 refactoring
const SoldListingsMapConfig = {
    // Map settings
    mapId: 'map-eq',
    jsonUrl: 'https://cdn.jsdelivr.net/gh/markharle/eq@b100aa62b847aa6135f5e224120478b56d7447a6/JSON/listingsMaster.json',
    defaultCenter: [41.661315, -93.737999],
    defaultZoom: 13,
    scrollWheelZoom: false,
    mapPadding: 24
    
    // Tile layer settings
    tileLayer: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
    },
    
    // Marker icon mapping
    priceRangeIcons: {
        'Under $150k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/89a054d7-d05e-46dd-8cad-7976e8859ea7/1208040-A0E7E5.png',
        '$150k - $249k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/6242ece6-b2d8-4aba-9701-bf61cf062ee3/1208040-76D7C4.png',
        '$250k - $499k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/e3172350-8018-4d9b-b810-a61640ec9732/1208040-AED581.png',
        '$500k - $749k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/dc14b087-873b-4017-9d73-f70573139805/1208040-FFD54F.png',
        '$750k - $999k': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/85122a0d-6caf-4b33-be07-8a3806cda25e/1208040-F48132.png',
        '$1m and up': 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/c553d3bf-9d91-4cb5-94e8-9579d1bd3011/1208040-7E57C2b.png'
    },
    
    // Price ranges for filtering
    priceRanges: ['Under $150k', '$150k - $249k', '$250k - $499k', '$500k - $749k', '$750k - $999k', '$1m and up']
};

// Main application class
class SoldListingsMap {
    constructor(config) {
        this.config = config;
        this.map = null;
        this.sidebar = null;
        this.markers = [];
        this.allListings = [];
        this.filteredListings = [];
        this.markerGroup = null;
        this.currentPopup = null;
        
        this.init();
    }
    
    async init() {
        try {
            // Initialize map and sidebar
            this.initializeMap();
            this.initializeSidebar();
            this.addCustomControls();
            this.setupEventListeners();
            this.setupKeyboardNavigation();
            
            // Load and process data
            await this.loadListingsData();
            this.hideSpinner();
            
        } catch (error) {
            console.error('Error initializing map:', error);
            this.handleError();
        }
    }
    
    initializeMap() {
        // Create map instance
        this.map = L.map(this.config.mapId, {
            center: this.config.defaultCenter,
            zoom: this.config.defaultZoom,
            zoomControl: false
        });
        
        // Add tile layer
        L.tileLayer(this.config.tileLayer.url, this.config.tileLayer.options).addTo(this.map);
        
        // Add zoom control in top-left
        L.control.zoom({ position: 'topleft' }).addTo(this.map);
        
        // Create marker group
        this.markerGroup = L.layerGroup().addTo(this.map);
        
        // Add accessibility attributes
        const mapContainer = document.getElementById(this.config.mapId);
        mapContainer.setAttribute('role', 'application');
        mapContainer.setAttribute('aria-label', 'Interactive map showing Eric\'s sold listings');
    }
    
    initializeSidebar() {
        this.sidebar = L.control.sidebar('sidebar', {
            position: 'left',
            closeButton: true
        }).addTo(this.map);
    }
    
/*     addCustomControls() {
        // Custom re-center control
        const RecenterControl = L.Control.extend({
            onAdd: function(map) {
                const container = L.DomUtil.create('div', 'leaflet-control-zoom leaflet-bar leaflet-control');
                const button = L.DomUtil.create('a', 'leaflet-control-recenter', container);
                
                button.innerHTML = '<i class="fa fa-crosshairs" aria-hidden="true"></i>';
                button.href = '#';
                button.title = 'Re-center the map';
                button.setAttribute('role', 'button');
                button.setAttribute('aria-label', 'Re-center the map to show all visible listings');
                
                L.DomEvent.on(button, 'click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    L.DomEvent.preventDefault(e);
                    this.recenterMap();
                }, this);
                
                return container;
            }.bind(this)
        });
        
        new RecenterControl({ position: 'topleft' }).addTo(this.map);
    }
     */
addCustomControls() {
    // Create a separate control for the re-center button
    const RecenterControl = L.Control.extend({
        onAdd: function(map) {
            // Create a separate container for our custom control
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            const button = L.DomUtil.create('a', 'leaflet-control-recenter', container);
            
            button.innerHTML = '<i class="fa fa-crosshairs" aria-hidden="true"></i>';
            button.href = '#';
            button.title = 'Re-center the map';
            button.setAttribute('role', 'button');
            button.setAttribute('aria-label', 'Re-center the map to show all visible listings');
            
            L.DomEvent.on(button, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                this.recenterMap();
            }, this);
            
            return container;
        }.bind(this)
    });
    
    // Add the custom control below the zoom control
    new RecenterControl({ position: 'topleft' }).addTo(this.map);
}

    setupEventListeners() {
        // Filter checkboxes
        const checkboxes = document.querySelectorAll('input[name="soldPriceRange"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.handleFilterChange());
        });
        
        // Select All / Clear All buttons
        document.getElementById('select-all-btn').addEventListener('click', () => this.selectAllFilters());
        document.getElementById('clear-all-btn').addEventListener('click', () => this.clearAllFilters());
        
        // Map click to close popup
        this.map.on('click', () => this.closeCurrentPopup());
    }
    
    setupKeyboardNavigation() {
        // ESC key to close popup
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeCurrentPopup();
            }
        });
        
        // Make filter controls keyboard accessible
        const filterControls = document.querySelectorAll('#filter input, #filter button');
        filterControls.forEach((control, index) => {
            control.setAttribute('tabindex', '0');
        });
    }
    
    async loadListingsData() {
        try {
            const response = await fetch(this.config.jsonUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.processListingsData(data);
            
        } catch (error) {
            console.error('Error fetching the JSON data.');
            throw error;
        }
    }
    
    processListingsData(data) {
        // Filter for published and sold listings
        this.allListings = data.filter(listing => {
            try {
                return listing.Publish === true && listing.Status === 'Sold' && 
                       this.isValidListing(listing);
            } catch (error) {
                // Skip invalid listings
                return false;
            }
        });
        
        this.updatePriceRangeCounts();
        this.filteredListings = [...this.allListings];
        this.createMarkers();
        this.recenterMap();
    }
    
    isValidListing(listing) {
        return listing.Latitude && 
               listing.Longitude && 
               !isNaN(listing.Latitude) && 
               !isNaN(listing.Longitude) &&
               listing.streetAddress &&
               listing.City &&
               listing.State;
    }
    
    updatePriceRangeCounts() {
        const counts = {};
        this.config.priceRanges.forEach(range => counts[range] = 0);
        
        this.allListings.forEach(listing => {
            const priceRange = listing.priceRange || 'Under $150k';
            if (counts.hasOwnProperty(priceRange)) {
                counts[priceRange]++;
            }
        });
        
        // Update UI
        const checkboxes = document.querySelectorAll('input[name="soldPriceRange"]');
        checkboxes.forEach(checkbox => {
            const countSpan = checkbox.parentElement.querySelector('.listing-count');
            countSpan.textContent = `(${counts[checkbox.value] || 0})`;
        });
    }
    
    createMarkers() {
        // Clear existing markers
        this.markerGroup.clearLayers();
        this.markers = [];
        
        this.filteredListings.forEach(listing => {
            try {
                const marker = this.createMarker(listing);
                if (marker) {
                    this.markers.push(marker);
                    this.markerGroup.addLayer(marker);
                }
            } catch (error) {
                // Skip problematic markers
                console.warn('Skipping marker for listing:', listing, error);
            }
        });
    }
    
    createMarker(listing) {
        const iconUrl = this.config.priceRangeIcons[listing.priceRange] || 
                       this.config.priceRangeIcons['Under $150k'];
        
        const customIcon = L.icon({
            iconUrl: iconUrl,
            iconSize: [24, 36],
            iconAnchor: [12, 36],
            popupAnchor: [0, -36]
        });
        
        const marker = L.marker([listing.Latitude, listing.Longitude], { 
            icon: customIcon,
            keyboard: true,
            alt: `Sold listing at ${listing.streetAddress}, ${listing.City}, ${listing.State}`
        });
        
        // Add tooltip
        const tooltipText = this.createTooltipText(listing);
        marker.bindTooltip(tooltipText, {
            permanent: false,
            direction: 'top',
            offset: [0, -40]
        });
        
        // Add popup
        const popupContent = this.createPopupContent(listing);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'custom-popup'
        });
        
        // Handle popup events
        marker.on('popupopen', () => {
            this.currentPopup = marker.getPopup();
        });
        
        marker.on('popupclose', () => {
            this.currentPopup = null;
        });
        
        return marker;
    }
    
    createTooltipText(listing) {
        const formattedPrice = this.formatPrice(listing.Price);
        return `${listing.streetAddress}, ${listing.City}, ${listing.State} | Sold in ${listing.yearSold} for ${formattedPrice}`;
    }
    
    createPopupContent(listing) {
        const formattedPrice = this.formatPrice(listing.Price);
        
        return `
            <div class="map-listing-popup shadow-3">
                <div class="map-listing-popup-content" style="background-image: url('${listing.imageURL}'); background-size: cover; background-position: center; width: 100%; height: auto; border-radius: 8px; overflow: hidden;">
                    <div class="map-listing-popup-content-overlay"></div>
                    <h4 class="text-white center">${listing.streetAddress}, ${listing.City}, ${listing.State}</h4>
                    <div class="map-listing-details">
                        <p>Sold in ${listing.yearSold} for<br>${formattedPrice}</p>            
                    </div>
                    <div class="map-listing-popup-button-container">
                        <button><a href="#wm-popup=/contact-us-popup">Inquire</a></button> 
                        <button><a href="${listing.ZillowURL}" target="_blank">Learn More</a></button>
                    </div>
                </div>
            </div>
        `;
    }
    
    formatPrice(price) {
        if (price === null || price === undefined || isNaN(price)) {
            return 'Not available';
        }
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(price);
    }
    
    handleFilterChange() {
        const selectedRanges = Array.from(document.querySelectorAll('input[name="soldPriceRange"]:checked'))
            .map(checkbox => checkbox.value);
        
        this.filteredListings = this.allListings.filter(listing => 
            selectedRanges.includes(listing.priceRange || 'Under $150k')
        );
        
        this.createMarkers();
        this.recenterMap();
    }
    
    selectAllFilters() {
        const checkboxes = document.querySelectorAll('input[name="soldPriceRange"]');
        checkboxes.forEach(checkbox => checkbox.checked = true);
        this.handleFilterChange();
    }
    
    clearAllFilters() {
        const checkboxes = document.querySelectorAll('input[name="soldPriceRange"]');
        checkboxes.forEach(checkbox => checkbox.checked = false);
        this.handleFilterChange();
    }
    
    recenterMap() {
        if (this.markers.length === 0) {
            this.map.setView(this.config.defaultCenter, this.config.defaultZoom);
            return;
        }
        
        const group = new L.featureGroup(this.markers);
        this.map.fitBounds(group.getBounds(), {
            padding: [this.config.mapPadding, this.config.mapPadding]
        });
    }
    
    closeCurrentPopup() {
        if (this.currentPopup) {
            this.map.closePopup(this.currentPopup);
            this.currentPopup = null;
        }
    }
    
    hideSpinner() {
        const spinner = document.getElementById('sold-map-spinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }
    
    handleError() {
        this.hideSpinner();
        alert('Sorry, we are unable to display the map. Please try again later.');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Wait for Leaflet to be available
    if (typeof L !== 'undefined') {
        new SoldListingsMap(SoldListingsMapConfig);
    } else {
        // Fallback in case Leaflet loads after DOMContentLoaded
        setTimeout(() => {
            if (typeof L !== 'undefined') {
                new SoldListingsMap(SoldListingsMapConfig);
            } else {
                console.error('Leaflet library not found');
                document.getElementById('sold-map-spinner').style.display = 'none';
                alert('Sorry, we are unable to display the map. Please try again later.');
            }
        }, 1000);
    }
});
