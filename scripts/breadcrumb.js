document.addEventListener('DOMContentLoaded', function() {
  function createBreadcrumb() {
    const breadcrumbContainer = document.querySelector('.breadcrumb-list');
    if (!breadcrumbContainer) return;

    // Clear existing breadcrumbs
    breadcrumbContainer.innerHTML = '';

    // Get current page info
    const currentPath = window.location.pathname;
    const currentTitle = document.title.split(' — ')[0] || document.title;
    
    // Always start with Home
    const homeItem = createBreadcrumbItem('Home', '/', false);
    breadcrumbContainer.appendChild(homeItem);

    // Parse the URL path
    const pathSegments = currentPath.split('/').filter(segment => segment !== '');
    
    // Skip if we're on the home page
    if (pathSegments.length === 0) {
      // We're on home page, just show "Home" as current
      homeItem.innerHTML = '<span class="breadcrumb-current">Home</span>';
      return;
    }

    let currentUrl = '';
    
    // Process each path segment
    for (let i = 0; i < pathSegments.length; i++) {
      currentUrl += '/' + pathSegments[i];
      const isLast = i === pathSegments.length - 1;
      
      // Get page title (try to find it from navigation or use segment name)
      let pageTitle = getPageTitle(pathSegments[i], currentUrl, isLast ? currentTitle : null);
      
      const breadcrumbItem = createBreadcrumbItem(
        pageTitle,
        currentUrl,
        isLast
      );
      
      breadcrumbContainer.appendChild(breadcrumbItem);
    }
  }

  function createBreadcrumbItem(title, url, isCurrent) {
    const li = document.createElement('li');
    li.className = 'breadcrumb-item';
    
    if (isCurrent) {
      li.innerHTML = `<span class="breadcrumb-current">${title}</span>`;
    } else {
      li.innerHTML = `<a href="${url}" class="breadcrumb-link">${title}</a>`;
    }
    
    return li;
  }

  function getPageTitle(segment, fullUrl, currentPageTitle) {
    // First, try to get title from current page if it's the last segment
    if (currentPageTitle) {
      return currentPageTitle;
    }

    // Try to find the page title from navigation
    const navLinks = document.querySelectorAll('nav a[href*="' + segment + '"]');
    for (let link of navLinks) {
      if (link.getAttribute('href') === fullUrl || 
          link.getAttribute('href') === fullUrl + '/' ||
          link.getAttribute('href') === fullUrl.replace(/\/$/, '')) {
        return link.textContent.trim();
      }
    }

    // Try to find from any links on the page
    const pageLinks = document.querySelectorAll('a[href="' + fullUrl + '"], a[href="' + fullUrl + '/"]');
    if (pageLinks.length > 0) {
      const linkText = pageLinks[0].textContent.trim();
      if (linkText && linkText.length < 50) { // Reasonable title length
        return linkText;
      }
    }

    // Fallback: Convert URL segment to readable title
    return segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Initialize breadcrumb
  createBreadcrumb();

  // Handle Squarespace's AJAX page loads
  window.addEventListener('popstate', createBreadcrumb);
  
  // For Squarespace's internal navigation
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList') {
        // Check if the page content has changed
        setTimeout(createBreadcrumb, 100);
      }
    });
  });

  // Observe changes to the main content area
  const mainContent = document.querySelector('#page') || document.querySelector('main') || document.body;
  if (mainContent) {
    observer.observe(mainContent, {
      childList: true,
      subtree: false
    });
  }
});
