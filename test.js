// Test file for DanDomain GraphQL API functionality
// This file demonstrates how to use the API module

// Example usage of the DanDomain API
async function testAPI(configId = null) {
  console.log('Testing DanDomain API...');
  
  try {
    // Initialize the API
    await danDomainAPI.initialize(configId);
    
    if (!danDomainAPI.isConfigured()) {
      console.error('API not configured. Please set up credentials in extension options.');
      return;
    }
    
    console.log('API configured successfully');
    
    // Test authentication
    const token = await danDomainAPI.getAccessToken();
    console.log('Access token obtained:', token ? 'SUCCESS' : 'FAILED');
    
    // Test getting languages
    try {
      const languages = await danDomainAPI.getLanguages();
      console.log('Available languages:', languages);
    } catch (error) {
      console.log('Languages query failed:', error.message);
    }
    
    // Test getting all categories
    try {
      const categories = await danDomainAPI.getAllCategories(1);
      console.log('Available categories:', categories);
    } catch (error) {
      console.log('Categories query failed:', error.message);
    }
    
  } catch (error) {
    console.error('API test failed:', error);
  }
}

// Test the category editor
function testCategoryEditor() {
  if (typeof categoryEditor !== 'undefined') {
    console.log('Category editor available');
    console.log('Platform data:', window.platform);
    categoryEditor.initialize();
  } else {
    console.log('Category editor not loaded');
  }
}

// Test platform data detection
function testPlatformData() {
  console.log('Platform data in content script:', platformData);
  
  if (platformData && platformData.platform) {
    console.log('Page data:', platformData.platform.page);
    console.log('General data:', platformData.platform.general);
    console.log('Language ISO:', platformData.languageIso);
    console.log('Language ID:', platformData.languageId);
    console.log('Category ID:', platformData.categoryId);
    console.log('Is category page:', platformData.isCategoryPage);
  } else {
    console.log('Platform data not available in content script');
  }
}

// Force category editor initialization
function forceCategoryEditor() {
  if (typeof categoryEditor !== 'undefined') {
    console.log('Forcing category editor initialization...');
    
    // Use existing platform data or create mock data
    const mockData = platformData || {
      isCategoryPage: true,
      pageType: 'category',
      categoryId: 1,
      pageId: 1,
      languageIso: 'DK',
      languageId: 1,
      shopId: 'shop12345'
    };
    
    categoryEditor.setPlatformData(mockData);
    categoryEditor.initialize();
  }
}

// Expose test functions to console for manual testing
window.testDanDomainAPI = testAPI;
window.testCategoryEditor = testCategoryEditor;
window.testPlatformData = testPlatformData;
window.forceCategoryEditor = forceCategoryEditor;

console.log('DanDomain API test functions loaded:');
console.log('- testDanDomainAPI() - Test API connection and queries');
console.log('- testCategoryEditor() - Test category editor initialization'); 
console.log('- testPlatformData() - Check platform data availability');
console.log('- forceCategoryEditor() - Force category editor with mock data');
