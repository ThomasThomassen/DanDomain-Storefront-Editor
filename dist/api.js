// DanDomain GraphQL API Module
class DanDomainAPI {
  constructor() {
    this.configs = [];
    this.currentConfig = null;
  }

  // Initialize the API with stored configurations
  async initialize(shopId = null) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['apiConfigs'], (result) => {
        this.configs = result.apiConfigs || [];
        if (shopId) {
          // Find config for specific shop
          const success = this.setCurrentShop(shopId);
          if (!success) {
            console.warn('Failed to set shop:', shopId);
          }
          resolve(success);
        }  else {
          console.warn('No API configurations found');
          resolve(false);
        }
      });
    });
  }

  // Set current configuration by shop ID
  setCurrentShop(shopId) {
    const config = this.configs.find(config => config.shopId === shopId);
    if (config) {
      this.currentConfig = config;
      return true;
    } else {
      console.warn('Shop configuration not found:', shopId);
      return false;
    }
  }

  // Get current shop ID
  getCurrentShopId() {
    return this.currentConfig ? this.currentConfig.shopId : null;
  }

  // Get configuration for a specific shop
  getConfigForShop(shopId) {
    return this.configs.find(config => config.shopId === shopId);
  }

  // Get all configured shops
  getConfiguredShops() {
    return this.configs.map(config => ({
      shopId: config.shopId,
      name: config.name || config.shopId,
      isConfigured: !!(config.clientId && config.clientSecret)
    }));
  }

  // Check if a specific shop has valid token
  hasValidTokenForShop(shopId) {
    const config = this.getConfigForShop(shopId);
    return config &&
           config.accessToken && 
           config.tokenExpiry && 
           config.tokenExpiry > Date.now();
  }

  // Clear cache for a specific shop
  clearCacheForShop(shopId) {
    // Clear category cache for all languages for this shop
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(`categories_${shopId}_`)) {
        localStorage.removeItem(key);
      }
    });
  }

  // Clear all cache
  clearAllCache() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('categories_')) {
        localStorage.removeItem(key);
      }
    });
  }

  // Check if API is configured and has valid credentials
  isConfigured() {
    if (!this.currentConfig) {
      return false;
    }
    return !!(this.currentConfig.shopId && 
              this.currentConfig.clientId && 
              this.currentConfig.clientSecret);
  }

  // Get detailed configuration status
  getConfigurationStatus() {
    if (!this.currentConfig) {
      return {
        isConfigured: false,
        hasToken: false,
        shopId: null,
        issues: ['No shop configuration selected']
      };
    }

    const issues = [];
    if (!this.currentConfig.shopId) issues.push('Missing shop ID');
    if (!this.currentConfig.clientId) issues.push('Missing client ID');
    if (!this.currentConfig.clientSecret) issues.push('Missing client secret');

    return {
      isConfigured: issues.length === 0,
      hasToken: this.hasValidToken(),
      shopId: this.currentConfig.shopId,
      issues
    };
  }

  // Check if we have a valid access token
  hasValidToken() {
    return this.currentConfig &&
           this.currentConfig.accessToken && 
           this.currentConfig.tokenExpiry && 
           this.currentConfig.tokenExpiry > Date.now();
  }

  // Get a fresh access token via background script
  async getAccessToken() {
    if (!this.isConfigured()) {
      throw new Error('API not configured. Please set up credentials in the extension options.');
    }

    // Return existing token if still valid
    if (this.hasValidToken()) {
      return this.currentConfig.accessToken;
    }

    return await this.getAccessTokenForShop(this.currentConfig.shopId);
  }

  // Get access token for a specific shop
  async getAccessTokenForShop(shopId) {
    const config = this.getConfigForShop(shopId);
    if (!config) {
      throw new Error(`No configuration found for shop: ${shopId}`);
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error(`Shop ${shopId} is not properly configured. Missing client credentials.`);
    }

    // Return existing token if still valid
    if (config.accessToken && config.tokenExpiry && config.tokenExpiry > Date.now()) {
      return config.accessToken;
    }

    try {
      // Use background script for OAuth request (bypasses CORS)
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'oauth',
          shopId: shopId,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          apiUrl: `https://${shopId}.mywebshop.io`
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        });
      });

      // Update config with new token
      config.accessToken = response.access_token;
      config.tokenExpiry = Date.now() + (response.expires_in * 1000); // Convert seconds to milliseconds

      // Update stored configs - find by shopId to ensure we update the right one
      const configIndex = this.configs.findIndex(c => c.shopId === shopId);
      if (configIndex !== -1) {
        this.configs[configIndex] = { ...this.configs[configIndex], ...config };
        
        // Save updated configs to storage
        chrome.storage.sync.set({ apiConfigs: this.configs }, () => {
          console.log('Updated token for shop:', shopId);
        });
      } else {
        console.warn('Could not find config to update for shop:', shopId);
      }

      return config.accessToken;
    } catch (error) {
      console.error('Failed to get access token for shop:', shopId, error);
      throw error;
    }
  }

  // Execute a GraphQL query/mutation via background script
  async executeGraphQL(query, variables = {}, operationName = null, shopId = null) {
    // Use provided shopId or fall back to current config
    const targetShopId = shopId || (this.currentConfig ? this.currentConfig.shopId : null);
    
    if (!targetShopId) {
      throw new Error('No shop ID provided and no current configuration selected.');
    }
    
    // Get config for the target shop
    const config = this.getConfigForShop(targetShopId);
    if (!config) {
      throw new Error(`No configuration found for shop: ${targetShopId}`);
    }
    
    if (!config.clientId || !config.clientSecret) {
      throw new Error(`Shop ${targetShopId} is not properly configured. Missing client credentials.`);
    }
    
    try {
      const token = await this.getAccessTokenForShop(targetShopId);
      
      // Use background script to make the request (bypasses CORS)
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'graphql',
          query,
          variables,
          shopId: targetShopId,
          accessToken: token,
          apiUrl: `https://${targetShopId}.mywebshop.io`
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        });
      });
    } catch (error) {
      console.error('GraphQL execution failed for shop:', targetShopId, error);
      throw error;
    }
  }

  // Update product category translations
  async updateCategoryTranslations(categoryId, languageId, title, summary, description, shopId = null) {
    const mutation = `
      mutation UpdateCategoryTranslations(
        $categoryId: ID!
        $languageId: ID!
        $title: String
        $summary: HTML
        $description: HTML
      ) {
        productCategoryUpdate(
          input: {
            id: $categoryId
            translations: [
              {
                languageId: $languageId
                data: {
                  title: $title
                  summary: $summary
                  description: $description
                }
              }
            ]
          }
        ) {
          data {
            updatedAt
            id
            translations {
              data {
                title
                summary
                description
              }
            }
          }
        }
      }
    `;

    const variables = {
      categoryId: categoryId.toString(),
      languageId: languageId.toString(),
      title,
      summary,
      description
    };

    return await this.executeGraphQL(mutation, variables, 'UpdateCategoryTranslations', shopId);
  }

  // Get category details with translations (from cached getAllCategories data)
  async getCategoryDetails(categoryId, languageId = null, shopId = null) {
    // Auto-detect language ID if not provided
    if (languageId === null) {
      const domainInfo = await this.detectLanguageId(shopId);
      languageId = domainInfo.languageId;
    }
    
    // Get all categories (this will use cache if available)
    const allCategories = await this.getAllCategories(languageId, shopId);
    
    // Find the specific category by ID
    const category = allCategories.find(cat => cat.id === categoryId.toString());
    
    if (!category) {
      console.warn('API: Category not found with ID:', categoryId);
      return null;
    }

    return category;
  }

  // Get all categories with caching
  async getAllCategories(languageId = null, shopId = null) {
    // Use provided shopId or fall back to current config
    const targetShopId = shopId || (this.currentConfig ? this.currentConfig.shopId : null);
    
    if (!targetShopId) {
      throw new Error('No shop ID provided and no current configuration selected');
    }
    
    // Auto-detect language ID if not provided
    if (languageId === null) {
      const domainInfo = await this.detectLanguageId(targetShopId);
      languageId = domainInfo.languageId;
      console.log('Auto-detected language ID:', languageId, 'for domain:', domainInfo.domain);
    }
    
    const cacheKey = `categories_${targetShopId}_${languageId}`;
    const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    
    // Check cache first
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < cacheExpiry) {
        return data.categories;
      }
    }

    const query = `
      query GetAllCategories($languageIds: [ID!]!) {
        productCategories {
          content {
            id
            translations(languageIds: $languageIds) {
              data {
                title
                summary
                description
              }
            }
          }
        }
      }
    `;

    const variables = { 
      languageIds: [languageId.toString()]
    };
    
    const result = await this.executeGraphQL(query, variables, 'GetAllCategories', targetShopId);
    const categories = result.productCategories.content;
    
    // Cache the result
    localStorage.setItem(cacheKey, JSON.stringify({
      categories,
      timestamp: Date.now()
    }));
    
    return categories;
  }

  // Get available domains
  async getDomains(shopId = null) {
    const query = `
      query GetDomains {
        domains {
          data {
            id
            siteId
            languageId
            domain
          }
        }
      }
    `;

    return await this.executeGraphQL(query, {}, 'GetDomains', shopId);
  }

  // Detect language ID based on current domain
  async detectLanguageId(shopId = null) {
    try {
      // Get all domains for the shop
      const domainsResponse = await this.getDomains(shopId);
      const domains = domainsResponse.domains.data;
      
      // Get current domain (without subdomain like www.)
      const currentDomain = window.location.hostname.toLowerCase();
      const currentDomainWithoutWww = currentDomain.replace(/^www\./, '');
      
      // Try to find exact match first
      let matchedDomain = domains.find(d => 
        d.domain.toLowerCase() === currentDomain || 
        d.domain.toLowerCase() === currentDomainWithoutWww
      );
      
      // If no exact match, try partial matching (domain contains current domain or vice versa)
      if (!matchedDomain) {
        matchedDomain = domains.find(d => {
          const domainLower = d.domain.toLowerCase();
          return domainLower.includes(currentDomainWithoutWww) || 
                 currentDomainWithoutWww.includes(domainLower);
        });
      }
      
      if (matchedDomain) {
        return {
          languageId: parseInt(matchedDomain.languageId),
          siteId: parseInt(matchedDomain.siteId),
          domain: matchedDomain.domain,
          domainId: parseInt(matchedDomain.id)
        };
      } else {
        console.warn('No matching domain found, defaulting to language ID 1');
        return {
          languageId: 1,
          siteId: 1,
          domain: currentDomain,
          domainId: null
        };
      }
    } catch (error) {
      console.error('Failed to detect language ID:', error);
      // Fallback to default
      return {
        languageId: 1,
        siteId: 1,
        domain: window.location.hostname,
        domainId: null
      };
    }
  }

  // Validate shop and domain configuration
  async validateShopAndDomain(shopId) {
    try {
      const domainInfo = await this.detectLanguageId(shopId);
      const config = this.getConfigForShop(shopId);
      
      if (!config) {
        return {
          isValid: false,
          error: `No configuration found for shop: ${shopId}`,
          domainInfo
        };
      }
      
      if (!config.clientId || !config.clientSecret) {
        return {
          isValid: false,
          error: `Shop ${shopId} is not properly configured. Missing client credentials.`,
          domainInfo
        };
      }
      
      return {
        isValid: true,
        shopId,
        config,
        domainInfo,
        languageId: domainInfo.languageId,
        siteId: domainInfo.siteId
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        domainInfo: null
      };
    }
  }
}

// Create a global instance
const danDomainAPI = new DanDomainAPI();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DanDomainAPI;
}
