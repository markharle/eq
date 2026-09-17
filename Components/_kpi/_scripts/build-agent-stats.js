/**
 * build-agent-stats.js
 * -----------------------------------------------------------------------
 * Fetches the single, global EQR_KPIs.json object and writes its four
 * values into whichever of the four stat elements are present on the
 * current page:
 *
 *   #yearsExperience   <- YearsExperience    (formatted "16+")
 *   #totalSalesVolume  <- TotalSalesVolume   (formatted "$147m")
 *   #totalClients      <- TotalClients       (formatted "652")
 *   #averageSalesPrice <- AverageSalesPrice  (formatted "$375k")
 *
 * These four numbers are intentionally GLOBAL (not neighborhood- or
 * city-specific) — the source JSON is a single object, not an array, so
 * there's no record lookup by ID. This script does not depend on
 * NeighborhoodID/CityID and can run on any page that includes the four
 * target elements: neighborhood pages, city pages, an About page, etc.
 *
 * REVISION NOTE — two triggers, not one
 * -----------------------------------------------------------------------
 * The four target elements now live inside a template
 * (display-our-track-record.html) that build-neighborhood-details.js
 * fetches and injects ASYNCHRONOUSLY, often after this script's own
 * DOMContentLoaded handler has already run and found nothing. So this
 * script listens for BOTH:
 *   - "DOMContentLoaded"          (covers pages where the four elements
 *                                  are already static in the markup)
 *   - "eqr:trackRecordRendered"   (a custom event build-neighborhood-
 *                                  details.js dispatches right after it
 *                                  injects the track-record template)
 * A simple "already ran" guard prevents fetching/populating twice if,
 * for some reason, both end up finding the elements present.
 *
 * Configuration block expected in the page header
 * ------------------------------------------------
 * <script type="application/json" id="agent-stats-config">
 * {
 *   "jsonUrl": "https://eq-realtor.s3.us-east-2.amazonaws.com/eq-realtor/EQR_KPIs.json"
 * }
 * </script>
 *
 * If none of the four target elements exist yet at the time either
 * trigger fires, the script exits quietly without fetching — so it's
 * safe to load globally (e.g. in site-wide header injection) without a
 * network cost on pages that never end up using these stats.
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  var STAT_ELEMENT_IDS = {
    yearsExperience:   "yearsExperience",
    totalSalesVolume:  "totalSalesVolume",
    totalClients:      "totalClients",
    averageSalesPrice: "averageSalesPrice"
  };

  var hasRun = false;

  document.addEventListener("DOMContentLoaded", tryInitAgentStats);
  document.addEventListener("eqr:trackRecordRendered", tryInitAgentStats);

  /**
   * Guards against double-fetching if both triggers end up firing after
   * the elements exist (e.g. a page that has them static in markup AND
   * later re-dispatches the event for some other reason).
   */
  function tryInitAgentStats() {
    if (hasRun) { return; }

    var hasAnyTarget = Object.keys(STAT_ELEMENT_IDS).some(function (key) {
      return document.getElementById(STAT_ELEMENT_IDS[key]) !== null;
    });
    if (!hasAnyTarget) { return; } // don't set hasRun — allow the other trigger to retry

    hasRun = true;
    initAgentStats();
  }

  async function initAgentStats() {

    var config = loadConfig("agent-stats-config");
    if (!config || !config.jsonUrl) {
      console.error(
        "[AgentStats] Configuration block #agent-stats-config is missing " +
        "or has no jsonUrl."
      );
      return;
    }

    try {
      var stats = await fetchStats(config.jsonUrl);
      populateStats(stats);
    } catch (err) {
      console.error("[AgentStats] Failed to load agent stats:", err);
    }
  }

  /* =====================================================================
     CONFIG LOADER
     ===================================================================== */
  function loadConfig(scriptId) {
    var el = document.getElementById(scriptId);
    if (!el) {
      console.error("[AgentStats] Config block #" + scriptId + " not found.");
      return null;
    }
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      console.error("[AgentStats] Failed to parse config JSON:", e);
      return null;
    }
  }

  /* =====================================================================
     DATA FETCH
     ===================================================================== */
  async function fetchStats(url) {
    var response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching " + url
      );
    }
    return response.json();
  }

  /* =====================================================================
     POPULATE
     ===================================================================== */
  function populateStats(stats) {
    setText(STAT_ELEMENT_IDS.yearsExperience,   formatYears(stats.YearsExperience));
    setText(STAT_ELEMENT_IDS.totalSalesVolume,  formatCompactCurrency(stats.TotalSalesVolume));
    setText(STAT_ELEMENT_IDS.totalClients,      formatCount(stats.TotalClients));
    setText(STAT_ELEMENT_IDS.averageSalesPrice, formatCompactCurrency(stats.AverageSalesPrice));

    console.log(
      "[AgentStats] Populated agent stats" +
      (stats.LastUpdated ? " (as of " + stats.LastUpdated + ")." : ".")
    );
  }

  function setText(elementId, text) {
    var el = document.getElementById(elementId);
    if (el) { el.textContent = text; }
  }

  /* =====================================================================
     FORMATTERS
     ===================================================================== */

  function formatYears(value) {
    if (value === null || value === undefined || value === "") { return ""; }
    return value + "+";
  }

  function formatCount(value) {
    if (value === null || value === undefined || isNaN(value)) { return ""; }
    return Number(value).toLocaleString("en-US");
  }

  /**
   * Compact currency formatter matching the site's established KPI
   * style (lowercase suffix, no decimals): millions -> "$147m",
   * thousands -> "$375k". Falls back to a plain dollar amount below
   * $1,000.
   */
  function formatCompactCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) { return ""; }
    var num = Number(value);
    var abs = Math.abs(num);

    if (abs >= 1000000) { return "$" + Math.round(num / 1000000) + "m"; }
    if (abs >= 1000)    { return "$" + Math.round(num / 1000) + "k"; }
    return "$" + Math.round(num).toLocaleString("en-US");
  }

})(); // end IIFE
