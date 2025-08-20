// Main application state
let platformData = { shopId: null, catalogLink: '/shop/' };
let isInitialized = false;
let isDanDomainShop = false;
let domainWhitelist = [];

// Global platform data that other scripts can access
window.ddPlatformData = null;

// Internationalization
function getMessage(key, defaultValue = '') {
  return chrome.i18n?.getMessage(key) || defaultValue;
}

// Domain whitelist checking
function checkDomainWhitelist() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['domainWhitelist'], (result) => {
      domainWhitelist = result.domainWhitelist || [];
      
      // If no whitelist is configured, allow all domains
      if (domainWhitelist.length === 0) {
        resolve(true);
        return;
      }
      
      // Check if current domain matches any whitelisted domain
      const currentDomain = window.location.hostname.toLowerCase();
      const isAllowed = domainWhitelist.some(domain => 
        currentDomain === domain || currentDomain.endsWith('.' + domain)
      );
      
      if (!isAllowed) {
        console.log('DanDomain Storefront Editor: Domain not whitelisted:', currentDomain);
      }
      
      resolve(isAllowed);
    });
  });
}

// Inject script to access page context and setup communication
async function initializeDanDomainDetection() {
  // Check domain whitelist first
  const isDomainAllowed = await checkDomainWhitelist();
  if (!isDomainAllowed) {
    console.log('DanDomain Storefront Editor: Domain not in whitelist, extension disabled');
    return;
  }
  
  // Inject the web accessible script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('web_accessible.js');
  script.onload = function() { this.remove(); };
  (document.head || document.documentElement).appendChild(script);

  // Listen for platform data from the injected script
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    
    if (event.data.type === 'dandomain-platform-data') {
      const payload = event.data.payload;
      
      // Check if this is a DanDomain shop
      if (!payload.isDanDomainShop) {
        isDanDomainShop = false;
        return;
      }
      
      // Initialize the extension for DanDomain shops
      isDanDomainShop = true;
      platformData = payload;
      window.ddPlatformData = payload; // Make platform data globally available
      updateProductLinkRegex();
      
      if (!isInitialized) {
        initializeExtension();
      } else if (platformData.shopId) {
        enhanceLinks();
      }

      // Only initialize on category pages
      if (payload.isCategoryPage) {
        if (typeof categoryEditor !== 'undefined' && categoryEditor.setPlatformData && categoryEditor.initialize) {
          categoryEditor.setPlatformData(payload);
          setTimeout(() => {
            categoryEditor.initialize();
          }, 1000);
        } else if (typeof window.categoryEditor !== 'undefined') {
          window.categoryEditor.setPlatformData(payload);
          setTimeout(() => {
            window.categoryEditor.initialize();
          }, 1000);
        } else {
          console.warn('CategoryEditor not available or missing methods');
        }
      }
    }
  });
}

// Shop detection and data extraction with fallback methods
function getShopId() {
  if (platformData.shopId) {
    return platformData.shopId;
  }

  // Fallback methods (keep existing logic as backup)
  // Method 2: Try to extract from CSS/JS files in the page
  const stylesheets = document.querySelectorAll('link[rel="stylesheet"], script[src]');
  for (const element of stylesheets) {
    const url = element.href || element.src;
    if (url && url.includes('sfstatic.io')) {
      const match = url.match(/(shop\d+)\.sfstatic\.io/);
      if (match) {
        console.log('DanDomain Storefront Editor: Shop ID extracted from stylesheet/script:', match[1]);
        platformData.shopId = match[1]; // Set globally
        return match[1];
      }
    }
  }

  // Method 3: Look for shop ID in page source or meta tags
  const metaTags = document.querySelectorAll('meta, script');
  for (const element of metaTags) {
    const content = element.content || element.textContent || '';
    const match = content.match(/shop(\d+)/i);
    if (match) {
      console.log('DanDomain Storefront Editor: Shop ID found in meta/script:', match[1]);
      platformData.shopId = match[1]; // Set globally
    }
  }

  console.log('DanDomain Storefront Editor: No shop ID found using any method');
  return null;
}

// Product link detection and processing
let PRODUCT_LINK_REGEX = /^\/shop\/\d+-[^/]+\/\d+-[^/]+\/?$/;
const PRODUCT_ID_REGEX = /^(\d+)-/;

function updateProductLinkRegex() {
  const catalogLink = platformData.catalogLink || '/shop/';
  const escapedPath = catalogLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  PRODUCT_LINK_REGEX = new RegExp(`^${escapedPath}\\d+-[^/]+/\\d+-[^/]+/?$`);
}

