# DanDomain Storefront Editor

A Chrome extension that enhances DanDomain webshops with quick edit functionality and in-browser content editing via the DanDomain GraphQL API.

## Features

### Quick Backend Access
- **Product pages**: Shows an "Edit product" button
- **Category pages**: Shows an "Edit category" button
- **CMS pages**: Shows an "Edit page" button
- **Product links**: Hover tooltips everywhere for quick editing

### In-Browser Category Editing
- **WYSIWYG editor**: Edit category summary and description directly on the frontend
- **Live preview**: See changes in real-time before saving
- **GraphQL integration**: Saves changes directly via DanDomain's API

## API Integration

### Setup
1. Go to extension options (right-click extension icon → Options)
2. Enter your:
   - **Shop ID** (e.g., shop12345)
   - **API Client ID**
   - **API Client Secret**
3. Click "Test Connection" to verify credentials
4. Save settings

### Authentication Flow
The extension automatically handles OAuth2 authentication:
```
POST https://{shopId}.mywebshop.io/auth/oauth/token
grant_type=client_credentials&client_id={id}&client_secret={secret}
```

### GraphQL Operations
Currently supports:
- `Mutation.productCategoryUpdate` - Update category translations
- `query.domains` - Fetching languageId and domain for internal mapping
- `query.productCategories` - Fetching category translations to find DOM containers

## Languages

- English (default)
- Danish (dansk)

## Settings

Right-click the extension icon → Options to configure:
- **API Integration**: Set up GraphQL API credentials
- **Domain whitelist**: Restrict to specific shops (optional)
- By default runs on all DanDomain shops

## How it works

### Backend Detection
1. Detects if you're on a DanDomain shop
2. Figures out what page you're on (product, category, or CMS page)
3. Adds edit buttons that link to the admin panel

### Category Editing
1. Detects category pages via `window.platform.page.type === 'category'`
2. Finds summary/description elements using common selectors
3. Provides WYSIWYG editing interface with toolbar
4. Saves changes via GraphQL API with proper language targeting

The extension reads the `window.platform` object that DanDomain provides to determine page types and IDs.

## Backend URLs

- Products: `{shopId}.webshop.dandomain.dk/heimdal/products/{productId}`
- Categories: `{shopId}.webshop.dandomain.dk/heimdal/products/categories/{categoryId}`
- Pages: `{shopId}.webshop.dandomain.dk/heimdal/pages/{pageId}`