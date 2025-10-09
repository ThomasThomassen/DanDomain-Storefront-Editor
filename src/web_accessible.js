// This script runs in the page context and has access to window.platform
(function() {
  // Check if this is a DanDomain shop first
  const generatorMeta = document.querySelector('meta[name="generator"]');
  if (!generatorMeta || generatorMeta.getAttribute('content') !== 'DanDomain Webshop') {
    // Send message indicating this is not a DanDomain shop
    window.postMessage({
      type: 'dandomain-platform-data',
      payload: { isDanDomainShop: false }
    }, '*');
    return; // Exit early for non-DanDomain shops
  }

  function extractPlatformData() {
    const data = {
      isDanDomainShop: true,
      shopId: null,
      catalogLink: '/shop/', // Default fallback
      isProductPage: false,
      productId: null,
      pageType: null,
      pageId: null,
      categoryId: null,
      isCMSPage: false,
      isCategoryPage: false,
      editableType: null, // 'product', 'category', 'page', or null
      languageIso: null,
      languageId: null,
      platform: null // Include the sanitized platform object
    };

    // Helper function to sanitize objects for postMessage
    function sanitizeForPostMessage(obj, maxDepth = 3, currentDepth = 0) {
      if (currentDepth >= maxDepth) return null;
      
      if (obj === null || obj === undefined) return obj;
      
      if (typeof obj === 'function') return null; // Skip functions
      
      if (typeof obj === 'object') {
        if (obj instanceof Date) return obj.toISOString();
        if (obj instanceof Array) {
          return obj.map(item => sanitizeForPostMessage(item, maxDepth, currentDepth + 1))
                    .filter(item => item !== null);
        }
        
        const sanitized = {};
        for (const key in obj) {
          if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
            const value = sanitizeForPostMessage(obj[key], maxDepth, currentDepth + 1);
            if (value !== null) {
              sanitized[key] = value;
            }
          }
        }
        return sanitized;
      }
      
      // Return primitive values as-is
      return obj;
    }

    // Extract data from window.platform if available
    if (window.platform) {
      try {
        // Store the sanitized platform object
        data.platform = sanitizeForPostMessage(window.platform);

        // Get shop ID from CDN URL
        if (window.platform.template?.cdn) {
          const match = window.platform.template.cdn.match(/(shop\d+)\.sfstatic\.io/);
          if (match) {
            console.info('DanDomain Storefront Editor: Found shop ID from platform:', match[1]);
            data.shopId = match[1];
          }
        }

        // Get catalog link
        if (window.platform.general?.productCatalogLink) {
          data.catalogLink = window.platform.general.productCatalogLink;
        }

        // Get language information
        if (window.platform.general?.languageIso) {
          data.languageIso = window.platform.general.languageIso;
        }

        // Get page information
        if (window.platform.page) {
          data.pageType = window.platform.page.type || null;
          data.pageId = window.platform.page.id;
          data.categoryId = window.platform.page.categoryId;
          data.isProductPage = window.platform.page.isProduct;
          
          // Determine what type of page we can edit
          if (data.isProductPage && window.platform.page.productId) {
            // Product page with actual product
            data.productId = window.platform.page.productId.toString();
            data.editableType = 'product';
          } else if (data.isProductPage && !window.platform.page.productId && data.categoryId) {
            // Category page (product listing without specific product)
            data.isCategoryPage = true;
            data.editableType = 'category';
          } else if (window.platform.page.isText && !window.platform.page.isFrontPage) {
            // CMS text page (not frontpage)
            data.isCMSPage = true;
            data.editableType = 'page';
          } else if (data.pageType === 'category') {
            // Direct category page detection
            data.isCategoryPage = true;
            data.editableType = 'category';
          }
        }
      } catch (error) {
        console.warn('DanDomain Storefront Editor: Error extracting platform data:', error);
      }
    }

    return data;
  }  function sendPlatformData() {
    try {
      const platformData = extractPlatformData();
      console.log('DanDomain Storefront Editor: Sending platform data:', platformData);
      
      // Test if the data can be serialized before sending
      try {
        JSON.stringify(platformData);
      } catch (serializationError) {
        console.error('DanDomain Storefront Editor: Platform data serialization failed:', serializationError);
        // Send minimal data if full data fails
        const minimalData = {
          isDanDomainShop: platformData.isDanDomainShop,
          shopId: platformData.shopId,
          catalogLink: platformData.catalogLink,
          pageType: platformData.pageType,
          categoryId: platformData.categoryId,
          languageIso: platformData.languageIso,
          languageId: platformData.languageId,
          editableType: platformData.editableType,
          isCategoryPage: platformData.isCategoryPage
        };
        
        window.postMessage({
          type: 'dandomain-platform-data',
          payload: minimalData
        }, '*');
        return;
      }
      
      window.postMessage({
        type: 'dandomain-platform-data',
        payload: platformData
      }, '*');
    } catch (error) {
      console.error('DanDomain Storefront Editor: Error sending platform data:', error);
    }
  }

  // Send initial data
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendPlatformData);
  } else {
    sendPlatformData();
  }

  // Also send data when window.platform becomes available (for delayed loading)
  let platformCheckInterval = null;
  let timeoutId = null;
  
  if (!window.platform) {
    platformCheckInterval = setInterval(() => {
      if (window.platform) {
        clearInterval(platformCheckInterval);
        clearTimeout(timeoutId);
        platformCheckInterval = null;
        timeoutId = null;
        sendPlatformData();
      }
    }, 100);
    
    // Stop checking after 10 seconds
    timeoutId = setTimeout(() => {
      if (platformCheckInterval) {
        clearInterval(platformCheckInterval);
        platformCheckInterval = null;
      }
    }, 10000);
  }
})();
