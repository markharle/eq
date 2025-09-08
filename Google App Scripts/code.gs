/**
 * @OnlyCurrentDoc
 */

// =================================================================
// --- GITHUB CONFIGURATION ---
// =================================================================

/**
 * Configuration for the GitHub repository where JSON files are stored.
 * The Personal Access Token (PAT) is stored securely in Script Properties, not here.
 */
const GITHUB_CONFIG = {
  owner: 'markharle', // Your GitHub username
  repo: 'eq',         // Your GitHub repository name
  branch: 'main',     // The branch to commit to
  token_property_key: 'GITHUB_PAT', // The key used to store the token in Script Properties
  listings_path: 'JSON/listingsMaster.json',
  kpi_path: 'JSON/KPI_Data.json'
};




/**
 * A one-time setup function to store your GitHub Personal Access Token (PAT) securely. Run only when changing the PAT
 * 1. Create a NEW PAT in GitHub with 'repo' scope.
 * 2. Copy the new token.
 * 3. Replace 'YOUR_NEW_TOKEN_HERE' with your actual token below.
 * 4. In the Apps Script editor, select this function and click 'Run'.
 * 5. Check the Execution Log for a success message.
 * 6. IMPORTANT: Remove your token from the code after running successfully.
 */
function setGitHubToken() {
  // PASTE YOUR *NEW* TOKEN HERE. DO NOT CHANGE ANY OTHER LINES.
  const token = 'YOUR_NEW_TOKEN_HERE'; 
  
  if (token === 'YOUR_NEW_TOKEN_HERE' || !token) {
    Logger.log('ERROR: Please replace "YOUR_NEW_TOKEN_HERE" with your actual GitHub PAT and run again.');
    return;
  }
  
  PropertiesService.getScriptProperties().setProperty(GITHUB_CONFIG.token_property_key, token);
  
  Logger.log('SUCCESS: Your GitHub token has been stored securely in Script Properties. You can now delete the token from this function.');
}



// =================================================================
// --- GITHUB API HELPER FUNCTIONS ---
// =================================================================

/**
 * Fetches a file from GitHub, returning its content and SHA hash.
 * The SHA is required for updating the file later.
 * @param {string} filePath The path to the file in the repository (e.g., 'JSON/data.json').
 * @returns {object} An object containing { content: string, sha: string } or throws an error.
 */
function getGitHubFile(filePath) {
  const token = PropertiesService.getScriptProperties().getProperty(GITHUB_CONFIG.token_property_key);
  if (!token) {
    throw new Error('GitHub token not found in Script Properties. Please run setGitHubToken().');
  }

  const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filePath}?ref=${GITHUB_CONFIG.branch}`;
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (responseCode === 200) {
    const fileData = JSON.parse(responseBody);
    // Content is returned Base64 encoded, so we need to decode it.
    const content = Utilities.newBlob(Utilities.base64Decode(fileData.content, Utilities.Charset.UTF_8)).getDataAsString();
    return {
      content: content,
      sha: fileData.sha
    };
  } else if (responseCode === 404) {
    // File doesn't exist yet, return null sha. This allows creating a new file.
    Logger.log(`File not found at ${filePath}. A new file will be created on update.`);
    return { content: null, sha: null };
  } else {
    throw new Error(`Failed to get GitHub file '${filePath}'. Status: ${responseCode}. Response: ${responseBody}`);
  }
}

/**
 * Creates or updates a file in a GitHub repository.
 * @param {string} filePath The path to the file in the repository.
 * @param {string} newContent The new content for the file.
 * @param {string} commitMessage A message for the commit.
 * @param {string|null} sha The SHA hash of the existing file. If null, a new file will be created.
 */
function updateGitHubFile(filePath, newContent, commitMessage, sha) {
  const token = PropertiesService.getScriptProperties().getProperty(GITHUB_CONFIG.token_property_key);
  if (!token) {
    throw new Error('GitHub token not found in Script Properties. Please run setGitHubToken().');
  }

  const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filePath}`;
  
  const payload = {
    message: commitMessage,
    content: Utilities.base64Encode(newContent, Utilities.Charset.UTF_8),
    branch: GITHUB_CONFIG.branch
  };

  // If sha is provided, it means we are updating an existing file.
  if (sha) {
    payload.sha = sha;
  }

  const options = {
    method: 'put',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (responseCode !== 200 && responseCode !== 201) { // 201 for created, 200 for updated
    throw new Error(`Failed to update GitHub file '${filePath}'. Status: ${responseCode}. Response: ${responseBody}`);
  }
  
  Logger.log(`Successfully committed '${commitMessage}' to '${filePath}' in GitHub.`);
}


// =================================================================
// --- SCRIPT CONFIGURATION --- 
// =================================================================

/**
 * A list of user email addresses who are considered "superusers".
 * These users bypass all editing restrictions. The sheet owner is always a superuser.
 * IMPORTANT: Replace with the actual email addresses of your superusers.
 */
const SUPERUSERS = ['markharle@gmail.com', 'another.admin@example.com'];

/**
 * The name of the named range covering your main data table on the 'Listings' sheet.
 * You will need to create this named range. For example, if your data is in A2:Z1000,
 * select that range and go to Data > Named ranges to name it 'ListingsData'.
 */
const MAIN_DATA_RANGE_NAME = 'ListingsData';

/**
 * The prefix used to identify named ranges for dropdown lists (e.g., 'LIST_Status').
 * Any named range starting with this prefix will be editable.
 * This also allows for the formulaic updating of the KPI data 
 */
const LIST_DATA_RANGE_PREFIX = 'LIST_';