function isProductLink(href) {
  return href && href.length >= 10 && PRODUCT_LINK_REGEX.test(href);
}

function isProductPage() {
  return platformData.isProductPage !== undefined 
    ? platformData.isProductPage 
    : PRODUCT_LINK_REGEX.test(window.location.pathname);
}

function extractProductId(href) {
  const catalogLink = platformData.catalogLink || '/shop/';
  const catalogParts = catalogLink.split('/').filter(part => part !== '');
  const parts = href.split('/');
  const productIndex = catalogParts.length + 2;
  
  if (parts.length < productIndex + 1) return null;
  
  const productPart = parts[productIndex];
  const match = productPart?.match(PRODUCT_ID_REGEX);
  return match ? match[1] : null;
}

function getCurrentPageProductId() {
  return platformData.productId || (isProductPage() ? extractProductId(window.location.pathname) : null);
}

// UI components - tooltip and fixed button
let globalTooltip = null;
let currentHoverTimeout = null;
let currentActiveLink = null;
let fixedButton = null;

function createTooltip() {
  if (globalTooltip) return globalTooltip;
  
  const tooltip = document.createElement('div');
  tooltip.className = 'quick-edit-tooltip';
  
  // Use internationalized text
  const editText = getMessage('editProduct', 'Rediger produkt');
  tooltip.innerHTML = `<div class="quick-edit-content">${editText}</div><div class="quick-edit-arrow"></div>`;
  
  // Tooltip hover handling
  tooltip.addEventListener('mouseenter', () => {
    if (currentHoverTimeout) {
      clearTimeout(currentHoverTimeout);
      currentHoverTimeout = null;
    }
    tooltip.classList.add('show');
  });
  
  tooltip.addEventListener('mouseleave', hideTooltip);
  
  document.body.appendChild(tooltip);
  globalTooltip = tooltip;
  return tooltip;
}

function createFixedButton(shopId, editableType, editableId) {
  if (fixedButton) return fixedButton;
  
  const button = document.createElement('button');
  button.className = 'quick-edit-fixed-button';
  
  // Set button text and URL based on type with i18n support
  let buttonText, buttonTitle, editUrl;
  
  switch (editableType) {
    case 'product':
      buttonText = getMessage('editProduct', 'Rediger produkt');
      buttonTitle = getMessage('editProductTooltip', 'Rediger dette produkt');
      editUrl = `https://${shopId}.webshop.dandomain.dk/heimdal/products/${editableId}`;
      break;
    case 'category':
      buttonText = getMessage('editCategory', 'Rediger kategori');
      buttonTitle = getMessage('editCategoryTooltip', 'Rediger denne kategori');
      editUrl = `https://${shopId}.webshop.dandomain.dk/heimdal/products/categories/${editableId}`;
      break;
    case 'page':
      buttonText = getMessage('editPage', 'Rediger side');
      buttonTitle = getMessage('editPageTooltip', 'Rediger denne side');
      editUrl = `https://${shopId}.webshop.dandomain.dk/heimdal/pages/${editableId}`;
      break;
    default:
      return null; // Unknown type
  }
  
  button.textContent = buttonText;
  button.title = buttonTitle;
  
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(editUrl, '_blank');
  });
  
  document.body.appendChild(button);
  fixedButton = button;
  
  setTimeout(() => button.classList.add('show'), 500);
  return button;
}

function showTooltip(element, shopId, editableId, editType = 'product') {
  if (currentHoverTimeout) {
    clearTimeout(currentHoverTimeout);
    currentHoverTimeout = null;
  }
  
  currentActiveLink = element;
  const tooltip = createTooltip();
  
  // Set click handler based on edit type
  let editUrl;
  switch (editType) {
    case 'product':
      editUrl = `https://${shopId}.webshop.dandomain.dk/heimdal/products/${editableId}`;
      break;
    case 'category':
      editUrl = `https://${shopId}.webshop.dandomain.dk/heimdal/products/categories/${editableId}`;
      break;
    case 'page':
      editUrl = `https://${shopId}.webshop.dandomain.dk/heimdal/pages/${editableId}`;
      break;
    default:
      editUrl = `https://${shopId}.webshop.dandomain.dk/heimdal/products/${editableId}`;
  }
  
  tooltip.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    window.open(editUrl, '_blank');
  };
  
  // Position tooltip
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + (rect.width / 2);
  const topY = rect.top + window.scrollY - 45;
  const finalLeft = Math.max(10, Math.min(centerX, window.innerWidth - 120));
  const finalTop = Math.max(10, topY);
  
  tooltip.style.position = 'absolute';
  tooltip.style.transform = `translate(${finalLeft}px, ${finalTop}px) translateX(-50%)`;
  tooltip.style.left = '0';
  tooltip.style.top = '0';
  tooltip.classList.add('show');
}

