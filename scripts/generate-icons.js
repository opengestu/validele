#!/usr/bin/env node
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

(async function generate() {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const iconsDir = path.join(projectRoot, 'public', 'icons');
    const srcSvg = path.join(iconsDir, 'validel-logo.svg');

    if (!fs.existsSync(srcSvg)) {
      console.error('Source SVG not found:', srcSvg);
      process.exit(1);
    }

    const sizes = [48, 72, 96, 128, 192, 256, 512];

    console.log('Generating WebP icons from', srcSvg);

    await Promise.all(sizes.map(async (size) => {
      const out = path.join(iconsDir, `icon-${size}.webp`);
      await sharp(srcSvg)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toFile(out);
      console.log(' ->', out);
    }));

    // Ensure PNG favicons for 32x32 and 16x16 exist (used as favicons)
    const pngTargets = [32, 16];
    await Promise.all(pngTargets.map(async (size) => {
      const out = path.join(iconsDir, `validel-logo-${size}.png`);
      await sharp(srcSvg)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ quality: 90 })
        .toFile(out);
      console.log(' ->', out);
    }));

    // Update manifest.webmanifest to ensure icons entries exist and mark 512 as maskable
    const manifestPath = path.join(projectRoot, 'public', 'manifest.webmanifest');
    if (fs.existsSync(manifestPath)) {
      console.log('Updating manifest at', manifestPath);
      const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
      let manifest;
      try { manifest = JSON.parse(manifestRaw); } catch (e) { manifest = {}; }
      manifest.icons = manifest.icons || [];

      const ensureIcon = (src, size, type, purpose) => {
        const existing = manifest.icons.find(i => i.src === src || i.sizes === `${size}x${size}`);
        if (existing) {
          existing.src = src; existing.sizes = `${size}x${size}`; existing.type = type; if (purpose) existing.purpose = purpose;
        } else {
          const entry = { src, sizes: `${size}x${size}`, type };
          if (purpose) entry.purpose = purpose;
          manifest.icons.push(entry);
        }
      };

      sizes.forEach(s => ensureIcon(`icons/icon-${s}.webp`, s, 'image/webp'));
      // mark 512 as maskable
      ensureIcon('icons/icon-512.webp', 512, 'image/webp', 'any maskable');

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      console.log('Manifest updated.');
    } else {
      console.warn('No manifest.webmanifest found at', manifestPath);
    }

    console.log('\nAll icons generated.');
    console.log('You can run this script again whenever you update the SVG.');
    console.log('To run: npm run generate:icons (script added to package.json) or node scripts/generate-icons.js');
  } catch (err) {
    console.error('Icon generation failed:', err);
    process.exit(1);
  }
})();
