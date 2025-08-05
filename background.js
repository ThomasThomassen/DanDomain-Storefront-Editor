// Background script for DanDomain Storefront Editor
// Handles storage initialization and settings

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Initialize default settings
    chrome.storage.sync.set({
      domainWhitelist: [] // Empty array means run on all DanDomain shops
    });
    
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});

// Handle extension icon click (if we add browser action later)
chrome.action?.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
