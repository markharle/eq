/**
 * team-member-card-deck.js
 * Renders the Team Member card deck by fetching JSON data and an HTML template,
 * then injecting populated cards into the configured target div.
 *
 * Hosted on GitHub and delivered via jsDelivr CDN.
 * Dependencies: Bootstrap 5 (already loaded on site)
 */

(function () {
  'use strict';

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Safely read the CONFIG object injected by the Squarespace code block.
   * Throws a descriptive error if the global is missing.
   */
  function getConfig() {
    if (typeof window.TEAM_CARD_CONFIG === 'undefined') {
      throw new Error(
        '[TeamCardDeck] window.TEAM_CARD_CONFIG is not defined. ' +
        'Ensure the CONFIG block runs before this script.'
      );
    }
    const cfg = window.TEAM_CARD_CONFIG;
    const required = ['jsonUrl', 'htmlUrl', 'targetDivId'];
    required.forEach(function (key) {
      if (!cfg[key]) {
        throw new Error('[TeamCardDeck] CONFIG is missing required field: ' + key);
      }
    });
    return cfg;
  }

  /**
   * Fetch a URL and return the response text.
   * Adds a cache-busting timestamp so Squarespace / CDN never serves stale JSON.
   */
  async function fetchText(url, bustCache) {
    const finalUrl = bustCache ? url + '?_=' + Date.now() : url;
    const response = await fetch(finalUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        '[TeamCardDeck] Failed to fetch ' + finalUrl +
        ' — HTTP ' + response.status
      );
    }
    return response.text();
  }

  /**
   * Evaluate a single filter rule against a record.
   * Rule shape: { field, operator, value }
   * Supported operators: '==' | '!=' | '>' | '>=' | '<' | '<='
   */
  function evaluateRule(record, rule) {
    const fieldVal = record[rule.field];
    const ruleVal  = rule.value;
    switch (rule.operator) {
      case '==':  return fieldVal == ruleVal;   // loose equality intentional (string vs number)
      case '!=':  return fieldVal != ruleVal;
      case '>':   return fieldVal >  ruleVal;
      case '>=':  return fieldVal >= ruleVal;
      case '<':   return fieldVal <  ruleVal;
      case '<=':  return fieldVal <= ruleVal;
      default:
        console.warn('[TeamCardDeck] Unknown operator "' + rule.operator + '" — rule skipped.');
        return true;
    }
  }

  /**
   * Apply the optional filter config to the full member array.
   *
   * CONFIG.filter shape (all fields optional):
   * {
   *   logic: 'AND' | 'OR',          // default 'AND'
   *   rules: [
   *     { field: 'Status', operator: '==', value: 1 },
   *     { field: 'EQRMember', operator: '==', value: 2 }
   *   ]
   * }
   */
  function applyFilter(members, filter) {
    if (!filter || !Array.isArray(filter.rules) || filter.rules.length === 0) {
      return members;
    }
    const logic = (filter.logic || 'AND').toUpperCase();
    return members.filter(function (member) {
      if (logic === 'OR') {
        return filter.rules.some(function (rule) { return evaluateRule(member, rule); });
      }
      // Default: AND
      return filter.rules.every(function (rule) { return evaluateRule(member, rule); });
    });
  }

  /**
   * Extract the repeatable card template block from the full HTML template.
   * Looks for <!-- START_REPEAT --> … <!-- END_REPEAT --> markers.
   */
  function extractRepeatBlock(html) {
    const startMarker = '<!-- START_REPEAT -->';
    const endMarker   = '<!-- END_REPEAT -->';
    const startIdx = html.indexOf(startMarker);
    const endIdx   = html.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1) {
      throw new Error(
        '[TeamCardDeck] HTML template is missing <!-- START_REPEAT --> or <!-- END_REPEAT --> markers.'
      );
    }
    return {
      before:  html.substring(0, startIdx),
      repeat:  html.substring(startIdx + startMarker.length, endIdx),
      after:   html.substring(endIdx + endMarker.length)
    };
  }

  /**
   * Replace all [Placeholder] tokens in a template string with values
   * from the data record.  Tokens are case-sensitive and must match JSON keys.
   */
  function populateTemplate(template, record) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        // Encode values placed inside HTML attributes to prevent XSS
        return String(record[key]);
      }
      console.warn('[TeamCardDeck] No JSON field found for template token: ' + match);
      return '';
    });
  }

  /**
   * Inject an optional CSS file into <head> if not already present.
   */
  function injectCss(cssUrl) {
    if (!cssUrl) return;
    if (document.querySelector('link[href="' + cssUrl + '"]')) return; // already loaded
    const link  = document.createElement('link');
    link.rel    = 'stylesheet';
    link.href   = cssUrl;
    document.head.appendChild(link);
    console.info('[TeamCardDeck] CSS injected:', cssUrl);
  }

  // ─── Main ───────────────────────────────────────────────────────────────────

  async function init() {
    let cfg;
    try {
      cfg = getConfig();
    } catch (err) {
      console.error(err.message);
      return;
    }

    const targetEl = document.getElementById(cfg.targetDivId);
    if (!targetEl) {
      console.error(
        '[TeamCardDeck] Target div #' + cfg.targetDivId + ' not found in the DOM. ' +
        'Ensure the code block TARGET DIV is present on this page.'
      );
      return;
    }

    // Show a loading indicator while fetching
    targetEl.innerHTML = '<p class="team-deck__loading">Loading team members…</p>';

    try {
      // 1. Inject CSS (non-blocking visual dependency)
      injectCss(cfg.cssUrl);

      // 2. Fetch JSON data and HTML template in parallel
      const [jsonText, htmlText] = await Promise.all([
        fetchText(cfg.jsonUrl, true),
        fetchText(cfg.htmlUrl, false)
      ]);

      // 3. Parse JSON
      let allMembers;
      try {
        allMembers = JSON.parse(jsonText);
      } catch (parseErr) {
        throw new Error('[TeamCardDeck] JSON parse error: ' + parseErr.message);
      }
      if (!Array.isArray(allMembers)) {
        throw new Error('[TeamCardDeck] JSON data is not an array.');
      }

      // 4. Apply optional filter
      const members = applyFilter(allMembers, cfg.filter);
      console.info('[TeamCardDeck] Members after filter: ' + members.length + ' of ' + allMembers.length);

      if (members.length === 0) {
        targetEl.innerHTML = '<p class="team-deck__empty">No team members to display.</p>';
        return;
      }

      // 5. Extract template blocks
      const { before, repeat, after } = extractRepeatBlock(htmlText);

      // 6. Build card HTML for each member
      const cardsHtml = members.map(function (member) {
        return populateTemplate(repeat, member);
      }).join('\n');

      // 7. Inject final HTML into target div
      targetEl.innerHTML = before + cardsHtml + after;
      console.info('[TeamCardDeck] Card deck rendered successfully.');

    } catch (err) {
      console.error(err.message);
      targetEl.innerHTML =
        '<p class="team-deck__error">Unable to load team members. Please try again later.</p>';
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
