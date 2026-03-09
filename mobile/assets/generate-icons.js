/**
 * EcoQuest Icon Generator - pakai jimp-compact (support JPEG+PNG)
 * Jalankan: node assets/generate-icons.js
 */
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = __dirname;
const ANDROID_RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const ANDROID_SIZES = [
  { folder: 'mipmap-mdpi',    size: 48  },
  { folder: 'mipmap-hdpi',    size: 72  },
  { folder: 'mipmap-xhdpi',   size: 96  },
  { folder: 'mipmap-xxhdpi',  size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

const ASSET_FILES = [
  { name: 'icon.png',          size: 1024 },
  { name: 'adaptive-icon.png', size: 1024 },
  { name: 'favicon.png',       size:   48 },
  { name: 'splash.png',        size: 1024 },
];

async function main() {
  // Coba load jimp-compact
  let Jimp;
  try {
    Jimp = require('../node_modules/jimp-compact');
    // jimp-compact bisa export sebagai fungsi atau object
    if (typeof Jimp !== 'function' && Jimp.default) Jimp = Jimp.default;
  } catch(e) {
    console.error('❌ jimp-compact tidak ditemukan:', e.message);
    process.exit(1);
  }

  const sourcePath = path.join(ASSETS_DIR, 'logo-source.png');
  if (!fs.existsSync(sourcePath)) {
    console.error('❌ File logo-source.png tidak ditemukan di folder assets!');
    process.exit(1);
  }

  console.log('📂 Membaca logo source...');
  const image = await Jimp.read(sourcePath);
  console.log(`✅ Logo: ${image.getWidth()}x${image.getHeight()}`);

  // Generate Expo assets
  console.log('\n🖼️  Generating Expo asset files...');
  for (const { name, size } of ASSET_FILES) {
    const resized = image.clone().resize(size, size);
    const outPath = path.join(ASSETS_DIR, name);
    await resized.writeAsync(outPath);
    console.log(`   ✅ ${name} (${size}x${size})`);
  }

  // Generate Android mipmaps
  console.log('\n📱 Generating Android mipmaps...');
  for (const { folder, size } of ANDROID_SIZES) {
    const resized = image.clone().resize(size, size);
    const outDir = path.join(ANDROID_RES, folder);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    await resized.writeAsync(path.join(outDir, 'ic_launcher.png'));
    await resized.writeAsync(path.join(outDir, 'ic_launcher_round.png'));
    console.log(`   ✅ ${folder}/ (${size}x${size})`);
  }

  console.log('\n🎉 Semua icon berhasil di-generate!');
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
