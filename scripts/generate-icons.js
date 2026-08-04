const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..', 'assets', 'brand', 'kickoff-dial.svg');
const ROOT_OUTPUT = path.resolve(__dirname, '..', 'icon.png');
const OUT_DIR = path.resolve(__dirname, '..', 'icons');
const SIZES = [16, 48, 128];

async function generate() {
  const source = fs.readFileSync(SOURCE);

  await sharp(source)
    .resize(640, 640, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(ROOT_OUTPUT);

  console.log('  icon.png');

  for (const size of SIZES) {
    await sharp(source)
      .resize(size, size, { fit: 'fill' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(OUT_DIR, `icon-${size}.png`));

    console.log(`  icons/icon-${size}.png`);
  }

  console.log('Done.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