function hideTooltip() {
  if (currentHoverTimeout) {
    clearTimeout(currentHoverTimeout);
    currentHoverTimeout = null;
  }
  
  if (globalTooltip) {
    globalTooltip.classList.remove('show');
  }
  currentActiveLink = null;
}

// Main link enhancement function
function enhanceLinks() {
  if (!isDanDomainShop) return;
  
  updateProductLinkRegex();
  const shopId = getShopId();
  
  if (!shopId) {
    console.log('DanDomain Storefront Editor: No shop ID found, exiting');
    return;
  }

  // Create fixed button for editable pages
  if (platformData.editableType) {
    let editableId = null;
    
    switch (platformData.editableType) {
      case 'product':
        editableId = getCurrentPageProductId();
        break;
      case 'category':
        editableId = platformData.categoryId;
        break;
      case 'page':
        editableId = platformData.pageId;
        break;
    }
    
    if (editableId) {
      createFixedButton(shopId, platformData.editableType, editableId);
    }
  }

  // Process product links (keep existing product link enhancement)
  const catalogPath = platformData.catalogLink || '/shop/';
  const links = document.querySelectorAll(`a[href*="${catalogPath}"]:not(.quick-edit-enhanced):not(.quick-edit-checked)`);
  
  let enhancedCount = 0;
  
  for (const link of links) {
    const href = link.getAttribute('href');
    
    if (isProductLink(href)) {
      const productId = extractProductId(href);
      if (productId) {
        link.dataset.quickEditShopId = shopId;
        link.dataset.quickEditProductId = productId;
        link.dataset.quickEditType = 'product';
        link.classList.add('quick-edit-enhanced');
        enhancedCount++;
      } else {
        link.classList.add('quick-edit-checked');
      }
    } else {
      link.classList.add('quick-edit-checked');
    }
  }
  
  if (enhancedCount > 0) {
    console.log(`DanDomain Storefront Editor: Enhanced ${enhancedCount} product links`);
  }
}

// Event handling and content monitoring
function setupEventHandlers() {
  // Event delegation for tooltips
  document.body.addEventListener('mouseenter', (e) => {
    const link = e.target.closest('a.quick-edit-enhanced');
    if (link?.dataset.quickEditProductId) {
      const editType = link.dataset.quickEditType || 'product';
      showTooltip(link, link.dataset.quickEditShopId, link.dataset.quickEditProductId, editType);
    }
  }, true);
  
  document.body.addEventListener('mouseleave', (e) => {
    const link = e.target.closest('a.quick-edit-enhanced');
    if (link?.dataset.quickEditProductId) {
      if (currentHoverTimeout) clearTimeout(currentHoverTimeout);
      currentHoverTimeout = setTimeout(() => {
        if (currentActiveLink === link && !globalTooltip?.matches(':hover')) {
          hideTooltip();
        }
      }, 150);
    }
  }, true);
}

function setupContentMonitoring() {
  if (!isDanDomainShop) return;
  
  let enhanceTimeout;
  
  // Debounced enhancement function
  const debouncedEnhance = () => {
    clearTimeout(enhanceTimeout);
    enhanceTimeout = setTimeout(enhanceLinks, 200);
  };
  
  // Monitor DOM changes
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && 
              (node.tagName === 'A' || node.querySelector?.('a[href]') || 
               node.classList?.contains('product') || node.querySelector?.('[class*="product"]'))) {
            debouncedEnhance();
            return;
          }
        }
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  // Monitor URL changes for SPAs
  let lastUrl = location.href;
  const checkUrlChange = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      debouncedEnhance();
    }
  };
  
  // Override history methods
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    setTimeout(checkUrlChange, 500);
  };
  
  window.addEventListener('popstate', () => setTimeout(checkUrlChange, 500));
  setInterval(checkUrlChange, 2000); // Fallback check
}

// Initialize the extension
function initializeExtension() {
  if (isInitialized) return;
  isInitialized = true;
  
  setupEventHandlers();
  setupContentMonitoring();
  
  // Initial enhancement
  enhanceLinks();
  
  // Additional check after a delay for dynamically loaded content
  setTimeout(enhanceLinks, 2000);
}

// Initialize when DOM is ready
async function startExtension() {
  await initializeDanDomainDetection();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startExtension);
} else {
  startExtension();
}