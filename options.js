// Multiple API configurations management
class MultiApiManager {
  constructor() {
    this.apiConfigs = [];
    this.currentConfigId = 0;
  }

  async loadConfigs() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['apiConfigs'], (result) => {
        this.apiConfigs = result.apiConfigs || [];
        resolve(this.apiConfigs);
      });
    });
  }

  async saveConfigs() {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ apiConfigs: this.apiConfigs }, resolve);
    });
  }

  addConfig(config) {
    config.name = config.name || `${config.shopId} (${config.shopId}.mywebshop.io)`;
    this.apiConfigs.push(config);
    return config;
  }

  updateConfig(clientId, updates) {
    const index = this.apiConfigs.findIndex(config => config.clientId === clientId);
    if (index !== -1) {
      this.apiConfigs[index] = { ...this.apiConfigs[index], ...updates };
      return this.apiConfigs[index];
    }
    return null;
  }

  deleteConfig(clientId) {
    const index = this.apiConfigs.findIndex(config => config.clientId === clientId);
    if (index !== -1) {
      this.apiConfigs.splice(index, 1);
      return true;
    }
    return false;
  }

  getConfig(shopId) {
    return this.apiConfigs.find(config => config.shopId === shopId);
  }

  getAllConfigs() {
    return this.apiConfigs;
  }
}

const apiManager = new MultiApiManager();

// Internationalization helper
function initI18n() {
  // Set text content for elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      element.textContent = message;
    } else {
      // Fallback to English if message not found
      const fallbacks = {
        'settings': 'Settings',
        'apiIntegrations': 'API Integrations',
        'apiIntegrationsDescription': 'Configure API credentials for different DanDomain shops. You can add multiple shop configurations.',
        'shopId': 'Shop ID',
        'clientId': 'API Client ID',
        'clientSecret': 'API Client Secret',
        'testConnection': 'Test Connection',
        'clearCredentials': 'Clear Credentials',
        'domainWhitelist': 'Domain restriction',
        'domainWhitelistDescription': 'Restrict the extension to only run on specific domains. Leave empty to run on all DanDomain shops.',
        'noDomains': 'No domains added. Extension will run on all DanDomain shops.',
        'addDomain': 'Add domain',
        'save': 'Save',
        'removeDomain': 'Remove',
        'invalidDomain': 'Please enter a valid domain (e.g: example.com)',
        'duplicateDomain': 'This domain is already in the list'
      };
      if (fallbacks[key]) {
        element.textContent = fallbacks[key];
      }
    }
  });
  
  // Set placeholder text for elements with data-i18n-placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      element.placeholder = message;
    } else {
      // Fallback placeholder
      if (key === 'domainPlaceholder') {
        element.placeholder = 'e.g: myshop.com';
      } else if (key === 'shopIdPlaceholder') {
        element.placeholder = 'e.g: shop12345';
      } else if (key === 'clientIdPlaceholder') {
        element.placeholder = 'Your API client ID';
      } else if (key === 'clientSecretPlaceholder') {
        element.placeholder = 'Your API client secret';
      }
    }
  });
  
  // Set document title
  const titleMessage = chrome.i18n.getMessage('settings');
  if (titleMessage) {
    document.title = titleMessage;
  } else {
    document.title = 'Settings';
  }
}

// Domain management
let whitelist = [];

// Create API configuration form
function createApiConfigForm(config = null) {
  const isEdit = config !== null;
  const configId = isEdit ? config.clientId : Date.now();
  const formHtml = `
    <div class="api-config" data-config-id="${configId}">
      <div class="api-title">
        ${isEdit ? config.name : 'New API Configuration'}
        <div class="api-actions">
          <button class="test-btn" data-config-id="${configId}" data-action="test">Test Connection</button>
          <button class="delete-btn" data-config-id="${configId}" data-action="delete">Delete</button>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="shopId_${configId}">Shop ID</label>
          <input type="text" id="shopId_${configId}" placeholder="e.g: shop12345" value="${isEdit ? config.shopId || '' : ''}">
        </div>
        <div class="form-group">
          <label for="configName_${configId}">Configuration Name (Optional)</label>
          <input type="text" id="configName_${configId}" placeholder="e.g: Main Shop" value="${isEdit ? config.customName || '' : ''}">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="clientId_${configId}">API Client ID</label>
          <input type="text" id="clientId_${configId}" placeholder="Your API client ID" value="${isEdit ? config.clientId || '' : ''}">
        </div>
        <div class="form-group">
          <label for="clientSecret_${configId}">API Client Secret</label>
          <input type="password" id="clientSecret_${configId}" placeholder="Your API client secret" value="${isEdit ? config.clientSecret || '' : ''}">
        </div>
      </div>
      
      <div class="api-status" id="apiStatus_${configId}" style="display: none;">
        <span id="apiStatusText_${configId}"></span>
      </div>
      
      <div style="margin-top: 12px;">
        <button class="save-btn" data-config-id="${configId}" data-action="save">
          ${isEdit ? 'Update Configuration' : 'Save Configuration'}
        </button>
      </div>
    </div>
  `;
  
  return formHtml;
}

