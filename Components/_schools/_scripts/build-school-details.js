/**
 * build-school-details.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block on
 * the page, extracts the schoolId querystring parameter from the URL,
 * then fetches the schools JSON and all HTML templates simultaneously.
 * The matching school's data is used to replace [tokens] in each template,
 * with special handling for:
 *   - Social media icon divs (hidden when URL field is empty/null)
 *   - Image Gallery (built from the ImageGallery JSON field; section
 *     hidden entirely if no images are present)
 *   - Hero background image (resolved via token replacement in template)
 *
 * Architecture note
 * -----------------
 * Data-fetching  ->  fetchSchoolData()        returns the full raw array
 * Member lookup  ->  findSchoolById()         returns one matched record
 * Rendering      ->  renderHero()             writes the hero block to the DOM
 *                ->  renderDetails()          writes the details block to the DOM
 *                ->  renderCitiesServed()     writes the cities card deck to the DOM
 * Processors     ->  processSocialRow()       shows/hides each icon div
 *                ->  processImageGallery()    builds or hides the gallery
 *
 * Configuration block expected on the page
 * ----------------------------------------
 * <script type="application/json" id="school-details-config">
 * {
 *   "jsonUrl":                  "https://...schoolJSON.json",
 *   "jsUrl":                    "https://...build-school-details.js",
 *   "htmlUrl":                  "https://...display-school-details.html",
 *   "heroHtmlUrl":              "https://...display-school-hero.html",
 *   "citiesServedHtmlUrl":      "https://...display-citiesServed-card-deck.html",
 *   "cssUrl":                   "https://...school-component.css",
 *   "bootstrapUrl":             "https://cdn.jsdelivr.net/.../bootstrap.min.css",
 *   "imageRootUrl":             "https://...amazonaws.com/eq-realtor/_schools",
 *   "cityImageRootUrl":         "https://...amazonaws.com/eq-realtor/_cities",
 *   "targetDivId":              "school-details",
 *   "heroTargetDivId":          "school-hero",
 *   "citiesServedTargetDivId":  "citiesServed-cards"
 * }
 *
 * CitiesServed field note
 * -----------------------
 * CitiesServed is a native JSON array (not stringified), so no JSON.parse
 * is needed.  Each element contains: ID, City, thumbnailImage, urlSlugCity.
 * The full image URL is constructed at render time as:
 *   cityImageRootUrl + "/" + city.urlSlugCity + "/" + city.thumbnailImage
 * </script>
 *
 * CONFIG key notes
 * ----------------
 * imageRootUrl   - Root S3 path for school images (no slug, no trailing slash).
 *                  The JS appends school.urlSlugSchool + "/" at render time.
 *                  Example: "https://...amazonaws.com/eq-realtor/_schools"
 *
 * heroHtmlUrl    - Standardized key name (was "heroURL" in earlier drafts).
 *                  Update your CONFIG block to use "heroHtmlUrl".
 *
 * URL querystring parameter
 * -------------------------
 * schoolId  - integer ID matching the "ID" field in the JSON (uppercase)
 * Example: /dev-school-details?schoolId=1
 *
 * ImageGallery field note
 * -----------------------
 * The ImageGallery JSON field is stored as a stringified JSON array
 * (e.g. "[\"file1.jpg\",\"file2.jpg\"]").  The JS parses this string
 * before iterating.  If PlantAnApp can be updated to emit a native
 * array instead, the JSON.parse step can be removed.
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
    var config = loadConfig("school-details-config");
    if (!config) { return; }

    var jsonUrl                  = config.jsonUrl;
    var htmlUrl                  = config.htmlUrl;
    var heroHtmlUrl              = config.heroHtmlUrl;
    var citiesServedHtmlUrl      = config.citiesServedHtmlUrl;
    var cssUrl                   = config.cssUrl;
    var bootstrapUrl             = config.bootstrapUrl;
    var imageRootUrl             = config.imageRootUrl             || "";
    var cityImageRootUrl         = config.cityImageRootUrl         || "";
    var targetDivId              = config.targetDivId;
    var heroTargetDivId          = config.heroTargetDivId;
    var citiesServedTargetDivId  = config.citiesServedTargetDivId;

    // -- 1b. Validate required fields ----------------------------------------
    if (!jsonUrl || !htmlUrl || !targetDivId) {
      console.error(
        "[SchoolDetails] Configuration is missing one or more required fields: " +
        "jsonUrl, htmlUrl, targetDivId."
      );
      return;
    }

    // -- 1c. Inject CSS assets (non-blocking) --------------------------------
    if (bootstrapUrl) { injectStylesheet(bootstrapUrl); }
    if (cssUrl)       { injectStylesheet(cssUrl); }

    // -- 1d. Locate the details target div -----------------------------------
    var targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) {
      console.error("[SchoolDetails] Target div #" + targetDivId + " not found in the DOM.");
      return;
    }

    // -- 1d2. Locate the hero target div (optional) --------------------------
    // If heroHtmlUrl or heroTargetDivId are absent, the hero block is
    // silently skipped - details still render normally.
    var heroTargetDiv = (heroHtmlUrl && heroTargetDivId)
      ? document.getElementById(heroTargetDivId)
      : null;

    if (heroHtmlUrl && heroTargetDivId && !heroTargetDiv) {
      console.warn(
        "[SchoolDetails] heroTargetDivId #" + heroTargetDivId + " is configured " +
        "but not found in the DOM. Hero block will be skipped."
      );
    }

    // -- 1d3. Locate the citiesServed target div (optional) ------------------
    // Both citiesServedHtmlUrl and citiesServedTargetDivId must be present
    // for the block to render.  If either is missing it is silently skipped.
    var citiesServedTargetDiv = (citiesServedHtmlUrl && citiesServedTargetDivId)
      ? document.getElementById(citiesServedTargetDivId)
      : null;

    if (citiesServedHtmlUrl && citiesServedTargetDivId && !citiesServedTargetDiv) {
      console.warn(
        "[SchoolDetails] citiesServedTargetDivId #" + citiesServedTargetDivId + " is configured " +
        "but not found in the DOM. CitiesServed block will be skipped."
      );
    }

    // -- 1e. Extract schoolId from the querystring ---------------------------
    var schoolId = getQueryParam("schoolId");

    if (!schoolId) {
      console.error("[SchoolDetails] schoolId querystring parameter is missing from the URL.");
      showError(targetDiv);
      return;
    }

    // -- 1f. Show the loading spinner in the details div ---------------------
    // Hero and CitiesServed divs intentionally have no programmatic spinner —
    // the hero has none by design, and the citiesServed spinner is embedded
    // in the target div markup so that static intro text above it is preserved.
    showSpinner(targetDiv);

    // -- 1g. Fetch data + all templates simultaneously -----------------------
    // All three templates are fetched in one Promise.all call.
    // citiesServed template is only fetched when its target div is present.
    try {
      var fetchPromises = [
        fetchSchoolData(jsonUrl),
        fetchTemplate(htmlUrl),
        heroTargetDiv         ? fetchTemplate(heroHtmlUrl)         : Promise.resolve(null),
        citiesServedTargetDiv ? fetchTemplate(citiesServedHtmlUrl) : Promise.resolve(null)
      ];

      var results               = await Promise.all(fetchPromises);
      var schoolData            = results[0];
      var detailsTemplate       = results[1];
      var heroTemplate          = results[2];
      var citiesServedTemplate  = results[3];

      var school = findSchoolById(schoolData, schoolId);

      if (!school) {
        console.error("[SchoolDetails] No school found with ID = " + schoolId + ".");
        showError(targetDiv);
        if (heroTargetDiv) { heroTargetDiv.innerHTML = ""; }
        return;
      }

      // Build the per-school image base URL by appending the slug
      // to the root S3 path defined in the config.
      // Example: ".../eq-realtor/_schools/" + "dmps" + "/" = ".../dmps/"
      var base      = imageRootUrl.replace(/\/$/, ""); // strip any trailing slash
      var imageBaseUrl = base + "/" + school.urlSlugSchool + "/";

      // Render hero first (sits above details on the page)
      if (heroTargetDiv && heroTemplate) {
        renderHero(school, heroTemplate, heroTargetDiv);
      }

      renderDetails(school, detailsTemplate, targetDiv, imageBaseUrl);

      // Render cities-served card deck (optional block)
      if (citiesServedTargetDiv && citiesServedTemplate) {
        renderCitiesServed(school, citiesServedTemplate, citiesServedTargetDiv, cityImageRootUrl);
      }

    } catch (err) {
      console.error("[SchoolDetails] Failed to load school details:", err);
      showError(targetDiv);
      if (heroTargetDiv)         { heroTargetDiv.innerHTML = ""; }
      if (citiesServedTargetDiv) { citiesServedTargetDiv.innerHTML = ""; }
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
        "[SchoolDetails] Configuration block #" + scriptId + " not found. " +
        "Make sure the CONFIG code block is above the DISPLAY code blocks on the page."
      );
      return null;
    }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[SchoolDetails] Failed to parse configuration JSON:", e);
      return null;
    }
  }


  /* =====================================================================
     3.  QUERYSTRING PARSER
     ===================================================================== */

  /**
   * Extracts a single parameter value from the current page URL querystring.
   * @param  {string} param  - the querystring key to look up
   * @returns {string|null}  - the decoded value, or null if not present
   */
  function getQueryParam(param) {
    var params = new URLSearchParams(window.location.search);
    return params.get(param);
  }


  /* =====================================================================
     4.  DATA FETCH
     ===================================================================== */

  /**
   * Fetches the schools JSON array from S3.
   * Throws on network failure or non-OK HTTP status.
   *
   * @param  {string} url  - absolute URL to the JSON file
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
      throw new Error("[SchoolDetails] Expected a JSON array but received: " + typeof data);
    }

    console.log("[SchoolDetails] Fetched " + data.length + " school record(s).");
    return data;
  }


  /* =====================================================================
     5.  HTML TEMPLATE FETCH
     ===================================================================== */

  /**
   * Fetches an HTML template file as plain text.
   * @param  {string} url  - absolute URL to the HTML template
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
     6.  SCHOOL LOOKUP
     ===================================================================== */

  /**
   * Finds a single school by ID.
   * Uses loose equality (==) to handle the common case where the
   * querystring value is a string ("1") but the JSON ID is a number (1).
   * Note: JSON primary key field is "ID" (all caps) for this component.
   *
   * @param  {Array}        schoolData  - full JSON array
   * @param  {string}       id          - value from the querystring
   * @returns {object|null}             - matched school record, or null
   */
  function findSchoolById(schoolData, id) {
    return schoolData.find(function (school) { return school.ID == id; }) || null;
  }


  /* =====================================================================
     7.  HERO RENDERER
     ===================================================================== */

  /**
   * Renders the hero block.  The hero template already contains the full
   * S3 base URL with [urlSlugSchool] and [Hero] tokens embedded, so a
   * standard token replacement is all that is needed.
   *
   * Schools without a Hero field will produce an empty src attribute,
   * resulting in a browser "image not found" display - acceptable per
   * requirements, as hero image assignment is validated in the workflow.
   *
   * @param  {object}      school       - the matched school record
   * @param  {string}      templateHtml - raw HTML string with [tokens]
   * @param  {HTMLElement} targetDiv    - the DOM node to inject into
   */
  function renderHero(school, templateHtml, targetDiv) {
    var populatedHtml   = replaceTokens(templateHtml, school);
    targetDiv.innerHTML = populatedHtml;
    console.log("[SchoolDetails] Rendered hero for " + school.Name + ".");
  }


  /* =====================================================================
     8.  DETAILS RENDERER
     ===================================================================== */

  /**
   * Replaces all [tokens] in the details template, applies social-media
   * show/hide logic, builds the image gallery, then injects the result
   * into the target div.
   *
   * @param  {object}      school       - the matched school record
   * @param  {string}      templateHtml - raw HTML string with [tokens]
   * @param  {HTMLElement} targetDiv    - the DOM node to inject into
   * @param  {string}      imageBaseUrl - full S3 path for this school's images
   *                                     (imageRootUrl + urlSlugSchool + "/")
   */
  function renderDetails(school, templateHtml, targetDiv, imageBaseUrl) {

    // -- 8a. Resolve image URLs for ThumbnailImage and Logo ------------------
    var resolvedSchool = resolveImageUrls(school, imageBaseUrl);

    // -- 8b. Replace all standard [tokens] -----------------------------------
    var populatedHtml = replaceTokens(templateHtml, resolvedSchool);

    // -- 8c. Parse into a live DOM tree --------------------------------------
    var parser = new DOMParser();
    var doc    = parser.parseFromString(populatedHtml, "text/html");

    // -- 8d. Apply social media show/hide rules ------------------------------
    processSocialRow(doc, resolvedSchool);

    // -- 8e. Build or hide the image gallery ---------------------------------
    processImageGallery(doc, school, imageBaseUrl);

    // -- 8f. Extract rendered body and inject into target div ----------------
    targetDiv.innerHTML = "";
    var content = doc.body;

    while (content.firstChild) {
      targetDiv.appendChild(content.firstChild);
    }

    // -- 8g. Initialise lightbox JS controls ---------------------------------
    // Must run AFTER content is in the live DOM so event listeners can
    // find the gallery elements.
    initLightboxControls(targetDiv);

    console.log("[SchoolDetails] Rendered details for " + school.Name + ".");
  }


  /* =====================================================================
     9.  CITIES SERVED RENDERER
     ===================================================================== */

  /**
   * Builds a vertically stacked card deck from the school's CitiesServed
   * array, or hides the target div entirely if no cities are present.
   *
   * CitiesServed is a native JSON array (not stringified), so no
   * JSON.parse is needed.  Each city object contains:
   *   ID              - City ID; used in the detail-page href
   *   City            - City name displayed on the card
   *   thumbnailImage  - Image filename for the card background
   *   urlSlugCity     - S3 folder name for the city's images
   *
   * Full image URL construction:
   *   cityImageRootUrl + "/" + city.urlSlugCity + "/" + city.thumbnailImage
   *   e.g. ".../eq-realtor/_cities/altoona-2/thumbnail-altoona.webp"
   *
   * A virtual field "thumbnailImageUrl" is added to each city object
   * before token replacement so the template can reference it as
   * [thumbnailImageUrl] without needing to know the base URL.
   *
   * Template fixes applied in display-citiesServed-card-deck.html:
   *   - [Name] corrected to [City] to match JSON field name
   *   - src="[thumbnailImageUrl]" replaces the relative path placeholder
   *   - Stray CSS comment between </style> and <div> removed
   *
   * @param  {object}      school           - the matched school record
   * @param  {string}      templateHtml     - raw HTML string for the card deck
   * @param  {HTMLElement} targetDiv        - the DOM node to inject into
   * @param  {string}      cityImageRootUrl - S3 root path for city images
   */
  function renderCitiesServed(school, templateHtml, targetDiv, cityImageRootUrl) {

    // -- 9a. Validate CitiesServed array ------------------------------------
    var cities = school.CitiesServed;

    if (!cities || !Array.isArray(cities) || cities.length === 0) {
      // Hide the entire block - this school has no associated cities
      targetDiv.style.display = "none";
      console.log("[SchoolDetails] No CitiesServed data for " + school.Name + " - block hidden.");
      return;
    }

    // -- 9b. Parse the template and inject inline styles --------------------
    // The template contains a <style> block for citiesServed-specific CSS.
    // DOMParser moves <style> tags to <head>, so we inject them into the
    // live document head to ensure the styles are applied.
    var parser = new DOMParser();
    var doc    = parser.parseFromString(templateHtml, "text/html");

    var styleEls = doc.querySelectorAll("head style");
    styleEls.forEach(function (styleEl) {
      // Only inject once - check for existing style block by marker attribute
      if (!document.querySelector("style[data-cities-served]")) {
        var liveStyle = document.createElement("style");
        liveStyle.setAttribute("data-cities-served", "true");
        liveStyle.textContent = styleEl.textContent;
        document.head.appendChild(liveStyle);
      }
    });

    // -- 9c. Extract the deck wrapper and the repeating card template --------
    var deckWrapper  = extractCitiesWrapper(doc);
    var cardTemplate = extractCityCardTemplate(doc);

    // -- 9d. Build one card per city ----------------------------------------
    var cityBase = cityImageRootUrl.replace(/\/$/, ""); // strip trailing slash

    cities.forEach(function (city) {

      // Augment the city object with the computed full image URL.
      // The template references this as [thumbnailImageUrl].
      var resolvedCity = Object.assign({}, city);
      resolvedCity.thumbnailImageUrl = cityBase + "/" + city.urlSlugCity + "/" + city.thumbnailImage;

      var cardHtml = replaceTokens(cardTemplate, resolvedCity);

      var temp = document.createElement("div");
      temp.innerHTML = cardHtml.trim();

      while (temp.firstChild) {
        deckWrapper.appendChild(temp.firstChild);
      }
    });

    // -- 9e. Replace tokens in the target div's static content ---------------
    // The target div markup may contain [tokens] in its static intro text
    // (e.g. [Nickname], [Name]).  We replace these using the school object
    // BEFORE injecting the card deck so the intro text is populated.
    // Note: only school-level JSON fields are available here.  City-level
    // fields (e.g. thumbnailImage) live inside the CitiesServed array and
    // will not resolve — use school-level fields in the static markup only.
    targetDiv.innerHTML = replaceTokens(targetDiv.innerHTML, school);

    // -- 9f. Inject the card deck into the designated slot ------------------
    // We target .citiesServed-deck-slot so only the spinner placeholder is
    // replaced, leaving the intro text above it intact.
    var slot = targetDiv.querySelector(".citiesServed-deck-slot");

    if (slot) {
      slot.innerHTML = "";
      slot.appendChild(deckWrapper);
    } else {
      // Fallback: slot not found — append deck to end of target div
      console.warn(
        "[SchoolDetails] .citiesServed-deck-slot not found in #" + targetDiv.id +
        " — appending card deck to end of target div."
      );
      targetDiv.appendChild(deckWrapper);
    }

    console.log("[SchoolDetails] Rendered " + cities.length + " cities-served card(s) for " + school.Name + ".");
  }

  /**
   * Extracts the outer .citiesServed-deck wrapper from the parsed template
   * as a clean empty element ready to receive cards.
   *
   * @param  {Document} doc  - parsed DOMParser document
   * @returns {HTMLElement}  - empty deck wrapper
   */
  function extractCitiesWrapper(doc) {
    var wrapper = doc.querySelector(".citiesServed-deck");

    if (!wrapper) {
      var fallback = document.createElement("div");
      fallback.className = "citiesServed-deck";
      return fallback;
    }

    return wrapper.cloneNode(false); // shallow clone - no children
  }

  /**
   * Extracts the repeating .citiesServed-card markup from the template.
   *
   * @param  {Document} doc  - parsed DOMParser document
   * @returns {string}       - HTML string for one card with [tokens] intact
   */
  function extractCityCardTemplate(doc) {
    var card = doc.querySelector(".citiesServed-card");

    if (!card) {
      throw new Error(
        "[SchoolDetails] Could not find a .citiesServed-card element in the CitiesServed template."
      );
    }

    return card.outerHTML;
  }


  /* =====================================================================
     10.  IMAGE URL RESOLVER
     ===================================================================== */

  /**
   * Returns a shallow copy of the school object with ThumbnailImage and
   * Logo fields prepended with imageBaseUrl if they are filenames rather
   * than fully-qualified URLs.
   *
   * @param  {object} school       - original school record
   * @param  {string} imageBaseUrl - full S3 path for this school's images
   * @returns {object}             - copy with resolved image URLs
   */
  function resolveImageUrls(school, imageBaseUrl) {
    var resolved = Object.assign({}, school);

    if (imageBaseUrl) {
      var base = imageBaseUrl.replace(/\/$/, "");

      if (resolved.ThumbnailImage && resolved.ThumbnailImage.indexOf("http") !== 0) {
        resolved.ThumbnailImage = base + "/" + resolved.ThumbnailImage;
      }
      if (resolved.Logo && resolved.Logo.indexOf("http") !== 0) {
        resolved.Logo = base + "/" + resolved.Logo;
      }
    }

    return resolved;
  }


  /* =====================================================================
     11.  TOKEN REPLACER
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
     12.  SOCIAL ROW PROCESSOR
     ===================================================================== */

  /**
   * Iterates over the seven social media icon divs and hides any whose
   * corresponding URL field is empty or null in the school record.
   *
   * @param  {Document} doc    - the parsed DOMParser document
   * @param  {object}   school - the resolved school record
   */
  function processSocialRow(doc, school) {

    var socialFields = [
      { selector: ".item-facebook",  field: "FacebookURL"  },
      { selector: ".item-x",         field: "TwitterURL"   },
      { selector: ".item-instagram", field: "InstagramURL" },
      { selector: ".item-linkedin",  field: "LinkedInURL"  },
      { selector: ".item-youtube",   field: "YouTubeURL"   },
      { selector: ".item-bluesky",   field: "BlueskyURL"   },
      { selector: ".item-flickr",    field: "FlickrURL"    }
    ];

    socialFields.forEach(function (item) {
      var iconDiv = doc.querySelector(item.selector);
      if (!iconDiv) { return; }

      var url    = school[item.field];
      var hasUrl = url && String(url).trim() !== "";

      if (!hasUrl) {
        iconDiv.style.display = "none";
      }
    });
  }


  /* =====================================================================
     13.  IMAGE GALLERY PROCESSOR
     ===================================================================== */

  /**
   * Builds the CSS masonry lightbox gallery from the school's ImageGallery
   * field, or hides the entire gallery section if no images are present.
   *
   * The ImageGallery field is stored in the JSON as a stringified array
   * (e.g. "[\"img1.jpg\",\"img2.jpg\"]") and must be JSON.parsed first.
   *
   * The lightbox uses the CSS :target pseudo-class - no custom JS needed.
   * Each thumbnail links to href="#gallery-img-N" which triggers
   * .gallery-lightbox:target { display: flex } on the matching overlay.
   *
   * Prev / Next navigation
   * ----------------------
   * Each lightbox overlay contains prev and next anchor links that point
   * to the adjacent #gallery-img-N fragment.  Clicking them changes the
   * :target, which closes the current overlay and opens the adjacent one -
   * pure CSS, no JavaScript.  The prev link is omitted on the first image
   * and the next link is omitted on the last image.
   *
   * @param  {Document} doc          - the parsed DOMParser document
   * @param  {object}   school       - the original (pre-resolved) school record
   * @param  {string}   imageBaseUrl - full S3 path for this school's images
   */
  function processImageGallery(doc, school, imageBaseUrl) {

    var gallerySection = doc.querySelector(".school-image-gallery");
    if (!gallerySection) { return; } // section not in template - skip

    var galleryGrid = doc.querySelector(".gallery-grid");

    // -- Parse the ImageGallery string into a native array ------------------
    var images = [];

    try {
      var raw = school.ImageGallery;
      if (raw && typeof raw === "string" && raw.trim() !== "") {
        images = JSON.parse(raw);
      } else if (Array.isArray(raw)) {
        images = raw;
      }
    } catch (e) {
      console.warn("[SchoolDetails] Could not parse ImageGallery field:", e);
    }

    // -- Hide gallery section if no images ----------------------------------
    if (!images || images.length === 0) {
      gallerySection.style.display = "none";
      return;
    }

    var total = images.length;

    // -- Build gallery HTML -------------------------------------------------
    var base = imageBaseUrl.replace(/\/$/, "");
    var html = "";

    for (var i = 0; i < total; i++) {
      var filename = images[i];
      var imgSrc   = base + "/" + filename;
      var imgId    = "gallery-img-" + i;
      var altText  = school.Name + " image " + (i + 1);

      html += '<div class="gallery-item">';

      // Thumbnail link - JS intercepts click, opens lightbox without scrolling
      html +=   '<a href="#" data-lightbox="open" data-target="' + imgId + '" class="gallery-thumb-link">';
      html +=     '<img src="' + imgSrc + '" alt="' + altText + '" class="gallery-thumb" loading="lazy">';
      html +=   '</a>';

      // Lightbox overlay - shown/hidden via .is-open class (toggled by JS)
      html +=   '<div id="' + imgId + '" class="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Image ' + (i + 1) + ' of ' + total + '">';

      // Close button - JS intercepts, removes .is-open without scrolling
      html +=     '<a href="#" data-lightbox="close" class="gallery-lightbox__close" aria-label="Close lightbox">&times;</a>';

      // Prev button - omitted for the first image
      if (i > 0) {
        html +=   '<a href="#" data-lightbox="prev" data-target="gallery-img-' + (i - 1) + '" class="gallery-lightbox__prev" aria-label="Previous image">&#10094;</a>';
      }

      // Next button - omitted for the last image
      if (i < total - 1) {
        html +=   '<a href="#" data-lightbox="next" data-target="gallery-img-' + (i + 1) + '" class="gallery-lightbox__next" aria-label="Next image">&#10095;</a>';
      }

      // Image counter label (e.g. "3 / 8")
      html +=     '<span class="gallery-lightbox__counter">' + (i + 1) + ' / ' + total + '</span>';

      html +=     '<img src="' + imgSrc + '" alt="' + altText + '" class="gallery-lightbox__img">';
      html +=   '</div>';

      html += '</div>';
    }

    if (galleryGrid) {
      galleryGrid.innerHTML = html;
    }

    console.log("[SchoolDetails] Built image gallery with " + total + " image(s).");
  }


  /* =====================================================================
     14.  LIGHTBOX CONTROLLER
     =====================================================================
     Handles three interactions that cannot be solved with CSS alone:
       1. Opening a lightbox without scrolling the page
       2. Closing a lightbox without scrolling to top (was caused by href="#")
       3. ESC key to close the active lightbox

     Mechanism
     ---------
     Lightboxes are shown/hidden by toggling a .is-open CSS class rather
     than relying on the :target pseudo-class.  All link clicks within the
     gallery are intercepted via event delegation on the container div;
     e.preventDefault() stops the browser's native hash-scroll behavior.

     This function must be called AFTER the gallery HTML is in the live DOM.
     ===================================================================== */

  /**
   * Attaches click (event delegation) and keydown (ESC) handlers to
   * control the lightbox.  Called once per renderDetails() invocation.
   *
   * @param {HTMLElement} container - the details target div containing the gallery
   */
  function initLightboxControls(container) {

    // -- Click handler (event delegation on container) ----------------------
    // Catches clicks on open / close / prev / next controls in one listener.
    container.addEventListener("click", function (e) {

      // Walk up from the clicked element to find a data-lightbox anchor
      var link = e.target;
      while (link && link !== container) {
        if (link.getAttribute && link.getAttribute("data-lightbox")) { break; }
        link = link.parentNode;
      }

      if (!link || !link.getAttribute || !link.getAttribute("data-lightbox")) { return; }

      e.preventDefault(); // prevent hash navigation and page scroll

      var action = link.getAttribute("data-lightbox");
      var target = link.getAttribute("data-target");

      if (action === "open" || action === "prev" || action === "next") {
        openLightbox(container, target);
      } else if (action === "close") {
        closeLightbox(container);
      }
    });

    // -- ESC key handler ----------------------------------------------------
    // Stored as a named function so it can be removed if the component is
    // ever torn down (prevents stacking listeners on repeated renders).
    if (container._lightboxKeyHandler) {
      document.removeEventListener("keydown", container._lightboxKeyHandler);
    }

    container._lightboxKeyHandler = function (e) {
      if (e.key === "Escape") {
        closeLightbox(container);
      }
    };

    document.addEventListener("keydown", container._lightboxKeyHandler);
  }

  /**
   * Opens a specific lightbox by adding .is-open to its element.
   * Closes any currently open lightbox first.
   *
   * @param {HTMLElement} container - the details target div
   * @param {string}      imgId     - the id of the lightbox div to open
   */
  function openLightbox(container, imgId) {
    closeLightbox(container); // ensure only one lightbox is open at a time
    var lightbox = container.querySelector("#" + imgId);
    if (lightbox) {
      lightbox.classList.add("is-open");
    }
  }

  /**
   * Closes the currently open lightbox by removing .is-open.
   * Page scroll position is not affected.
   *
   * @param {HTMLElement} container - the details target div
   */
  function closeLightbox(container) {
    var open = container.querySelector(".gallery-lightbox.is-open");
    if (open) {
      open.classList.remove("is-open");
    }
  }


  /* =====================================================================
     15.  UI HELPERS  (spinner, error, stylesheet injection)
     ===================================================================== */

  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" aria-label="Loading details..."></div>' +
      '</div>';
  }

  function showError(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-warning d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        '<span>Sorry, we cannot locate this school\'s information. ' +
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
