import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The shared <head> (src/components/Seo.astro) declares every page's social
// preview image as og:image:width=1200 / og:image:height=630 (asserted by
// check-share-metadata.js), and the renderer (renderOgImage in
// src/lib/og-image.ts, wired from src/pages/og/[slug].png.ts) builds the cards
// on a 1200x630 canvas. check-og-images.js then asserts every built article has
// a matching dist/og/<slug>.png file. None of those look inside the PNG bytes:
// the meta-tag check reads HTML strings and the bijection check only reads
// filenames, so a regression that changed the canvas size (or the resvg fitTo
// mode) would produce images whose real dimensions disagreed with the declared
// 1200x630 while every check stayed green.
//
// That disagreement is a silent social-preview regression: Facebook, LinkedIn,
// and Slack read og:image:width/height to reserve layout space before the image
// bytes arrive, so a mismatch renders a blank card first and reflows when the
// bytes finally load. A route that ever emitted a non-PNG body (an error page or
// a renamed SVG/JPEG) would break og:image rendering outright and is caught here
// too.
//
// This closes the gap by parsing each built PNG's IHDR chunk independently of
// the renderer source and asserting the real width/height is exactly 1200x630.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distOgDir = path.join(projectRoot, 'dist', 'og');

assert.ok(fs.existsSync(distOgDir), 'dist/og/ not found; run the build first');

// PNG signature (the first 8 bytes of every valid PNG) and the IHDR chunk, which
// always starts at byte 8 and carries width/height as big-endian uint32 at the
// fixed offsets defined by the PNG spec.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_TYPE = Buffer.from('IHDR', 'ascii');
const EXPECTED_WIDTH = 1200;
const EXPECTED_HEIGHT = 630;

const pngFiles = fs.readdirSync(distOgDir).filter((name) => name.endsWith('.png')).sort();
assert.ok(pngFiles.length > 0, 'no OG images found in dist/og/');

const notPng = [];
const wrongDimensions = [];

for (const name of pngFiles) {
  const buf = fs.readFileSync(path.join(distOgDir, name));

  // A valid PNG starts with the signature and an IHDR chunk. Any other leading
  // bytes mean the route served a non-PNG body (e.g. HTML/SVG/JPEG), which
  // breaks og:image rendering.
  if (buf.length < 24 || buf.subarray(0, 8).compare(PNG_SIGNATURE) !== 0 || buf.subarray(12, 16).compare(IHDR_TYPE) !== 0) {
    notPng.push(name);
    continue;
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
    wrongDimensions.push(`${name} (${width}x${height})`);
  }
}

assert.deepEqual(
  notPng,
  [],
  `every dist/og/*.png must be a valid PNG; not a PNG: ${notPng.join(', ') || '(none)'}`,
);

assert.deepEqual(
  wrongDimensions,
  [],
  `every OG image must be ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT} to match Seo.astro's og:image dimensions; wrong size: ${wrongDimensions.join(', ') || '(none)'}`,
);

console.log(`OG image dimensions check passed (${pngFiles.length} images, all ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT})`);
