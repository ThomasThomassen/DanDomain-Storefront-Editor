# DanDomain Storefront Editor

A Chrome extension that enhances DanDomain webshops with quick edit functionality and in-browser content editing via the DanDomain GraphQL API.

## Features

### Quick Backend Access
- **Product pages**: Shows an "Edit product" button
- **Category pages**: Shows an "Edit category" button
- **CMS pages**: Shows an "Edit page" button
- **Product links**: Hover tooltips everywhere for quick editing

### In-Browser Category Editing
- **WYSIWYG editor**: Edit category summary and description directly on the frontend using CKEditor5
- **Live preview**: See changes in real-time before saving
- **GraphQL integration**: Saves changes directly via DanDomain's API
- **HTML preservation**: Maintains existing HTML structure, classes, and styling

## Installation

### For End Users (Simple Installation)

1. **Download the pre-built extension**:
   - Download `dandomain-storefront-editor.zip` from releases
   - OR clone this repo and run `npm run package` to build it yourself

2. **Install in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select the `dist` folder (or extract the zip first)
   - The extension is now installed and ready to use!

### For Developers

## Development

### Prerequisites
- Node.js (v16 or higher)
- npm

### Building the Extension

The extension uses CKEditor5 with ES6 modules that need to be bundled:

```bash
# Install dependencies (first time only)
npm install

# Build the extension (creates complete dist/ folder)
npm run build

# Watch for changes during development
npm run dev

# Create a distributable zip file
npm run package

# Clean build artifacts
npm run clean
```

### Build Output

- **`dist/` folder**: Contains the complete, ready-to-install extension
- **`dandomain-storefront-editor.zip`**: Distributable package for end users

### Project Structure

```
├── src/category-editor.js     # Source code with ES6 imports
├── dist/                      # Complete built extension (ready to install)
│   ├── category-editor.js     # Bundled CKEditor5 (5.78 MB)
│   ├── manifest.json          # Extension manifest
│   ├── api.js, content.js     # Extension scripts
│   ├── *.png                  # Icons
│   └── _locales/              # Translations
├── package.json               # npm dependencies and scripts
├── webpack.config.js          # Build configuration
└── scripts/package.js         # Packaging script
```

### CKEditor5 Configuration

The editor includes DanDomain's complete configuration:
- Full HTML support with `GeneralHtmlSupport`
- Link decorators for new tab handling
- Image handling and styling
- Table support with column resizing
- Heading configuration (H2-H4)
- Rich text formatting (bold, italic, underline)
- Lists and indentation
- Media embedding

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