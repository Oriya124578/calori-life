import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fitnessIconsDir = path.join(__dirname, '..', 'calori_fitness', 'assets', 'icons');
const fitnessWebDir = path.join(__dirname, '..', 'calori_fitness', 'web');
const fitnessWebIconsDir = path.join(fitnessWebDir, 'icons');

async function generate() {
  const svgPath = path.join(fitnessIconsDir, 'logo.svg');
  
  if (!fs.existsSync(svgPath)) {
    console.error('logo.svg not found at: ' + svgPath);
    return;
  }

  const svgBuffer = fs.readFileSync(svgPath);

  console.log('Generating PNG and JPEG assets for Calori Fitness...');

  // 1. Generate app_icon.png (512x512, transparent background)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(fitnessIconsDir, 'app_icon.png'));
  console.log('- Generated app_icon.png');

  // 2. Generate app_icon.jpg (512x512, solid cream #FAF7F2 background)
  await sharp(svgBuffer)
    .resize(512, 512)
    .flatten({ background: '#FAF7F2' })
    .jpeg({ quality: 90 })
    .toFile(path.join(fitnessIconsDir, 'app_icon.jpg'));
  console.log('- Generated app_icon.jpg');

  // 3. Generate web/favicon.png (32x32)
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(fitnessWebDir, 'favicon.png'));
  console.log('- Generated web/favicon.png');

  // 4. Generate web/icons/Icon-192.png (192x192)
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(fitnessWebIconsDir, 'Icon-192.png'));
  console.log('- Generated Icon-192.png');

  // 5. Generate web/icons/Icon-512.png (512x512)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(fitnessWebIconsDir, 'Icon-512.png'));
  console.log('- Generated Icon-512.png');

  // 6. Generate web/icons/Icon-maskable-192.png (192x192, with background)
  await sharp(svgBuffer)
    .resize(192, 192)
    .flatten({ background: '#FAF7F2' })
    .png()
    .toFile(path.join(fitnessWebIconsDir, 'Icon-maskable-192.png'));
  console.log('- Generated Icon-maskable-192.png');

  // 7. Generate web/icons/Icon-maskable-512.png (512x512, with background)
  await sharp(svgBuffer)
    .resize(512, 512)
    .flatten({ background: '#FAF7F2' })
    .png()
    .toFile(path.join(fitnessWebIconsDir, 'Icon-maskable-512.png'));
  console.log('- Generated Icon-maskable-512.png');

  console.log('Successfully generated all Calori Fitness assets from logo.svg!');
}

generate().catch(console.error);