/**
 * The background color to apply to any cell that has been successfully edited,
 * indicating it's "dirty" and needs to be published.
 */
const DIRTY_CELL_COLOR = '#ffff00'; // Yellow

/**
 * The title and message for the alert pop-up shown to users who make an invalid edit.
 */
const ALERT_TITLE = 'Edit Restricted';
const ALERT_MESSAGE = 'You can only edit cells within designated data areas (like the main Listings table or dropdown lists). This change has been canceled.';

// =================================================================
// --- SCRIPT CONFIGURATION ---
// =================================================================

/**
 * The technical header names required for the downstream publishing process.
 * These will be set automatically before publishing.
 */
const TECHNICAL_HEADERS = [[
  'Timestamp', 'Publish', 'MLS', 'streetAddress', 'City', 'State', 'Zip', 'County', 
  'Neighborhood', 'Latitude', 'Longitude', 'Price', 'Status', 'currentListingStatusLabel', 
  'dateSold', 'imageURL', 'ZillowURL', 'Summary', 'priceRange', 'yearSold'
]];

/**
 * The user-friendly semantic header names displayed during normal editing.
 * These will be set automatically when the sheet is opened.
 */
const SEMANTIC_HEADERS = [[
  'Timestamp', 'Publish', 'MLS', 'Street Address', 'City', 'State', 'Zip', 'County', 
  'Neighborhood', 'Latitude', 'Longitude', 'Price', 'Status', 'Sub-status', 
  'Date Sold', 'Image URL', 'Zillow URL', 'Summary', 'priceRange', 'yearSold'
]];



// ... the rest of your configuration continues here ...



// Configure external URLs.
const URL_CONFIG = {
  addListingForm: 'https://forms.gle/MSitPdbuozARAuveA',
  dropdowns: {
    cities: 'https://docs.google.com/spreadsheets/d/13nIoNHI3IG-CkfoP-O0d3ENOH-lNfYA_WqvMq7uopNs/edit?gid=691000270#gid=691000270',
    counties: 'https://docs.google.com/spreadsheets/d/13nIoNHI3IG-CkfoP-O0d3ENOH-lNfYA_WqvMq7uopNs/edit?gid=1741922174#gid=1741922174',
    neighborhoods: 'https://docs.google.com/spreadsheets/d/13nIoNHI3IG-CkfoP-O0d3ENOH-lNfYA_WqvMq7uopNs/edit?gid=979171514#gid=979171514',
    renovationStatus: 'https://docs.google.com/spreadsheets/d/1Bt0f1dnNgqF3MpiYKbbyBytyZBx9KM8qqCgE-NTCSjY/edit?gid=261620177#gid=261620177',
    states: 'https://docs.google.com/spreadsheets/d/13nIoNHI3IG-CkfoP-O0d3ENOH-lNfYA_WqvMq7uopNs/edit?gid=894849676#gid=894849676',
    status: 'https://docs.google.com/spreadsheets/d/13nIoNHI3IG-CkfoP-O0d3ENOH-lNfYA_WqvMq7uopNs/edit?gid=244122861#gid=244122861',
    subStatus: 'https://docs.google.com/spreadsheets/d/13nIoNHI3IG-CkfoP-O0d3ENOH-lNfYA_WqvMq7uopNs/edit?gid=1650289105#gid=1650289105'
  }
};

// =================================================================
// --- MAIN onEdit TRIGGER FUNCTION ---
// =================================================================

/**
 * This function runs automatically every time a user edits the spreadsheet.
 * It enforces editing permissions and highlights valid edits.
 * @param {Object} e The event object passed by the trigger.
 */
function onEdit(e) {
  // Get context from the event object
  const range = e.range;
  const userEmail = e.user ? e.user.getEmail() : '';
  const oldValue = e.oldValue;

  // --- Step 1: Check for Superuser ---
  // If the user is a superuser, allow the edit and apply dirty formatting.
  if (SUPERUSERS.includes(userEmail)) {
    range.setBackground(DIRTY_CELL_COLOR);
    return; // Exit the script
  }

  // --- Step 2: Check if the Edit Location is Allowed ---
  // This now includes the header row via the 'ListingsHeader' named range.
  if (isEditInAllowedLocation(range)) {
    // If the location is valid, apply the "dirty cell" formatting.
    range.setBackground(DIRTY_CELL_COLOR);
  } else {
    // If the location is NOT valid, revert the change and show an alert.
    if (oldValue !== undefined) {
      range.setValue(oldValue);
    } else {
      range.clearContent();
    }
    
    // Display the pop-up alert to the user.
    SpreadsheetApp.getUi().alert(ALERT_TITLE, ALERT_MESSAGE, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}


// =================================================================
// --- HELPER FUNCTIONS ---
// =================================================================

/**
 * Checks if an edited range is within any of the allowed named ranges.
 * @param {GoogleAppsScript.Spreadsheet.Range} editedRange The range that was edited.
 * @returns {boolean} True if the edit is in an allowed location, false otherwise.
 */
function isEditInAllowedLocation(editedRange) {
  const allNamedRanges = SpreadsheetApp.getActiveSpreadsheet().getNamedRanges();
  
  for (const namedRange of allNamedRanges) {
    const rangeName = namedRange.getName();
    
    // Check if the named range matches our allowed criteria
    // *** UPDATED to include the new ListingsHeader named range ***
    if (rangeName === MAIN_DATA_RANGE_NAME || rangeName.startsWith(LIST_DATA_RANGE_PREFIX) || rangeName === 'ListingsHeader') {
      // Check if the edited cell is physically inside this allowed named range
      if (isRangeWithinNamedRange(editedRange, namedRange.getRange())) {
        return true; // Found a valid location, so we can stop checking
      }
    }
  }
  
  return false; // If we looped through all and found no match, the edit is not allowed
}

/**
 * Writes the user-friendly "Semantic Headers" to Row 1 of the Listings sheet.
 */
function setSemanticHeaders() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Listings');
    if (sheet) {
      sheet.getRange('A1:T1').setValues(SEMANTIC_HEADERS);
    }
  } catch (e) {
    Logger.log('Error setting semantic headers: ' + e.toString());
  }
}