// Render all API configurations
async function renderApiConfigs() {
  await apiManager.loadConfigs();
  const configs = apiManager.getAllConfigs();
  const container = document.getElementById('apiConfigsList');
  const noApisMessage = document.getElementById('noApisMessage');
  
  if (!container) {
    console.error('apiConfigsList container not found');
    return;
  }
  
  if (configs.length === 0) {
    container.innerHTML = '';
    if (noApisMessage) {
      noApisMessage.style.display = 'block';
    }
  } else {
    if (noApisMessage) {
      noApisMessage.style.display = 'none';
    }
    container.innerHTML = configs.map(config => createApiConfigForm(config)).join('');
    
    // Show connection status for each config
    configs.forEach(config => {
      if (config.shopId && config.clientId && config.clientSecret) {
        if (config.accessToken && config.tokenExpiry > Date.now()) {
          showApiStatus(config.clientId, '✓ Connected (token valid)', 'connected');
        } else {
          showApiStatus(config.clientId, 'Credentials saved (test connection to verify)', 'testing');
        }
      }
    });
  }
}

// Add new API configuration
function addApiConfig() {
  const container = document.getElementById('apiConfigsList');
  const noApisMessage = document.getElementById('noApisMessage');
  
  if (noApisMessage) {
    noApisMessage.style.display = 'none';
  }
  
  if (container) {
    container.insertAdjacentHTML('beforeend', createApiConfigForm());
  }
}

// Save API configuration
async function saveApiConfig(configId) {
  const shopId = document.getElementById(`shopId_${configId}`).value.trim();
  const clientId = document.getElementById(`clientId_${configId}`).value.trim();
  const clientSecret = document.getElementById(`clientSecret_${configId}`).value.trim();
  const customName = document.getElementById(`configName_${configId}`).value.trim();
  
  if (!shopId || !clientId || !clientSecret) {
    showApiStatus(configId, 'Please fill in all required fields', 'disconnected');
    return;
  }
  
  const config = {
    shopId,
    clientId,
    clientSecret,
    customName,
    name: customName || `${shopId} (${shopId}.mywebshop.io)`,
    accessToken: '',
    tokenExpiry: null
  };
  
  // Check if this is an update or new config
  const existingConfig = apiManager.getAllConfigs().find(c => c.clientId == config.clientId);
  if (existingConfig) {
    apiManager.updateConfig(config.clientId, config);
  } else {
    apiManager.addConfig(config);
  }
  
  await apiManager.saveConfigs();
  showApiStatus(config.clientId, '✓ Configuration saved', 'connected');

  // Update the title
  const titleElement = document.querySelector(`[data-config-id="${configId}"] .api-title`);
  if (titleElement) {
    titleElement.firstChild.textContent = config.name;
  }
}

// Delete API configuration
async function deleteApiConfig(configId) {
  if (confirm('Are you sure you want to delete this API configuration?')) {
    apiManager.deleteConfig(parseInt(configId));
    await apiManager.saveConfigs();
    renderApiConfigs();
  }
}

