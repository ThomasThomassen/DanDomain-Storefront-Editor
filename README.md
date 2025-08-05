# DanDomain Storefront Editor

A simple Chrome extension that adds quick edit buttons and tooltips to DanDomain webshops. Makes it super easy to jump from the frontend directly to the backend editor.

## What it does

- **Product pages**: Shows an "Edit product" button
- **Category pages**: Shows an "Edit category" button  
- **CMS pages**: Shows an "Edit page" button
- **Product links**: Hover tooltips everywhere for quick editing

## Languages

- English (default)
- Danish (dansk)

## Settings

Right-click the extension icon → Options to configure:
- **Domain whitelist**: Restrict to specific shops (optional)
- By default runs on all DanDomain shops

## How it works

1. Detects if you're on a DanDomain shop
2. Figures out what page you're on (product, category, or CMS page)
3. Adds edit buttons that link to the admin panel

The extension reads the `window.platform` object that DanDomain provides to determine page types and IDs.

## Backend URLs

- Products: `{shopId}.webshop.dandomain.dk/heimdal/products/{productId}`
- Categories: `{shopId}.webshop.dandomain.dk/heimdal/products/categories/{categoryId}`  
- Pages: `{shopId}.webshop.dandomain.dk/heimdal/pages/{pageId}`