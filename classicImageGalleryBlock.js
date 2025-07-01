// Classic image gallery block  /sqs:beyondspace--classic-gallery 
document.addEventListener('DOMContentLoaded', function() {
  const pathParts = window.location.pathname.split('/').filter(part => part);
  const breadcrumbContainer = document.createElement('div');
  breadcrumbContainer.className = 'breadcrumb-container';
  
  let breadcrumbHTML = '<a href="/">Home</a>';
  
  pathParts.forEach((part, index) => {
    const decodedPart = decodeURIComponent(part);
    const capitalizedPart = decodedPart.replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    const partPath = '/' + pathParts.slice(0, index + 1).join('/');
    
    // Only create a link if its not the last (current) page
    if (index < pathParts.length - 1) {
      breadcrumbHTML += ` > <a href="${partPath}">${capitalizedPart}</a>`;
    } else {
      // Last item (current page) is not a link
      breadcrumbHTML += ` > ${capitalizedPart}`;
    }
  });
  
  breadcrumbContainer.innerHTML = breadcrumbHTML;
  
  // Insertion method
  const contentArea = document.querySelector('.page-content');
  if (contentArea) {
    contentArea.insertBefore(breadcrumbContainer, contentArea.firstChild);
  }
});

