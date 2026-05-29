/**
 * build-team-member-card-deck.js
 * -----------------------------------------------------------------------
 * Reads configuration from a <script type="application/json"> block on
 * the page, then fetches the team-member JSON data and the HTML card
 * template simultaneously.  Each JSON record is used to replace [tokens]
 * in a clone of the template, and the resulting cards are injected into
 * the configured target div.
 *
 * Architecture note
 * -----------------
 * Data-fetching  →  fetchTeamData()      returns the raw array
 * Filtering      →  applyFilters()       returns a filtered array
 * Rendering      →  renderCardDeck()     writes cards to the DOM
 *
 * Keeping fetch and render separate means future components can call
 * fetchTeamData() independently (e.g. for client-side search / sort)
 * without re-fetching on every interaction.
 *
 * Configuration block expected on the page
 * ----------------------------------------
 * <script type="application/json" id="team-card-deck-config">
 * {
 *   "jsonUrl":       "https://…/team-members.json",
 *   "jsUrl":         "https://…/build-team-member-card-deck.js",
 *   "htmlUrl":       "https://…/display-team-member-card-deck.html",
 *   "cssUrl":        "https://…/team-member-bio.css",
 *   "bootstrapUrl":  "https://cdn.jsdelivr.net/…/bootstrap.min.css",
 *   "targetDivId":   "team-member-card-deck",
 *   "filters": [
 *     { "field": "StatusID", "operator": "eq", "value": 1 }
 *   ]
 * }
 * </script>
 *
 * Supported filter operators: eq, neq, gt, gte, lt, lte, contains
 * Multiple filter objects are combined with AND logic by default.
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP — wait for DOM, then kick off the component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initCardDeck);

  async function initCardDeck() {

    // -- 1a. Parse the configuration block ----------------------------------
    const config = loadConfig("team-card-deck-config");
    if (!config) return; // loadConfig() already logged the error

    const { jsonUrl, htmlUrl, cssUrl, bootstrapUrl, targetDivId, filters } = config;

    // -- 1b. Validate required fields ----------------------------------------
    if (!jsonUrl || !htmlUrl || !targetDivId) {
      console.error(
        "[TeamCardDeck] Configuration is missing one or more required fields: " +
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
      console.error(`[TeamCardDeck] Target div #${targetDivId} not found in the DOM.`);
      return;
    }

    // -- 1e. Show the loading spinner ----------------------------------------
    showSpinner(targetDiv);

    // -- 1f. Fetch data + template, then render ------------------------------
    try {
      const [teamData, templateHtml] = await Promise.all([
        fetchTeamData(jsonUrl),
        fetchTemplate(htmlUrl)
      ]);

      const filteredData = applyFilters(teamData, filters);
      renderCardDeck(filteredData, templateHtml, targetDiv);

    } catch (err) {
      console.error("[TeamCardDeck] Failed to load team member data:", err);
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
        `[TeamCardDeck] Configuration block #${scriptId} not found. ` +
        "Make sure the CONFIG code block is above the DISPLAY code block on the page."
      );
      return null;
    }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[TeamCardDeck] Failed to parse configuration JSON:", e);
      return null;
    }
  }


  /* =====================================================================
     3.  DATA FETCH  (kept separate so it can be reused for search/filter)
     ===================================================================== */

  /**
   * Fetches the team-members JSON from the provided URL.
   * Throws on network failure or non-OK HTTP status so the caller can
   * catch and display a friendly error message.
   *
   * @param  {string} url  — absolute URL to the JSON file on S3
   * @returns {Promise<Array>}  — resolves to the parsed array of team members
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
      throw new Error("[TeamCardDeck] Expected a JSON array but received: " + typeof data);
    }

    console.log(`[TeamCardDeck] Fetched ${data.length} team member record(s).`);
    return data;
  }


  /* =====================================================================
     4.  HTML TEMPLATE FETCH
     ===================================================================== */

  /**
   * Fetches the HTML card template as plain text.
   * @param  {string} url  — absolute URL to the HTML template on S3
   * @returns {Promise<string>}  — raw HTML string
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
     5.  FILTER ENGINE
     ===================================================================== */

  /**
   * Applies an array of filter rules to the data set.
   * All rules are combined with AND logic (every rule must pass).
   *
   * Supported operators:
   *   eq        — strict equality          (field == value)
   *   neq       — not equal                (field != value)
   *   gt        — greater than             (field > value)
   *   gte       — greater than or equal    (field >= value)
   *   lt        — less than                (field < value)
   *   lte       — less than or equal       (field <= value)
   *   contains  — substring match          (String(field).includes(value))
   *
   * @param  {Array}        data     — full team member array
   * @param  {Array|null}   filters  — array of { field, operator, value }
   * @returns {Array}                — filtered array
   */
  function applyFilters(data, filters) {
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return data; // no filtering configured — return everything
    }

    return data.filter(member =>
      filters.every(rule => evaluateRule(member, rule))
    );
  }

  /**
   * Evaluates a single filter rule against one team member record.
   * @param  {object} member  — one record from the JSON array
   * @param  {object} rule    — { field, operator, value }
   * @returns {boolean}
   */
  function evaluateRule(member, rule) {
    const { field, operator, value } = rule;
    const memberValue = member[field];

    switch (operator) {
      case "eq":       return memberValue == value;        // loose equality covers "1" vs 1
      case "neq":      return memberValue != value;
      case "gt":       return memberValue >  value;
      case "gte":      return memberValue >= value;
      case "lt":       return memberValue <  value;
      case "lte":      return memberValue <= value;
      case "contains": return String(memberValue).toLowerCase()
                              .includes(String(value).toLowerCase());
      default:
        console.warn(`[TeamCardDeck] Unknown filter operator "${operator}" — rule ignored.`);
        return true; // unknown operator → don't exclude the record
    }
  }


  /* =====================================================================
     6.  CARD DECK RENDERER
     ===================================================================== */

  /**
   * Clones the card HTML template for each team member, replaces [tokens],
   * and injects the complete card deck into the target div.
   *
   * @param  {Array}       teamData     — filtered array of team member objects
   * @param  {string}      templateHtml — raw HTML string for one card
   * @param  {HTMLElement} targetDiv    — the DOM node to inject into
   */
  function renderCardDeck(teamData, templateHtml, targetDiv) {

    // Clear spinner / previous content
    targetDiv.innerHTML = "";

    if (teamData.length === 0) {
      targetDiv.innerHTML =
        '<div class="alert alert-info">No team members found.</div>';
      return;
    }

    // Build a document fragment for a single DOM write
    const fragment = document.createDocumentFragment();

    // Outer wrapper — extractDeckWrapper() returns an HTMLElement directly;
    // assigning it to innerHTML would stringify it as "[object HTMLDivElement]",
    // so we use it as a node reference instead.
    const deckWrapper = extractDeckWrapper(templateHtml);

    // Extract the repeating card markup from the template
    const cardTemplate = extractCardTemplate(templateHtml);

    teamData.forEach(member => {
      const cardHtml = replaceTokens(cardTemplate, member);

      // Parse the HTML string into a real DOM node
      const temp = document.createElement("div");
      temp.innerHTML = cardHtml.trim();

      // Append each card child into the deck wrapper
      while (temp.firstChild) {
        deckWrapper.appendChild(temp.firstChild);
      }
    });

    fragment.appendChild(deckWrapper);
    targetDiv.appendChild(fragment);

    console.log(`[TeamCardDeck] Rendered ${teamData.length} card(s) into #${targetDiv.id}.`);
  }

  /**
   * Extracts the outer wrapper element (<div class="team-deck …">) opening tag
   * from the template so we can use it as the deck container.
   *
   * The template stores the full outer div; we strip the card markup from it,
   * leaving an empty grid wrapper ready to receive cards.
   *
   * @param  {string} html  — raw template HTML
   * @returns {HTMLElement} — empty deck wrapper element
   */
  function extractDeckWrapper(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const wrapper = doc.querySelector(".team-deck");

    if (!wrapper) {
      // Fallback: return a generic wrapper
      const fallback = document.createElement("div");
      fallback.className = "team-deck desktop-cols-3";
      return fallback;
    }

    // Return a clone with children removed — cards will be added per-member
    const clean = wrapper.cloneNode(false); // shallow clone = no children
    return clean;
  }

  /**
   * Extracts the repeating card markup (.team-card div) from the template.
   * @param  {string} html  — raw template HTML
   * @returns {string}      — HTML string for one card with [tokens] intact
   */
  function extractCardTemplate(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const card = doc.querySelector(".team-card");

    if (!card) {
      throw new Error(
        "[TeamCardDeck] Could not find a .team-card element in the HTML template."
      );
    }

    return card.outerHTML;
  }


  /* =====================================================================
     7.  TOKEN REPLACER
     ===================================================================== */

  /**
   * Replaces every [FieldName] token in a string with the matching value
   * from the team member data object.
   *
   * Tokens are case-sensitive and must match JSON field names exactly.
   * Missing fields produce an empty string (never "undefined").
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
     8.  UI HELPERS  (spinner, error, stylesheet injection)
     ===================================================================== */

  /**
   * Replaces the target div contents with the CSS spinner while data loads.
   * Uses the .ripple-ring-spinner class defined in team-member-bio.css.
   */
  function showSpinner(targetDiv) {
    targetDiv.innerHTML =
      '<div class="d-flex justify-content-center align-items-center py-5">' +
        '<div class="spinner ripple-ring-spinner" role="status" aria-label="Loading team members…"></div>' +
      '</div>';
  }

  /**
   * Replaces the target div with a Bootstrap 5 warning alert on error.
   * Mirrors the requirement in BRD §10.1.2.e.
   */
  function showError(targetDiv) {
    targetDiv.innerHTML =
      '<div class="alert alert-warning d-flex align-items-center gap-2" role="alert">' +
        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
        '<span>Sorry, we cannot locate the Team Member information. ' +
        'Please <a href="/contact" class="alert-link">Contact Us</a> for assistance.</span>' +
      '</div>';
  }

  /**
   * Dynamically injects a <link rel="stylesheet"> into <head> if it is
   * not already present (prevents duplicate loads on SPA-style navigation).
   * @param {string} href — absolute URL to the CSS file
   */
  function injectStylesheet(href) {
    if (document.querySelector(`link[href="${href}"]`)) return; // already loaded

    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

})(); // end IIFE
