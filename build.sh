#!/bin/bash
echo "Building DanDomain Storefront Editor with CKEditor5..."
npm run build
echo ""
echo "Build complete! Extension files are ready in the 'dist' folder."
echo ""
echo "To use the extension:"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable 'Developer mode'"
echo "3. Click 'Load unpacked' and select the 'dist' folder"
echo ""
echo "To create a distributable zip file, run: npm run package"
