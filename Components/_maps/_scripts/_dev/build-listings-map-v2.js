/**
 * build-listings-map-v2.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block in
 * the page header, fetches the listings JSON and the popup HTML template
 * simultaneously, filters listings based on either a CityID querystring
 * parameter or CONFIG filter rules, then renders a Leaflet.js map with
 * CSS pill-style markers and click-to-open modal popups.
 *
 * Architecture note
 * -----------------
 * Library loading  ->  loadLeaflet()          ensures Leaflet is ready
 * Data-fetching    ->  fetchListingsData()    returns the raw array
 * Filtering        ->  filterListings()       returns filtered array
 *                  ->  applyFilters()         applies config filter rules
 * Rendering        ->  initializeMap()        creates the Leaflet map
 *                  ->  buildMarker()          creates a pill divIcon
 *                  ->  buildPopupContent()    replaces tokens in popup template
 * Utilities        ->  replaceTokens()        token replacer
 *                  ->  normalizeListing()     normalizes JSON field casing
 *
 * Configuration block expected in the page header
 * ------------------------------------------------
 * <script type="application/json" id="listings-map-config">
 * {
 *   "jsonUrl":               "https://...listings-map-v2.json",
 *   "jsUrl":                 "https://...build-listings-map-v2.js",
 *   "cssUrl":                "https://...listings-map-v2.css",
 *   "leafletCssUrl":         "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
 *   "leafletJsUrl":          "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
 *   "listingsMapTargetDivId":"listings-map-v2",
 *   "listingsMapModalUrl":   "https://...display-listing-map-popup-v2.html",
 *   "filters": [
 *     { "field": "listingStatus", "operator": "eq", "value": "Sold" }
 *   ]
 * }
 * </script>
 *
 * NOTE: During UAT, leafletCssUrl and leafletJsUrl may be omitted when
 * Leaflet is already loaded globally.  The JS detects window.L and skips
 * dynamic loading automatically.
 *
 * Map display scenarios (determined at runtime)
 * ---------------------------------------------
 * CityID in URL  ->  Show all listings matching that CityID
 *                    (config filters are ignored in this mode)
 * No CityID      ->  Apply config filter rules (Sold or Available)
 *
 * Field normalization
 * -------------------
 * The JSON uses "State" (capital S) but the popup template uses [state]
 * (lowercase).  normalizeListing() adds a lowercase alias so both resolve.
 * Update the JSON field to "state" when re-publishing to eliminate the
 * need for this normalization step.
 *
 * URL querystring parameter
 * -------------------------
 * CityID  - integer matching the "CityID" field in the JSON
 * Example: /dev-city-details?CityID=2
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP - wait for DOM, then kick off the component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initMap);

  async function initMap() {

    // -- 1a. Parse the configuration block ----------------------------------
    var config = loadConfig("listings-map-config");
    if (!config) { return; }

    var jsonUrl             = config.jsonUrl;
    var cssUrl              = config.cssUrl;
    var leafletCssUrl       = config.leafletCssUrl;
    var leafletJsUrl        = config.leafletJsUrl;
    var targetDivId         = config.listingsMapTargetDivId;
    var listingsMapModalUrl = config.listingsMapModalUrl;
    var filters             = config.filters;
    var requireCityId       = config.requireCityId || false;

    // -- 1b. Validate required fields ----------------------------------------
    if (!jsonUrl || !targetDivId) {
      console.error(
        "[ListingsMap] Configuration is missing required fields: jsonUrl, listingsMapTargetDivId."
      );
      return;
    }

    // -- 1c. Inject CSS assets -----------------------------------------------
    // Leaflet CSS must be injected before the map initializes.
    // Custom CSS is injected alongside it.
    if (leafletCssUrl) { injectStylesheet(leafletCssUrl); }
    if (cssUrl)        { injectStylesheet(cssUrl); }

    // -- 1d. Locate the target div -------------------------------------------
    // Option A: the target div IS the Leaflet container.
    // No separate HTML template is fetched — Leaflet initializes directly
    // on this element, replacing the spinner.
    var targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) {
      console.error("[ListingsMap] Target div #" + targetDivId + " not found in the DOM.");
      return;
    }

    // -- 1e. Show the loading spinner ----------------------------------------
    showSpinner(targetDiv);

    try {
      // -- 1f. Ensure Leaflet library is available ----------------------------
      await loadLeaflet(leafletJsUrl);

      // -- 1g. Fetch listings data + popup template simultaneously ------------
      var fetchPromises = [
        fetchListingsData(jsonUrl),
        listingsMapModalUrl ? fetchTemplate(listingsMapModalUrl) : Promise.resolve(null)
      ];

      var results         = await Promise.all(fetchPromises);
      var allListings     = results[0];
      var popupTemplate   = results[1];

      // -- 1h. Filter listings for this map instance --------------------------
      var filteredListings = filterListings(allListings, filters, requireCityId);

      if (filteredListings.length === 0) {
        showNoResults(targetDiv);
        return;
      }

      // -- 1i. Initialize the map ---------------------------------------------
      initializeMap(targetDiv, filteredListings, popupTemplate);

    } catch (err) {
      console.error("[ListingsMap] Failed to initialize map:", err);
      showError(targetDiv);
    }
  }


  /* =====================================================================
     2.  CONFIG LOADER
     ===================================================================== */

  function loadConfig(scriptId) {
    var configEl = document.getElementById(scriptId);

    if (!configEl) {
      console.error(
        "[ListingsMap] Configuration block #" + scriptId + " not found. " +
        "Make sure the CONFIG script is present in the page header."
      );
      return null;
    }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[ListingsMap] Failed to parse configuration JSON:", e);
      return null;
    }
  }


  /* =====================================================================
     3.  QUERYSTRING PARSER
     ===================================================================== */

  function getQueryParam(param) {
    var params = new URLSearchParams(window.location.search);
    return params.get(param);
  }


  /* =====================================================================
     4.  LEAFLET LIBRARY LOADER
     ===================================================================== */

  /**
   * Ensures the Leaflet library (window.L) is available before the map
   * initializes.
   *
   * If Leaflet is already present (loaded globally during UAT or by a
   * prior script), resolves immediately without making a network request.
   *
   * If Leaflet is not present and a leafletJsUrl is configured, loads
   * it dynamically and waits for it to be ready before resolving.
   *
   * If Leaflet is not present and no URL is configured, rejects with a
   * clear error message.
   *
   * @param  {string|undefined} leafletJsUrl - URL to leaflet.js (optional)
   * @returns {Promise}
   */
  function loadLeaflet(leafletJsUrl) {
    return new Promise(function (resolve, reject) {

      // Leaflet already loaded — nothing to do
      if (window.L) {
        console.log("[ListingsMap] Leaflet already available.");
        resolve();
        return;
      }

      // Leaflet not loaded and no URL provided — can't proceed
      if (!leafletJsUrl) {
        reject(
          new Error(
            "[ListingsMap] Leaflet is not loaded and no leafletJsUrl is configured. " +
            "Either add leafletJsUrl to the config or load Leaflet globally."
          )
        );
        return;
      }

      // Dynamically load Leaflet from the configured URL
      console.log("[ListingsMap] Dynamically loading Leaflet from " + leafletJsUrl);

      var script    = document.createElement("script");
      script.src    = leafletJsUrl;
      script.onload = function () {
        console.log("[ListingsMap] Leaflet loaded successfully.");
        resolve();
      };
      script.onerror = function () {
        reject(new Error("[ListingsMap] Failed to load Leaflet from " + leafletJsUrl));
      };
      document.head.appendChild(script);
    });
  }


  /* =====================================================================
     5.  DATA FETCH
     ===================================================================== */

  async function fetchListingsData(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching " + url
      );
    }

    var data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("[ListingsMap] Expected a JSON array but received: " + typeof data);
    }

    console.log("[ListingsMap] Fetched " + data.length + " listing record(s).");
    return data;
  }


  /* =====================================================================
     6.  HTML TEMPLATE FETCH
     ===================================================================== */

  async function fetchTemplate(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching template " + url
      );
    }

    return response.text();
  }


  /* =====================================================================
     7.  LISTING FILTER
     ===================================================================== */

  /**
   * Determines which listings to display based on the current page context:
   *
   * Neighborhood mode (NeighborhoodID in URL):
   *   Returns all listings whose "neighborhoodID" field matches the parameter.
   *   Config filters are not applied in this mode.
   *   Example: ?NeighborhoodID=2 -> listing.neighborhoodID == 2
   *
   * requireCityId mode (no CityID or NeighborhoodID in URL):
   *   If "requireCityId": true is set and neither ID parameter is present,
   *   returns an empty array — prevents the city/neighborhood map from
   *   showing all listings when accessed without a querystring parameter.
   *
   * City mode (CityID in URL):
   *   Returns all listings whose "community" field matches the parameter.
   *   Config filters are not applied in this mode.
   *   Example: ?CityID=12 -> listing.community == 12
   *
   * Sold / Available mode (no ID parameter, requireCityId not set):
   *   Applies the filter rules defined in the CONFIG script.
   *
   * @param  {Array}      allListings   - full listings array from JSON
   * @param  {Array|null} filters       - filter rules from CONFIG
   * @param  {boolean}    requireCityId - true = show nothing if no ID in URL
   * @returns {Array}                   - filtered listings array
   */
  function filterListings(allListings, filters, requireCityId) {
    var cityId         = getQueryParam("CityID");
    var neighborhoodId = getQueryParam("NeighborhoodID");

    // Neighborhood mode: NeighborhoodID in URL takes priority
    if (neighborhoodId) {
      var neighborhoodFiltered = allListings.filter(function (listing) {
        return listing.neighborhoodID == neighborhoodId;
      });
      console.log(
        "[ListingsMap] Neighborhood mode (NeighborhoodID=" + neighborhoodId + "): " +
        neighborhoodFiltered.length + " listing(s) found."
      );
      return neighborhoodFiltered;
    }

    // requireCityId: no CityID or NeighborhoodID present — show nothing
    if (requireCityId && !cityId) {
      console.log(
        "[ListingsMap] requireCityId is set but no CityID or NeighborhoodID " +
        "parameter found - showing no listings."
      );
      return [];
    }

    // City mode: CityID in URL
    if (cityId) {
      var cityFiltered = allListings.filter(function (listing) {
        return listing.community == cityId;
      });
      console.log(
        "[ListingsMap] City mode (CityID=" + cityId + "): " +
        cityFiltered.length + " listing(s) found."
      );
      return cityFiltered;
    }

    // Status mode: apply config filter rules (Sold / Available pages)
    var statusFiltered = applyFilters(allListings, filters);
    console.log("[ListingsMap] Filter mode: " + statusFiltered.length + " listing(s) found.");
    return statusFiltered;
  }


  /* =====================================================================
     8.  FILTER ENGINE  (consistent with other components)
     ===================================================================== */

  /**
   * Applies an array of filter rules to the listings array.
   * All rules are combined with AND logic (every rule must pass).
   *
   * Supported operators: eq, neq, gt, gte, lt, lte, contains
   */
  function applyFilters(data, filters) {
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return data;
    }

    return data.filter(function (listing) {
      return filters.every(function (rule) {
        return evaluateRule(listing, rule);
      });
    });
  }

  function evaluateRule(listing, rule) {
    var field        = rule.field;
    var operator     = rule.operator;
    var value        = rule.value;
    var listingValue = listing[field];

    switch (operator) {
      case "eq":       return listingValue == value;
      case "neq":      return listingValue != value;
      case "gt":       return listingValue >  value;
      case "gte":      return listingValue >= value;
      case "lt":       return listingValue <  value;
      case "lte":      return listingValue <= value;
      case "contains": return String(listingValue).toLowerCase()
                              .indexOf(String(value).toLowerCase()) !== -1;
      default:
        console.warn("[ListingsMap] Unknown filter operator \"" + operator + "\" - rule ignored.");
        return true;
    }
  }


  /* =====================================================================
     9.  MAP INITIALIZER
     ===================================================================== */

  /**
   * Clears the target div, initializes a Leaflet map, plots all filtered
   * listings as pill markers, fits the map to show all markers, and wires
   * up the ESC key to close any open popup.
   *
   * @param  {HTMLElement} targetDiv        - the map container element
   * @param  {Array}       listings         - filtered listings to plot
   * @param  {string|null} popupTemplate    - raw HTML for the popup template
   */
  function initializeMap(targetDiv, listings, popupTemplate) {

    // Extract reusable inner popup HTML from the template
    // (Leaflet generates its own outer wrapper — we only provide inner content)
    var popupInnerHtml = popupTemplate ? extractPopupContent(popupTemplate) : null;

    // Clear the spinner and prepare the container
    // Leaflet requires position:relative or position:absolute on the container
    targetDiv.innerHTML = "";
    targetDiv.style.position = "relative";

    // Initialise the Leaflet map directly on the target div element
    var map = L.map(targetDiv, {
      attributionControl: false,  // hide attribution string per requirements
      zoomControl:        true,
      scrollWheelZoom:    true,
      tap:                false    // prevents double-tap issues on iOS
    });

    // OpenStreetMap tile layer (same provider as v1)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(map);

    // Accumulate bounds so we can fit all markers into view after plotting
    var bounds = L.latLngBounds();

    // Plot one marker per listing
    listings.forEach(function (listing) {
      var lat = parseFloat(listing.Latitude);
      var lng = parseFloat(listing.Longitude);

      if (isNaN(lat) || isNaN(lng)) {
        console.warn(
          "[ListingsMap] Skipping listing " + listing.listingID +
          " — invalid coordinates (" + listing.latitude + ", " + listing.longitude + ")."
        );
        return;
      }

      var latLng = L.latLng(lat, lng);
      bounds.extend(latLng);

      var marker = L.marker(latLng, {
        icon: buildMarkerIcon(listing)
      }).addTo(map);

      // Hover: scale the pill up and back down
      marker.on("mouseover", function () {
        var pillEl = this._icon ? this._icon.querySelector(".map-pill-marker") : null;
        if (pillEl) { pillEl.classList.add("map-pill-marker--hovered"); }
      });

      marker.on("mouseout", function () {
        var pillEl = this._icon ? this._icon.querySelector(".map-pill-marker") : null;
        if (pillEl) { pillEl.classList.remove("map-pill-marker--hovered"); }
      });

      // Click: open popup with listing details
      if (popupInnerHtml) {
        var normalizedListing = normalizeListing(listing);
        var popupContent      = buildPopupContent(popupInnerHtml, normalizedListing);

        marker.bindPopup(popupContent, {
          maxWidth:    300,
          closeButton: true,
          className:   "listings-map-popup"
        });
      }
    });

    // Fit map view to all markers, with padding
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }

    // ESC key closes any open popup
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        map.closePopup();
      }
    });

    console.log("[ListingsMap] Map initialized with " + listings.length + " marker(s).");
  }


  /* =====================================================================
     10.  MARKER BUILDER
     ===================================================================== */

  /**
   * Creates a Leaflet divIcon styled as a CSS pill containing the listing's
   * priceDisplay value.
   *
   * Pin color by listing status:
   *   Available -> green  (#2e7d32)
   *   Sold      -> dark grey (#555)
   *   Other     -> grey   (#777)
   *
   * Hover scale effect is applied via the .map-pill-marker--hovered CSS
   * class toggled in the mouseover / mouseout event handlers.
   *
   * @param  {object} listing  - one listing record
   * @returns {L.DivIcon}
   */
  function buildMarkerIcon(listing) {
    var status    = listing.listingStatus || "";
    var bgColor   = status === "Available" ? "#2e7d32"
                  : status === "Sold"      ? "#555555"
                  : "#777777";

    var pillHtml =
      '<div class="map-pill-marker" style="background-color:' + bgColor + ';">' +
        (listing.priceDisplay || "") +
      '</div>';

    return L.divIcon({
      html:        pillHtml,
      className:   "map-pill-icon",   // empty wrapper — styling lives on .map-pill-marker
      iconAnchor:  [20, 12],          // center of the pill
      popupAnchor: [0, -14]           // popup opens above the pill
    });
  }


  /* =====================================================================
     11.  POPUP CONTENT BUILDER
     ===================================================================== */

  /**
   * Extracts the inner .map-listing-popup div from the popup template.
   * Leaflet generates its own outer wrapper (.leaflet-popup, etc.) — we
   * must provide only the inner content to bindPopup(), not the full
   * Leaflet wrapper that the template file contains.
   *
   * @param  {string} templateHtml  - raw HTML from display-listing-map-popup-v2.html
   * @returns {string}              - the .map-listing-popup outerHTML
   */
  function extractPopupContent(templateHtml) {
    var parser = new DOMParser();
    var doc    = parser.parseFromString(templateHtml, "text/html");
    var inner  = doc.querySelector(".map-listing-popup");

    if (!inner) {
      console.warn("[ListingsMap] .map-listing-popup not found in popup template — using full template.");
      return templateHtml;
    }

    return inner.outerHTML;
  }

  /**
   * Replaces [tokens] in the popup inner HTML with the listing's field values.
   *
   * @param  {string} popupInnerHtml  - extracted .map-listing-popup HTML
   * @param  {object} listing         - one normalized listing record
   * @returns {string}                - populated popup HTML string
   */
  function buildPopupContent(popupInnerHtml, listing) {
    return replaceTokens(popupInnerHtml, listing);
  }


  /* =====================================================================
     12.  LISTING NORMALIZER
     ===================================================================== */

  /**
   * Returns a shallow copy of the listing with field-name casing
   * discrepancies between the JSON and the popup template resolved.
   *
   * JSON field -> popup token aliases added:
   *   City      -> city        (popup uses [city])
   *   State     -> state       (popup uses [state])
   *   Zip       -> zip         (popup uses [zip])
   *   ZillowURL -> zillowURL   (popup uses [zillowURL])
   *
   * These aliases can be removed once the JSON is republished with
   * consistent lowercase field names.
   *
   * @param  {object} listing  - raw listing from JSON
   * @returns {object}         - normalized copy
   */
  function normalizeListing(listing) {
    var normalized = Object.assign({}, listing);

    if (normalized.City      !== undefined) { normalized.city      = normalized.City; }
    if (normalized.State     !== undefined) { normalized.state     = normalized.State; }
    if (normalized.Zip       !== undefined) { normalized.zip       = normalized.Zip; }
    if (normalized.ZillowURL !== undefined) { normalized.zillowURL = normalized.ZillowURL; }

    return normalized;
  }


  /* =====================================================================
     13.  TOKEN REPLACER
     ===================================================================== */

  /**
   * Replaces every [FieldName] token in a string with the matching value
   * from the listing object.  Tokens are case-sensitive.
   * Missing/null/undefined fields produce an empty string.
   */
  function replaceTokens(template, listing) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = listing[key];
      if (value === null || value === undefined) { return ""; }
      return String(value);
    });
  }


  /* =====================================================================
     14.  UI HELPERS  (spinner, errors, stylesheet injection)
     ===================================================================== */

  /**
   * Shows the loading spinner while the map data is being fetched.
   * Uses the same .ripple-ring-spinner pattern as other components.
   */
  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" aria-label="Loading map..."></div>' +
      '</div>';
  }

  /**
   * Shown when the filtered data set returns zero listings.
   */
  function showNoResults(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-info d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-info-circle" aria-hidden="true"></i>' +
        '<span>No listings are currently available for this map view.</span>' +
      '</div>';
  }

  /**
   * Shown when a network or initialization error occurs.
   */
  function showError(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-warning d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        '<span>Sorry, we could not load the listings map. ' +
        'Please <a href="/contact" class="alert-link">Contact Us</a> for assistance.</span>' +
      '</div>';
  }

  /**
   * Injects a <link rel="stylesheet"> into <head> if not already present.
   * Prevents duplicate loads on repeated navigation.
   */
  function injectStylesheet(href) {
    if (document.querySelector('link[href="' + href + '"]')) { return; }

    var link  = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

})(); // end IIFE