/**
 * Writes the system-required "Technical Headers" to Row 1 of the Listings sheet.
 */
function setTechnicalHeaders() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Listings');
    if (sheet) {
      sheet.getRange('A1:T1').setValues(TECHNICAL_HEADERS);
    }
  } catch (e) {
    Logger.log('Error setting technical headers: ' + e.toString());
  }
}




/**
 * Determines if one range is completely contained within another.
 * @param {GoogleAppsScript.Spreadsheet.Range} innerRange The range to check (e.g., the edited cell).
 * @param {GoogleAppsScript.Spreadsheet.Range} outerRange The containing range (e.g., an allowed named range).
 * @returns {boolean} True if innerRange is within outerRange.
 */
function isRangeWithinNamedRange(innerRange, outerRange) {
  return innerRange.getSheet().getName() === outerRange.getSheet().getName() &&
         innerRange.getRow() >= outerRange.getRow() &&
         innerRange.getLastRow() <= outerRange.getLastRow() &&
         innerRange.getColumn() >= outerRange.getColumn() &&
         innerRange.getLastColumn() <= outerRange.getLastColumn();
}



/**
 * Activates a specific sheet by name, making it the visible sheet in the UI. This is used to activate the LIST_xxx tabs to enable editing the dropdown lists items
 * @param {string} sheetName The name of the sheet to navigate to.
 */
function navigateToSheet(sheetName) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(sheetName);
    
    if (sheet) {
      sheet.activate();
    } else {
      SpreadsheetApp.getUi().alert('Error', `Sheet named "${sheetName}" could not be found.`, SpreadsheetApp.getUi().ButtonSet.OK);
    }
  } catch (e) {
    Logger.log(`Error in navigateToSheet: ${e.toString()}`);
    SpreadsheetApp.getUi().alert('An error occurred while trying to switch sheets.');
  }
}


// --- Wrapper functions to call navigateToSheet() from the menu ---
function goToCities() { navigateToSheet('LIST_Cities'); }
function goToCounties() { navigateToSheet('LIST_Counties'); }
function goToNeighborhoods() { navigateToSheet('LIST_Neighborhoods'); }
function goToRenovationStatus() { navigateToSheet('LIST_RenovationStatus'); }
function goToStates() { navigateToSheet('LIST_States'); }
function goToStatus() { navigateToSheet('LIST_ListingStatus'); }
function goToSubStatus() { navigateToSheet('LIST_ListingSubStatus'); }



/**
 * Removes all background highlighting from data cells (row 2 and below)
 * across ALL sheets in the spreadsheet.
 * This ensures that all 'dirty cell' indicators after removed after publishing.
 */
function removeEditHighlighting() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const allSheets = spreadsheet.getSheets(); // Get an array of all sheets in the spreadsheet

  // Loop through each sheet in the spreadsheet
  allSheets.forEach(sheet => {
    // Check if the sheet has any data below the header row (row 1)
    // This prevents errors on empty sheets or sheets with only a header.
    if (sheet.getLastRow() > 1) {
      
      // Define the range to clear: 
      // from row 2, column 1, down to the last row and last column with content.
      const rangeToClear = sheet.getRange(
        2,                      // startRow
        1,                      // startColumn
        sheet.getLastRow() - 1, // numRows (total rows minus the header)
        sheet.getLastColumn()   // numColumns
      );

      // Set the background to 'null' to remove any color formatting.
      rangeToClear.setBackground(null);
    }
  });
}


/**
 * Creates a custom menu and sets 'Semantic Headers' in the Listings tab when the file is opened.
 */
function onOpen() {
  // *** UPDATED to set semantic headers on open ***
  setSemanticHeaders();

  const ui = SpreadsheetApp.getUi();

  // Create the sub-menu for dropdown lists first
  const dropdownMenu = ui.createMenu('Update Dropdown Lists')
    .addItem('Cities', 'goToCities')
    .addItem('Counties', 'goToCounties')
    .addItem('Neighborhoods', 'goToNeighborhoods')
    .addItem('Renovation Status', 'goToRenovationStatus')
    .addItem('States', 'goToStates')
    .addItem('Status', 'goToStatus')
    .addItem('Sub-status', 'goToSubStatus');

  // Create the sub-menu for documentation
  const documentationMenu = ui.createMenu('Documentation')
    .addItem('Admin Resources', 'showUserDocumentationSidebar')
    .addItem('Developer Resources', 'showTechnicalDocumentationSidebar');

  // Create the new sub-menu for Update Listings
  const updateListingsMenu = ui.createMenu('Manage Listings')
    .addItem('Add New Listing', 'showAddListingSidebar') 
    .addItem('Publish Listings', 'publishListingsToJSON')
    .addItem('Publish Dropdowns', 'populateAllDropdowns')
    .addItem('Rebuid Listings Tab', 'startImportProcess');


  // Create the main menu and add the items and all sub-menus
  ui.createMenu('Website Tools')
    .addSubMenu(updateListingsMenu)
    .addSeparator()
    .addSubMenu(dropdownMenu)
    .addSeparator()
    .addSubMenu(documentationMenu)
    .addToUi();
}


