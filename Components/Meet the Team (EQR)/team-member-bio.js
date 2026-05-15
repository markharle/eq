/**
 * team-member-bio.js
 * Reads a URL parameter to identify the requested Team Member, fetches the
 * JSON data and HTML template, then injects the member's bio into the
 * configured target div on the Squarespace details page.
 *
 * Hosted on GitHub and delivered via jsDelivr CDN.
 * Dependencies: Bootstrap 5 (already loaded on site)
 */

(function () {
  'use strict';

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Safely read the CONFIG object injected by the Squarespace code block.
   */
  function getConfig() {
    if (typeof window.TEAM_BIO_CONFIG === 'undefined') {
      throw new Error(
        '[TeamMemberBio] window.TEAM_BIO_CONFIG is not defined. ' +
        'Ensure the CONFIG block runs before this script.'
      );
    }
    const cfg = window.TEAM_BIO_CONFIG;
    const required = ['jsonUrl', 'urlParamKey', 'htmlUrl', 'targetDivId'];
    required.forEach(function (key) {
      if (!cfg[key]) {
        throw new Error('[TeamMemberBio] CONFIG is missing required field: ' + key);
      }
    });
    return cfg;
  }

  /**
   * Read a query-string parameter value from the current page URL.
   * Squarespace uses the hash-based pattern: #wm-popup=/path?Key=Value
   * This function checks both window.location.search and window.location.hash.
   */
  function getUrlParam(key) {
    // 1. Standard query string: ?TeamMemberId=1
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has(key)) {
      return searchParams.get(key);
    }

    // 2. Hash-based pattern used by Squarespace popups:
    //    #wm-popup=/team-member/details?TeamMemberId=1
    const hash = window.location.hash;
    if (hash) {
      const hashQuery = hash.indexOf('?');
      if (hashQuery !== -1) {
        const hashParams = new URLSearchParams(hash.substring(hashQuery));
        if (hashParams.has(key)) {
          return hashParams.get(key);
        }
      }
    }

    return null;
  }

  /**
   * Fetch a URL and return the response text.
   */
  async function fetchText(url, bustCache) {
    const finalUrl = bustCache ? url + '?_=' + Date.now() : url;
    const response = await fetch(finalUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        '[TeamMemberBio] Failed to fetch ' + finalUrl +
        ' — HTTP ' + response.status
      );
    }
    return response.text();
  }

  /**
   * Replace all [Placeholder] tokens in a template string with values
   * from the data record.
   */
  function populateTemplate(template, record) {
    return template.replace(/\[([^\]]+)\]/g, function (match, key) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        return String(record[key]);
      }
      console.warn('[TeamMemberBio] No JSON field found for template token: ' + match);
      return '';
    });
  }

  /**
   * Inject an optional CSS file into <head> if not already present.
   */
  function injectCss(cssUrl) {
    if (!cssUrl) return;
    if (document.querySelector('link[href="' + cssUrl + '"]')) return;
    const link  = document.createElement('link');
    link.rel    = 'stylesheet';
    link.href   = cssUrl;
    document.head.appendChild(link);
    console.info('[TeamMemberBio] CSS injected:', cssUrl);
  }

  /**
   * Update the document <title> and any og:title meta tag with the member's name.
   * Improves readability when users share or bookmark the page.
   */
  function updatePageTitle(member) {
    const fullName = (member.FirstName || '') + ' ' + (member.LastName || '');
    if (fullName.trim()) {
      document.title = fullName.trim() + ' | ' + document.title;
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', fullName.trim());
    }
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
        '[TeamMemberBio] Target div #' + cfg.targetDivId + ' not found in the DOM.'
      );
      return;
    }

    // Read the member ID from the URL
    const memberId = getUrlParam(cfg.urlParamKey);
    if (!memberId) {
      console.warn(
        '[TeamMemberBio] URL parameter "' + cfg.urlParamKey + '" not found. ' +
        'Cannot determine which team member to display.'
      );
      targetEl.innerHTML =
        '<p class="team-bio__error">No team member specified.</p>';
      return;
    }

    console.info('[TeamMemberBio] Loading member ID:', memberId);
    targetEl.innerHTML = '<p class="team-bio__loading">Loading…</p>';

    try {
      injectCss(cfg.cssUrl);

      // Fetch JSON and HTML template in parallel
      const [jsonText, htmlText] = await Promise.all([
        fetchText(cfg.jsonUrl, true),
        fetchText(cfg.htmlUrl, false)
      ]);

      // Parse JSON
      let allMembers;
      try {
        allMembers = JSON.parse(jsonText);
      } catch (parseErr) {
        throw new Error('[TeamMemberBio] JSON parse error: ' + parseErr.message);
      }
      if (!Array.isArray(allMembers)) {
        throw new Error('[TeamMemberBio] JSON data is not an array.');
      }

      // Find the requested member — compare as strings to handle both types
      const member = allMembers.find(function (m) {
        return String(m.Id) === String(memberId);
      });

      if (!member) {
        console.warn('[TeamMemberBio] No member found with Id:', memberId);
        targetEl.innerHTML =
          '<p class="team-bio__error">Team member not found.</p>';
        return;
      }

      // Populate template and inject
      const populated = populateTemplate(htmlText, member);
      targetEl.innerHTML = populated;

      // Update page title for readability
      updatePageTitle(member);

      console.info(
        '[TeamMemberBio] Bio rendered for:',
        member.FirstName, member.LastName
      );

    } catch (err) {
      console.error(err.message);
      targetEl.innerHTML =
        '<p class="team-bio__error">Unable to load this team member\'s bio. Please try again later.</p>';
    }
  }

  // ─── Hash-change support ────────────────────────────────────────────────────
  // Squarespace popup navigation changes window.location.hash without a full
  // page reload, so we re-run init() whenever the hash changes.
  window.addEventListener('hashchange', function () {
    console.info('[TeamMemberBio] Hash changed — re-initialising.');
    init();
  });

  // Initial run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
