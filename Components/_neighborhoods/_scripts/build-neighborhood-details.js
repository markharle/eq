/**
 * build-neighborhood-details.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block in
 * the page header, extracts the NeighborhoodID querystring parameter,
 * then fetches the neighborhoods JSON and all HTML templates
 * simultaneously. The matching neighborhood's data is used to replace
 * [tokens] in each template, with special handling for:
 *   - Section show/hide rules based on label field values
 *   - Alternating split-layout image placement (right / left / right...)
 *   - imageRootUrl injected as a virtual field for image src construction
 *   - investDSM block shown only when investDSM field equals 2
 *
 * Architecture note
 * -----------------
 * Data-fetching  ->  fetchNeighborhoodData()        returns the full array
 * Lookup         ->  findNeighborhoodById()         returns one record
 * Rendering      ->  renderHero()                   hero block
 *                ->  renderDetails()                main details block
 *                ->  renderFooter()                 footer CTA block
 *                ->  renderRealEstateTeam()         team block
 *                ->  renderInvestDSM()              investDSM block
 * Processors     ->  processShowHide()              section/button visibility
 *                ->  applyAlternatingSplitLayout()  alternates image placement
 *
 * Configuration block expected in the page header
 * ------------------------------------------------
 * <script type="application/json" id="neighborhood-details-config">
 * {
 *   "jsonUrl":                   "https://...neighborhoodsJSON.json",
 *   "jsUrl":                     "https://...build-neighborhood-details.js",
 *   "cssUrl":                    "https://...neighborhood-component.css",
 *   "bootstrapUrl":              "https://cdn.jsdelivr.net/.../bootstrap.min.css",
 *   "heroTargetDivId":           "neighborhood-hero",
 *   "heroHtmlUrl":               "https://...display-neighborhood-hero.html",
 *   "detailsTargetDivId":        "neighborhood-details",
 *   "detailsHtmlUrl":            "https://...display-neighborhood-details.html",
 *   "footerTargetDivId":         "neighborhood-footer-cta",
 *   "footerHtmlUrl":             "https://...display-neighborhood-footer.html",
 *   "realEstateTeamTargetDivId": "real-estate-team",
 *   "realEstateTeamUrl":         "https://...display-real-estate-team.html",
 *   "investDsmTargetDivID":      "investDSM",
 *   "investDsmHtmlURL":          "https://...display-investDSM.html",
 *   "neighborhoodImageRootUrl":  "https://...amazonaws.com/eq-realtor/_neighborhoods/"
 * }
 * </script>
 *
 * URL querystring parameter
 * -------------------------
 * NeighborhoodID - integer ID matching the "Id" field in the JSON
 * Example: /dev-neighborhood-details?NeighborhoodID=2
 *
 * Image URL construction
 * ----------------------
 * The JS injects "imageRootUrl" as a virtual field on the neighborhood
 * object (= neighborhoodImageRootUrl with trailing slash removed).
 * The details template uses it as [imageRootUrl] in src attributes:
 *   src="[imageRootUrl]/[folder]/[marketImage]"
 *
 * Show/hide rules applied to display-neighborhood-details.html
 * ------------------------------------------------------------
 * IF [marketLabel]    is null/blank -> hide <section id="market">
 * IF [communityLabel] is null/blank -> hide <section id="community">
 * IF [schoolsLabel]   is null/blank -> hide <section id="schools">
 * IF [commuteLabel]   is null/blank -> hide <section id="commute">
 * IF [lifestyleLabel] is null/blank -> hide <section id="lifestyle">
 * IF [showDSMNeighborhoodBTN] != 2  -> hide <div id="learn-more-btn-community">
 * IF [dartSupport]            != 2  -> hide <div id="learn-more-btn-DART">
 * IF [investDSM]              != 2  -> hide entire investDSM target div
 *
 * NOTE: Fields absent from a neighborhood record (e.g. commuteLabel for
 * most Des Moines neighborhoods) evaluate as null and are handled
 * gracefully — their sections are hidden automatically.
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP - wait for DOM, then kick off the component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initDetails);

  async function initDetails() {

    var config = loadConfig("neighborhood-details-config");
    if (!config) { return; }

    var jsonUrl                    = config.jsonUrl;
    var cssUrl                     = config.cssUrl;
    var bootstrapUrl               = config.bootstrapUrl;
    var neighborhoodImageRootUrl   = config.neighborhoodImageRootUrl || "";
    var heroTargetDivId            = config.heroTargetDivId;
    var heroHtmlUrl                = config.heroHtmlUrl;
    var detailsTargetDivId         = config.detailsTargetDivId;
    var detailsHtmlUrl             = config.detailsHtmlUrl;
    var footerTargetDivId          = config.footerTargetDivId;
    var footerHtmlUrl              = config.footerHtmlUrl;
    var realEstateTeamTargetDivId  = config.realEstateTeamTargetDivId;
    var realEstateTeamUrl          = config.realEstateTeamUrl;
    var investDsmTargetDivID       = config.investDsmTargetDivID;
    var investDsmHtmlURL           = config.investDsmHtmlURL;

    if (!jsonUrl || !detailsTargetDivId || !detailsHtmlUrl) {
      console.error(
        "[NeighborhoodDetails] Configuration is missing required fields: " +
        "jsonUrl, detailsTargetDivId, detailsHtmlUrl."
      );
      return;
    }

    if (bootstrapUrl) { injectStylesheet(bootstrapUrl); }
    if (cssUrl)       { injectStylesheet(cssUrl); }

    // -- Locate all target divs ---------------------------------------------
    var detailsTargetDiv = document.getElementById(detailsTargetDivId);
    if (!detailsTargetDiv) {
      console.error(
        "[NeighborhoodDetails] Target div #" + detailsTargetDivId + " not found."
      );
      return;
    }

    var heroTargetDiv = (heroHtmlUrl && heroTargetDivId)
      ? document.getElementById(heroTargetDivId) : null;

    if (heroHtmlUrl && heroTargetDivId && !heroTargetDiv) {
      console.warn("[NeighborhoodDetails] heroTargetDivId #" + heroTargetDivId +
        " configured but not found. Hero block will be skipped.");
    }

    var footerTargetDiv = (footerHtmlUrl && footerTargetDivId)
      ? document.getElementById(footerTargetDivId) : null;

    if (footerHtmlUrl && footerTargetDivId && !footerTargetDiv) {
      console.warn("[NeighborhoodDetails] footerTargetDivId #" + footerTargetDivId +
        " configured but not found. Footer block will be skipped.");
    }

    var realEstateTeamTargetDiv = (realEstateTeamUrl && realEstateTeamTargetDivId)
      ? document.getElementById(realEstateTeamTargetDivId) : null;

    if (realEstateTeamUrl && realEstateTeamTargetDivId && !realEstateTeamTargetDiv) {
      console.warn("[NeighborhoodDetails] realEstateTeamTargetDivId #" +
        realEstateTeamTargetDivId + " configured but not found. Team block will be skipped.");
    }

    var investDsmTargetDiv = (investDsmHtmlURL && investDsmTargetDivID)
      ? document.getElementById(investDsmTargetDivID) : null;

    if (investDsmHtmlURL && investDsmTargetDivID && !investDsmTargetDiv) {
      console.warn("[NeighborhoodDetails] investDsmTargetDivID #" + investDsmTargetDivID +
        " configured but not found. InvestDSM block will be skipped.");
    }

    // -- Extract NeighborhoodID from querystring ----------------------------
    var neighborhoodId = getQueryParam("NeighborhoodID");

    if (!neighborhoodId) {
      console.error(
        "[NeighborhoodDetails] NeighborhoodID querystring parameter is missing."
      );
      showError(detailsTargetDiv);
      return;
    }

    showSpinner(detailsTargetDiv);

    try {
      // -- Fetch all data and templates simultaneously ----------------------
      var fetchPromises = [
        fetchNeighborhoodData(jsonUrl),
        fetchTemplate(detailsHtmlUrl),
        heroTargetDiv           ? fetchTemplate(heroHtmlUrl)         : Promise.resolve(null),
        footerTargetDiv         ? fetchTemplate(footerHtmlUrl)       : Promise.resolve(null),
        realEstateTeamTargetDiv ? fetchTemplate(realEstateTeamUrl)   : Promise.resolve(null),
        investDsmTargetDiv      ? fetchTemplate(investDsmHtmlURL)    : Promise.resolve(null)
      ];

      var results                = await Promise.all(fetchPromises);
      var neighborhoodData       = results[0];
      var detailsTemplate        = results[1];
      var heroTemplate           = results[2];
      var footerTemplate         = results[3];
      var realEstateTeamTemplate = results[4];
      var investDsmTemplate      = results[5];

      var neighborhood = findNeighborhoodById(neighborhoodData, neighborhoodId);

      if (!neighborhood) {
        console.error(
          "[NeighborhoodDetails] No neighborhood found with Id = " + neighborhoodId + "."
        );
        showError(detailsTargetDiv);
        if (heroTargetDiv)           { heroTargetDiv.innerHTML = ""; }
        if (footerTargetDiv)         { footerTargetDiv.innerHTML = ""; }
        if (realEstateTeamTargetDiv) { realEstateTeamTargetDiv.innerHTML = ""; }
        if (investDsmTargetDiv)      { investDsmTargetDiv.innerHTML = ""; }
        return;
      }

      // -- Build the per-neighborhood image base URL -----------------------
      var base             = neighborhoodImageRootUrl.replace(/\/$/, "");
      var folder           = neighborhood.folder
                              ? String(neighborhood.folder).replace(/\/$/, "")
                              : "";
      var imageBaseUrl     = base + "/" + folder;

      // -- Render each block -----------------------------------------------
      if (heroTargetDiv && heroTemplate) {
        renderHero(neighborhood, heroTemplate, heroTargetDiv);
      }

      renderDetails(neighborhood, detailsTemplate, detailsTargetDiv, neighborhoodImageRootUrl);

      if (footerTargetDiv && footerTemplate) {
        renderFooter(neighborhood, footerTemplate, footerTargetDiv);
      }

      if (realEstateTeamTargetDiv && realEstateTeamTemplate) {
        renderRealEstateTeam(neighborhood, realEstateTeamTemplate, realEstateTeamTargetDiv);
      }

      // investDSM: only render if investDSM field equals 2
      if (investDsmTargetDiv && investDsmTemplate) {
        if (neighborhood.investDSM == 2) {
          renderInvestDSM(neighborhood, investDsmTemplate, investDsmTargetDiv);
        } else {
          investDsmTargetDiv.style.display = "none";
          console.log(
            "[NeighborhoodDetails] InvestDSM block hidden - investDSM value is not 2 for " +
            neighborhood.name + "."
          );
        }
      }

    } catch (err) {
      console.error("[NeighborhoodDetails] Failed to load neighborhood details:", err);
      showError(detailsTargetDiv);
      if (heroTargetDiv)           { heroTargetDiv.innerHTML = ""; }
      if (footerTargetDiv)         { footerTargetDiv.innerHTML = ""; }
      if (realEstateTeamTargetDiv) { realEstateTeamTargetDiv.innerHTML = ""; }
      if (investDsmTargetDiv)      { investDsmTargetDiv.innerHTML = ""; }
    }
  }


  /* =====================================================================
     2.  CONFIG LOADER
     ===================================================================== */

  function loadConfig(scriptId) {
    var configEl = document.getElementById(scriptId);

    if (!configEl) {
      console.error(
        "[NeighborhoodDetails] Configuration block #" + scriptId + " not found. " +
        "Make sure the CONFIG script is in the page header."
      );
      return null;
    }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[NeighborhoodDetails] Failed to parse configuration JSON:", e);
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

  async function fetchNeighborhoodData(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching " + url
      );
    }

    var data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        "[NeighborhoodDetails] Expected a JSON array but received: " + typeof data
      );
    }

    console.log("[NeighborhoodDetails] Fetched " + data.length + " neighborhood record(s).");
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
     6.  NEIGHBORHOOD LOOKUP
     ===================================================================== */

  /**
   * Finds a single neighborhood by Id.
   * Uses loose equality (==) so the querystring string "2" matches JSON
   * number 2.  Note: primary key field is "Id" (capital I, lowercase d).
   */
  function findNeighborhoodById(neighborhoodData, id) {
    return neighborhoodData.find(function (n) { return n.Id == id; }) || null;
  }


  /* =====================================================================
     7.  HERO RENDERER
     ===================================================================== */

  /**
   * Renders the hero block.
   * The hero template contains the full S3 base URL with [folder] and
   * [heroImage] tokens embedded, so standard token replacement handles
   * the image URL automatically — no virtual field needed here.
   */
  function renderHero(neighborhood, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, neighborhood);
    targetDiv.innerHTML = populatedHtml;
    console.log("[NeighborhoodDetails] Rendered hero for " + neighborhood.name + ".");
  }


  /* =====================================================================
     8.  DETAILS RENDERER
     ===================================================================== */

  /**
   * Renders the main neighborhood details block.
   *
   * Steps:
   *   a. Inject "imageRootUrl" as a virtual field so [imageRootUrl] tokens
   *      in the template resolve to the S3 base URL from the config.
   *   b. Replace all [tokens].
   *   c. Parse into a live DOM tree.
   *   d. Apply show/hide rules to sections and buttons.
   *   e. Apply alternating split-layout image placement.
   *   f. Inject into the target div.
   */
  function renderDetails(neighborhood, templateHtml, targetDiv, neighborhoodImageRootUrl) {

    // Inject imageRootUrl as a virtual field for image src construction
    var resolvedNeighborhood = Object.assign({}, neighborhood);
    resolvedNeighborhood.imageRootUrl = neighborhoodImageRootUrl.replace(/\/$/, "");

    var populatedHtml = replaceTokens(templateHtml, resolvedNeighborhood);

    var parser = new DOMParser();
    var doc    = parser.parseFromString(populatedHtml, "text/html");

    processShowHide(doc, neighborhood);
    applyAlternatingSplitLayout(doc);

    targetDiv.innerHTML = "";
    var content = doc.body;

    while (content.firstChild) {
      targetDiv.appendChild(content.firstChild);
    }

    console.log("[NeighborhoodDetails] Rendered details for " + neighborhood.name + ".");
  }


  /* =====================================================================
     9.  FOOTER RENDERER
     ===================================================================== */

  function renderFooter(neighborhood, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, neighborhood);
    targetDiv.innerHTML = populatedHtml;
    console.log("[NeighborhoodDetails] Rendered footer for " + neighborhood.name + ".");
  }


  /* =====================================================================
     10.  REAL ESTATE TEAM RENDERER
     ===================================================================== */

  function renderRealEstateTeam(neighborhood, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, neighborhood);
    targetDiv.innerHTML = populatedHtml;
    console.log(
      "[NeighborhoodDetails] Rendered real estate team block for " + neighborhood.name + "."
    );
  }


  /* =====================================================================
     11.  INVEST DSM RENDERER
     ===================================================================== */

  /**
   * Renders the InvestDSM content block.
   * Only called when neighborhood.investDSM == 2.
   * Any other value (null, 1, absent) hides the target div — handled
   * in initDetails() before this function is called.
   */
  function renderInvestDSM(neighborhood, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, neighborhood);
    targetDiv.innerHTML = populatedHtml;
    console.log(
      "[NeighborhoodDetails] Rendered InvestDSM block for " + neighborhood.name + "."
    );
  }


  /* =====================================================================
     12.  TOKEN REPLACER
     ===================================================================== */

  /**
   * Replaces every [FieldName] token with the matching value from the
   * neighborhood object (including any virtual fields injected by the
   * render functions).  Missing/null/undefined fields produce empty string.
   */
  function replaceTokens(template, neighborhood) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = neighborhood[key];
      if (value === null || value === undefined) { return ""; }
      return String(value);
    });
  }


  /* =====================================================================
     13.  SHOW / HIDE PROCESSOR
     ===================================================================== */

  /**
   * Applies all show/hide rules to the parsed DOM tree.
   *
   * Section rules: hide the entire <section> if its label field is
   * null, blank, or absent in the neighborhood JSON.
   *
   * Button rules: hide a specific <div> if its boolean field does not
   * equal 2.  Fields absent from the JSON record evaluate as undefined,
   * which does not equal 2, so buttons are hidden by default for any
   * neighborhood that does not explicitly enable them.
   */
  function processShowHide(doc, neighborhood) {

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

      var value = neighborhood[rule.field];
      if (!value || String(value).trim() === "") {
        section.style.display = "none";
      }
    });

    var buttonRules = [
      { divId: "learn-more-btn-community", field: "showDSMNeighborhoodBTN", requiredValue: 2 },
      { divId: "learn-more-btn-DART",      field: "dartSupport",             requiredValue: 2 }
    ];

    buttonRules.forEach(function (rule) {
      var div = doc.getElementById(rule.divId);
      if (!div) { return; }

      if (neighborhood[rule.field] != rule.requiredValue) {
        div.style.display = "none";
      }
    });
  }


  /* =====================================================================
     14.  ALTERNATING SPLIT-LAYOUT PROCESSOR
     ===================================================================== */

  /**
   * Applies alternating image placement to visible .split-layout sections.
   * Must be called AFTER processShowHide() so hidden sections are excluded
   * from the visible count.
   *
   * 1st visible section: image right (default CSS flex-direction: row)
   * 2nd visible section: image left  (adds .split-layout--flipped)
   * 3rd visible section: image right — pattern repeats
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
      "[NeighborhoodDetails] Applied alternating layout to " +
      visibleIndex + " visible section(s)."
    );
  }


  /* =====================================================================
     15.  UI HELPERS
     ===================================================================== */

  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" ' +
        'aria-label="Loading..."></div>' +
      '</div>';
  }

  function showError(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-warning d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        '<span>Sorry, we cannot locate this neighborhood\'s information. ' +
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
