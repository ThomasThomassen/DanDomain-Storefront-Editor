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

function renderDomainList() {
  const domainList = document.getElementById('domainList');
  const emptyState = document.getElementById('emptyState');
  
  if (whitelist.length === 0) {
    emptyState.style.display = 'block';
    // Remove existing domain items
    domainList.querySelectorAll('.domain-item').forEach(item => item.remove());
  } else {
    emptyState.style.display = 'none';
    
    // Clear existing items
    domainList.querySelectorAll('.domain-item').forEach(item => item.remove());
    
    // Add domain items
    whitelist.forEach((domain, index) => {
      const domainItem = document.createElement('div');
      domainItem.className = 'domain-item';
      
      // Get localized remove button text
      const removeText = chrome.i18n.getMessage('removeDomain') || 'Remove';
      
      domainItem.innerHTML = `
        <span class="domain-text">${escapeHtml(domain)}</span>
        <button class="remove-btn" data-index="${index}">${removeText}</button>
      `;
      
      domainList.appendChild(domainItem);
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addDomain() {
  const input = document.getElementById('domainInput');
  const domain = input.value.trim().toLowerCase();
  
  if (!domain) return;
  
  // Basic domain validation
  if (!domain.match(/^[a-z0-9.-]+\.[a-z]{2,}$/)) {
    const errorMessage = chrome.i18n.getMessage('invalidDomain') || 'Please enter a valid domain (e.g: example.com)';
    alert(errorMessage);
    return;
  }
  
  // Check for duplicates
  if (whitelist.includes(domain)) {
    const duplicateMessage = chrome.i18n.getMessage('duplicateDomain') || 'This domain is already in the list';
    alert(duplicateMessage);
    return;
  }
  
  whitelist.push(domain);
  input.value = '';
  renderDomainList();
}

function removeDomain(index) {
  whitelist.splice(index, 1);
  renderDomainList();
}

function saveSettings() {
  chrome.storage.sync.set({ domainWhitelist: whitelist }, () => {
    const statusMessage = document.getElementById('statusMessage');
    const savedText = chrome.i18n.getMessage('saved') || 'Saved!';
    
    statusMessage.textContent = savedText;
    statusMessage.className = 'status-message success';
    statusMessage.style.display = 'block';
    
    setTimeout(() => {
      statusMessage.style.display = 'none';
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
  
  document.getElementById('addDomainBtn').addEventListener('click', addDomain);
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  
  // Handle Enter key in domain input
  document.getElementById('domainInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addDomain();
    }
  });
  
  // Handle remove button clicks using event delegation
  document.getElementById('domainList').addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-btn')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      removeDomain(index);
    }
  });
});

// Add missing locale message
if (!chrome.i18n.getMessage('noDomains')) {
  // Fallback for missing locale
  document.addEventListener('DOMContentLoaded', () => {
    const emptyState = document.getElementById('emptyState');
    if (emptyState && emptyState.textContent.includes('noDomains')) {
      emptyState.textContent = 'No domains added. Extension will run on all DanDomain shops.';
    }
  });
}