// --- Start Function to Show Sidebar that holds the Add Property Google Form ---
// Creates an HTML template from a file, injects the form URL, and displays it in a sidebar in the spreadsheet.

function showAddListingSidebar() {
  // Create an HTML template from the AddListingSidebar.html file.
  const htmlTemplate = HtmlService.createTemplateFromFile('AddListingSidebar.html');
  
  // Pass the form URL to the 'formUrl' variable inside the HTML template.
  htmlTemplate.formUrl = URL_CONFIG.addListingForm;
  
  // Evaluate the template to get the final HTML output.
  const htmlOutput = htmlTemplate.evaluate()
    .setTitle('Add New Listing')
    .setWidth(400);

  // Display the HTML output as a sidebar.
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}
//  --- End Function to Show Sidebar ---


// --- Start Function to Show the USer Documetation Sidebar  ---

function showUserDocumentationSidebar() {
  // Create an HTML template from the showUserDocumentationSidebar.html file.
  const htmlTemplate = HtmlService.createTemplateFromFile('showUserDocumentationSidebar.html');
  
  // Evaluate the template to get the final HTML output.
  const htmlOutput = htmlTemplate.evaluate()
    .setTitle('Admin Resources')
    .setWidth(400);

  // Display the HTML output as a sidebar.
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}
//  --- End Function to Show the User Documetation Sidebar ---


// --- Start Function to Show the Technical Documetation Sidebar  ---

function showTechnicalDocumentationSidebar() {
  // Create an HTML template from the showTechnicalDocumentationSidebar.html file.
  const htmlTemplate = HtmlService.createTemplateFromFile('showTechnicalDocumentationSidebar.html');
  
  // Evaluate the template to get the final HTML output.
  const htmlOutput = htmlTemplate.evaluate()
    .setTitle('Developer Resources')
    .setWidth(400);

  // Display the HTML output as a sidebar.
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}
//  --- End Function to Show the Technical Documetation Sidebar ---





// --- START Publish Listing Updates ---
/**
 * [REFACTORED]
 * This function publishes listings and KPI data to JSON files in a GitHub repository.
 * It geocodes missing lat/lon values, then commits the updated JSON to GitHub.
 */
function publishListingsToJSON() {
  try {
    var ui = SpreadsheetApp.getUi();
    const message = 
      'Before we make your updates live, take a moment to review everything:\n\n' +
      '1. Pay special attention to the yellow highlighted cells. These are the recent updates you\'ve made - so make sure these are just right!\n\n' +
      '2. Be sure the checkboxes in the \'Publish\' column are accurate. If a checkbox is not ticked-on, the listing will not be published to the site.\n\n' +
      '3. If you have changed a listing status to \'Sold\' be sure that you have updated the Price and dateSold fields.\n\n' +
      'If things look good, click \'Yes\' to publish now, or \'No\' to cancel and keep editing.';

    const response = ui.alert('Ready to Publish?', message, ui.ButtonSet.YES_NO);

    if (response !== ui.Button.YES) {
      SpreadsheetApp.getActiveSpreadsheet().toast('Publication cancelled.', 'Status', 5);
      return; 
    }

    setTechnicalHeaders();
    SpreadsheetApp.flush(); 

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var listingsSheet = spreadsheet.getSheetByName('Listings');
    var kpiSheet = spreadsheet.getSheetByName('KPI Data'); 
    
    var html = HtmlService.createHtmlOutputFromFile('progressDialog').setWidth(450).setHeight(350);
    ui.showModalDialog(html, 'Updating ericquiner.com');
    Utilities.sleep(500);
    
    if (!listingsSheet) {
      ui.alert('Error', 'Sheet "Listings" not found.', ui.ButtonSet.OK);
      return;
    }
    
    var dataRange = listingsSheet.getDataRange();
    var data = dataRange.getValues();
    
    if (data.length <= 1) {
      ui.alert('Info', 'No data to publish.', ui.ButtonSet.OK);
      return;
    }

    var API_KEY = "AIzaSyBzkfNcFjqDH7nQsiVoLViVZYEmKyc-AJY";
    var STREET_COL = 3, CITY_COL = 4, STATE_COL = 5, ZIP_COL = 6, LAT_COL = 9, LON_COL = 10;
    var geocodingPerformed = false;

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[LAT_COL] || !row[LON_COL]) {
        var streetAddress = row[STREET_COL];
        if (streetAddress) {
          var fullAddress = streetAddress + ', ' + row[CITY_COL] + ', ' + row[STATE_COL] + ' ' + row[ZIP_COL];
          var url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(fullAddress) + '&key=' + API_KEY;
          try {
            var responseAPI = UrlFetchApp.fetch(url);
            var jsonResponse = JSON.parse(responseAPI.getContentText());
            if (jsonResponse.status === 'OK' && jsonResponse.results.length > 0) {
              var location = jsonResponse.results[0].geometry.location;
              listingsSheet.getRange(i + 1, LAT_COL + 1).setValue(location.lat);
              listingsSheet.getRange(i + 1, LON_COL + 1).setValue(location.lng);
              geocodingPerformed = true;
            }
          } catch (e) { Logger.log('Error geocoding row ' + (i + 1) + ': ' + e.toString()); }
        }
      }
    }

    if (geocodingPerformed) {
      SpreadsheetApp.flush();
      data = listingsSheet.getDataRange().getValues();
    }
    
    var headers = data[0];
    var processedData = data.slice(1).map(function(row, rowIndex) {
      var rowObject = {};
      headers.forEach(function(header, colIndex) {
        var value = row[colIndex];
        if (colIndex === 18 || colIndex === 19) { 
          value = listingsSheet.getRange(rowIndex + 2, colIndex + 1).getDisplayValue();
        }
        rowObject[header] = value;
      });
      return rowObject;
    });
    
    var jsonString = JSON.stringify(processedData, null, 2);
    
    // --- GITHUB UPDATE FOR LISTINGS ---
    const listingsFileInfo = getGitHubFile(GITHUB_CONFIG.listings_path);
    updateGitHubFile(
      GITHUB_CONFIG.listings_path, 
      jsonString, 
      `Update listings data - ${new Date().toISOString()}`, 
      listingsFileInfo.sha
    );
    
    var kpiData = {
      "YearsExperience": kpiSheet.getRange('data_YearsExperience').getValue(),
      "TotalClients": kpiSheet.getRange('data_TotalClients').getValue(),
      "TotalSalesVolume": kpiSheet.getRange('data_TotalSalesVolume').getValue(),
      "AverageSalesPrice": kpiSheet.getRange('data_AverageSalesPrice').getValue(),
      "TotalCurrentListings": kpiSheet.getRange('data_TotalCurrentListings').getValue(),
      "lastUpdated": new Date().toISOString()
    };
    
    var kpiJsonString = JSON.stringify(kpiData, null, 2);

    // --- GITHUB UPDATE FOR KPI DATA ---
    const kpiFileInfo = getGitHubFile(GITHUB_CONFIG.kpi_path);
    updateGitHubFile(
      GITHUB_CONFIG.kpi_path,
      kpiJsonString,
      `Update KPI data - ${new Date().toISOString()}`,
      kpiFileInfo.sha
    );
    
    removeEditHighlighting(); 
    
    var closeHtml = HtmlService.createHtmlOutput('<script>google.script.host.close();</script>');
    ui.showModalDialog(closeHtml, 'Closing');
    Utilities.sleep(500);
    
    ui.alert('Publish Complete', 'Your listing and KPI updates have been published successfully to GitHub!', ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('Error updating JSON files: ' + e.toString());
    var closeHtml = HtmlService.createHtmlOutput('<script>google.script.host.close();</script>');
    SpreadsheetApp.getUi().showModalDialog(closeHtml, '');
    Utilities.sleep(500);
    SpreadsheetApp.getUi().alert('Error Publishing', 'An error occurred: ' + e.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
  } finally {
    setSemanticHeaders();
  }
}



