/**
 * build-team-member-bio.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block on
 * the page, extracts the TeamMemberId querystring parameter from the URL,
 * then fetches the team-member JSON and the bio HTML template
 * simultaneously.  The matching team member's data is used to replace
 * [tokens] in the template, with special handling for optional social
 * media icon divs (hidden when the URL field is empty/null).
 *
 * Architecture note
 * -----------------
 * Data-fetching  ->  fetchTeamData()      returns the full raw array
 * Member lookup  ->  findMemberById()     returns one matched record
 * Rendering      ->  renderHero()         writes the hero block to the DOM
 *                ->  renderBio()          writes the bio block to the DOM
 * Social icons   ->  processSocialRow()   shows/hides each icon div
 *
 * Configuration block expected on the page
 * ----------------------------------------
 * <script type="application/json" id="team-bio-config">
 * {
 *   "jsonUrl":          "https://...team-members.json",
 *   "jsUrl":            "https://...build-team-member-bio.js",
 *   "htmlUrl":          "https://...display-team-member-bio.html",
 *   "cssUrl":           "https://...team-member-bio.css",
 *   "bootstrapUrl":     "https://cdn.jsdelivr.net/.../bootstrap.min.css",
 *   "imageBaseUrl":     "https://YOUR-BUCKET.s3.amazonaws.com/eq-realtor",
 *   "targetDivId":      "team-member-bio",
 *   "heroHtmlUrl":      "https://...display-team-member-hero.html",
 *   "heroTargetDivId":  "team-member-hero"
 * }
 * </script>
 *
 * Adding a new content block to this page
 * ----------------------------------------
 * Follow this four-step pattern for any new block (e.g. a pull-quote,
 * a stats panel, a related listings strip):
 *
 *   Step 1 - HTML template
 *     Create display-team-member-BLOCKNAME.html with [tokens] where
 *     dynamic values should appear.
 *
 *   Step 2 - CONFIG keys (in the existing config block)
 *     Add "blocknameHtmlUrl"     - S3 URL to the new template file
 *     Add "blocknameTargetDivId" - the id of the div that will receive it
 *
 *   Step 3 - JS render function
 *     Add renderBlockname(member, templateHtml, targetDiv, imageBaseUrl)
 *     following the same shape as renderBio() / renderHero() below.
 *     If the block needs special token logic (like social show/hide),
 *     add a dedicated processor function for it.
 *
 *   Step 4 - Squarespace DISPLAY code block
 *     Add a new Code Block on the page at the position you want it to
 *     appear. Paste in the target div and spinner markup, using the
 *     blocknameTargetDivId value as the div id.
 *     The single CONFIG code block and single <script src> tag
 *     already on the page do not need to change.
 *
 * URL querystring parameter
 * -------------------------
 * TeamMemberId  - integer ID matching the "Id" field in the JSON
 * Example: /dev-team-member-details?TeamMemberId=1
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP - wait for DOM, then kick off the component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initBio);

  async function initBio() {

    // -- 1a. Parse the configuration block ----------------------------------
    var config = loadConfig("team-bio-config");
    if (!config) return; // loadConfig() already logged the error

    var jsonUrl         = config.jsonUrl;
    var htmlUrl         = config.htmlUrl;
    var cssUrl          = config.cssUrl;
    var bootstrapUrl    = config.bootstrapUrl;
    var imageBaseUrl    = config.imageBaseUrl;
    var targetDivId     = config.targetDivId;
    var heroHtmlUrl     = config.heroHtmlUrl;
    var heroTargetDivId = config.heroTargetDivId;

    // -- 1b. Validate required fields ----------------------------------------
    if (!jsonUrl || !htmlUrl || !targetDivId) {
      console.error(
        "[TeamBio] Configuration is missing one or more required fields: " +
        "jsonUrl, htmlUrl, targetDivId."
      );
      return;
    }

    // -- 1c. Inject CSS assets (non-blocking) --------------------------------
    if (bootstrapUrl) { injectStylesheet(bootstrapUrl); }
    if (cssUrl)       { injectStylesheet(cssUrl); }

    // -- 1d. Locate the bio target div ---------------------------------------
    var targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) {
      console.error("[TeamBio] Target div #" + targetDivId + " not found in the DOM.");
      return;
    }

    // -- 1d2. Locate the hero target div (optional) --------------------------
    // heroHtmlUrl and heroTargetDivId are both required to render the hero.
    // If either is absent the hero block is silently skipped - the bio still
    // renders normally.  This keeps the config backward-compatible.
    var heroTargetDiv = (heroHtmlUrl && heroTargetDivId)
      ? document.getElementById(heroTargetDivId)
      : null;

    if (heroHtmlUrl && heroTargetDivId && !heroTargetDiv) {
      console.warn(
        "[TeamBio] heroTargetDivId #" + heroTargetDivId + " is configured but " +
        "not found in the DOM. Hero block will be skipped."
      );
    }

    // -- 1e. Extract TeamMemberId from the querystring -----------------------
    var memberId = getQueryParam("TeamMemberId");

    if (!memberId) {
      console.error("[TeamBio] TeamMemberId querystring parameter is missing from the URL.");
      showError(targetDiv);
      return;
    }

    // -- 1f. Show the loading spinner in each active block -------------------
    showSpinner(targetDiv);
    if (heroTargetDiv) { showSpinner(heroTargetDiv); }

    // -- 1g. Fetch data + all templates simultaneously, then render ----------
    // Build the fetch array dynamically so heroHtmlUrl is only fetched when
    // the hero block is actually configured and its target div exists.
    try {
      var fetchPromises = [
        fetchTeamData(jsonUrl),
        fetchTemplate(htmlUrl),
        heroTargetDiv ? fetchTemplate(heroHtmlUrl) : Promise.resolve(null)
      ];

      var results          = await Promise.all(fetchPromises);
      var teamData         = results[0];
      var bioTemplateHtml  = results[1];
      var heroTemplateHtml = results[2];

      var member = findMemberById(teamData, memberId);

      if (!member) {
        console.error("[TeamBio] No team member found with Id = " + memberId + ".");
        showError(targetDiv);
        if (heroTargetDiv) { showError(heroTargetDiv); }
        return;
      }

      // Render hero first (sits above bio on the page)
      if (heroTargetDiv && heroTemplateHtml) {
        renderHero(member, heroTemplateHtml, heroTargetDiv, imageBaseUrl);
      }

      renderBio(member, bioTemplateHtml, targetDiv, imageBaseUrl);

    } catch (err) {
      console.error("[TeamBio] Failed to load team member bio:", err);
      showError(targetDiv);
      if (heroTargetDiv) { showError(heroTargetDiv); }
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
        "[TeamBio] Configuration block #" + scriptId + " not found. " +
        "Make sure the CONFIG code block is above the DISPLAY code block on the page."
      );
      return null;
    }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[TeamBio] Failed to parse configuration JSON:", e);
      return null;
    }
  }


  /* =====================================================================
     3.  QUERYSTRING PARSER
     ===================================================================== */

  /**
   * Extracts a single parameter value from the current page URL querystring.
   * Uses the native URLSearchParams API for reliable encoded-value handling.
   *
   * @param  {string} param  - the querystring key to look up
   * @returns {string|null}  - the decoded value, or null if not present
   */
  function getQueryParam(param) {
    var params = new URLSearchParams(window.location.search);
    return params.get(param);
  }


  /* =====================================================================
     4.  DATA FETCH  (same pattern as card deck - reusable across components)
     ===================================================================== */

  /**
   * Fetches the team-members JSON array from S3.
   * Throws on network failure or non-OK HTTP status.
   *
   * @param  {string} url  - absolute URL to the JSON file
   * @returns {Promise<Array>}
   */
  async function fetchTeamData(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching " + url
      );
    }

    var data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("[TeamBio] Expected a JSON array but received: " + typeof data);
    }

    console.log("[TeamBio] Fetched " + data.length + " team member record(s).");
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
     6.  MEMBER LOOKUP
     ===================================================================== */

  /**
   * Finds a single team member by Id.
   * Uses loose equality (==) to handle the common case where the
   * querystring value is a string ("1") but the JSON Id is a number (1).
   *
   * @param  {Array}        teamData  - full JSON array
   * @param  {string}       id        - value from the querystring
   * @returns {object|null}           - matched member record, or null
   */
  function findMemberById(teamData, id) {
    return teamData.find(function (member) { return member.Id == id; }) || null;
  }


  /* =====================================================================
     7.  HERO RENDERER
     ===================================================================== */

  /**
   * Renders the hero content block - lightweight token-replace with no
   * special processing needed (no social row, no complex image logic).
   * Image URL resolution is included for forward-compatibility in case a
   * future hero template references [Headshot] or another image field.
   *
   * @param  {object}      member       - the matched team member record
   * @param  {string}      templateHtml - raw HTML string with [tokens]
   * @param  {HTMLElement} targetDiv    - the DOM node to inject into
   * @param  {string}      imageBaseUrl - S3 base URL prepended to image filenames
   */
  function renderHero(member, templateHtml, targetDiv, imageBaseUrl) {
    var resolvedMember = resolveImageUrls(member, imageBaseUrl);
    var populatedHtml  = replaceTokens(templateHtml, resolvedMember);
    targetDiv.innerHTML = populatedHtml;
    console.log("[TeamBio] Rendered hero for " + member.FirstName + " " + member.LastName + ".");
  }


  /* =====================================================================
     8.  BIO RENDERER
     ===================================================================== */

  /**
   * Replaces all [tokens] in the bio template with the team member's data,
   * applies special social-media show/hide logic, then injects the result
   * into the target div.
   *
   * @param  {object}      member       - the matched team member record
   * @param  {string}      templateHtml - raw HTML string with [tokens]
   * @param  {HTMLElement} targetDiv    - the DOM node to inject into
   * @param  {string}      imageBaseUrl - S3 base URL prepended to image filenames
   */
  function renderBio(member, templateHtml, targetDiv, imageBaseUrl) {

    // -- 8a. Resolve image URLs ----------------------------------------------
    var resolvedMember = resolveImageUrls(member, imageBaseUrl);

    // -- 8b. Replace all standard [tokens] -----------------------------------
    var populatedHtml = replaceTokens(templateHtml, resolvedMember);

    // -- 8c. Parse the populated HTML into a live DOM tree -------------------
    var parser = new DOMParser();
    var doc    = parser.parseFromString(populatedHtml, "text/html");

    // -- 8d. Apply social media show/hide rules ------------------------------
    processSocialRow(doc, resolvedMember);

    // -- 8e. Extract the rendered body and inject into the target div --------
    // We want everything inside <body>, not the full document wrapper.
    targetDiv.innerHTML = "";
    var bioContent = doc.body;

    while (bioContent.firstChild) {
      targetDiv.appendChild(bioContent.firstChild);
    }

    console.log("[TeamBio] Rendered bio for " + member.FirstName + " " + member.LastName + ".");
  }


  /* =====================================================================
     9.  IMAGE URL RESOLVER  (shared by renderHero and renderBio)
     ===================================================================== */

  /**
   * Returns a shallow copy of the member object with Headshot and Logo
   * fields prepended with the S3 imageBaseUrl when they are filenames
   * rather than fully-qualified URLs.
   *
   * @param  {object} member       - original team member record
   * @param  {string} imageBaseUrl - S3 base path from config (may be empty)
   * @returns {object}             - copy with resolved image URLs
   */
  function resolveImageUrls(member, imageBaseUrl) {
    var resolved = Object.assign({}, member);

    if (imageBaseUrl) {
      var base = imageBaseUrl.replace(/\/$/, ""); // strip any trailing slash
      if (resolved.Headshot && resolved.Headshot.indexOf("http") !== 0) {
        resolved.Headshot = base + "/" + resolved.Headshot;
      }
      if (resolved.Logo && resolved.Logo.indexOf("http") !== 0) {
        resolved.Logo = base + "/" + resolved.Logo;
      }
    }

    return resolved;
  }


  /* =====================================================================
     10.  TOKEN REPLACER
     ===================================================================== */

  /**
   * Replaces every [FieldName] token in a string with the matching value
   * from the team member data object.
   *
   * Tokens are case-sensitive and must match JSON field names exactly.
   * Missing/null/undefined fields produce an empty string.
   *
   * @param  {string} template - HTML string containing [tokens]
   * @param  {object} member   - one team member record
   * @returns {string}         - HTML string with tokens replaced
   */
  function replaceTokens(template, member) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = member[key];
      if (value === null || value === undefined) { return ""; }
      return String(value);
    });
  }


  /* =====================================================================
     11.  SOCIAL ROW PROCESSOR
     ===================================================================== */

  /**
   * Iterates over the four social media icon divs and hides any whose
   * corresponding URL field is empty or null in the team member record.
   *
   * - If the URL field has a value  -> the icon displays normally.
   * - If the URL field is null/empty -> the entire icon div is hidden
   *   (display: none) so it takes up no space in the social row.
   *
   * @param  {Document} doc     - the parsed DOMParser document
   * @param  {object}   member  - the resolved team member record
   */
  function processSocialRow(doc, member) {

    var socialFields = [
      { selector: ".item-facebook",  field: "FacebookURL"  },
      { selector: ".item-x",         field: "TwitterURL"   },
      { selector: ".item-instagram", field: "InstagramURL" },
      { selector: ".item-linkedin",  field: "LinkedInURL"  }
    ];

    socialFields.forEach(function (item) {
      var iconDiv = doc.querySelector(item.selector);
      if (!iconDiv) { return; } // div not present in template - skip

      var url    = member[item.field];
      var hasUrl = url && String(url).trim() !== "";

      if (!hasUrl) {
        // Hide the entire icon div - no space consumed in the row
        iconDiv.style.display = "none";
      }
      // If the URL is present, replaceTokens() above already set the href.
    });
  }


  /* =====================================================================
     12.  UI HELPERS  (spinner, error, stylesheet injection)
     ===================================================================== */

  /**
   * Replaces the target div contents with the CSS spinner while data loads.
   * Uses the .ripple-ring-spinner class defined in team-member-bio.css.
   */
  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" aria-label="Loading..."></div>' +
      '</div>';
  }

  /**
   * Replaces the target div with a Bootstrap 5 warning alert on error.
   */
  function showError(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-warning d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        '<span>Sorry, we cannot locate this Team Member\'s information. ' +
        'Please <a href="/contact" class="alert-link">Contact Us</a> for assistance.</span>' +
      '</div>';
  }

  /**
   * Dynamically injects a <link rel="stylesheet"> into <head> if not
   * already present - prevents duplicate loads on repeated navigation.
   * @param {string} href - absolute URL to the CSS file
   */
  function injectStylesheet(href) {
    if (document.querySelector('link[href="' + href + '"]')) { return; }

    var link  = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

})(); // end IIFE
