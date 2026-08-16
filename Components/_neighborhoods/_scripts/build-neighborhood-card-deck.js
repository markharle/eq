/**
 * build-neighborhood-card-deck.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block in
 * the page header, then fetches the neighborhoods JSON and the card HTML
 * template simultaneously. Each JSON record that passes the filter rules
 * is used to replace [tokens] in a clone of the template, and the
 * resulting cards are injected into the configured target div.
 *
 * Architecture note
 * -----------------
 * Data-fetching  ->  fetchNeighborhoodData()   returns the raw array
 * Filtering      ->  applyFilters()            returns a filtered array
 * Rendering      ->  renderCardDeck()          writes cards to the DOM
 *
 * Configuration block expected in the page header
 * ------------------------------------------------
 * <script type="application/json" id="neighborhood-card-deck-config">
 * {
 *   "jsonUrl":                 "https://...neighborhoodsJSON.json",
 *   "jsUrl":                   "https://...build-neighborhood-card-deck.js",
 *   "htmlUrl":                 "https://...display-neighborhood-card-deck.html",
 *   "cssUrl":                  "https://...neighborhood-component.css",
 *   "bootstrapUrl":            "https://cdn.jsdelivr.net/.../bootstrap.min.css",
 *   "targetDivId":             "neighborhood-card-deck",
 *   "neighborhoodImageRootUrl":"https://...amazonaws.com/eq-realtor/_neighborhoods/",
 *   "filters": [
 *     { "field": "publishStatus", "operator": "eq", "value": 2 }
 *   ]
 * }
 * </script>
 *
 * Image URL construction
 * ----------------------
 * The JS builds a virtual field "thumbnailImageUrl" for each neighborhood:
 *   neighborhoodImageRootUrl + neighborhood.folder + "/" + neighborhood.thumbnailImage
 * The card template references this as [thumbnailImageUrl].
 *
 * Supported filter operators: eq, neq, gt, gte, lt, lte, contains
 * Multiple filter objects are combined with AND logic.
 *
 * NOTE: publishStatus field uses lowercase p in the neighborhoods JSON.
 *       Use "publishStatus" (not "PublishStatus") in your filter rules.
 *
 * URL querystring parameter used on the card link
 * -----------------------------------------------
 * NeighborhoodID - integer ID matching the "Id" field in the JSON
 * Example: /dev-neighborhood-details?NeighborhoodID=2
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP - wait for DOM, then kick off the component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initCardDeck);

  async function initCardDeck() {

    var config = loadConfig("neighborhood-card-deck-config");
    if (!config) { return; }

    var jsonUrl                  = config.jsonUrl;
    var htmlUrl                  = config.htmlUrl;
    var cssUrl                   = config.cssUrl;
    var bootstrapUrl             = config.bootstrapUrl;
    var targetDivId              = config.targetDivId;
    var neighborhoodImageRootUrl = config.neighborhoodImageRootUrl || "";
    var filters                  = config.filters;

    if (!jsonUrl || !htmlUrl || !targetDivId) {
      console.error(
        "[NeighborhoodCardDeck] Configuration is missing required fields: " +
        "jsonUrl, htmlUrl, targetDivId."
      );
      return;
    }

    if (bootstrapUrl) { injectStylesheet(bootstrapUrl); }
    if (cssUrl)       { injectStylesheet(cssUrl); }

    var targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) {
      console.error("[NeighborhoodCardDeck] Target div #" + targetDivId + " not found.");
      return;
    }

    showSpinner(targetDiv);

    try {
      var results      = await Promise.all([
        fetchNeighborhoodData(jsonUrl),
        fetchTemplate(htmlUrl)
      ]);
      var neighborhoodData = results[0];
      var templateHtml     = results[1];

      var filteredData = applyFilters(neighborhoodData, filters);
      renderCardDeck(filteredData, templateHtml, targetDiv, neighborhoodImageRootUrl);

    } catch (err) {
      console.error("[NeighborhoodCardDeck] Failed to load neighborhood data:", err);
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
        "[NeighborhoodCardDeck] Configuration block #" + scriptId + " not found. " +
        "Make sure the CONFIG script is in the page header."
      );
      return null;
    }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[NeighborhoodCardDeck] Failed to parse configuration JSON:", e);
      return null;
    }
  }


  /* =====================================================================
     3.  DATA FETCH
     ===================================================================== */

  async function fetchNeighborhoodData(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching " + url
      );
    }

    var data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("[NeighborhoodCardDeck] Expected a JSON array but received: " + typeof data);
    }

    console.log("[NeighborhoodCardDeck] Fetched " + data.length + " neighborhood record(s).");
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

  function applyFilters(data, filters) {
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return data;
    }

    return data.filter(function (neighborhood) {
      return filters.every(function (rule) {
        return evaluateRule(neighborhood, rule);
      });
    });
  }

  function evaluateRule(neighborhood, rule) {
    var field             = rule.field;
    var operator          = rule.operator;
    var value             = rule.value;
    var neighborhoodValue = neighborhood[field];

    switch (operator) {
      case "eq":       return neighborhoodValue == value;
      case "neq":      return neighborhoodValue != value;
      case "gt":       return neighborhoodValue >  value;
      case "gte":      return neighborhoodValue >= value;
      case "lt":       return neighborhoodValue <  value;
      case "lte":      return neighborhoodValue <= value;
      case "contains": return String(neighborhoodValue).toLowerCase()
                              .indexOf(String(value).toLowerCase()) !== -1;
      default:
        console.warn(
          "[NeighborhoodCardDeck] Unknown operator \"" + operator + "\" - rule ignored."
        );
        return true;
    }
  }


  /* =====================================================================
     6.  CARD DECK RENDERER
     ===================================================================== */

  function renderCardDeck(neighborhoodData, templateHtml, targetDiv, neighborhoodImageRootUrl) {

    targetDiv.innerHTML = "";

    if (neighborhoodData.length === 0) {
      targetDiv.innerHTML =
        '<div class="alert alert-info">No neighborhoods found matching the current filter criteria.</div>';
      return;
    }

    var fragment     = document.createDocumentFragment();
    var deckWrapper  = extractDeckWrapper(templateHtml);
    var cardTemplate = extractCardTemplate(templateHtml);
    var base         = neighborhoodImageRootUrl.replace(/\/$/, "");

    neighborhoodData.forEach(function (neighborhood) {

      // Build virtual thumbnailImageUrl field:
      // neighborhoodImageRootUrl + folder + "/" + thumbnailImage
      var resolvedNeighborhood = Object.assign({}, neighborhood);
      var folder               = neighborhood.folder
                                  ? String(neighborhood.folder).replace(/\/$/, "")
                                  : "";
      resolvedNeighborhood.thumbnailImageUrl =
        base + "/" + folder + "/" + (neighborhood.thumbnailImage || "");

      var cardHtml = replaceTokens(cardTemplate, resolvedNeighborhood);
      var temp     = document.createElement("div");
      temp.innerHTML = cardHtml.trim();

      while (temp.firstChild) {
        deckWrapper.appendChild(temp.firstChild);
      }
    });

    fragment.appendChild(deckWrapper);
    targetDiv.appendChild(fragment);

    console.log(
      "[NeighborhoodCardDeck] Rendered " + neighborhoodData.length +
      " card(s) into #" + targetDiv.id + "."
    );
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

    return wrapper.cloneNode(false);
  }

  function extractCardTemplate(html) {
    var parser = new DOMParser();
    var doc    = parser.parseFromString(html, "text/html");
    var card   = doc.querySelector(".image-card");

    if (!card) {
      throw new Error(
        "[NeighborhoodCardDeck] Could not find a .image-card element in the HTML template."
      );
    }

    return card.outerHTML;
  }


  /* =====================================================================
     7.  TOKEN REPLACER
     ===================================================================== */

  function replaceTokens(template, neighborhood) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = neighborhood[key];
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
        '<div class="spinner ripple-ring-spinner" role="status" ' +
        'aria-label="Loading neighborhoods..."></div>' +
      '</div>';
  }

  function showError(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-warning d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        '<span>Sorry, we cannot locate the neighborhood information. ' +
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