/**
 * Main entry point for the web app.
 */
function doGet(e) {
  if (e.parameter.function === 'doGetListings') {
    return doGetListings(); // Call the function for Listings JSON
  } else if (e.parameter.function === 'doGetKPI') {
    return doGetKPI(); // Call the function for KPI JSON
  } else {
    return ContentService.createTextOutput(JSON.stringify({ error: "Invalid function parameter." }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Web App endpoint to serve the KPI JSON data from GitHub.
 */
function doGetKPI() {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.kpi_path}`;
  try {
    const response = UrlFetchApp.fetch(rawUrl, { muteHttpExceptions: true });
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      const kpiJsonString = response.getContentText();
      return ContentService.createTextOutput(kpiJsonString)
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      Logger.log(`Error fetching KPI file for doGetKPI. Status: ${responseCode}. URL: ${rawUrl}`);
      return ContentService.createTextOutput(JSON.stringify({ error: `Failed to access KPI data file. Status: ${responseCode}` }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (e) {
    Logger.log('Error in doGetKPI fetching from GitHub: ' + e.toString());
    return ContentService.createTextOutput(JSON.stringify({ error: "An unexpected error occurred while fetching KPI data." }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Web App endpoint to serve the Listings JSON data from GitHub.
 */
function doGetListings() {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.listings_path}`;
  try {
    const response = UrlFetchApp.fetch(rawUrl, { muteHttpExceptions: true });
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      const listingsJsonString = response.getContentText();
      return ContentService.createTextOutput(listingsJsonString)
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      Logger.log(`Error fetching Listings file for doGetListings. Status: ${responseCode}. URL: ${rawUrl}`);
      return ContentService.createTextOutput(JSON.stringify({ error: `Failed to access Listings data file. Status: ${responseCode}` }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (e) {
    Logger.log('Error in doGetListings fetching from GitHub: ' + e.toString());
    return ContentService.createTextOutput(JSON.stringify({ error: "An unexpected error occurred while fetching Listings data." }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

  


// --- START 'Add Listing' Google Form Submission Process ---
/**
 * This function runs automatically whenever an 'Add Listing' form is submitted.
 * It geocodes the address, adds the response to a new row at the top of the 'Listings' sheet, 
 * applies specific formulas, and highlights the new row as "dirty".
 */
function onFormSubmit(e) {

  // --- CONFIGURATION ---
  const sheetName = 'Listings'; 
  
  // Column numbers for formula updates (1-based indexing: A=1, S=19, T=20)
  const formulaColumn1 = 19; // Column S
  const formulaColumn2 = 20; // Column T

  const formulaString1 = '=IF(L2="", "", IFERROR(IFS(L2 < 150000, "Under $150k", L2 < 250000, "$150k - $249k", L2 < 500000, "$250k - $499k", L2 < 750000, "$500k - $749k", L2 < 1000000, "$750k - $999k", L2 >= 1000000, "$1m and up"), ""))'; 
  const formulaString2 = '=IF(ISBLANK(N2), "", IFERROR(YEAR(N2), ""))';

  // Geocoding Configuration (1-based indexing for sheet columns)
  const streetAddressCol = 4;  // Column D
  const cityCol = 5;           // Column E
  const stateCol = 6;          // Column F
  const zipCol = 7;            // Column G
  const latitudeCol = 10;      // Column J (The column where Latitude will be placed)
  // --- END CONFIGURATION ---

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const listingsSheet = ss.getSheetByName(sheetName);

    if (!listingsSheet) {
      Logger.log(`Error: Sheet named '${sheetName}' not found.`);
      return;
    }

    const formResponse = e.values;

    // --- START GEOCODING LOGIC ---
    let latitude = '';
    let longitude = '';

    const streetAddress = formResponse[streetAddressCol - 1];
    const city = formResponse[cityCol - 1];
    const state = formResponse[stateCol - 1];
    const zip = formResponse[zipCol - 1];

    if (streetAddress && city && state) {
      const fullAddress = `${streetAddress}, ${city}, ${state} ${zip}`;
      const apiKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
      
      if (!apiKey) {
        Logger.log('ERROR: MAPS_API_KEY not found in Script Properties. Please set it up.');
      } else {
        const encodedAddress = encodeURIComponent(fullAddress);
        const apiUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

        const apiResponse = UrlFetchApp.fetch(apiUrl, { 'muteHttpExceptions': true });
        const responseCode = apiResponse.getResponseCode();
        const json = JSON.parse(apiResponse.getContentText());

        if (responseCode === 200 && json.status === 'OK' && json.results && json.results.length > 0) {
          const location = json.results[0].geometry.location;
          latitude = location.lat;
          longitude = location.lng;
        } else {
          Logger.log(`Geocoding failed for ${fullAddress}. Status: ${json.status}. Error: ${json.error_message || 'No results found.'}`);
        }
      }
    } else {
      Logger.log('Address information was incomplete, skipping geocoding.');
    }
    // --- END GEOCODING LOGIC ---

    // --- START ROW CONSTRUCTION ---
    const newRowData = [...formResponse];
    newRowData.splice(latitudeCol - 1, 2, latitude, longitude);
    // --- END ROW CONSTRUCTION ---

    listingsSheet.insertRowBefore(2);

    const targetRange = listingsSheet.getRange(2, 1, 1, newRowData.length);
    targetRange.setValues([newRowData]);
    
    // --- APPLY FORMULAS TO THE NEW ROW ---
    listingsSheet.getRange(2, formulaColumn1).setFormula(formulaString1);
    listingsSheet.getRange(2, formulaColumn2).setFormula(formulaString2);
    
    // --- Highlight the new row to mark it as "dirty" ---
    targetRange.setBackground(DIRTY_CELL_COLOR);
    
    Logger.log('New row added, geocoded, formulas applied, and highlighted successfully.');

  } catch (error) {
    Logger.log(`An error occurred in onFormSubmit: ${error.toString()}`);
    Logger.log(`Stack: ${error.stack}`);
  }
}

// --- End 'Add Listing' Google Form Submission Process ---



// --- REUSABLE HTML SERVICE DIALOG ---

/**
 * Opens a specified URL in a new browser tab using an HTML service dialog.
 * This is a generic function that can be called by any menu item.
 * @param {string} url The URL to open in a new tab.
 */

/**
 * Configuration object that maps Google Form dropdown fields to their
 * corresponding named ranges in the Google Sheet.
 *
 * @property {string} formFieldName - The exact title of the dropdown field in the Google Form.
 * @property {string} namedRangeName - The name of the named range in the Google Sheet.
 */
const DROPDOWN_CONFIG = [
  { formFieldName: 'City',         namedRangeName: 'LIST_CIties' },
  { formFieldName: 'County',       namedRangeName: 'LIST_Counties' },
  { formFieldName: 'State',        namedRangeName: 'LIST_States' },
  { formFieldName: 'Neighborhood', namedRangeName: 'LIST_Neighborhoods' },
  { formFieldName: 'Status',       namedRangeName: 'LIST_ListingStatus' },
  { formFieldName: 'Sub-status',   namedRangeName: 'LIST_ListingSubStatus' }
];

// --- UPDATE THESE IDS ---
const SPREADSHEET_ID = '13nIoNHI3IG-CkfoP-O0d3ENOH-lNfYA_WqvMq7uopNs'; // The ID of the Google Sheet containing the named ranges.
const FORM_ID = '1mS7L4YCPlrXimR1hZCZ3eLrGG9ACyM_G8w4ewIlzBlQ';          // The ID of the Google Form you want to update.




/**
 * Main function to populate all specified dropdowns in a Google Form
 * with values from named ranges in a Google Sheet. After completion,
 * it hides the active LIST sheet, which returns the user to their
 * previous view, and then shows a confirmation.
 */
function populateAllDropdowns() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const currentSheet = spreadsheet.getActiveSheet();
    const currentSheetName = currentSheet.getName();

    const form = FormApp.openById(FORM_ID);
    
    console.log(`Function triggered from sheet: "${currentSheetName}"`);

    const formItems = form.getItems();

    DROPDOWN_CONFIG.forEach(config => {
      populateSingleDropdown(spreadsheet, formItems, config.formFieldName, config.namedRangeName);
    });
    
    console.log('--- All dropdowns processed successfully! ---');

    // --- NEW, STABLE LOGIC ---

    // 1. Hide the current sheet FIRST.
    // This automatically and gracefully moves the user's view to another
    // visible sheet (like 'Listings') without causing a UI conflict.
    if (currentSheetName.startsWith('LIST_')) {
      currentSheet.hideSheet();
      console.log(`Successfully hid sheet: "${currentSheetName}"`);
    }

    // 2. THEN, show the confirmation alert.
    // By the time this alert appears, the UI is already in a stable state,
    // viewing the 'Listings' sheet. Clicking "OK" now simply closes the
    // dialog and the script ends.
    SpreadsheetApp.getUi().alert(
      'Success!', 
      'All Google Form dropdowns have been updated. You have been returned to the Listings tab.', 
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (e) {
    console.error(`An error occurred in populateAllDropdowns: ${e.toString()}`);
    console.error(`Stack: ${e.stack}`);
    SpreadsheetApp.getUi().alert('Error', `An error occurred: ${e.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Populates a single dropdown list in the Google Form.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - The active spreadsheet object.
 * @param {GoogleAppsScript.Forms.Item[]} formItems - An array of all items in the form.
 * @param {string} formFieldName - The title of the form field to update.
 * @param {string} namedRangeName - The name of the range containing the values.
 */
function populateSingleDropdown(spreadsheet, formItems, formFieldName, namedRangeName) {
  // 1. Get the data from the named range in the Sheet
  const range = spreadsheet.getRangeByName(namedRangeName);
  if (!range) {
    console.warn(`Named range "${namedRangeName}" not found. Skipping field "${formFieldName}".`);
    return;
  }
  
  // getValues() returns a 2D array. We convert it to a 1D array of strings
  // and filter out any blank cells to keep the dropdown clean.
  const allValues = range.getValues()
                         .map(row => row[0])
                         .filter(value => value !== '' && value != null);

  // --- NEW: REMOVE DUPLICATES ---
  // Google Forms requires all dropdown choices to be unique.
  // We use a Set to automatically filter out any duplicate values from our list.
  const uniqueValues = [...new Set(allValues)];

  if (uniqueValues.length === 0) {
    console.warn(`No values found in named range "${namedRangeName}". Skipping field "${formFieldName}".`);
    return;
  }

  // 2. Find the corresponding item in the Form
  const targetItem = formItems.find(item => item.getTitle() === formFieldName);
  
  if (!targetItem) {
    console.warn(`Form field with title "${formFieldName}" not found. Skipping.`);
    return;
  }

  // 3. Check if the item is a dropdown (List Item) and update its choices
  if (targetItem.getType() === FormApp.ItemType.LIST) {
    const dropdownItem = targetItem.asListItem();
    // Use the de-duplicated list of values
    dropdownItem.setChoiceValues(uniqueValues);
    console.log(`Successfully populated "${formFieldName}" with ${uniqueValues.length} unique items from "${namedRangeName}".`);
  } else {
    console.warn(`Form field "${formFieldName}" was found, but it is not a dropdown list. Skipping.`);
  }
}


// =================================================================
// ONE-TIME SETUP FUNCTION FOR COLUMN PROTECTION
// =================================================================

/**
 * Run this function ONCE from the script editor to store the initial
 * correct order of your headers in the 'Listings' sheet.
 * After running, check the Execution Log for a success message.
 */
function storeInitialHeaderOrder() {
  const sheetName = 'Listings';
  const headerRow = 1;
  
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      // Log an error if the sheet isn't found.
      Logger.log(`ERROR: Sheet "${sheetName}" not found. Please check the name.`);
      return; // Stop the function
    }
    
    const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    const actualHeaders = headers.filter(h => h !== "");
    
    // Store the correct header order in a persistent script property
    PropertiesService.getScriptProperties().setProperty('correctHeaderOrder', JSON.stringify(actualHeaders));
    
    // CHANGED: Replaced ui.alert with Logger.log for running from the editor.
    Logger.log('SUCCESS! Header order for "' + sheetName + '" has been stored successfully.');
    Logger.log('Stored Headers: ' + JSON.stringify(actualHeaders));
    
  } catch (error) {
    // CHANGED: Log any other errors that occur.
    Logger.log('An unexpected error occurred: ' + error.message);
  }
}



/**
 * Imports JSON data, asks for confirmation, and then restores data
 * validation rules to ensure they apply to the entire column.
 *
 * FINAL WORKING VERSION: This script works by capturing a "blueprint" of the
 * validation rule using .copy() before any content is cleared. This blueprint
 * is then used to build and apply a fresh rule after the new data is imported,
 * successfully preserving the validation across the entire column.
 */
// =================================================================
// === MAIN FUNCTION TO RUN FROM MENU ==============================
// =================================================================



/**
 * [REFACTORED]
 * Reads the import file from GitHub to get a count, shows a detailed confirmation
 * dialog, and if confirmed, triggers the actual import process.
 */
function startImportProcess() {
  const sheetName = 'Listings';
  const ui = SpreadsheetApp.getUi();
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      ui.alert(`Sheet "${sheetName}" not found!`);
      return;
    }

    // --- GITHUB READ FOR LISTINGS COUNT ---
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.listings_path}`;
    const response = UrlFetchApp.fetch(rawUrl, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      throw new Error(`Could not fetch listings data from GitHub. URL: ${rawUrl}`);
    }
    const jsonString = response.getContentText();
    const data = JSON.parse(jsonString);

    if (!Array.isArray(data)) {
      ui.alert('Error', 'The data from the source file is not a valid list.', ui.ButtonSet.OK);
      return;
    }
    const newListingsCount = data.length;

    const existingListingsCount = Math.max(0, sheet.getLastRow() - 1);

    const alertTitle = 'Confirm Import';
    const alertMessage = `Your '${sheetName}' tab contains ${existingListingsCount} listings. If you continue, you will replace them with ${newListingsCount} new listings from the website.\n\nAre you sure you want to proceed?`;
    
    const alertResponse = ui.alert(alertTitle, alertMessage, ui.ButtonSet.YES_NO);

    if (alertResponse == ui.Button.YES) {
      const html = HtmlService.createHtmlOutputFromFile('processingDialogImportListings')
        .setWidth(560)
        .setHeight(400);
      ui.showModalDialog(html, 'Processing');
    } else {
      ui.alert('Import Cancelled', 'The import process was cancelled.', ui.ButtonSet.OK);
    }
  } catch (e) {
    ui.alert('An error occurred during pre-check', e.message, ui.ButtonSet.OK);
  }
}


// =================================================================
// === CORE LOGIC (DO NOT RUN THIS DIRECTLY) =======================
// =================================================================

/**
 * [REFACTORED]
 * Performs the actual data import from GitHub and validation restoration.
 * This function is called by the 'processingDialogImportListings.html' file.
 */
function performTheActualImport() {
  const sheetName = 'Listings';
  const COLUMNS_WITH_VALIDATION = ['B', 'E', 'F', 'H', 'I', 'L' ,'M' ,'N' ,'P'];
  const ui = SpreadsheetApp.getUi();

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found!`);
    }
    
    const validationRuleBuilders = {};
    COLUMNS_WITH_VALIDATION.forEach(columnLetter => {
      const originalRule = sheet.getRange(`${columnLetter}2`).getDataValidation();
      if (originalRule) {
        validationRuleBuilders[columnLetter] = originalRule.copy();
      }
    });
    
    // --- GITHUB READ FOR LISTINGS IMPORT ---
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.listings_path}`;
    const response = UrlFetchApp.fetch(rawUrl, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      throw new Error(`Could not fetch listings data from GitHub for import. URL: ${rawUrl}`);
    }
    const jsonString = response.getContentText();
    const data = JSON.parse(jsonString);

    if (!Array.isArray(data)) {
      throw new Error('The data from the source file is not a valid list.');
    }
    const newListingsCount = data.length;
      
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const values = data.map(item => 
      headers.map(header => 
        item[header.trim()] !== undefined ? item[header.trim()] : ""
      )
    );

    if (sheet.getLastRow() > 1) {
      const rangeToClear = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
      rangeToClear.clearContent();
    }

    if (values.length > 0) {
      sheet.getRange(2, 1, values.length, values[0].length).setValues(values);
    }

    SpreadsheetApp.flush();
    
    COLUMNS_WITH_VALIDATION.forEach(columnLetter => {
      const savedBuilder = validationRuleBuilders[columnLetter];
      if (savedBuilder) {
        const newRule = savedBuilder.build();
        const targetRange = sheet.getRange(`${columnLetter}2:${columnLetter}`);
        targetRange.setDataValidation(newRule);
      }
    });

    ui.alert('Success!', `Successfully imported ${newListingsCount} items and restored validation rules.`, ui.ButtonSet.OK);
    
    return true; 

  } catch (e) {
    throw new Error(e.message);
  }
}


/**
 * These functions are called by the 'Documentation' menu. They display a
 * dialog with a link to the relevant Google Doc.
 */

// A generic helper function to avoid repeating code.
function showUrlDialog(url, title) {
  const html = `
    <html>
      <body>
        <p>Click the link below to open the documentation in a new tab.</p>
        <a href="${url}" target="_blank" onclick="google.script.host.close()">Open: ${title}</a>
      </body>
    </html>`;
  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(400)
    .setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, title);
}

// --- Functions for each menu item ---

function openDocAddListing() {
  // TODO: Replace with your actual URL
  const url = 'https://docs.google.com/document/d/your-placeholder-doc-id-here/edit';
  showUrlDialog(url, 'How to add a new listing');
}

function openDocPublish() {
  // TODO: Replace with your actual URL
  const url = 'https://docs.google.com/document/d/your-placeholder-doc-id-here/edit';
  showUrlDialog(url, 'How to publish to the website');
}

function openDocDropdowns() {
  // TODO: Replace with your actual URL
  const url = 'https://docs.google.com/document/d/your-placeholder-doc-id-here/edit';
  showUrlDialog(url, 'How to update our dropdown lists');
}

function openDocRebuild() {
  // TODO: Replace with your actual URL
  const url = 'https://docs.google.com/document/d/your-placeholder-doc-id-here/edit';
  showUrlDialog(url, 'How to rebuild the Listings spreadsheet');
}

/**
 * Creates and displays an HTML modal dialog in the Google Sheet UI.
 * The modal will contain an iframe pointing to the provided Google Doc URL.
 *
 * @param {string} docUrl The full URL of the Google Doc.
 * @param {number} width The desired width of the modal in pixels.
 * @param {number} height The desired height of the modal in pixels.
 */

/**
 * Creates and displays a modal dialog in the Google Sheet UI.
 * The modal will contain an iframe pointing to the provided Google Doc URL.
 *
 * @param {string} docUrl The full URL of the Google Doc.
 */
function showDocInModal(docUrl) {
  // For a cleaner view, change the URL from '/edit' to '/preview'.
  const embedUrl = docUrl.replace(/\/edit.*$/, "/preview");

  // --- START OF CHANGE ---
  // We are adding CSS to make the <html> and <body> tags fill the entire
  // modal window, which allows the iframe's height="100%" to work correctly.
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          /* Tell the container elements to fill the entire space */
          html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden; /* Prevents scrollbars on the modal itself */
          }
          iframe {
            border: none; /* Remove the default iframe border */
          }
        </style>
      </head>
      <body>
        <iframe src="${embedUrl}" width="100%" height="100%"></iframe>
      </body>
    </html>
  `;
  // --- END OF CHANGE ---

  // Define fixed dimensions for the modal.
  const modalWidth = 800;
  const modalHeight = 650;

  // Create an HtmlOutput object from our content.
  const htmlOutput = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(modalWidth)
    .setHeight(modalHeight);

  // Display the modal dialog to the user.
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'User Documentation');
}
