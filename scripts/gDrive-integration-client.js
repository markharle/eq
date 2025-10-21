class DocumentBrowser {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.apiBaseUrl = 'https://getdrivedocuments-561483368663.us-central1.run.app/';
    this.folders = {
      'listings-management': '1NwP8AIf-SIwZ7Ek9SNeS82OcH0lNWgJe',
      'technical-documents': '1GmgTkDO7ilriJsgcgGkl6FcKVwvBGgT6',
      'site-admin-documents': '10ekn8q0aFbN3568Ip1PVySKYK_pXzazR',
      'squarespace-procedures': '1RpFUADyFCViFlTRbtJQYrVr3YcYNBrMX',
      'components': '1rGgkOCblVgitGdKLNyLK6xBBgGpah3EF'
    };
    this.folderBlurbs = {
      'all': '<strong>All Folders</strong><br>All documents are shown below. To narrow your search, select a document category from the <strong>Folders</strong> field above or search by keyword.',
      'listings-management': '<strong>Listings Management</strong><br>These documents explain how add or update our listings.',
      'technical-documents': '<strong>Developer Documents</strong><br>These documents provide details of our APIs, Google Apps Scripts Javascipt, and related technical inforation.',
      'site-admin-documents': '<strong>Site Admin Documents</strong><br>Documents for <strong>Site Administrators</strong> only, including application authorization and configuration guides.',
      'squarespace-procedures': '<strong>Squarespace Procedures</strong><br>Step-by-step guides and procedures for managing content and features on the Squarespace platform.',
      'components': '<strong>Components</strong><br>Details of the key UI components we use to render content on our website pages. These document contains both instructions for managing content in the component and technical details for our Site Administrators and Developers.'  
    };
    this.folderIcons = {
      'listings-management': {
        src: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/1ba44a2d-6743-444e-93f9-a9d26ea9d120/1745674-404040.png?content-type=image%2Fpng',
        alt: 'Listings Mgmt'
      },
      'technical-documents': {
        src: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/0550cbd9-5f89-4ffc-ac37-e0161bcb7a23/8090338-404040.png',
        alt: 'Technical Docs'
      },
      'site-admin-documents': {
        src: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/4a4151e4-b5d5-4ce1-ae11-0c728a335377/1710635-404040.png',
        alt: 'Site Admin Docs'
      },
      'squarespace-procedures': {
        src: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/334d1316-a2a7-498f-8fb5-c278787a955e/SSProce350.png',
        alt: 'Squarespace Procs'
      },
      'components': {
        src: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/0197578c-159d-4150-acf1-fe3741b67be2/4814706-404040.png',
        alt: 'Components'
      },      
      'default': {
        src: 'https://images.squarespace-cdn.com/content/5db1a8c2af0b1a1c3004a035/78f66660-350f-4af2-97b5-2aade9e8cdf7/643174-404040.png',
        alt: 'Other'
      }
    };
    this.selectedFolders = ['listings-management','technical-documents','site-admin-documents','squarespace-procedures','components'];
    this.documents = [];
    this.filteredDocuments = [];
    this.searchTerm = '';
    this.filterType = 'all';
    this.loading = false;
    
    this.init();
  }

  async init() {
    this.renderHTML();
    this.attachEventListeners();
    this.updateFilterBlurb('all');
    await this.loadAllDocuments();
  }

  renderHTML() {
    this.container.innerHTML = `
      <div class="document-browser">
        <div class="browser-header">
          <div class="browser-controls">
            <div class="folder-selector">
              <label for="folder-select" class="file-type">Folders:</label>
              <select id="folder-select" class="folder-select">
                <option value="all">All Folders</option>
                <option value="components">Components</option>
                <option value="technical-documents">Developer Documents</option>
                <option value="listings-management">Listings Management</option>
                <option value="site-admin-documents">Site Admin Documents</option>
                <option value="squarespace-procedures">Squarespace Procedures</option>             
              </select>
            </div>
            
            <div class="search-container">
              <input type="text" id="document-search" class="search-input" placeholder="Search documents...">
              <span id="clear-search-btn" class="clear-search-btn">&times;</span>
            </div>
            
            <div class="filter-container">
              <select id="document-filter" class="filter-select">
                <option value="all">All Types</option>
                <option value="PDF">PDF</option>
                <option value="Google Doc">Google Doc</option>
                <option value="Google Slides">Google Slides</option>
                <option value="Word Document">Word Document</option>
                <option value="Excel Spreadsheet">Excel Spreadsheet</option>
                <option value="PowerPoint">PowerPoint</option>
              </select>
            </div>
            <div class="document-count" id="document-count" style="display: none;">
              <span id="count-text">0 documents found</span>
            </div>
          </div>
        </div>
        <div class="loading-spinner" id="loading-spinner">
          <div class="spinner"></div>
          <p>Loading documents...</p>
        </div>
        <div id="filter-blurb" class="filter-blurb"></div>
        <div class="document-card-document-grid" id="document-grid"></div>
        <div class="error-message" id="error-message" style="display: none;">
          <p>Unable to load documents. Please try again later.</p>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const folderSelect = document.getElementById('folder-select');
    folderSelect.value = 'all';
    folderSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      this.updateFilterBlurb(value);
      if (value === 'all') {
        this.selectedFolders = ['listings-management','technical-documents','site-admin-documents','squarespace-procedures','components'];
      } else {
        this.selectedFolders = [value];
      }
      this.filterDocuments();
    });

    // MODIFIED: Enhanced search functionality with clear button logic
    const searchInput = document.getElementById('document-search');
    const clearSearchBtn = document.getElementById('clear-search-btn'); // NEW: Get the clear button

    searchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase();
      // NEW: Show or hide the clear button based on input value
      clearSearchBtn.style.display = this.searchTerm.length > 0 ? 'block' : 'none';
      this.filterDocuments();
    });

    // NEW: Add click event listener for the clear button
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = ''; // Clear the input field
      this.searchTerm = ''; // Clear the search term in our class
      clearSearchBtn.style.display = 'none'; // Hide the button
      this.filterDocuments(); // Re-run the filter to update the view
      searchInput.focus(); // Put focus back on the search input
    });

    const filterSelect = document.getElementById('document-filter');
    filterSelect.addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.filterDocuments();
    });
  }

  updateFilterBlurb(filterKey) {
    const blurbContainer = document.getElementById('filter-blurb');
    if (blurbContainer) {
      blurbContainer.innerHTML = this.folderBlurbs[filterKey] || '';
    }
  }

  async loadAllDocuments() {
    if (this.loading) return;
    this.showLoading();
    this.loading = true;
    try {
      const folderPromises = Object.entries(this.folders).map(async ([folderKey, folderId]) => {
        try {
          const response = await fetch(`${this.apiBaseUrl}?folderId=${folderId}`);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const data = await response.json();
          if (data.success) {
            return data.documents.map(doc => ({
              ...doc,
              folderKey: folderKey,
              folderName: this.getFolderDisplayName(folderKey)
            }));
          } else {
            console.error(`Failed to fetch documents from ${folderKey}:`, data.error);
            return [];
          }
        } catch (error) {
          console.error(`Error loading documents from ${folderKey}:`, error);
          return [];
        }
      });
      
      const documentArrays = await Promise.all(folderPromises);
      this.documents = documentArrays.flat();
      this.documents.sort((a, b) => a.documentName.localeCompare(b.documentName));
      this.filteredDocuments = [...this.documents];
      this.renderDocuments();
      this.updateDocumentCount();
      
    } catch (error) {
      console.error('Error loading documents:', error);
      this.showError();
    }
    
    this.loading = false;
    this.hideLoading();
  }

  getFolderDisplayName(folderKey) {
    const displayNames = {
      'listings-management': 'Listings Management',
      'technical-documents': 'Technical Documents',
      'site-admin-documents': 'Site Admin Documents',
      'squarespace-procedures': 'Squarespace Procedures',
      'components': 'Components'
    };
    return displayNames[folderKey] || folderKey;
  }

  filterDocuments() {
    this.filteredDocuments = this.documents.filter(doc => {
      const matchesFolder = this.selectedFolders.includes(doc.folderKey);
      const matchesSearch = !this.searchTerm || 
        doc.documentName.toLowerCase().includes(this.searchTerm) ||
        (doc.description && doc.description.toLowerCase().includes(this.searchTerm));
      const matchesFilter = this.filterType === 'all' || doc.fileType === this.filterType;
      return matchesFolder && matchesSearch && matchesFilter;
    });
    this.renderDocuments();
    this.updateDocumentCount();
  }

  renderDocuments() {
    const grid = document.getElementById('document-grid');
    if (this.filteredDocuments.length === 0) {
      grid.innerHTML = `<div class="no-documents"><p>No documents found matching your criteria.</p></div>`;
      return;
    }
    const cards = this.filteredDocuments.map(doc => this.createDocumentCard(doc)).join('');
    grid.innerHTML = cards;
  }

  getFolderIconHtml(folderKey) {
    const iconData = this.folderIcons[folderKey] || this.folderIcons['default'];
    return `<img src="${iconData.src}" alt="${iconData.alt}" class="document-folder-icon">`;
  }

  createDocumentCard(document) {
    const fileIcon = this.getFileIcon(document.fileType);
    return `
      <div class="document-card">
        <div class="document-card-header">
          <div class="file-icon" style="display:none;">${fileIcon} <span class="fiile-type">${document.fileType}</span></div>
          <div class="last-modified" style="display:none;">${document.lastModified}</div>
          <div class="document-folder">${this.getFolderIconHtml(document.folderKey)} ${document.folderName}</div>
        </div>
        <div class="document-card-body">
          <h3 class="document-title">${this.escapeHtml(document.documentName)}</h3>
          ${document.description ? `<p class="document-description">${this.escapeHtml(document.description)}</p>` : ''}
        </div>
        <div class="document-card-footer">
          <div class="document-meta">
            <span class="document-folder" style="display:none;"><i class="fa fa-folder-open"></i> ${document.folderName}</span>
            <span class="document-actions">
              <a href="${document.absoluteUrl}" target="_blank" class="btn btn-view">View</a>
              ${document.downloadUrl ? `<a href="${document.downloadUrl}" class="btn btn-download">Download</a>` : ''}
            </span>
          </div>
          <div class="document-actions" style="display:none;">
            <a href="${document.absoluteUrl}" target="_blank" class="btn btn-view">View</a>
            ${document.downloadUrl ? `<a href="${document.downloadUrl}" class="btn btn-download">Download</a>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  getFileIcon(fileType) {
    const icons = {
      'PDF': '<i class="fa fa-file-pdf-o"></i>',
      'Google Doc': '<i class="fa fa-file-text-o"></i>',
      'Google Slides': '<i class="fa fa-file-powerpoint-o"></i>',
      'Google Sheet': '<i class="fa fa-file-excel-o"></i>',
      'Word Document': '<i class="fa fa-file-word-o"></i>',
      'Excel Spreadsheet': '<i class="fa fa-file-excel-o"></i>',
      'PowerPoint': '<i class="fa fa-file-powerpoint-o"></i>',
      'JPEG Image': '<i class="fa fa-file-image-o"></i>',
      'PNG Image': '<i class="fa fa-file-image-o"></i>',
      'Text File': '<i class="fa fa-file-text-o"></i>'
    };
    return icons[fileType] || '<i class="fa fa-file-o"></i>';
  }

  updateDocumentCount() {
    const countElement = document.getElementById('count-text');
    const countContainer = document.getElementById('document-count');
    const count = this.filteredDocuments.length;
    const total = this.documents.length;
    if (count === total) {
      countElement.textContent = `${count} document${count !== 1 ? 's' : ''} found`;
    } else {
      countElement.textContent = `${count} of ${total} document${total !== 1 ? 's' : ''} shown`;
    }
    countContainer.style.display = 'block';
  }

  showLoading() {
    document.getElementById('loading-spinner').style.display = 'block';
    document.getElementById('document-grid').style.display = 'none';
    document.getElementById('error-message').style.display = 'none';
    const blurb = document.getElementById('filter-blurb');
    if (blurb) blurb.style.display = 'none';
  }

  hideLoading() {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('document-grid').style.display = 'grid';
    const blurb = document.getElementById('filter-blurb');
    if (blurb) blurb.style.display = 'block';
  }

  showError() {
    document.getElementById('error-message').style.display = 'block';
    document.getElementById('document-grid').style.display = 'none';
    document.getElementById('document-count').style.display = 'none';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
 
document.addEventListener('DOMContentLoaded', function() {
  new DocumentBrowser('document-browser-container');
});
