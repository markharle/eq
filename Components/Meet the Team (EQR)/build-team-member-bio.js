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
 * Data-fetching  →  fetchTeamData()      returns the full raw array
 * Member lookup  →  findMemberById()     returns one matched record
 * Rendering      →  renderBio()          writes the bio to the DOM
 * Social icons   →  processSocialRow()   shows/hides each icon div
 *
 * Configuration block expected on the page
 * ----------------------------------------
 * <script type="application/json" id="team-bio-config">
 * {
 *   "jsonUrl":       "https://…/team-members.json",
 *   "jsUrl":         "https://…/build-team-member-bio.js",
 *   "htmlUrl":       "https://…/display-team-member-bio.html",
 *   "cssUrl":        "https://…/team-member-bio.css",
 *   "bootstrapUrl":  "https://cdn.jsdelivr.net/…/bootstrap.min.css",
 *   "imageBaseUrl":  "https://YOUR-BUCKET.s3.amazonaws.com/eq-realtor/",
 *   "targetDivId":   "team-member-bio"
 * }
 * </script>
 *
 * URL querystring parameter
 * -------------------------
 * TeamMemberId  — integer ID matching the "Id" field in the JSON
 * Example: /dev-team-member-details?TeamMemberId=1
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP — wait for DOM, then kick off the component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initBio);

  async function initBio() {

    // -- 1a. Parse the configuration block ----------------------------------
    const config = loadConfig("team-bio-config");
    if (!config) return; // loadConfig() already logged the error

    const { jsonUrl, htmlUrl, cssUrl, bootstrapUrl, imageBaseUrl, targetDivId } = config;

    // -- 1b. Validate required fields ----------------------------------------
    if (!jsonUrl || !htmlUrl || !targetDivId) {
      console.error(
        "[TeamBio] Configuration is missing one or more required fields: " +
        "jsonUrl, htmlUrl, targetDivId."
      );
      return;
    }

    // -- 1c. Inject CSS assets (non-blocking) --------------------------------
    if (bootstrapUrl) injectStylesheet(bootstrapUrl);
    if (cssUrl)       injectStylesheet(cssUrl);

    // -- 1d. Locate the target div -------------------------------------------
    const targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) {
      console.error(`[TeamBio] Target div #${targetDivId} not found in the DOM.`);
      return;
    }

    // -- 1e. Extract TeamMemberId from the querystring -----------------------
    const memberId = getQueryParam("TeamMemberId");

    if (!memberId) {
      console.error("[TeamBio] TeamMemberId querystring parameter is missing from the URL.");
      showError(targetDiv);
      return;
    }

    // -- 1f. Show the loading spinner ----------------------------------------
    showSpinner(targetDiv);

    // -- 1g. Fetch data + template simultaneously, then render ---------------
    try {
      const [teamData, templateHtml] = await Promise.all([
        fetchTeamData(jsonUrl),
        fetchTemplate(htmlUrl)
      ]);

      const member = findMemberById(teamData, memberId);

      if (!member) {
        console.error(`[TeamBio] No team member found with Id = ${memberId}.`);
        showError(targetDiv);
        return;
      }

      renderBio(member, templateHtml, targetDiv, imageBaseUrl);

    } catch (err) {
      console.error("[TeamBio] Failed to load team member bio:", err);
      showError(targetDiv);
    }
  }


  /* =====================================================================
     2.  CONFIG LOADER
     ===================================================================== */

  /**
   * Reads and parses the JSON configuration block embedded on the page.
   * @param  {string} scriptId  — the id attribute of the <script> block
   * @returns {object|null}     — parsed config object, or null on failure
   */
  function loadConfig(scriptId) {
    const configEl = document.getElementById(scriptId);

    if (!configEl) {
      console.error(
        `[TeamBio] Configuration block #${scriptId} not found. ` +
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
   * Extracts a single parameter value from the current page's URL querystring.
   * Uses the native URLSearchParams API for reliable, encoded-value handling.
   *
   * @param  {string} param  — the querystring key to look up
   * @returns {string|null}  — the decoded value, or null if not present
   */
  function getQueryParam(param) {
    const params = new URLSearchParams(window.location.search);
    return params.get(param);
  }


  /* =====================================================================
     4.  DATA FETCH  (same pattern as card deck — reusable across components)
     ===================================================================== */

  /**
   * Fetches the team-members JSON array from S3.
   * Throws on network failure or non-OK HTTP status.
   *
   * @param  {string} url  — absolute URL to the JSON file
   * @returns {Promise<Array>}
   */
  async function fetchTeamData(url) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Network response was not OK — status ${response.status} fetching ${url}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("[TeamBio] Expected a JSON array but received: " + typeof data);
    }

    console.log(`[TeamBio] Fetched ${data.length} team member record(s).`);
    return data;
  }


  /* =====================================================================
     5.  HTML TEMPLATE FETCH
     ===================================================================== */

  /**
   * Fetches the bio HTML template as plain text.
   * @param  {string} url  — absolute URL to the HTML template
   * @returns {Promise<string>}
   */
  async function fetchTemplate(url) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Network response was not OK — status ${response.status} fetching template ${url}`
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
   * @param  {Array}        teamData  — full JSON array
   * @param  {string}       id        — value from the querystring
   * @returns {object|null}           — matched member record, or null
   */
  function findMemberById(teamData, id) {
    return teamData.find(member => member.Id == id) || null;
  }


  /* =====================================================================
     7.  BIO RENDERER
     ===================================================================== */

  /**
   * Replaces all [tokens] in the bio template with the team member's data,
   * applies special social-media show/hide logic, then injects the result
   * into the target div.
   *
   * @param  {object}      member       — the matched team member record
   * @param  {string}      templateHtml — raw HTML string with [tokens]
   * @param  {HTMLElement} targetDiv    — the DOM node to inject into
   * @param  {string}      imageBaseUrl — S3 base URL prepended to image filenames
   */
  function renderBio(member, templateHtml, targetDiv, imageBaseUrl) {

    // -- 7a. Resolve image URLs ----------------------------------------------
    // Headshot and Logo values in the JSON are filenames only (e.g. "Eric-Quiner.jpg").
    // Prepend the S3 base URL so <img src="…"> is a valid absolute URL.
    // If imageBaseUrl is not configured, the filename is used as-is.
    const resolvedMember = Object.assign({}, member);

    if (imageBaseUrl) {
      const base = imageBaseUrl.replace(/\/$/, ""); // strip any trailing slash
      if (resolvedMember.Headshot && !resolvedMember.Headshot.startsWith("http")) {
        resolvedMember.Headshot = `${base}/${resolvedMember.Headshot}`;
      }
      if (resolvedMember.Logo && !resolvedMember.Logo.startsWith("http")) {
        resolvedMember.Logo = `${base}/${resolvedMember.Logo}`;
      }
    }

    // -- 7b. Replace all standard [tokens] -----------------------------------
    const populatedHtml = replaceTokens(templateHtml, resolvedMember);

    // -- 7c. Parse the populated HTML into a live DOM tree -------------------
    const parser = new DOMParser();
    const doc = parser.parseFromString(populatedHtml, "text/html");

    // -- 7d. Apply social media show/hide rules ------------------------------
    processSocialRow(doc, resolvedMember);

    // -- 7e. Extract the rendered body and inject into the target div --------
    // We want everything inside <body>, not the full document wrapper.
    targetDiv.innerHTML = "";
    const bioContent = doc.body;

    while (bioContent.firstChild) {
      targetDiv.appendChild(bioContent.firstChild);
    }

    console.log(`[TeamBio] Rendered bio for ${member.FirstName} ${member.LastName}.`);
  }


  /* =====================================================================
     8.  TOKEN REPLACER
     ===================================================================== */

  /**
   * Replaces every [FieldName] token in a string with the matching value
   * from the team member data object.
   *
   * Tokens are case-sensitive and must match JSON field names exactly.
   * Missing/null/undefined fields produce an empty string.
   *
   * @param  {string} template — HTML string containing [tokens]
   * @param  {object} member   — one team member record
   * @returns {string}         — HTML string with tokens replaced
   */
  function replaceTokens(template, member) {
    return template.replace(/\[([^\]]+)\]/g, (match, key) => {
      const value = member[key];
      if (value === null || value === undefined) return "";
      return String(value);
    });
  }


  /* =====================================================================
     9.  SOCIAL ROW PROCESSOR
     ===================================================================== */

  /**
   * Iterates over the four social media icon divs and hides any whose
   * corresponding URL field is empty or null in the team member record.
   *
   * Per BRD §10.2.2.d:
   *   - If the URL field has a value  → the icon displays normally.
   *   - If the URL field is null/empty → the entire icon div is hidden
   *     (display: none) so it takes up no space in the social row.
   *
   * @param  {Document} doc     — the parsed DOMParser document
   * @param  {object}   member  — the resolved team member record
   */
  function processSocialRow(doc, member) {

    // Map: CSS class on the icon div  →  JSON field name
    const socialFields = [
      { selector: ".item-facebook",  field: "FacebookURL"  },
      { selector: ".item-x",         field: "TwitterURL"   },
      { selector: ".item-instagram", field: "InstagramURL" },
      { selector: ".item-linkedin",  field: "LinkedInURL"  }
    ];

    socialFields.forEach(({ selector, field }) => {
      const iconDiv = doc.querySelector(selector);
      if (!iconDiv) return; // div not present in template — skip

      const url = member[field];
      const hasUrl = url && String(url).trim() !== "";

      if (!hasUrl) {
        // Hide the entire icon div — no space consumed in the row
        iconDiv.style.display = "none";
      }
      // If the URL is present, replaceTokens() above already set the href;
      // nothing further to do.
    });
  }


  /* =====================================================================
     10.  UI HELPERS  (spinner, error, stylesheet injection)
     ===================================================================== */

  /**
   * Replaces the target div contents with the CSS spinner while data loads.
   * Uses the .ripple-ring-spinner class defined in team-member-bio.css.
   */
  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" aria-label="Loading bio…"></div>' +
      '</div>';
  }

  /**
   * Replaces the target div with a Bootstrap 5 warning alert on error.
   * Mirrors the requirement in BRD §10.2.2.e–g.
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
   * already present — prevents duplicate loads on repeated navigation.
   * @param {string} href — absolute URL to the CSS file
   */
  function injectStylesheet(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;

    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

})(); // end IIFE
