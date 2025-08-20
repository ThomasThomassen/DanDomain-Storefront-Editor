Write-Host "Building DanDomain Storefront Editor with CKEditor5..." -ForegroundColor Green
npm run build
Write-Host ""
Write-Host "Build complete! Extension files are ready in the 'dist' folder." -ForegroundColor Green
Write-Host ""
Write-Host "To use the extension:" -ForegroundColor Yellow
Write-Host "1. Open Chrome and go to chrome://extensions/" -ForegroundColor White
Write-Host "2. Enable 'Developer mode'" -ForegroundColor White
Write-Host "3. Click 'Load unpacked' and select the 'dist' folder" -ForegroundColor White
Write-Host ""
Write-Host "To create a distributable zip file, run: npm run package" -ForegroundColor Cyan