// Test API connection
async function testApiConnection(configId) {
  const shopId = document.getElementById(`shopId_${configId}`).value.trim();
  const clientId = document.getElementById(`clientId_${configId}`).value.trim();
  const clientSecret = document.getElementById(`clientSecret_${configId}`).value.trim();
  
  if (!shopId || !clientId || !clientSecret) {
    showApiStatus(configId, 'Please fill in all API fields', 'disconnected');
    return;
  }
  
  const testBtn = document.querySelector(`[data-config-id="${configId}"] .test-btn`);
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  
  showApiStatus(configId, 'Testing connection...', 'testing');
  
  try {
    const token = await getAccessToken(shopId, clientId, clientSecret);
    
    if (token) {
      showApiStatus(configId, '✓ Connection successful!', 'connected');
      
      // Update the stored config with the token
      const config = apiManager.getAllConfigs().find(c => c.clientId == configId);
      if (config) {
        apiManager.updateConfig(parseInt(configId), {
          accessToken: token.access_token,
          tokenExpiry: Date.now() + (token.expires_in * 1000)
        });
        await apiManager.saveConfigs();
      }
    } else {
      showApiStatus(configId, '✗ Authentication failed', 'disconnected');
    }
  } catch (error) {
    console.error('API test error:', error);
    showApiStatus(configId, `✗ Error: ${error.message}`, 'disconnected');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

// Show API status for specific config
function showApiStatus(configId, message, type) {
  const statusElement = document.getElementById(`apiStatus_${configId}`);
  const statusText = document.getElementById(`apiStatusText_${configId}`);
  
  if (statusElement && statusText) {
    statusText.textContent = message;
    statusElement.className = `api-status ${type}`;
    statusElement.style.display = 'flex';
    
    if (type === 'connected') {
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 3000);
    }
  }
}

// Get access token (shared utility function)
async function getAccessToken(shopId, clientId, clientSecret) {
  try {
    const response = await fetch(`https://${shopId}.mywebshop.io/auth/oauth/token`, {
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Test the token with a simple GraphQL query
    const testQuery = `
      query {
        domains {
          data {
            id
            domain
          }
        }
      }
    `;
    
    const testResponse = await fetch(`https://${shopId}.mywebshop.io/api/graphql`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.access_token}`
      },
      body: JSON.stringify({
        query: testQuery,
        variables: {},
        operationName: null
      })
    });
    
    const testResult = await testResponse.json();
    
    if (!testResponse.ok || testResult.errors) {
      throw new Error(testResult.errors?.[0]?.message || 'GraphQL test failed');
    }
    
    return data;
  } catch (error) {
    console.error('Token request failed:', error);
    throw error;
  }
}

// Domain management functions
function addDomain() {
  const domainInput = document.getElementById('domainInput');
  const domain = domainInput.value.trim().toLowerCase();
  
  if (!domain) {
    return;
  }
  
  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!domainRegex.test(domain)) {
    showMessage('invalidDomain');
    return;
  }
  
  if (whitelist.includes(domain)) {
    showMessage('duplicateDomain');
    return;
  }
  
  whitelist.push(domain);
  domainInput.value = '';
  renderDomainList();
}

function removeDomain(index) {
  whitelist.splice(index, 1);
  renderDomainList();
}

function renderDomainList() {
  const domainList = document.getElementById('domainList');
  const emptyState = document.getElementById('emptyState');
  
  if (whitelist.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
  }
  
  const domainsHtml = whitelist.map((domain, index) => `
    <div class="domain-item">
      <span class="domain-text">${domain}</span>
      <button class="remove-btn" data-index="${index}" data-i18n="removeDomain">Remove</button>
    </div>
  `).join('');
  
  domainList.innerHTML = domainsHtml + `<div class="empty-state" id="emptyState" style="${whitelist.length > 0 ? 'display: none;' : ''}" data-i18n="noDomains"></div>`;
  
  // Re-initialize i18n for new elements
  initI18n();
}

function showMessage(key) {
  const messages = {
    'invalidDomain': 'Please enter a valid domain (e.g: example.com)',
    'duplicateDomain': 'This domain is already in the list'
  };
  
  alert(messages[key] || key);
}

function saveSettings() {
  chrome.storage.sync.set({ domainWhitelist: whitelist }, () => {
    const saveBtn = document.getElementById('saveBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved!';
    saveBtn.style.background = '#34a853';
    
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = '#1a73e8';
    }, 2000);
  });
}

function loadSettings() {
  chrome.storage.sync.get(['domainWhitelist'], (result) => {
    whitelist = result.domainWhitelist || [];
    renderDomainList();
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  initI18n();
  loadSettings();
  renderApiConfigs();
  
  const addApiBtn = document.getElementById('addApiBtn');
  const addDomainBtn = document.getElementById('addDomainBtn');
  const saveBtn = document.getElementById('saveBtn');
  const domainInput = document.getElementById('domainInput');
  const domainList = document.getElementById('domainList');
  
  if (addApiBtn) {
    addApiBtn.addEventListener('click', addApiConfig);
  }
  
  if (addDomainBtn) {
    addDomainBtn.addEventListener('click', addDomain);
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }
  
  // Handle Enter key in domain input
  if (domainInput) {
    domainInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addDomain();
      }
    });
  }
  
  // Handle remove button clicks using event delegation
  if (domainList) {
    domainList.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-btn')) {
        const index = parseInt(e.target.getAttribute('data-index'));
        removeDomain(index);
      }
    });
  }
  
  // Handle API configuration button clicks using event delegation
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-action]')) {
      const action = e.target.getAttribute('data-action');
      const configId = e.target.getAttribute('data-config-id');
      
      switch (action) {
        case 'test':
          testApiConnection(configId);
          break;
        case 'delete':
          deleteApiConfig(configId);
          break;
        case 'save':
          saveApiConfig(configId);
          break;
      }
    }
  });
});


