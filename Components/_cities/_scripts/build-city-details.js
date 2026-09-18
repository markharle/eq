/**
 * build-city-details.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block in
 * the page header, extracts the CityID querystring parameter, then
 * fetches the cities JSON and all HTML templates simultaneously. The
 * matching city's data is used to replace [tokens] in each template,
 * with special handling for:
 *   - Section show/hide rules based on label field values
 *   - Alternating split-layout image placement (right / left / right...)
 *   - imageRootUrl injected as a virtual field for image src construction
 *   - investDSM block shown only when investDSM field equals 2
 *
 * PARITY NOTE (this revision)
 * -----------------------------------------------------------------------
 * This file brings City Details to full feature parity with the stable
 * Neighborhood Details baseline (build-neighborhood-details.js). It is
 * a systematic adaptation of that file — same architecture, same
 * function names, same market-analysis-wrapper / custom-404 / event-
 * dispatch patterns — with these City-specific differences called out
 * explicitly since they're easy to miss on a future edit:
 *
 *   - URL param:        CityID          (was NeighborhoodID)
 *   - Primary key field: Id              (same casing as Neighborhood —
 *                        confirmed against real cities.json data)
 *   - DART button field: "DARTSupport"   (Neighborhood uses "dartSupport" —
 *                        cities.json uses different casing; do NOT copy
 *                        Neighborhood's rule verbatim here)
 *   - Content block id:  cityContentBlocks (was neighborhoodContentBlocks)
 *   - Error messaging:   "this city's information" (was "this
 *                        neighborhood's information")
 *
 * Everything else — showDSMNeighborhoodBTN, investDSM, showMarketTrends,
 * folder/imageRootUrl — uses identical field names and semantics to
 * Neighborhood, confirmed against a real cities.json sample.
 *
 * NOT included in this revision: the price-trajectory chart block
 * (market-analysis-chart-text / market-analysis-history-chart). That's
 * rendered by the separate build-entity-chart.js script, which already
 * supports City pages with zero changes (it auto-detects CityID and
 * falls back to reading "city-details-config") — it's just not wired
 * into the CONFIG yet, pending a City-equivalent chart JSON data source.
 *
 * Architecture note
 * -----------------
 * Data-fetching  ->  fetchCityData()                 returns the full array
 * Lookup         ->  findCityById()                  returns one record
 * Rendering      ->  renderHero()                    hero block
 *                ->  renderDetails()                 main details block
 *                ->  renderFooter()                  footer CTA block
 *                ->  renderRealEstateTeam()           team block
 *                ->  renderInvestDSM()                investDSM block
 *                ->  renderMarketAnalysisHeader()     market analysis header
 *                ->  renderMarketAnalysisCurrent()    market analysis current
 *                ->  renderMarketAnalysisProjection() Our Track Record (KPI + map)
 *                ->  showError()                      custom "not found" block
 * Processors     ->  processShowHide()               section/button visibility
 *                ->  applyAlternatingSplitLayout()    alternates image placement
 *
 * market-analysis-wrapper visibility
 * -----------------------------------------------------------------------
 * #market-analysis-wrapper ships hidden by default in the Squarespace
 * code block (display:none inline). This script is the ONLY thing that
 * reveals it, and only inside the showMarketTrends == 2 success branch
 * below. An invalid/unmatched CityID (the early-return branches) and a
 * valid city with showMarketTrends != 2 both simply leave the wrapper
 * at its hidden default.
 *
 * "Our Track Record" (KPI + map) block
 * -----------------------------------------------------------------------
 * This block lives INSIDE #market-analysis-wrapper (div id
 * "our-track-record"), rendered via renderMarketAnalysisProjection() /
 * the marketAnalysisProjection* config keys. The four KPI numbers inside
 * it (#yearsExperience, #totalSalesVolume, #totalClients,
 * #averageSalesPrice) are GLOBAL — not city-specific — and are populated
 * separately by build-agent-stats.js (unchanged from the Neighborhood
 * implementation), which listens for the "eqr:trackRecordRendered"
 * event this script dispatches right after injecting that template.
 * The map inside the same block is rendered by build-listings-map-v3b.js
 * (also unchanged) — it already filters by CityID automatically when a
 * NeighborhoodID isn't present in the URL.
 *
 * Custom "not found" markup
 * -----------------------------------------------------------------------
 * Any failure to resolve a city (missing CityID param, no matching
 * record, or a fetch/network error) fetches and injects a configurable
 * custom template (config key "notFoundHtmlUrl") instead of a hardcoded
 * message, falling back to plain text if that template isn't configured
 * or fails to load. See fetchTemplateSafe()/showError() below.
 *
 * Configuration block expected in the page header
 * ------------------------------------------------
 * <script type="application/json" id="city-details-config">
 * {
 *   "jsonUrl":                   "https://...citiesJSON.json",
 *   "jsUrl":                     "https://...build-city-details.js",
 *   "cssUrl":                    "https://...city-component.css",
 *   "bootstrapUrl":              "https://cdn.jsdelivr.net/.../bootstrap.min.css",
 *   "heroTargetDivId":           "city-hero",
 *   "heroHtmlUrl":               "https://...display-city-hero.html",
 *   "detailsTargetDivId":        "city-details",
 *   "detailsHtmlUrl":            "https://...display-city-details.html",
 *   "notFoundHtmlUrl":           "https://...display-city-not-found.html",
 *   "investDsmTargetDivID":      "investDSM",
 *   "investDsmHtmlURL":          "https://...display-investDSM.html",
 *   "marketAnalysisHeaderTargetDivId":  "market-analysis-header",
 *   "marketAnalysisHeaderHtmlUrl":      "https://...display-market-analysis-header.html",
 *   "marketAnalysisCurrentTargetDivId": "market-analysis-current",
 *   "marketAnalysisCurrentHtmlUrl":     "https://...display-market-analysis-eq-quotes.html",
 *   "marketAnalysisProjectionTargetDivId": "our-track-record",
 *   "marketAnalysisProjectionHtmlUrl":     "https://...display-our-track-record.html",
 *   "realEstateTeamTargetDivId": "real-estate-team",
 *   "realEstateTeamUrl":         "https://...display-real-estate-team.html",
 *   "footerTargetDivId":         "city-footer-cta",
 *   "footerHtmlUrl":             "https://...display-city-footer.html",
 *   "cityImageRootUrl":          "https://...amazonaws.com/eq-realtor/_cities/"
 * }
 * </script>
 *
 * URL querystring parameter
 * -------------------------
 * CityID - integer ID matching the "Id" field in the JSON
 * Example: /dev-city-details?CityID=2
 *
 * Image URL construction
 * ----------------------
 * The JS injects "imageRootUrl" as a virtual field on the city object
 * (= cityImageRootUrl with trailing slash removed).
 * The details template uses it as [imageRootUrl] in src attributes:
 *   src="[imageRootUrl]/[folder]/[marketImage]"
 *
 * Show/hide rules applied to display-city-details.html
 * ------------------------------------------------------------
 * IF [marketLabel]    is null/blank -> hide <section id="market">
 * IF [communityLabel] is null/blank -> hide <section id="community">
 * IF [schoolsLabel]   is null/blank -> hide <section id="schools">
 * IF [commuteLabel]   is null/blank -> hide <section id="commute">
 * IF [lifestyleLabel] is null/blank -> hide <section id="lifestyle">
 * IF [showDSMNeighborhoodBTN] != 2  -> hide <div id="learn-more-btn-community">
 * IF [DARTSupport]            != 2  -> hide <div id="learn-more-btn-DART">
 * IF [investDSM]              != 2  -> hide entire investDSM target div
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP - wait for DOM, then kick off the component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initDetails);

  async function initDetails() {

    var config = loadConfig("city-details-config");
    if (!config) { return; }

    var jsonUrl                    = config.jsonUrl;
    var cssUrl                     = config.cssUrl;
    var bootstrapUrl               = config.bootstrapUrl;
    var cityImageRootUrl           = config.cityImageRootUrl || "";
    var heroTargetDivId            = config.heroTargetDivId;
    var heroHtmlUrl                = config.heroHtmlUrl;
    var detailsTargetDivId         = config.detailsTargetDivId;
    var detailsHtmlUrl             = config.detailsHtmlUrl;
    var notFoundHtmlUrl            = config.notFoundHtmlUrl;
    var footerTargetDivId          = config.footerTargetDivId;
    var footerHtmlUrl              = config.footerHtmlUrl;
    var realEstateTeamTargetDivId  = config.realEstateTeamTargetDivId;
    var realEstateTeamUrl          = config.realEstateTeamUrl;
    var investDsmTargetDivID       = config.investDsmTargetDivID;
    var investDsmHtmlURL           = config.investDsmHtmlURL;

    // Market analysis config keys (show/hide controlled by showMarketTrends field)
    var marketAnalysisHeaderTargetDivId      = config.marketAnalysisHeaderTargetDivId;
    var marketAnalysisHeaderHtmlUrl          = config.marketAnalysisHeaderHtmlUrl;
    var marketAnalysisCurrentTargetDivId     = config.marketAnalysisCurrentTargetDivId;
    var marketAnalysisCurrentHtmlUrl         = config.marketAnalysisCurrentHtmlUrl;
    // "Projection" keys point at the Our Track Record (KPI + map) block.
    // Target div id is "our-track-record", nested inside
    // #market-analysis-wrapper — same ids as Neighborhood, reused as-is
    // since City and Neighborhood pages never coexist on the same page.
    var marketAnalysisProjectionTargetDivId  = config.marketAnalysisProjectionTargetDivId;
    var marketAnalysisProjectionHtmlUrl      = config.marketAnalysisProjectionHtmlUrl;

    if (!jsonUrl || !detailsTargetDivId || !detailsHtmlUrl) {
      console.error(
        "[CityDetails] Configuration is missing required fields: " +
        "jsonUrl, detailsTargetDivId, detailsHtmlUrl."
      );
      return;
    }

    if (bootstrapUrl) { injectStylesheet(bootstrapUrl); }
    if (cssUrl)       { injectStylesheet(cssUrl); }

    // -- Fetch the custom "not found" template early and independently --
    // Needed by THREE different early-exit paths below (missing param,
    // no matching record, fetch error), including one that happens
    // before the main Promise.all batch even runs. fetchTemplateSafe()
    // resolves to null on any failure rather than throwing, so a
    // broken/unset notFoundHtmlUrl falls back to the plain-text message
    // in showError() below instead of leaving the page broken.
    var notFoundTemplate = notFoundHtmlUrl
      ? await fetchTemplateSafe(notFoundHtmlUrl)
      : null;

    // -- Locate all target divs ---------------------------------------------
    var detailsTargetDiv = document.getElementById(detailsTargetDivId);
    if (!detailsTargetDiv) {
      console.error(
        "[CityDetails] Target div #" + detailsTargetDivId + " not found."
      );
      return;
    }

    var heroTargetDiv = (heroHtmlUrl && heroTargetDivId)
      ? document.getElementById(heroTargetDivId) : null;

    if (heroHtmlUrl && heroTargetDivId && !heroTargetDiv) {
      console.warn("[CityDetails] heroTargetDivId #" + heroTargetDivId +
        " configured but not found. Hero block will be skipped.");
    }

    var footerTargetDiv = (footerHtmlUrl && footerTargetDivId)
      ? document.getElementById(footerTargetDivId) : null;

    if (footerHtmlUrl && footerTargetDivId && !footerTargetDiv) {
      console.warn("[CityDetails] footerTargetDivId #" + footerTargetDivId +
        " configured but not found. Footer block will be skipped.");
    }

    var realEstateTeamTargetDiv = (realEstateTeamUrl && realEstateTeamTargetDivId)
      ? document.getElementById(realEstateTeamTargetDivId) : null;

    if (realEstateTeamUrl && realEstateTeamTargetDivId && !realEstateTeamTargetDiv) {
      console.warn("[CityDetails] realEstateTeamTargetDivId #" +
        realEstateTeamTargetDivId + " configured but not found. Team block will be skipped.");
    }

    var investDsmTargetDiv = (investDsmHtmlURL && investDsmTargetDivID)
      ? document.getElementById(investDsmTargetDivID) : null;

    if (investDsmHtmlURL && investDsmTargetDivID && !investDsmTargetDiv) {
      console.warn("[CityDetails] investDsmTargetDivID #" + investDsmTargetDivID +
        " configured but not found. InvestDSM block will be skipped.");
    }

    // -- Market analysis target divs (optional) ------------------------------
    // All three are located unconditionally here; the show/hide decision
    // is made later after the city record is fetched and showMarketTrends
    // is evaluated. If the wrapper div is hidden, these divs are hidden
    // alongside it and no templates are rendered into them.
    var marketAnalysisHeaderTargetDiv = (marketAnalysisHeaderHtmlUrl && marketAnalysisHeaderTargetDivId)
      ? document.getElementById(marketAnalysisHeaderTargetDivId) : null;

    var marketAnalysisCurrentTargetDiv = (marketAnalysisCurrentHtmlUrl && marketAnalysisCurrentTargetDivId)
      ? document.getElementById(marketAnalysisCurrentTargetDivId) : null;

    var marketAnalysisProjectionTargetDiv = (marketAnalysisProjectionHtmlUrl && marketAnalysisProjectionTargetDivId)
      ? document.getElementById(marketAnalysisProjectionTargetDivId) : null;

    // -- Extract CityID from querystring ----------------------------
    var cityId = getQueryParam("CityID");

    if (!cityId) {
      console.error(
        "[CityDetails] CityID querystring parameter is missing."
      );
      showError(detailsTargetDiv, notFoundTemplate, cityId);
      return;
    }

    showSpinner(detailsTargetDiv);

    try {
      // -- Fetch all data and templates simultaneously ----------------------
      var fetchPromises = [
        fetchCityData(jsonUrl),
        fetchTemplate(detailsHtmlUrl),
        heroTargetDiv                    ? fetchTemplate(heroHtmlUrl)                    : Promise.resolve(null),
        footerTargetDiv                  ? fetchTemplate(footerHtmlUrl)                  : Promise.resolve(null),
        realEstateTeamTargetDiv          ? fetchTemplate(realEstateTeamUrl)              : Promise.resolve(null),
        investDsmTargetDiv               ? fetchTemplate(investDsmHtmlURL)               : Promise.resolve(null),
        marketAnalysisHeaderTargetDiv    ? fetchTemplate(marketAnalysisHeaderHtmlUrl)    : Promise.resolve(null),
        marketAnalysisCurrentTargetDiv   ? fetchTemplate(marketAnalysisCurrentHtmlUrl)   : Promise.resolve(null),
        marketAnalysisProjectionTargetDiv ? fetchTemplate(marketAnalysisProjectionHtmlUrl) : Promise.resolve(null)
      ];

      var results                        = await Promise.all(fetchPromises);
      var cityData                       = results[0];
      var detailsTemplate                = results[1];
      var heroTemplate                   = results[2];
      var footerTemplate                 = results[3];
      var realEstateTeamTemplate         = results[4];
      var investDsmTemplate              = results[5];
      var marketAnalysisHeaderTemplate   = results[6];
      var marketAnalysisCurrentTemplate  = results[7];
      var marketAnalysisProjectionTemplate = results[8];

      var city = findCityById(cityData, cityId);

      if (!city) {
        console.error(
          "[CityDetails] No city found with Id = " + cityId + "."
        );
        showError(detailsTargetDiv, notFoundTemplate, cityId);
        if (heroTargetDiv)           { heroTargetDiv.innerHTML = ""; }
        if (footerTargetDiv)         { footerTargetDiv.innerHTML = ""; }
        if (realEstateTeamTargetDiv) { realEstateTeamTargetDiv.innerHTML = ""; }
        if (investDsmTargetDiv)      { investDsmTargetDiv.innerHTML = ""; }
        // #market-analysis-wrapper is NOT touched here on purpose — it
        // ships hidden by default, so an invalid/unmatched CityID simply
        // leaves it hidden without this branch having to know that div
        // exists at all.
        return;
      }

      // -- Build the per-city image base URL -----------------------
      var base             = cityImageRootUrl.replace(/\/$/, "");
      var folder           = city.folder
                              ? String(city.folder).replace(/\/$/, "")
                              : "";
      var imageBaseUrl     = base + "/" + folder;

      // -- Render each block -----------------------------------------------
      if (heroTargetDiv && heroTemplate) {
        renderHero(city, heroTemplate, heroTargetDiv);
      }

      renderDetails(city, detailsTemplate, detailsTargetDiv, cityImageRootUrl);

      if (footerTargetDiv && footerTemplate) {
        renderFooter(city, footerTemplate, footerTargetDiv);
      }

      if (realEstateTeamTargetDiv && realEstateTeamTemplate) {
        renderRealEstateTeam(city, realEstateTeamTemplate, realEstateTeamTargetDiv);
      }

      // investDSM: only render if investDSM field equals 2
      if (investDsmTargetDiv && investDsmTemplate) {
        if (city.investDSM == 2) {
          renderInvestDSM(city, investDsmTemplate, investDsmTargetDiv);
        } else {
          investDsmTargetDiv.style.display = "none";
          console.log(
            "[CityDetails] InvestDSM block hidden - investDSM value is not 2 for " +
            city.name + "."
          );
        }
      }

      // Market Analysis blocks ---------------------------------------------------
      // Show/hide rule: #market-analysis-wrapper ships hidden by default
      // and is revealed HERE, only when showMarketTrends == 2. If
      // showMarketTrends is absent, null, blank, or any value other than
      // 2, the wrapper is simply left at its hidden default and no
      // market analysis content is rendered.
      var marketWrapper = document.getElementById("market-analysis-wrapper");

      if (city.showMarketTrends == 2) {

        if (marketAnalysisHeaderTargetDiv && marketAnalysisHeaderTemplate) {
          renderMarketAnalysisHeader(city, marketAnalysisHeaderTemplate,
            marketAnalysisHeaderTargetDiv);
        }

        if (marketAnalysisCurrentTargetDiv && marketAnalysisCurrentTemplate) {
          renderMarketAnalysisCurrent(city, marketAnalysisCurrentTemplate,
            marketAnalysisCurrentTargetDiv);
        }

        if (marketAnalysisProjectionTargetDiv && marketAnalysisProjectionTemplate) {
          renderMarketAnalysisProjection(city, marketAnalysisProjectionTemplate,
            marketAnalysisProjectionTargetDiv);

          // Tell independent, page-agnostic scripts (build-agent-stats.js,
          // build-listings-map-v3b.js) that the Our Track Record markup
          // now exists in the DOM.
          document.dispatchEvent(new CustomEvent("eqr:trackRecordRendered"));
        }

        // Reveal the wrapper now that its contents are populated.
        if (marketWrapper) {
          marketWrapper.style.display = "";
        }

        console.log(
          "[CityDetails] Market analysis blocks rendered for " + city.name + "."
        );

      } else {
        // Redundant with the hidden-by-default state in the code block —
        // kept for defensiveness in case that inline default is ever
        // removed or changed.
        if (marketWrapper) {
          marketWrapper.style.display = "none";
        }
        console.log(
          "[CityDetails] Market analysis wrapper hidden - " +
          "showMarketTrends is not 2 for " + city.name + "."
        );
      }

    } catch (err) {
      console.error("[CityDetails] Failed to load city details:", err);
      showError(detailsTargetDiv, notFoundTemplate, cityId);
      if (heroTargetDiv)           { heroTargetDiv.innerHTML = ""; }
      if (footerTargetDiv)         { footerTargetDiv.innerHTML = ""; }
      if (realEstateTeamTargetDiv) { realEstateTeamTargetDiv.innerHTML = ""; }
      if (investDsmTargetDiv)      { investDsmTargetDiv.innerHTML = ""; }
      // As with the "no city found" branch above, the wrapper is
      // intentionally left untouched — hidden by default covers this too.
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
        "Make sure the CONFIG script is in the page header."
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
      throw new Error(
        "[CityDetails] Expected a JSON array but received: " + typeof data
      );
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

  /**
   * Same as fetchTemplate(), but never throws — resolves to null on any
   * failure. Used specifically for the "not found" template, since a
   * broken/unset URL for THAT template must not prevent showError()
   * from still showing something (the plain-text fallback).
   */
  async function fetchTemplateSafe(url) {
    try {
      return await fetchTemplate(url);
    } catch (err) {
      console.warn(
        "[CityDetails] Could not load the custom not-found template " +
        "(falling back to the default message):", err
      );
      return null;
    }
  }


  /* =====================================================================
     6.  CITY LOOKUP
     ===================================================================== */

  /**
   * Finds a single city by Id.
   * Uses loose equality (==) so the querystring string "2" matches JSON
   * number 2. Primary key field is "Id" — confirmed identical casing to
   * Neighborhood against a real cities.json sample.
   */
  function findCityById(cityData, id) {
    return cityData.find(function (c) { return c.Id == id; }) || null;
  }


  /* =====================================================================
     7.  HERO RENDERER
     ===================================================================== */

  function renderHero(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log("[CityDetails] Rendered hero for " + city.name + ".");
  }


  /* =====================================================================
     8.  DETAILS RENDERER
     ===================================================================== */

  function renderDetails(city, templateHtml, targetDiv, cityImageRootUrl) {

    var resolvedCity = Object.assign({}, city);
    resolvedCity.imageRootUrl = cityImageRootUrl.replace(/\/$/, "");

    var populatedHtml = replaceTokens(templateHtml, resolvedCity);

    var parser = new DOMParser();
    var doc    = parser.parseFromString(populatedHtml, "text/html");

    processShowHide(doc, city);
    applyAlternatingSplitLayout(doc);

    targetDiv.innerHTML = "";
    var content = doc.body;

    while (content.firstChild) {
      targetDiv.appendChild(content.firstChild);
    }

    console.log("[CityDetails] Rendered details for " + city.name + ".");
  }


  /* =====================================================================
     9.  FOOTER RENDERER
     ===================================================================== */

  function renderFooter(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log("[CityDetails] Rendered footer for " + city.name + ".");
  }


  /* =====================================================================
     10.  REAL ESTATE TEAM RENDERER
     ===================================================================== */

  function renderRealEstateTeam(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log(
      "[CityDetails] Rendered real estate team block for " + city.name + "."
    );
  }


  /* =====================================================================
     11.  INVEST DSM RENDERER
     ===================================================================== */

  /**
   * Renders the InvestDSM content block. Only called when
   * city.investDSM == 2. Any other value (null, 1, absent) hides the
   * target div — handled in initDetails() before this function is
   * called. Jurisdictional differences (which cities actually have an
   * Invest DSM-equivalent program) are addressed within the template
   * content itself, not in this script's logic.
   */
  function renderInvestDSM(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log(
      "[CityDetails] Rendered InvestDSM block for " + city.name + "."
    );
  }


  /* =====================================================================
     12.  MARKET ANALYSIS RENDERERS
     ===================================================================== */

  function renderMarketAnalysisHeader(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log(
      "[CityDetails] Rendered market analysis header for " + city.name + "."
    );
  }

  function renderMarketAnalysisCurrent(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log(
      "[CityDetails] Rendered market analysis current block for " + city.name + "."
    );
  }

  /**
   * Renders the Our Track Record (KPI + map) block.
   * Standard token replacement — currently just [name] in the heading.
   * The four KPI numbers inside are global and populated separately by
   * build-agent-stats.js.
   */
  function renderMarketAnalysisProjection(city, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, city);
    targetDiv.innerHTML = populatedHtml;
    console.log(
      "[CityDetails] Rendered Our Track Record block for " + city.name + "."
    );
  }


  /* =====================================================================
     13.  TOKEN REPLACER
     ===================================================================== */

  function replaceTokens(template, data) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = data[key];
      if (value === null || value === undefined) { return ""; }
      return String(value);
    });
  }


  /* =====================================================================
     14.  SHOW / HIDE PROCESSOR
     ===================================================================== */

  /**
   * Applies all show/hide rules to the parsed DOM tree.
   *
   * NOTE the DART rule below uses "DARTSupport" (matching cities.json's
   * actual casing), NOT "dartSupport" as Neighborhood's equivalent rule
   * does — this was verified against real data, not assumed.
   */
  function processShowHide(doc, city) {

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

    var buttonRules = [
      { divId: "learn-more-btn-community", field: "showDSMNeighborhoodBTN", requiredValue: 2 },
      { divId: "learn-more-btn-DART",      field: "DARTSupport",             requiredValue: 2 }
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
     15.  ALTERNATING SPLIT-LAYOUT PROCESSOR
     ===================================================================== */

  /**
   * Same as Neighborhood's version, but reads from #cityContentBlocks
   * (the City details template's content wrapper id) instead of
   * #neighborhoodContentBlocks.
   */
  function applyAlternatingSplitLayout(doc) {

    var contentBlock = doc.getElementById("cityContentBlocks");
    if (!contentBlock) { return; }

    var sections     = contentBlock.querySelectorAll(".split-layout");
    var visibleIndex = 0;

    sections.forEach(function (section) {
      if (section.style.display !== "none") {
        if (visibleIndex % 2 === 1) {
          section.classList.add("split-layout--flipped");
        }
        visibleIndex++;
      }
    });

    console.log(
      "[CityDetails] Applied alternating layout to " +
      visibleIndex + " visible section(s)."
    );
  }


  /* =====================================================================
     16.  UI HELPERS
     ===================================================================== */

  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" ' +
        'aria-label="Loading..."></div>' +
      '</div>';
  }

  /**
   * Shows the "not found" state inside targetDiv. Same pattern as
   * Neighborhood's showError(): a configured/fetched notFoundTemplate is
   * preferred (token-replaced, with [requestedId] available if the
   * template wants it), falling back to plain text if none is
   * configured or its fetch failed.
   */
  function showError(targetDiv, notFoundTemplate, requestedId) {
    if (notFoundTemplate) {
      var populatedHtml = replaceTokens(notFoundTemplate, { requestedId: requestedId || "" });
      targetDiv.innerHTML = populatedHtml;
      return;
    }

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
