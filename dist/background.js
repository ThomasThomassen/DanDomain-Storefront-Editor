// Background script for DanDomain Storefront Editor
// Handles storage initialization, settings, and API calls

// Background API handler for CORS-free requests
class BackgroundAPI {
  constructor() {
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'graphql') {
        this.handleGraphQLRequest(request, sendResponse);
        return true; // Keep the message channel open for async response
      }
      
      if (request.action === 'getConfig') {
        this.getStoredConfig(sendResponse);
        return true;
      }
      
      if (request.action === 'oauth') {
        this.handleOAuthRequest(request, sendResponse);
        return true;
      }
    });
  }

  async getStoredConfig(sendResponse) {
    try {
      const config = await chrome.storage.sync.get(['shopId', 'clientId', 'clientSecret', 'apiUrl']);
      sendResponse({ success: true, config });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleOAuthRequest(request, sendResponse) {
    try {
      const { shopId, clientId, clientSecret, apiUrl } = request;
      
      const response = await fetch(`${apiUrl}/auth/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: ''
        })
      });

      if (!response.ok) {
        throw new Error(`OAuth request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Background: OAuth request successful');
      sendResponse({ success: true, data });
    } catch (error) {
      console.error('Background OAuth error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleGraphQLRequest(request, sendResponse) {
    try {
      const { query, variables, shopId, accessToken, apiUrl } = request;
      
      if (!accessToken) {
        throw new Error('No access token provided');
      }

      console.log('Background: Making GraphQL request to:', `${apiUrl}/api/graphql`);
      console.log('Background: Query:', query);
      console.log('Background: Variables:', variables);
      console.log('Background: Shop ID:', shopId);

      const response = await fetch(`${apiUrl}/api/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Shop-Id': shopId
        },
        body: JSON.stringify({
          query,
          variables
        })
      });

      console.log('Background: Response status:', response.status);
      console.log('Background: Response headers:', Object.fromEntries(response.headers.entries()));

      const responseText = await response.text();
      console.log('Background: Response body:', responseText);

      if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}. Response: ${responseText}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Failed to parse response as JSON: ${parseError.message}. Response: ${responseText}`);
      }
      
      if (data.errors) {
        console.log('Background: GraphQL errors:', data.errors);
        throw new Error(`GraphQL errors: ${data.errors.map(e => e.message).join(', ')}`);
      }

      console.log('Background: GraphQL request successful', data.data);
      sendResponse({ success: true, data: data.data });
    } catch (error) {
      console.error('Background GraphQL error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
}

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

// Initialize the background API
new BackgroundAPI();
