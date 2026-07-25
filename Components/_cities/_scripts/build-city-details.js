/**
 * build-city-details.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block on
 * the page, extracts the CityID querystring parameter from the URL,
 * then fetches the cities JSON and all HTML templates simultaneously.
 * The matching city's data is used to replace [tokens] in each template,
 * with special handling for:
 *   - Section show/hide rules based on label field values
 *   - Alternating split-layout image placement (right / left / right...)
 *   - imageRootUrl injected as a virtual field for image src construction
 *
 * Architecture note
 * -----------------
 * Data-fetching  ->  fetchCityData()             returns the full raw array
 * City lookup    ->  findCityById()              returns one matched record
 * Rendering      ->  renderHero()               writes the hero block to the DOM
 *                ->  renderDetails()            writes the details block to the DOM
 *                ->  renderFooter()             writes the footer CTA to the DOM
 * Processors     ->  processShowHide()          shows/hides sections and buttons
 *                ->  applyAlternatingSplitLayout() alternates image placement
 *
 * Configuration block expected on the page
 * ----------------------------------------
 * <script type="application/json" id="city-details-config">
 * {
 *   "jsonUrl":           "https://...citiesJSON.json",
 *   "jsUrl":             "https://...build-city-details.js",
 *   "cssUrl":            "https://...city-component.css",
 *   "bootstrapUrl":      "https://cdn.jsdelivr.net/.../bootstrap.min.css",
 *   "heroTargetDivId":   "city-hero",
 *   "heroHtmlUrl":       "https://...display-city-hero.html",
 *   "detailsTargetDivId":"city-details",
 *   "detailsHtmlUrl":    "https://...display-city-details.html",
 *   "footerTargetDivId": "city-footer-cta",
 *   "footerHtmlUrl":     "https://...display-city-footer.html",
 *   "cityImageRootUrl":  "https://...amazonaws.com/eq-realtor/_cities/"
 * }
 * </script>
 *
 * URL querystring parameter
 * -------------------------
 * CityID  - integer ID matching the "ID" field in the JSON (uppercase)
 * Example: /dev-city-details?CityID=2
 *
 * Image URL construction
 * ----------------------
 * The JS injects "imageRootUrl" as a virtual field on the city object
 * (= cityImageRootUrl with any trailing slash removed).
 * The details template references it as [imageRootUrl] in src attributes:
 *   src="[imageRootUrl]/[folder]/[marketImage]"
 * replaceTokens() resolves all three tokens in one pass.
 *
 * Show/hide rules applied to display-city-details.html
 * -----------------------------------------------------
 * IF [marketLabel]    is null/blank -> hide <section id="market">
 * IF [communityLabel] is null/blank -> hide <section id="community">
 * IF [schoolsLabel]   is null/blank -> hide <section id="schools">
 * IF [commuteLabel]   is null/blank -> hide <section id="commute">
 * IF [lifestyleLabel] is null/blank -> hide <section id="lifestyle">
 * IF [showDSMNeighborhoodBTN] != 2  -> hide <div id="learn-more-btn-community">
 * IF [dartSupport]            != 2  -> hide <div id="learn-more-btn-DART">
 *
 * Alternating split-layout
 * ------------------------
 * After show/hide, the JS counts visible .split-layout sections.
 * Odd-indexed sections (1st, 3rd, 5th...) get no change (image right).
 * Even-indexed sections (2nd, 4th...) get class "split-layout--flipped"
 * which reverses the flex direction to place the image on the left.
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP - wait for DOM, then kick off the component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initDetails);

  async function initDetails() {

    // -- 1a. Parse the configuration block ----------------------------------
    var config = loadConfig("city-details-config");
    if (!config) { return; }

    var jsonUrl                    = config.jsonUrl;
    var cssUrl                     = config.cssUrl;
    var bootstrapUrl               = config.bootstrapUrl;
    var cityImageRootUrl           = config.cityImageRootUrl           || "";
    var heroTargetDivId            = config.heroTargetDivId;
    var heroHtmlUrl                = config.heroHtmlUrl;
    var detailsTargetDivId         = config.detailsTargetDivId;
    var detailsHtmlUrl             = config.detailsHtmlUrl;
    var footerTargetDivId          = config.footerTargetDivId;
    var footerHtmlUrl              = config.footerHtmlUrl;
    var realEstateTeamTargetDivId  = config.realEstateTeamTargetDivId;
    var realEstateTeamUrl          = config.realEstateTeamUrl;

    // -- 1b. Validate required fields ----------------------------------------
    if (!jsonUrl || !detailsTargetDivId || !detailsHtmlUrl) {
      console.error(
        "[CityDetails] Configuration is missing one or more required fields: " +
        "jsonUrl, detailsTargetDivId, detailsHtmlUrl."
      );
      return;
    }

    // -- 1c. Inject CSS assets (non-blocking) --------------------------------
    if (bootstrapUrl) { injectStylesheet(bootstrapUrl); }
    if (cssUrl)       { injectStylesheet(cssUrl); }

    // -- 1d. Locate the details target div -----------------------------------
    var detailsTargetDiv = document.getElementById(detailsTargetDivId);
    if (!detailsTargetDiv) {
      console.error("[CityDetails] Target div #" + detailsTargetDivId + " not found in the DOM.");
      return;
    }

    // -- 1d2. Locate the hero target div (optional) --------------------------
    var heroTargetDiv = (heroHtmlUrl && heroTargetDivId)
      ? document.getElementById(heroTargetDivId)
      : null;

    if (heroHtmlUrl && heroTargetDivId && !heroTargetDiv) {
      console.warn(
        "[CityDetails] heroTargetDivId #" + heroTargetDivId + " is configured " +
        "but not found in the DOM. Hero block will be skipped."
      );
    }

    // -- 1d3. Locate the footer target div (optional) ------------------------
    var footerTargetDiv = (footerHtmlUrl && footerTargetDivId)
      ? document.getElementById(footerTargetDivId)
      : null;

    if (footerHtmlUrl && footerTargetDivId && !footerTargetDiv) {
      console.warn(
        "[CityDetails] footerTargetDivId #" + footerTargetDivId + " is configured " +
        "but not found in the DOM. Footer block will be skipped."
      );
    }

    // -- 1d4. Locate the real estate team target div (optional) --------------
    var realEstateTeamTargetDiv = (realEstateTeamUrl && realEstateTeamTargetDivId)
      ? document.getElementById(realEstateTeamTargetDivId)
      : null;

    if (realEstateTeamUrl && realEstateTeamTargetDivId && !realEstateTeamTargetDiv) {
      console.warn(
        "[CityDetails] realEstateTeamTargetDivId #" + realEstateTeamTargetDivId + " is configured " +
        "but not found in the DOM. Real Estate Team block will be skipped."
      );
    }

    // -- 1e. Extract CityID from the querystring -----------------------------
    var cityId = getQueryParam("CityID");

    if (!cityId) {
      console.error("[CityDetails] CityID querystring parameter is missing from the URL.");
      showError(detailsTargetDiv);
      return;
    }

    // -- 1f. Show the loading spinner in the details div ---------------------
    // Hero and footer divs have no spinner — their target divs are empty
    // until content is injected.
    showSpinner(detailsTargetDiv);

    // -- 1g. Fetch data + all templates simultaneously -----------------------
    try {
      var fetchPromises = [
        fetchCityData(jsonUrl),
        fetchTemplate(detailsHtmlUrl),
        heroTargetDiv           ? fetchTemplate(heroHtmlUrl)         : Promise.resolve(null),
        footerTargetDiv         ? fetchTemplate(footerHtmlUrl)       : Promise.resolve(null),
        realEstateTeamTargetDiv ? fetchTemplate(realEstateTeamUrl)   : Promise.resolve(null)
      ];

      var results               = await Promise.all(fetchPromises);
      var cityData              = results[0];
      var detailsTemplate       = results[1];
      var heroTemplate          = results[2];
      var footerTemplate        = results[3];
      var realEstateTeamTemplate = results[4];

      var city = findCityById(cityData, cityId);

      if (!city) {
        console.error("[CityDetails] No city found with ID = " + cityId + ".");
        showError(detailsTargetDiv);
        if (heroTargetDiv)   { heroTargetDiv.innerHTML = ""; }
        if (footerTargetDiv) { footerTargetDiv.innerHTML = ""; }
        return;
      }

      // Render hero first (sits at the top of the page)
      if (heroTargetDiv && heroTemplate) {
        renderHero(city, heroTemplate, heroTargetDiv);
      }

      renderDetails(city, detailsTemplate, detailsTargetDiv, cityImageRootUrl);

      if (footerTargetDiv && footerTemplate) {
        renderFooter(city, footerTemplate, footerTargetDiv);
      }

      // Render real estate team block (optional)
      if (realEstateTeamTargetDiv && realEstateTeamTemplate) {
        renderRealEstateTeam(city, realEstateTeamTemplate, realEstateTeamTargetDiv);
      }

    } catch (err) {
      console.error("[CityDetails] Failed to load city details:", err);
      showError(detailsTargetDiv);
      if (heroTargetDiv)           { heroTargetDiv.innerHTML = ""; }
      if (footerTargetDiv)         { footerTargetDiv.innerHTML = ""; }
      if (realEstateTeamTargetDiv) { realEstateTeamTargetDiv.innerHTML = ""; }
    }
  }


  /* =====================================================================
     2.  CONFIG LOADER
     ===================================================================== */

  function loadConfig(scriptId) {
    var configEl = document.getElementById(scriptId);

    if (!configEl) {
      console.error(
        "[CityDetails] Configuration block #" + scriptId + " not found. " +
        "Make sure the CONFIG code block is above the DISPLAY code blocks on the page."
      );
      return null;
    }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[CityDetails] Failed to parse configuration JSON:", e);
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
     4.  DATA FETCH
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
      throw new Error("[CityDetails] Expected a JSON array but received: " + typeof data);
    }

    console.log("[CityDetails] Fetched " + data.length + " city record(s).");
    return data;
  }


  /* =====================================================================
     5.  HTML TEMPLATE FETCH
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
     6.  CITY LOOKUP
     ===================================================================== */

  /**
   * Finds a single city by ID.
   * Uses loose equality (==) to handle the common case where the
   * querystring value is a string ("2") but the JSON ID is a number (2).
   * Note: JSON primary key field is "ID" (all caps) for this component.
   */
  function findCityById(cityData, id) {
    return cityData.find(function (city) { return city.Id == id; }) || null;
  }


  /* =====================================================================
     7.  HERO RENDERER
     ===================================================================== */

  /**
   * Renders the hero block.
   * The hero template contains the full S3 base URL with [folder] and
   * [heroImage] tokens embedded, so standard token replacement handles
   * the image URL automatically.
   */
  function renderHero(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log("[CityDetails] Rendered hero for " + city.Name + ".");
  }


  /* =====================================================================
     8.  DETAILS RENDERER
     ===================================================================== */

  /**
   * Renders the main city details block.
   *
   * Steps:
   *   a. Inject "imageRootUrl" as a virtual field so [imageRootUrl] tokens
   *      in the template resolve to the S3 base URL from the config.
   *   b. Replace all [tokens] with city data values.
   *   c. Parse into a live DOM tree.
   *   d. Apply show/hide rules to sections and buttons.
   *   e. Apply alternating split-layout image placement.
   *   f. Inject into the target div.
   *
   * @param  {object}      city           - the matched city record
   * @param  {string}      templateHtml   - raw HTML with [tokens]
   * @param  {HTMLElement} targetDiv      - the #city-details DOM node
   * @param  {string}      cityImageRootUrl - S3 root URL from config
   */
  function renderDetails(city, templateHtml, targetDiv, cityImageRootUrl) {

    // -- 8a. Inject imageRootUrl as a virtual field --------------------------
    // This allows [imageRootUrl] in the template to be resolved by
    // replaceTokens() without the URL needing to be in the JSON.
    var resolvedCity = Object.assign({}, city);
    resolvedCity.imageRootUrl = cityImageRootUrl.replace(/\/$/, "");

    // -- 8b. Replace all [tokens] --------------------------------------------
    var populatedHtml = replaceTokens(templateHtml, resolvedCity);

    // -- 8c. Parse into a live DOM tree --------------------------------------
    var parser = new DOMParser();
    var doc    = parser.parseFromString(populatedHtml, "text/html");

    // -- 8d. Apply section and button show/hide rules ------------------------
    processShowHide(doc, city);

    // -- 8e. Apply alternating split-layout image placement ------------------
    // Must run AFTER show/hide so hidden sections are not counted.
    applyAlternatingSplitLayout(doc);

    // -- 8f. Inject into the target div --------------------------------------
    targetDiv.innerHTML = "";
    var content = doc.body;

    while (content.firstChild) {
      targetDiv.appendChild(content.firstChild);
    }

    console.log("[CityDetails] Rendered details for " + city.Name + ".");
  }


  /* =====================================================================
     9.  FOOTER RENDERER
     ===================================================================== */

  /**
   * Renders the footer CTA block.
   * Simple token replacement — no special processing required.
   */
  function renderFooter(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log("[CityDetails] Rendered footer CTA for " + city.Name + ".");
  }


  /* =====================================================================
     10.  REAL ESTATE TEAM RENDERER
     ===================================================================== */

  /**
   * Renders the Real Estate Team block.
   * Standard token replacement only — no special processing required.
   * The template uses [name] (lowercase) which matches the JSON field.
   *
   * @param  {object}      city         - the matched city record
   * @param  {string}      templateHtml - raw HTML from display-real-estate-team.html
   * @param  {HTMLElement} targetDiv    - the #real-estate-team DOM node
   */
  function renderRealEstateTeam(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log("[CityDetails] Rendered real estate team block for " + city.name + ".");
  }


  /* =====================================================================
     11.  TOKEN REPLACER
     ===================================================================== */

  /**
   * Replaces every [FieldName] token in a string with the matching value
   * from the city data object (including any virtual fields injected by
   * the render functions).
   *
   * Tokens are case-sensitive and must match JSON field names exactly.
   * Missing/null/undefined fields produce an empty string.
   */
  function replaceTokens(template, city) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = city[key];
      if (value === null || value === undefined) { return ""; }
      return String(value);
    });
  }


  /* =====================================================================
     12.  SHOW / HIDE PROCESSOR
     ===================================================================== */

  /**
   * Applies all show/hide rules defined in the requirements.
   *
   * Section rules: hide the entire <section> if its label field is
   * null or blank in the city JSON.
   *
   * Button rules: hide a specific <div> if its boolean field does not
   * equal the required value (2 = show).
   *
   * @param  {Document} doc   - parsed DOMParser document
   * @param  {object}   city  - the city record (original, not resolved)
   */
  function processShowHide(doc, city) {

    // -- Section show/hide rules (label-driven) ------------------------------
    var sectionRules = [
      { sectionId: "market",    field: "marketLabel"    },
      { sectionId: "community", field: "communityLabel" },
      { sectionId: "schools",   field: "schoolsLabel"   },
      { sectionId: "commute",   field: "commuteLabel"   },
      { sectionId: "lifestyle", field: "lifestyleLabel" }
    ];

    sectionRules.forEach(function (rule) {
      var section = doc.getElementById(rule.sectionId);
      if (!section) { return; }

      var value = city[rule.field];
      if (!value || String(value).trim() === "") {
        section.style.display = "none";
      }
    });

    // -- Button show/hide rules (boolean-driven) -----------------------------
    var buttonRules = [
      { divId: "learn-more-btn-community", field: "showDSMNeighborhoodBTN", requiredValue: 2 },
      { divId: "learn-more-btn-DART",      field: "dartSupport",             requiredValue: 2 }
    ];

    buttonRules.forEach(function (rule) {
      var div = doc.getElementById(rule.divId);
      if (!div) { return; }

      if (city[rule.field] != rule.requiredValue) {
        div.style.display = "none";
      }
    });
  }


  /* =====================================================================
     13.  ALTERNATING SPLIT-LAYOUT PROCESSOR
     ===================================================================== */

  /**
   * Applies alternating image placement to the visible .split-layout
   * sections inside #cityContentBlocks.
   *
   * The default CSS positions the image on the RIGHT (flex-direction: row).
   * This function adds the class "split-layout--flipped" to every
   * even-indexed visible section (2nd, 4th, ...) to place the image on
   * the LEFT (flex-direction: row-reverse on desktop).
   *
   * This must be called AFTER processShowHide() so that hidden sections
   * are not included in the visible count.
   *
   * @param {Document} doc - the parsed DOMParser document
   */
  function applyAlternatingSplitLayout(doc) {

    var contentBlock = doc.getElementById("cityContentBlocks");
    if (!contentBlock) { return; }

    var sections     = contentBlock.querySelectorAll(".split-layout");
    var visibleIndex = 0;

    sections.forEach(function (section) {
      // Only count sections that are not hidden by processShowHide()
      if (section.style.display !== "none") {
        if (visibleIndex % 2 === 1) {
          // Even-indexed visible section (0-based): flip to image-left
          section.classList.add("split-layout--flipped");
        }
        visibleIndex++;
      }
    });

    console.log("[CityDetails] Applied alternating layout to " + visibleIndex + " visible section(s).");
  }


  /* =====================================================================
     14.  UI HELPERS  (spinner, error, stylesheet injection)
     ===================================================================== */

  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" aria-label="Loading..."></div>' +
      '</div>';
  }

  function showError(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-warning d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        '<span>Sorry, we cannot locate this city\'s information. ' +
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
