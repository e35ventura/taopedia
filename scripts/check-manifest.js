import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Validate public/site.webmanifest: the file Seo.astro links as the installable
// web app manifest. Astro copies public/ verbatim into the build, so a malformed
// manifest, an icon `src` that points at a file that does not exist, or a missing
// installability requirement ships straight to production and silently breaks the
// PWA install/home-screen experience. Kept as a pure, exported validator (like
// check-csp.js) so the invariants run against fixtures, not just the live file.

// The largest concrete pixel dimension declared in a `sizes` string
// ("192x192 512x512" -> 512), or 0 when none parse. `any` is handled by the
// caller as a scalable icon and never reaches here as a pixel size.
function maxPixelSize(sizes) {
  let max = 0;
  for (const token of String(sizes).trim().split(/\s+/)) {
    const match = /^(\d+)x(\d+)$/i.exec(token);
    if (match) max = Math.max(max, Number(match[1]), Number(match[2]));
  }
  return max;
}

// An icon counts toward installability when it is scalable (`sizes: "any"`, e.g.
// an SVG) or raster and at least 192px on its largest edge — the threshold
// Chromium and Lighthouse use for the install prompt / home-screen icon.
function isInstallableIcon(icon) {
  const sizes = String(icon.sizes ?? '').trim().toLowerCase();
  if (sizes.split(/\s+/).includes('any')) return true;
  return maxPixelSize(sizes) >= 192;
}

// Parse the manifest text, asserting it is valid JSON (a trailing comma or stray
// token would otherwise ship a manifest the browser silently ignores).
export function parseManifest(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    assert.fail(`site.webmanifest is not valid JSON: ${error.message}`);
  }
}

// Validate a parsed manifest. `iconExists(src)` reports whether an icon `src`
// resolves to a real file, injected so the rules can be exercised without a
// filesystem. Pure and exported for the self-tests below.
export function validateManifest(manifest, iconExists) {
  assert.ok(manifest && typeof manifest === 'object', 'manifest must be a JSON object');

  // Identity + install fields. `id` gives the installed app a stable identity
  // independent of start_url (Chromium warns when it is absent); the others are
  // required for an installable standalone PWA.
  for (const field of ['name', 'short_name', 'id', 'start_url', 'display']) {
    assert.equal(typeof manifest[field], 'string', `manifest.${field} must be a string`);
    assert.ok(manifest[field].length > 0, `manifest.${field} must not be empty`);
  }

  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest.icons must be a non-empty array');

  for (const icon of manifest.icons) {
    assert.ok(icon && typeof icon === 'object', 'each manifest icon must be an object');
    assert.equal(typeof icon.src, 'string', 'each manifest icon must declare a string src');
    assert.ok(icon.src.startsWith('/'), `icon src "${icon.src}" must be a root-relative path`);
    assert.equal(typeof icon.sizes, 'string', `icon "${icon.src}" must declare its sizes`);
    assert.equal(typeof icon.type, 'string', `icon "${icon.src}" must declare its MIME type`);
    assert.ok(iconExists(icon.src), `manifest icon "${icon.src}" has no matching file in public/`);
  }

  assert.ok(
    manifest.icons.some(isInstallableIcon),
    'manifest must declare an installable icon (sizes "any" or at least 192px) so the PWA can be installed',
  );

  return manifest;
}

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const publicDir = path.join(projectRoot, 'public');
const manifestPath = path.join(publicDir, 'site.webmanifest');

const liveIconExists = (src) => fs.existsSync(path.join(publicDir, src.replace(/^\/+/, '')));

const manifest = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
validateManifest(manifest, liveIconExists);

// Self-tests: prove each invariant actually rejects a broken manifest. A fixture
// where every declared icon "exists" except where a test overrides it.
const presentIcons = (src) => src !== '/missing.png';

const VALID_MANIFEST = {
  name: 'Taopedia',
  short_name: 'Taopedia',
  id: '/',
  start_url: '/',
  display: 'standalone',
  icons: [
    { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    { src: '/apple-touch-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
};

// A complete, installable manifest is accepted.
assert.doesNotThrow(
  () => validateManifest(VALID_MANIFEST, presentIcons),
  'a complete installable manifest must be accepted',
);

// A scalable ("any") icon satisfies installability; so does a >=192px raster icon.
assert.doesNotThrow(
  () =>
    validateManifest(
      { ...VALID_MANIFEST, icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      presentIcons,
    ),
  'a 192px raster icon must satisfy installability',
);

// A missing manifest id must be REJECTED.
assert.throws(
  () => {
    const { id, ...withoutId } = VALID_MANIFEST;
    return validateManifest(withoutId, presentIcons);
  },
  /manifest\.id/,
  'a manifest without an id must be rejected',
);

// An empty required field must be REJECTED.
assert.throws(
  () => validateManifest({ ...VALID_MANIFEST, name: '' }, presentIcons),
  /manifest\.name must not be empty/,
  'a manifest with an empty name must be rejected',
);

// A manifest with no icons must be REJECTED.
assert.throws(
  () => validateManifest({ ...VALID_MANIFEST, icons: [] }, presentIcons),
  /non-empty array/,
  'a manifest without icons must be rejected',
);

// An icon pointing at a file that does not exist must be REJECTED.
assert.throws(
  () =>
    validateManifest(
      { ...VALID_MANIFEST, icons: [{ src: '/missing.png', sizes: 'any', type: 'image/png' }] },
      presentIcons,
    ),
  /no matching file in public/,
  'a manifest icon with no backing file must be rejected',
);

// A manifest whose only icons are below the install threshold must be REJECTED.
assert.throws(
  () =>
    validateManifest(
      { ...VALID_MANIFEST, icons: [{ src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }] },
      presentIcons,
    ),
  /installable icon/,
  'a manifest with no installable icon must be rejected',
);

// Malformed JSON must be REJECTED by parseManifest.
assert.throws(
  () => parseManifest('{ "name": "Taopedia", }'),
  /not valid JSON/,
  'a manifest with invalid JSON must be rejected',
);

console.log('Web app manifest check passed');
