/**
 * build-school-card-deck.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block on
 * the page, then fetches the schools JSON and the card HTML template
 * simultaneously.  Each JSON record that passes the filter rules is used
 * to replace [tokens] in a clone of the template, and the resulting cards
 * are injected into the configured target div.
 *
 * Architecture note
 * -----------------
 * Data-fetching  ->  fetchSchoolData()     returns the raw array
 * Filtering      ->  applyFilters()        returns a filtered array
 * Rendering      ->  renderCardDeck()      writes cards to the DOM
 *
 * Keeping fetch and render separate means future pages can call
 * fetchSchoolData() independently (e.g. for client-side search / sort)
 * without re-fetching on every interaction.
 *
 * Configuration block expected on the page
 * ----------------------------------------
 * <script type="application/json" id="school-card-deck-config">
 * {
 *   "jsonUrl":     "https://...schoolJSON.json",
 *   "jsUrl":       "https://...build-school-card-deck.js",
 *   "htmlUrl":     "https://...display-school-card-deck.html",
 *   "cssUrl":      "https://...school-component.css",
 *   "bootstrapUrl":"https://cdn.jsdelivr.net/.../bootstrap.min.css",
 *   "targetDivId": "school-card-deck",
 *   "filters": [
 *     { "field": "PublishStatus", "operator": "eq", "value": 2 }
 *   ]
 * }
 * </script>
 *
 * Supported filter operators: eq, neq, gt, gte, lt, lte, contains
 * Multiple filter objects are combined with AND logic.
 *
 * NOTE: Filter field must match the JSON field name exactly.
 *       Use "PublishStatus" (not "Status") to match the JSON schema.
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
    var config = loadConfig("school-card-deck-config");
    if (!config) { return; }

    var jsonUrl      = config.jsonUrl;
    var htmlUrl      = config.htmlUrl;
    var cssUrl       = config.cssUrl;
    var bootstrapUrl = config.bootstrapUrl;
    var targetDivId  = config.targetDivId;
    var filters      = config.filters;

    // -- 1b. Validate required fields ----------------------------------------
    if (!jsonUrl || !htmlUrl || !targetDivId) {
      console.error(
        "[SchoolCardDeck] Configuration is missing one or more required fields: " +
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
      console.error("[SchoolCardDeck] Target div #" + targetDivId + " not found in the DOM.");
      return;
    }

    // -- 1e. Show the loading spinner ----------------------------------------
    showSpinner(targetDiv);

    // -- 1f. Fetch data + template simultaneously, then render ---------------
    try {
      var results      = await Promise.all([fetchSchoolData(jsonUrl), fetchTemplate(htmlUrl)]);
      var schoolData   = results[0];
      var templateHtml = results[1];

      var filteredData = applyFilters(schoolData, filters);
      renderCardDeck(filteredData, templateHtml, targetDiv);

    } catch (err) {
      console.error("[SchoolCardDeck] Failed to load school data:", err);
      showError(targetDiv);
    }
  }


  /* =====================================================================
     2.  CONFIG LOADER
     ===================================================================== */

  /**
   * Reads and parses the JSON configuration block embedded on the page.
   * @param  {string} scriptId  - the id attribute of the <script> block
   * @returns {object|null}     - parsed config object, or null on failure
   */
  function loadConfig(scriptId) {
    var configEl = document.getElementById(scriptId);

    if (!configEl) {
      console.error(
        "[SchoolCardDeck] Configuration block #" + scriptId + " not found. " +
        "Make sure the CONFIG code block is above the DISPLAY code block on the page."
      );
      return null;
    }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[SchoolCardDeck] Failed to parse configuration JSON:", e);
      return null;
    }
  }


  /* =====================================================================
     3.  DATA FETCH  (kept separate so it can be reused for search/filter)
     ===================================================================== */

  /**
   * Fetches the schools JSON from the provided URL.
   * Throws on network failure or non-OK HTTP status.
   *
   * @param  {string} url  - absolute URL to the JSON file on S3
   * @returns {Promise<Array>}
   */
  async function fetchSchoolData(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching " + url
      );
    }

    var data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("[SchoolCardDeck] Expected a JSON array but received: " + typeof data);
    }

    console.log("[SchoolCardDeck] Fetched " + data.length + " school record(s).");
    return data;
  }


  /* =====================================================================
     4.  HTML TEMPLATE FETCH
     ===================================================================== */

  /**
   * Fetches the HTML card template as plain text.
   * @param  {string} url  - absolute URL to the HTML template on S3
   * @returns {Promise<string>}
   */
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
   * @param  {Array}      data     - full school array
   * @param  {Array|null} filters  - array of { field, operator, value }
   * @returns {Array}              - filtered array
   */
  function applyFilters(data, filters) {
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return data;
    }

    return data.filter(function (school) {
      return filters.every(function (rule) {
        return evaluateRule(school, rule);
      });
    });
  }

  /**
   * Evaluates a single filter rule against one school record.
   * @param  {object} school  - one record from the JSON array
   * @param  {object} rule    - { field, operator, value }
   * @returns {boolean}
   */
  function evaluateRule(school, rule) {
    var field       = rule.field;
    var operator    = rule.operator;
    var value       = rule.value;
    var schoolValue = school[field];

    switch (operator) {
      case "eq":       return schoolValue == value;
      case "neq":      return schoolValue != value;
      case "gt":       return schoolValue >  value;
      case "gte":      return schoolValue >= value;
      case "lt":       return schoolValue <  value;
      case "lte":      return schoolValue <= value;
      case "contains": return String(schoolValue).toLowerCase()
                              .indexOf(String(value).toLowerCase()) !== -1;
      default:
        console.warn("[SchoolCardDeck] Unknown filter operator \"" + operator + "\" - rule ignored.");
        return true;
    }
  }


  /* =====================================================================
     6.  CARD DECK RENDERER
     ===================================================================== */

  /**
   * Clones the card HTML template for each school, replaces [tokens],
   * and injects the complete card deck into the target div.
   *
   * @param  {Array}       schoolData   - filtered array of school objects
   * @param  {string}      templateHtml - raw HTML string for one card
   * @param  {HTMLElement} targetDiv    - the DOM node to inject into
   */
  function renderCardDeck(schoolData, templateHtml, targetDiv) {

    targetDiv.innerHTML = "";

    if (schoolData.length === 0) {
      targetDiv.innerHTML =
        '<div class="alert alert-info">No schools found matching the current filter criteria.</div>';
      return;
    }

    var fragment    = document.createDocumentFragment();
    var deckWrapper = extractDeckWrapper(templateHtml);
    var cardTemplate = extractCardTemplate(templateHtml);

    schoolData.forEach(function (school) {
      var cardHtml = replaceTokens(cardTemplate, school);
      var temp     = document.createElement("div");
      temp.innerHTML = cardHtml.trim();

      while (temp.firstChild) {
        deckWrapper.appendChild(temp.firstChild);
      }
    });

    fragment.appendChild(deckWrapper);
    targetDiv.appendChild(fragment);

    console.log("[SchoolCardDeck] Rendered " + schoolData.length + " card(s) into #" + targetDiv.id + ".");
  }

  /**
   * Extracts the outer .school-deck wrapper from the template as a clean
   * empty DOM element (no card children) ready to receive rendered cards.
   *
   * @param  {string} html  - raw template HTML
   * @returns {HTMLElement} - empty deck wrapper element
   */
  function extractDeckWrapper(html) {
    var parser  = new DOMParser();
    var doc     = parser.parseFromString(html, "text/html");
    var wrapper = doc.querySelector(".school-deck");

    if (!wrapper) {
      var fallback = document.createElement("div");
      fallback.className = "school-deck desktop-cols-3";
      return fallback;
    }

    return wrapper.cloneNode(false); // shallow clone - no children
  }

  /**
   * Extracts the repeating .school-card markup from the template.
   * @param  {string} html  - raw template HTML
   * @returns {string}      - HTML string for one card with [tokens] intact
   */
  function extractCardTemplate(html) {
    var parser = new DOMParser();
    var doc    = parser.parseFromString(html, "text/html");
    var card   = doc.querySelector(".school-card");

    if (!card) {
      throw new Error(
        "[SchoolCardDeck] Could not find a .school-card element in the HTML template."
      );
    }

    return card.outerHTML;
  }


  /* =====================================================================
     7.  TOKEN REPLACER
     ===================================================================== */

  /**
   * Replaces every [FieldName] token in a string with the matching value
   * from the school data object.
   *
   * Tokens are case-sensitive and must match JSON field names exactly.
   * Missing/null/undefined fields produce an empty string.
   *
   * @param  {string} template - HTML string containing [tokens]
   * @param  {object} school   - one school record
   * @returns {string}         - HTML string with tokens replaced
   */
  function replaceTokens(template, school) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = school[key];
      if (value === null || value === undefined) { return ""; }
      return String(value);
    });
  }


  /* =====================================================================
     8.  UI HELPERS  (spinner, error, stylesheet injection)
     ===================================================================== */

  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" aria-label="Loading schools..."></div>' +
      '</div>';
  }

  function showError(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-warning d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        '<span>Sorry, we cannot locate the school information. ' +
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
