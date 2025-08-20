import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

const createExtensionZip = () => {
  const output = fs.createWriteStream('dandomain-storefront-editor.zip');
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });

  output.on('close', () => {
    console.log(`Extension packaged: ${archive.pointer()} total bytes`);
    console.log('Created: dandomain-storefront-editor.zip');
    console.log('Ready for Chrome Web Store or manual installation!');
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  
  // Add all files from dist directory
  archive.directory('dist/', false);
  
  archive.finalize();
};

createExtensionZip();
