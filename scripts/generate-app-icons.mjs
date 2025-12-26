import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const input = path.join(repoRoot, 'src', 'assets', 'validel-logo.png');
const outDir = path.join(repoRoot, 'public', 'icons');
const resourcesIcon = path.join(repoRoot, 'resources', 'icon.png');
const resourcesSplash = path.join(repoRoot, 'resources', 'splash.png');
const androidResDir = path.join(repoRoot, 'android', 'app', 'src', 'main', 'res');

const webpSizes = [48, 72, 96, 128, 192, 256, 512];

// Android mipmap sizes for ic_launcher
const androidIconSizes = {
  'mipmap-ldpi': 36,
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Android splash screen sizes (drawable-port-*)
const androidSplashSizes = {
  'drawable-port-ldpi': { width: 200, height: 320 },
  'drawable-port-mdpi': { width: 320, height: 480 },
  'drawable-port-hdpi': { width: 480, height: 800 },
  'drawable-port-xhdpi': { width: 720, height: 1280 },
  'drawable-port-xxhdpi': { width: 960, height: 1600 },
  'drawable-port-xxxhdpi': { width: 1280, height: 1920 },
};

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'resources'), { recursive: true });

  // Generate PWA icons in WebP
  for (const size of webpSizes) {
    const outPath = path.join(outDir, `icon-${size}.webp`);
    await sharp(input)
      .resize(size, size, { fit: 'cover' })
      .webp({ quality: 90 })
      .toFile(outPath);
  }

  // Generate favicon PNGs
  await sharp(input)
    .resize(32, 32, { fit: 'cover' })
    .png({ quality: 90 })
    .toFile(path.join(outDir, 'icon-32.png'));

  await sharp(input)
    .resize(16, 16, { fit: 'cover' })
    .png({ quality: 90 })
    .toFile(path.join(outDir, 'icon-16.png'));

  // Capacitor expects resources/icon.png (1024x1024)
  await sharp(input)
    .resize(1024, 1024, { fit: 'cover' })
    .png({ quality: 95 })
    .toFile(resourcesIcon);

  // Generate resources/splash.png (2732x2732 for Capacitor)
  await sharp(input)
    .resize(600, 600, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .extend({
      top: 1066,
      bottom: 1066,
      left: 1066,
      right: 1066,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png({ quality: 95 })
    .toFile(resourcesSplash);

  // Generate Android launcher icons (ic_launcher.png)
  for (const [folder, size] of Object.entries(androidIconSizes)) {
    const folderPath = path.join(androidResDir, folder);
    await fs.mkdir(folderPath, { recursive: true });
    
    // ic_launcher.png (standard icon) - logo plein cadre
    await sharp(input)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ quality: 90 })
      .toFile(path.join(folderPath, 'ic_launcher.png'));
    
    // ic_launcher_round.png (round icon) - logo plein cadre
    await sharp(input)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ quality: 90 })
      .toFile(path.join(folderPath, 'ic_launcher_round.png'));
    
    // ic_launcher_foreground.png (adaptive icon foreground) - logo agrandi
    const foregroundSize = Math.round(size * 1.5);
    const logoSize = Math.round(foregroundSize * 0.72); // 72% du foreground = logo bien visible
    await sharp(input)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: Math.round((foregroundSize - logoSize) / 2),
        bottom: Math.round((foregroundSize - logoSize) / 2),
        left: Math.round((foregroundSize - logoSize) / 2),
        right: Math.round((foregroundSize - logoSize) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .resize(foregroundSize, foregroundSize)
      .png({ quality: 90 })
      .toFile(path.join(folderPath, 'ic_launcher_foreground.png'));
  }

  // Generate Android splash screens
  for (const [folder, dims] of Object.entries(androidSplashSizes)) {
    const folderPath = path.join(androidResDir, folder);
    await fs.mkdir(folderPath, { recursive: true });
    
    const logoSize = Math.min(dims.width, dims.height) * 0.4;
    await sharp(input)
      .resize(Math.round(logoSize), Math.round(logoSize), { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .extend({
        top: Math.round((dims.height - logoSize) / 2),
        bottom: Math.round((dims.height - logoSize) / 2),
        left: Math.round((dims.width - logoSize) / 2),
        right: Math.round((dims.width - logoSize) / 2),
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .resize(dims.width, dims.height)
      .png({ quality: 90 })
      .toFile(path.join(folderPath, 'splash.png'));
  }

  // Generate main drawable splash
  const drawablePath = path.join(androidResDir, 'drawable');
  await fs.mkdir(drawablePath, { recursive: true });
  await sharp(input)
    .resize(480, 480, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png({ quality: 90 })
    .toFile(path.join(drawablePath, 'splash.png'));

  console.log('✅ Generated:');
  console.log('   - PWA icons in public/icons/');
  console.log('   - resources/icon.png (1024x1024)');
  console.log('   - resources/splash.png (2732x2732)');
  console.log('   - Android launcher icons in android/app/src/main/res/mipmap-*/');
  console.log('   - Android splash screens in android/app/src/main/res/drawable-port-*/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
