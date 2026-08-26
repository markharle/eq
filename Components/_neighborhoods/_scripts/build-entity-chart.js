/**
 * build-entity-chart.js
 * -----------------------------------------------------------------------
 * Reads configuration from the same <script type="application/json">
 * config block as the parent details script (e.g., neighborhood-details-config
 * or city-details-config), fetches the chart data JSON and the chart
 * configuration JSON simultaneously, then:
 *
 *   1. Finds the matching entity record by the URL querystring ID
 *   2. Formats currentValue and change for the chart text template
 *   3. Populates the chart text target div via token replacement
 *   4. Renders a Chart.js line graph in the chart canvas element
 *
 * This file is intentionally named "build-entity-chart" (not
 * "build-neighborhood-chart") so that the same script handles charts
 * on both Neighborhood pages (NeighborhoodID parameter) and City pages
 * (CityID parameter). The URL parameter is detected automatically.
 *
 * Architecture note
 * -----------------
 * Library loading  ->  loadChartJs()           ensures Chart.js is ready
 * Data-fetching    ->  fetchChartData()         returns entity chart array
 *                  ->  fetchChartConfig()       returns chart config object
 * Matching         ->  findEntityById()         finds record by ID param
 * Formatting       ->  formatCurrentValue()     $257,449
 *                  ->  formatChange()           <span>up 2.90%</span>
 * Rendering        ->  populateChartText()      token replacement in text div
 *                  ->  renderChart()            Chart.js initialization
 *
 * Configuration block read by this script (shared with details script)
 * -----------------------------------------------------------------------
 * "jsonUrlChart":                  "https://...neighborhoodsChartJSON.json",
 * "jsonUrlChartConfig":            "https://...chartConfig.json",
 * "chartJsUrl":                    "https://cdn.jsdelivr.net/npm/chart.js"  (optional)
 * "marketAnalysisChartTextTargetDivId": "market-analysis-chart-text",
 * "marketAnalysisChartTextHtmlURL":     "https://...display-market-analysis-chart-text.html",
 * "marketAnalysisChartTargetCanvasId":  "market-analysis-history-chart"
 *
 * URL querystring detection (automatic)
 * -----------------------------------------------------------------------
 * Neighborhood page: ?NeighborhoodID=2  -> reads NeighborhoodID, matches JSON ID
 * City page:         ?CityID=12         -> reads CityID, matches JSON ID
 * The matching field in the JSON is always "ID" (uppercase) in both files.
 *
 * Token reference for display-market-analysis-chart-text.html
 * -----------------------------------------------------------------------
 * [entity]       - neighborhood or city name
 * [date]         - "as of" date string from JSON (e.g., "Q2 2026")
 * [currentValue] - formatted average home value (e.g., "$257,449")
 * [change]       - formatted change span (e.g., <span class="...">up 2.90%</span>)
 *
 * Change formatting rules
 * -----------------------------------------------------------------------
 * Positive or zero: <span class="price-change-positive">up X.XX%</span>
 * Negative:         <span class="price-change-negative">down X.XX%</span>
 * The absolute value is always used for the percentage display.
 * Example: -0.08 -> <span class="price-change-negative">down 8.00%</span>
 *
 * NOTE: The canvas ID in the config must exactly match the id attribute
 * in the Squarespace code block wrapper HTML.
 * "market-analysis-history-chart" is the correct spelling.
 * -----------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* =====================================================================
     1.  BOOTSTRAP - wait for DOM, then kick off the chart component
     ===================================================================== */
  document.addEventListener("DOMContentLoaded", initChart);

  async function initChart() {

    // -- 1a. Detect which config block to read ------------------------------
    // This script shares the config block with the parent details script.
    // Try neighborhood config first, then city config as fallback.
    var config = loadConfig("neighborhood-details-config") ||
                 loadConfig("city-details-config");

    if (!config) {
      console.error(
        "[EntityChart] No recognised config block found. " +
        "Expected neighborhood-details-config or city-details-config."
      );
      return;
    }

    var jsonUrlChart                       = config.jsonUrlChart;
    var jsonUrlChartConfig                 = config.jsonUrlChartConfig;
    var chartJsUrl                         = config.chartJsUrl;
    var chartTextTargetDivId               = config.marketAnalysisChartTextTargetDivId;
    var chartTextHtmlUrl                   = config.marketAnalysisChartTextHtmlURL;
    var chartCanvasId                      = config.marketAnalysisChartTargetCanvasId;

    // -- 1b. Validate required fields ----------------------------------------
    if (!jsonUrlChart || !chartCanvasId) {
      console.error(
        "[EntityChart] Missing required config fields: " +
        "jsonUrlChart, marketAnalysisChartTargetCanvasId."
      );
      return;
    }

    // -- 1c. Detect the entity ID from the URL querystring ------------------
    // Support both NeighborhoodID (neighborhood pages) and CityID (city pages).
    var entityId = getQueryParam("NeighborhoodID") || getQueryParam("CityID");

    if (!entityId) {
      console.error(
        "[EntityChart] No NeighborhoodID or CityID querystring parameter found."
      );
      return;
    }

    try {
      // -- 1d. Ensure Chart.js is available before proceeding ---------------
      await loadChartJs(chartJsUrl);

      // -- 1e. Fetch chart data, chart config, and text template in parallel -
      var fetchPromises = [
        fetchChartData(jsonUrlChart),
        jsonUrlChartConfig ? fetchChartConfig(jsonUrlChartConfig) : Promise.resolve(null),
        (chartTextTargetDivId && chartTextHtmlUrl)
          ? fetchTemplate(chartTextHtmlUrl)
          : Promise.resolve(null)
      ];

      var results       = await Promise.all(fetchPromises);
      var allChartData  = results[0];
      var chartConfig   = results[1];
      var chartTextHtml = results[2];

      // -- 1f. Find the matching entity record --------------------------------
      var entityRecord = findEntityById(allChartData, entityId);

      if (!entityRecord) {
        console.warn(
          "[EntityChart] No chart record found for ID = " + entityId + ". " +
          "Chart will not render."
        );
        return;
      }

      // -- 1g. Populate the chart text div ------------------------------------
      if (chartTextTargetDivId && chartTextHtml) {
        var chartTextDiv = document.getElementById(chartTextTargetDivId);
        if (chartTextDiv) {
          populateChartText(entityRecord, chartTextHtml, chartTextDiv);
        } else {
          console.warn(
            "[EntityChart] Chart text div #" + chartTextTargetDivId + " not found."
          );
        }
      }

      // -- 1h. Render the Chart.js line graph ---------------------------------
      renderChart(entityRecord, chartConfig, chartCanvasId);

    } catch (err) {
      console.error("[EntityChart] Failed to initialize chart:", err);
    }
  }


  /* =====================================================================
     2.  CONFIG LOADER
     ===================================================================== */

  function loadConfig(scriptId) {
    var configEl = document.getElementById(scriptId);
    if (!configEl) { return null; }

    try {
      return JSON.parse(configEl.textContent);
    } catch (e) {
      console.error("[EntityChart] Failed to parse config block #" + scriptId + ":", e);
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
     4.  CHART.JS LIBRARY LOADER
     ===================================================================== */

  /**
   * Ensures Chart.js (window.Chart) is available before the chart renders.
   *
   * If Chart.js is already present (loaded globally or by a prior script),
   * resolves immediately without a network request.
   *
   * If Chart.js is not present and chartJsUrl is configured, loads it
   * dynamically and waits for it to be ready.
   *
   * If Chart.js is absent and no URL is configured, rejects with a clear
   * error — add "chartJsUrl" to the config to enable dynamic loading.
   *
   * @param  {string|undefined} chartJsUrl
   * @returns {Promise}
   */
  function loadChartJs(chartJsUrl) {
    return new Promise(function (resolve, reject) {

      if (window.Chart) {
        console.log("[EntityChart] Chart.js already available.");
        resolve();
        return;
      }

      if (!chartJsUrl) {
        reject(
          new Error(
            "[EntityChart] Chart.js is not loaded and no chartJsUrl is configured. " +
            "Add chartJsUrl to the config or load Chart.js globally."
          )
        );
        return;
      }

      console.log("[EntityChart] Dynamically loading Chart.js from " + chartJsUrl);

      var script    = document.createElement("script");
      script.src    = chartJsUrl;
      script.onload = function () {
        console.log("[EntityChart] Chart.js loaded successfully.");
        resolve();
      };
      script.onerror = function () {
        reject(new Error("[EntityChart] Failed to load Chart.js from " + chartJsUrl));
      };
      document.head.appendChild(script);
    });
  }


  /* =====================================================================
     5.  DATA FETCHES
     ===================================================================== */

  async function fetchChartData(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching " + url
      );
    }

    var data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("[EntityChart] Expected a JSON array but received: " + typeof data);
    }

    console.log("[EntityChart] Fetched " + data.length + " chart record(s).");
    return data;
  }

  async function fetchChartConfig(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Network response was not OK - status " + response.status + " fetching chart config " + url
      );
    }

    var config = await response.json();
    console.log("[EntityChart] Chart config loaded.");
    return config;
  }

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
     6.  ENTITY LOOKUP
     ===================================================================== */

  /**
   * Finds the matching chart record by ID.
   * Uses loose equality (==) so the querystring string "2" matches JSON
   * number 2.  The JSON field is "ID" (all caps) in both neighborhood
   * and city chart JSON files.
   */
  function findEntityById(chartData, id) {
    return chartData.find(function (record) { return record.ID == id; }) || null;
  }


  /* =====================================================================
     7.  VALUE FORMATTERS
     ===================================================================== */

  /**
   * Formats currentValue as a USD currency string with comma separators.
   * Example: 257449 -> "$257,449"
   *
   * @param  {number} value
   * @returns {string}
   */
  function formatCurrentValue(value) {
    return new Intl.NumberFormat("en-US", {
      style:                 "currency",
      currency:              "USD",
      maximumFractionDigits: 0
    }).format(value);
  }

  /**
   * Formats the change field as a colored, directional percentage span.
   *
   * Rules:
   *   Positive or zero -> <span class="price-change-positive">up X.XX%</span>
   *   Negative         -> <span class="price-change-negative">down X.XX%</span>
   *
   * The absolute value is always used for the percentage digit.
   * Examples:
   *    0.029 -> <span class="price-change-positive">up 2.90%</span>
   *   -0.015 -> <span class="price-change-negative">down 1.50%</span>
   *   -0.08  -> <span class="price-change-negative">down 8.00%</span>
   *
   * @param  {number} change - raw decimal change value from JSON
   * @returns {string}       - HTML span string
   */
  function formatChange(change) {
    var isPositive  = change >= 0;
    var direction   = isPositive ? "up" : "down";
    var cssClass    = isPositive ? "price-change-positive" : "price-change-negative";
    var percentage  = (Math.abs(change) * 100).toFixed(2) + "%";

    return '<span class="' + cssClass + '">' + direction + " " + percentage + "</span>";
  }


  /* =====================================================================
     8.  CHART TEXT POPULATOR
     ===================================================================== */

  /**
   * Augments the entity record with formatted values, then uses standard
   * token replacement to populate the chart text template.
   *
   * Tokens resolved:
   *   [entity]       -> entityRecord.entity
   *   [date]         -> entityRecord.date
   *   [currentValue] -> formatted currency string  (e.g., "$257,449")
   *   [change]       -> formatted change span      (e.g., <span>up 2.90%</span>)
   *
   * @param  {object}      entityRecord - the matched chart JSON record
   * @param  {string}      templateHtml - raw HTML from chart text template
   * @param  {HTMLElement} targetDiv    - the chart text target div
   */
  function populateChartText(entityRecord, templateHtml, targetDiv) {

    // Augment with formatted values before token replacement
    var resolved = Object.assign({}, entityRecord);
    resolved.currentValue = formatCurrentValue(entityRecord.currentValue);
    resolved.change       = formatChange(entityRecord.change);

    var populatedHtml   = replaceTokens(templateHtml, resolved);
    targetDiv.innerHTML = populatedHtml;

    console.log(
      "[EntityChart] Chart text populated for " + entityRecord.entity + "."
    );
  }


  /* =====================================================================
     9.  TOKEN REPLACER
     ===================================================================== */

  function replaceTokens(template, record) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      var value = record[key];
      if (value === null || value === undefined) { return ""; }
      return String(value);
    });
  }


  /* =====================================================================
     10.  CHART RENDERER
     ===================================================================== */

  /**
   * Initializes the Chart.js line graph on the configured canvas element.
   *
   * Chart display options are read from chartConfig (loaded from
   * chartConfig.json on S3). If chartConfig is null (fetch was skipped or
   * failed), sensible defaults are used so the chart always renders.
   *
   * The historicalData field is a key-value object of { "year": value }.
   * Keys are sorted chronologically before plotting.
   *
   * @param  {object}      entityRecord - the matched chart JSON record
   * @param  {object|null} chartConfig  - options from chartConfig.json
   * @param  {string}      canvasId     - the canvas element ID
   */
  function renderChart(entityRecord, chartConfig, canvasId) {

    var canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error(
        "[EntityChart] Canvas element #" + canvasId + " not found. " +
        "Check that marketAnalysisChartTargetCanvasId in the config matches " +
        "the id attribute in the Squarespace code block."
      );
      return;
    }

    var historicalData = entityRecord.historicalData;
    if (!historicalData) {
      console.error("[EntityChart] historicalData not found in record for " + entityRecord.entity);
      return;
    }

    // Sort year keys chronologically and extract values
    var labels = Object.keys(historicalData).sort();
    var values = labels.map(function (year) { return historicalData[year]; });

    // Merge chartConfig with defaults
    // Functions (tooltip/tick callbacks) cannot live in JSON so are
    // always applied here, using config values where relevant.
    var cfg = chartConfig || {};

    new Chart(canvas, {
      type: "line",
      data: {
        labels:   labels,
        datasets: [{
          label:                "Market Value",
          data:                 values,
          borderColor:          cfg.borderColor          || "#3181FF",
          backgroundColor:      cfg.backgroundColor      || "transparent",
          borderWidth:          cfg.borderWidth          || 1,
          pointStyle:           cfg.pointStyle           || "circle",
          pointBackgroundColor: cfg.pointBackgroundColor || "#3181FF",
          pointBorderColor:     cfg.pointBorderColor     || "#3181FF",
          pointRadius:          cfg.pointRadius          !== undefined ? cfg.pointRadius : 2,
          pointHoverRadius:     cfg.pointHoverRadius     !== undefined ? cfg.pointHoverRadius : 6,
          fill:                 cfg.fill                 !== undefined ? cfg.fill : true,
          tension:              cfg.tension              !== undefined ? cfg.tension : 0.1
        }]
      },
      options: {
        responsive:          cfg.responsive          !== undefined ? cfg.responsive : true,
        maintainAspectRatio: cfg.maintainAspectRatio !== undefined ? cfg.maintainAspectRatio : false,
        plugins: {
          legend: {
            display: cfg.legendDisplay !== undefined ? cfg.legendDisplay : false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                var label = context.dataset.label || "";
                if (label) { label += ": "; }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat("en-US", {
                    style:                 "currency",
                    currency:              cfg.currencyCode || "USD",
                    maximumFractionDigits: 0
                  }).format(context.parsed.y);
                }
                return label;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: cfg.yBeginAtZero !== undefined ? cfg.yBeginAtZero : false,
            ticks: {
              callback: function (value) {
                return new Intl.NumberFormat("en-US", {
                  style:          "currency",
                  currency:       cfg.currencyCode   || "USD",
                  notation:       cfg.tickNotation   || "compact",
                  compactDisplay: cfg.compactDisplay || "short",
                  maximumFractionDigits: 0
                }).format(value);
              }
            }
          },
          x: {
            grid: {
              display: cfg.xGridDisplay !== undefined ? cfg.xGridDisplay : false
            }
          }
        }
      }
    });

    console.log("[EntityChart] Chart rendered for " + entityRecord.entity + ".");
  }

})(); // end IIFE
