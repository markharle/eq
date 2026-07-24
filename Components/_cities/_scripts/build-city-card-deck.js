/**
 * build-city-card-deck.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block on
 * the page, then fetches the cities JSON and the card HTML template
 * simultaneously. Each JSON record that passes the filter rules is used
 * to replace [tokens] in a clone of the template, and the resulting cards
 * are injected into the configured target div.
 *
 * Architecture note
 * -----------------
 * Data-fetching  ->  fetchCityData()      returns the raw array
 * Filtering      ->  applyFilters()       returns a filtered array
 * Rendering      ->  renderCardDeck()     writes cards to the DOM
 *
 * Configuration block expected on the page
 * ----------------------------------------
 * <script type="application/json" id="city-card-deck-config">
 * {
 *   "jsonUrl":          "https://...citiesJSON.json",
 *   "jsUrl":            "https://...build-city-card-deck.js",
 *   "htmlUrl":          "https://...display-cities-card-deck.html",
 *   "cssUrl":           "https://...city-component.css",
 *   "bootstrapUrl":     "https://cdn.jsdelivr.net/.../bootstrap.min.css",
 *   "targetDivId":      "city-card-deck",
 *   "cityImageRootUrl": "https://...amazonaws.com/eq-realtor/_cities/",
 *   "filters": [
 *     { "field": "PublishStatus", "operator": "eq", "value": 2 }
 *   ]
 * }
 * </script>
 *
 * Image URL construction
 * ----------------------
 * The JS builds a virtual field "thumbnailImageUrl" for each city:
 *   cityImageRootUrl + city.folder + "/" + city.thumbnailImage
 * The card template references this as [thumbnailImageUrl].
 *
 * Supported filter operators: eq, neq, gt, gte, lt, lte, contains
 * Multiple filter objects are combined with AND logic.
 *
 * NOTE: PublishStatus == 2 is the "published" state. Records with
 *       PublishStatus == 1, null, or blank are excluded by the filter.
 *
 * URL querystring parameter used on the card link
 * -----------------------------------------------
 * CityID  - integer ID matching the "ID" field in the JSON (uppercase)
 * Example: /dev-city-details?CityID=2
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP - wait for DOM, then kick off the component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initCardDeck);

  async function initCardDeck() {

    // -- 1a. Parse the configuration block ----------------------------------
    var config = loadConfig("city-card-deck-config");
    if (!config) { return; }

    var jsonUrl          = config.jsonUrl;
    var htmlUrl          = config.htmlUrl;
    var cssUrl           = config.cssUrl;
    var bootstrapUrl     = config.bootstrapUrl;
    var targetDivId      = config.targetDivId;
    var cityImageRootUrl = config.cityImageRootUrl || "";
    var filters          = config.filters;

    // -- 1b. Validate required fields ----------------------------------------
    if (!jsonUrl || !htmlUrl || !targetDivId) {
      console.error(
        "[CityCardDeck] Configuration is missing one or more required fields: " +
        "jsonUrl, htmlUrl, targetDivId."
      );
      return;
    }

    // -- 1c. Inject CSS assets (non-blocking) --------------------------------
    if (bootstrapUrl) { injectStylesheet(bootstrapUrl); }
    if (cssUrl)       { injectStylesheet(cssUrl); }

    // -- 1d. Locate the target div -------------------------------------------
    var targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) {
      console.error("[CityCardDeck] Target div #" + targetDivId + " not found in the DOM.");
      return;
    }

    // -- 1e. Show the loading spinner ----------------------------------------
    showSpinner(targetDiv);

    // -- 1f. Fetch data + template simultaneously, then render ---------------
    try {
      var results      = await Promise.all([fetchCityData(jsonUrl), fetchTemplate(htmlUrl)]);
      var cityData     = results[0];
      var templateHtml = results[1];

      var filteredData = applyFilters(cityData, filters);
      renderCardDeck(filteredData, templateHtml, targetDiv, cityImageRootUrl);

    } catch (err) {
      console.error("[CityCardDeck] Failed to load city data:", err);
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
        "[CityCardDeck] Configuration block #" + scriptId + " not found. " +
        "Make sure the CONFIG code block is above the DISPLAY code block on the page."
      );
      return null;
    }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[CityCardDeck] Failed to parse configuration JSON:", e);
      return null;
    }
  }


  /* =====================================================================
     3.  DATA FETCH
     ===================================================================== */

  async function fetchCityData(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching " + url
      );
    }

    var data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("[CityCardDeck] Expected a JSON array but received: " + typeof data);
    }

    console.log("[CityCardDeck] Fetched " + data.length + " city record(s).");
    return data;
  }


  /* =====================================================================
     4.  HTML TEMPLATE FETCH
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
     5.  FILTER ENGINE
     ===================================================================== */

  /**
   * Applies an array of filter rules to the data set.
   * All rules are combined with AND logic (every rule must pass).
   *
   * Supported operators: eq, neq, gt, gte, lt, lte, contains
   *
   * Important: use "PublishStatus" (not "Status") to match the JSON field.
   * Records with PublishStatus != 2 (unpublished or incomplete) are excluded.
   */
  function applyFilters(data, filters) {
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return data;
    }

    return data.filter(function (city) {
      return filters.every(function (rule) {
        return evaluateRule(city, rule);
      });
    });
  }

  function evaluateRule(city, rule) {
    var field     = rule.field;
    var operator  = rule.operator;
    var value     = rule.value;
    var cityValue = city[field];

    switch (operator) {
      case "eq":       return cityValue == value;
      case "neq":      return cityValue != value;
      case "gt":       return cityValue >  value;
      case "gte":      return cityValue >= value;
      case "lt":       return cityValue <  value;
      case "lte":      return cityValue <= value;
      case "contains": return String(cityValue).toLowerCase()
                              .indexOf(String(value).toLowerCase()) !== -1;
      default:
        console.warn("[CityCardDeck] Unknown filter operator \"" + operator + "\" - rule ignored.");
        return true;
    }
  }


  /* =====================================================================
     6.  CARD DECK RENDERER
     ===================================================================== */

  function renderCardDeck(cityData, templateHtml, targetDiv, cityImageRootUrl) {

    targetDiv.innerHTML = "";

    if (cityData.length === 0) {
      targetDiv.innerHTML =
        '<div class="alert alert-info">No cities found matching the current filter criteria.</div>';
      return;
    }

    var fragment     = document.createDocumentFragment();
    var deckWrapper  = extractDeckWrapper(templateHtml);
    var cardTemplate = extractCardTemplate(templateHtml);
    var base         = cityImageRootUrl.replace(/\/$/, "");

    cityData.forEach(function (city) {

      // Build virtual thumbnailImageUrl field:
      // cityImageRootUrl + city.folder + "/" + city.thumbnailImage
      // The folder field may include a trailing slash - strip it to avoid
      // double slashes, then reassemble cleanly.
      var resolvedCity = Object.assign({}, city);
      var folder       = city.folder ? String(city.folder).replace(/\/$/, "") : "";
      resolvedCity.thumbnailImageUrl = base + "/" + folder + "/" + city.thumbnailImage;

      var cardHtml = replaceTokens(cardTemplate, resolvedCity);
      var temp     = document.createElement("div");
      temp.innerHTML = cardHtml.trim();

      while (temp.firstChild) {
        deckWrapper.appendChild(temp.firstChild);
      }
    });

    fragment.appendChild(deckWrapper);
    targetDiv.appendChild(fragment);

    console.log("[CityCardDeck] Rendered " + cityData.length + " card(s) into #" + targetDiv.id + ".");
  }

  function extractDeckWrapper(html) {
    var parser  = new DOMParser();
    var doc     = parser.parseFromString(html, "text/html");
    var wrapper = doc.querySelector(".image-deck");

    if (!wrapper) {
      var fallback = document.createElement("div");
      fallback.className = "image-deck desktop-cols-3";
      return fallback;
    }

    return wrapper.cloneNode(false); // shallow clone - no children
  }

  function extractCardTemplate(html) {
    var parser = new DOMParser();
    var doc    = parser.parseFromString(html, "text/html");
    var card   = doc.querySelector(".image-card");

    if (!card) {
      throw new Error(
        "[CityCardDeck] Could not find a .image-card element in the HTML template."
      );
    }

    return card.outerHTML;
  }


  /* =====================================================================
     7.  TOKEN REPLACER
     ===================================================================== */

  function replaceTokens(template, city) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = city[key];
      if (value === null || value === undefined) { return ""; }
      return String(value);
    });
  }


  /* =====================================================================
     8.  UI HELPERS
     ===================================================================== */

  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" aria-label="Loading cities..."></div>' +
      '</div>';
  }

  function showError(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-warning d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        '<span>Sorry, we cannot locate the city information. ' +
        'Please <a href="/contact" class="alert-link">Contact Us</a> for assistance.</span>' +
      '</div>';
  }

  function injectStylesheet(href) {
    if (document.querySelector('link[href="' + href + '"]')) { return; }

    var link  = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

})(); // end IIFE
