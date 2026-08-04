import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const storeDirectory = path.join(rootDirectory, 'assets', 'store');
const expectedStoreAssets = new Map([
  ['promo-small-440x280.png', [440, 280]],
  ['promo-marquee-1400x560.png', [1400, 560]],
  ['screenshot-01-next-match-1280x800.png', [1280, 800]],
  ['screenshot-02-confidence-1280x800.png', [1280, 800]],
  ['screenshot-03-viewing-1280x800.png', [1280, 800]],
  ['screenshot-04-resilient-1280x800.png', [1280, 800]],
  ['screenshot-05-privacy-1280x800.png', [1280, 800]],
]);

const storeFiles = (await fs.readdir(storeDirectory)).sort();
const expectedFiles = [...expectedStoreAssets.keys()].sort();

assert(JSON.stringify(storeFiles) === JSON.stringify(expectedFiles), 'Store asset inventory does not match the approved export set.');

for (const [filename, [expectedWidth, expectedHeight]] of expectedStoreAssets) {
  const metadata = await sharp(path.join(storeDirectory, filename)).metadata();
  assert(metadata.format === 'png', `${filename} must be PNG.`);
  assert(metadata.width === expectedWidth && metadata.height === expectedHeight, `${filename} must be ${expectedWidth}x${expectedHeight}.`);
}

for (const size of [16, 48, 128]) {
  const metadata = await sharp(path.join(rootDirectory, 'icons', `icon-${size}.png`)).metadata();
  assert(metadata.format === 'png', `icon-${size}.png must be PNG.`);
  assert(metadata.width === size && metadata.height === size, `icon-${size}.png must be ${size}x${size}.`);
}

const rootIcon = await sharp(path.join(rootDirectory, 'icon.png')).metadata();
assert(rootIcon.format === 'png' && rootIcon.width === 640 && rootIcon.height === 640, 'icon.png must be a 640x640 PNG source export.');

const manifest = JSON.parse(await fs.readFile(path.join(rootDirectory, 'manifest.json'), 'utf8'));
assert(manifest.description.length <= 132, 'Manifest description must remain within the Chrome Web Store summary limit.');
assert(manifest.icons?.['128'] === 'icons/icon-128.png', 'Manifest must use the approved 128px icon.');

const presentationText = [
  await fs.readFile(path.join(rootDirectory, 'popup.html'), 'utf8'),
  await fs.readFile(path.join(rootDirectory, 'assets', 'brand', 'kickoff-dial.svg'), 'utf8'),
  await fs.readFile(path.join(rootDirectory, 'scripts', 'generate-store-assets.mjs'), 'utf8'),
].join('\n');

assert(!/crest|timber-mini|marquee-a|marquee-b/i.test(presentationText), 'Presentation sources contain retired official-adjacent asset language.');

process.stdout.write(`Verified ${expectedStoreAssets.size} Chrome Web Store exports, 3 runtime icons, and the manifest presentation fields.\n`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
