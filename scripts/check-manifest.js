import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderPwaIcon } from '../src/lib/pwa-icon.js';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public', 'site.webmanifest'), 'utf8'));

assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must declare icons');

// Browser install eligibility requires both a 192x192 and a 512x512 icon.
const sizes = new Set(manifest.icons.map((icon) => icon.sizes));
assert.ok(sizes.has('192x192'), 'manifest must declare a 192x192 icon (PWA install eligibility)');
assert.ok(sizes.has('512x512'), 'manifest must declare a 512x512 icon (PWA install eligibility)');

// A 512x512 maskable icon lets platforms apply adaptive masking without clipping.
assert.ok(
  manifest.icons.some(
    (icon) => icon.sizes === '512x512' && String(icon.purpose || '').split(/\s+/).includes('maskable'),
  ),
  'manifest must declare a 512x512 maskable icon',
);

// Every icon src must resolve to a real asset: a file in public/ or a build-time
// PNG endpoint at src/pages/<name>.ts.
for (const icon of manifest.icons) {
  const rel = String(icon.src || '').replace(/^\//, '');
  const inPublic = fs.existsSync(path.join(projectRoot, 'public', rel));
  const asEndpoint = fs.existsSync(path.join(projectRoot, 'src', 'pages', `${rel}.ts`));
  assert.ok(inPublic || asEndpoint, `manifest icon ${icon.src} must resolve to a public asset or a src/pages endpoint`);
}

// The generated icons must render to valid PNGs (magic bytes 89 50 4E 47).
for (const [size, opts] of [[192, {}], [512, {}], [512, { maskable: true }]]) {
  const png = renderPwaIcon(size, opts);
  assert.ok(png.length > 100, `renderPwaIcon(${size}) must produce a non-empty PNG`);
  assert.ok(
    png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47,
    `renderPwaIcon(${size}${opts.maskable ? ', maskable' : ''}) output must be a PNG`,
  );
}

console.log('Manifest check passed');
