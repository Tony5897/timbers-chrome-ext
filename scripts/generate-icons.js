const sharp = require('sharp');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..', 'icon.png');
const OUT_DIR = path.resolve(__dirname, '..', 'icons');
const SIZES = [16, 48, 128];

async function generate() {
  const metadata = await sharp(SOURCE).metadata();
  const crop = Math.min(metadata.width, metadata.height);
  const left = Math.round((metadata.width - crop) / 2);
  const top = Math.round((metadata.height - crop) / 2);

  for (const size of SIZES) {
    await sharp(SOURCE)
      .extract({ left, top, width: crop, height: crop })
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toFile(path.join(OUT_DIR, `icon-${size}.png`));

    console.log(`  icons/icon-${size}.png`);
  }

  console.log('Done.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
