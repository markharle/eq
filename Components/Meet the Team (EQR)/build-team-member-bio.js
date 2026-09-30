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
 * REVISION NOTE — custom "not found" markup + failure-path cleanup
 * -----------------------------------------------------------------------
 * Any failure to resolve a team member (missing TeamMemberId param, no
 * matching record, or a fetch/network error) now fetches and injects a
 * configurable custom template (config key "notFoundHtmlUrl") into the
 * main bio div, instead of a hardcoded plain-text message — falls back
 * to that plain text if the template isn't configured or fails to load.
 * See fetchTemplateSafe()/showError() below. Same pattern as the
 * Neighborhood/City/School components, with its own dedicated
 * not-found template.
 *
 * ALSO FIXED: previously, a failure showed the SAME plain-text error
 * alert box in BOTH the hero div and the bio div — two stacked,
 * redundant error messages. The hero now simply clears to empty on any
 * failure, matching the convention used elsewhere, so there is exactly
 * ONE error message shown (in the main bio div).
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
 *   "notFoundHtmlUrl":  "https://...display-eqr-team-member-not-found.html",
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
    var htmlUrl          = config.htmlUrl;
    var notFoundHtmlUrl  = config.notFoundHtmlUrl;
    var cssUrl           = config.cssUrl;
    var bootstrapUrl     = config.bootstrapUrl;
    var imageBaseUrl     = config.imageBaseUrl;
    var targetDivId      = config.targetDivId;
    var heroHtmlUrl      = config.heroHtmlUrl;
    var heroTargetDivId  = config.heroTargetDivId;

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

    // -- 1c2. Fetch the custom "not found" template early and independently --
    // Needed by THREE different failure paths below (missing param, no
    // matching record, fetch error), including one that happens before
    // any other fetch is attempted. fetchTemplateSafe() resolves to null
    // on any failure rather than throwing, so a broken/unset
    // notFoundHtmlUrl falls back to the plain-text message in showError()
    // instead of leaving the page broken.
    var notFoundTemplate = notFoundHtmlUrl
      ? await fetchTemplateSafe(notFoundHtmlUrl)
      : null;

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
      showError(targetDiv, notFoundTemplate, memberId);
      if (heroTargetDiv) { heroTargetDiv.innerHTML = ""; }
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
        showError(targetDiv, notFoundTemplate, memberId);
        if (heroTargetDiv) { heroTargetDiv.innerHTML = ""; }
        return;
      }

      // Render hero first (sits above bio on the page)
      if (heroTargetDiv && heroTemplateHtml) {
        renderHero(member, heroTemplateHtml, heroTargetDiv, imageBaseUrl);
      }

      renderBio(member, bioTemplateHtml, targetDiv, imageBaseUrl);

    } catch (err) {
      console.error("[TeamBio] Failed to load team member bio:", err);
      showError(targetDiv, notFoundTemplate, memberId);
      if (heroTargetDiv) { heroTargetDiv.innerHTML = ""; }
    }
  }


  /* =====================================================================
     2.  CONFIG LOADER
     ===================================================================== */

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

  function getQueryParam(param) {
    var params = new URLSearchParams(window.location.search);
    return params.get(param);
  }


  /* =====================================================================
     4.  DATA FETCH
     ===================================================================== */

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
   * broken/unset URL for THAT template must not prevent showError() from
   * still showing something (the plain-text fallback).
   */
  async function fetchTemplateSafe(url) {
    try {
      return await fetchTemplate(url);
    } catch (err) {
      console.warn(
        "[TeamBio] Could not load the custom not-found template " +
        "(falling back to the default message):", err
      );
      return null;
    }
  }


  /* =====================================================================
     6.  MEMBER LOOKUP
     ===================================================================== */

  /**
   * Finds a single team member by Id. Uses loose equality (==) to handle
   * the common case where the querystring value is a string ("1") but
   * the JSON Id is a number (1). Field is "Id" (capital I only) —
   * confirmed against a real teamMemberJSON.json sample.
   */
  function findMemberById(teamData, id) {
    return teamData.find(function (member) { return member.Id == id; }) || null;
  }


  /* =====================================================================
     7.  HERO RENDERER
     ===================================================================== */

  function renderHero(member, templateHtml, targetDiv, imageBaseUrl) {
    var resolvedMember = resolveImageUrls(member, imageBaseUrl);
    var populatedHtml  = replaceTokens(templateHtml, resolvedMember);
    targetDiv.innerHTML = populatedHtml;
    console.log("[TeamBio] Rendered hero for " + member.FirstName + " " + member.LastName + ".");
  }


  /* =====================================================================
     8.  BIO RENDERER
     ===================================================================== */

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

  function resolveImageUrls(member, imageBaseUrl) {
    var resolved = Object.assign({}, member);

    if (imageBaseUrl) {
      var base = imageBaseUrl.replace(/\/$/, "");
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
   * from the supplied data object — a team member record, or (for the
   * not-found template) a small object like { requestedId: "99" }.
   * Tokens are case-sensitive. Missing/null/undefined fields produce an
   * empty string.
   */
  function replaceTokens(template, data) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = data[key];
      if (value === null || value === undefined) { return ""; }
      return String(value);
    });
  }


  /* =====================================================================
     11.  SOCIAL ROW PROCESSOR
     ===================================================================== */

  function processSocialRow(doc, member) {

    var socialFields = [
      { selector: ".item-facebook",  field: "FacebookURL"  },
      { selector: ".item-x",         field: "TwitterURL"   },
      { selector: ".item-instagram", field: "InstagramURL" },
      { selector: ".item-linkedin",  field: "LinkedInURL"  }
    ];

    socialFields.forEach(function (item) {
      var iconDiv = doc.querySelector(item.selector);
      if (!iconDiv) { return; }

      var url    = member[item.field];
      var hasUrl = url && String(url).trim() !== "";

      if (!hasUrl) {
        iconDiv.style.display = "none";
      }
    });
  }


  /* =====================================================================
     12.  UI HELPERS  (spinner, error, stylesheet injection)
     ===================================================================== */

  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" aria-label="Loading..."></div>' +
      '</div>';
  }

  /**
   * Shows the "not found" state inside targetDiv. If notFoundTemplate was
   * successfully fetched, it's token-replaced (with [requestedId]
   * available for the template to optionally reference) and injected.
   * Falls back to the original plain-text message if no template was
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
        '<span>Sorry, we cannot locate this Team Member\'s information. ' +
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
