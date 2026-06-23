import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Validates the Progressive Web App manifest served at /site.webmanifest
// (public/site.webmanifest, copied verbatim into the build output). The shared
// <head> (src/components/Seo.astro) advertises it with <link rel="manifest">,
// so a browser that offers "Add to Home Screen" / "Install" reads this file to
// pick the install name, colors, and icon. Nothing else in the suite guards it:
// a typo'd color, a dropped required member, or — most insidiously — an icon
// whose file was renamed or deleted would ship a broken install experience
// while every other check stayed green (the manifest is a static asset, not a
// rendered route, so the page-shape checks never touch it).
//
// This check locks the manifest's shape and, crucially, that every icon `src`
// resolves to a file that actually exists, and that the manifest's icon/manifest
// declarations stay consistent with the rel=icon / rel=apple-touch-icon /
// rel=manifest links the same <head> emits. It reads the source files directly
// (like check-share-metadata.js reads Seo.astro), so it runs without a build.

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const publicDir = path.join(projectRoot, 'public');
const manifestPath = path.join(publicDir, 'site.webmanifest');
const seoPath = path.join(projectRoot, 'src', 'components', 'Seo.astro');

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const VALID_DISPLAY = new Set(['fullscreen', 'standalone', 'minimal-ui', 'browser']);

// ---- 1) The manifest parses and is the expected shape ----------------------
assert.ok(fs.existsSync(manifestPath), 'public/site.webmanifest must exist');
const raw = fs.readFileSync(manifestPath, 'utf8');
let manifest;
assert.doesNotThrow(() => {
  manifest = JSON.parse(raw);
}, 'site.webmanifest must be valid JSON');
assert.ok(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest must be a JSON object');

// Identity / labelling members. name is the full install title; short_name is
// what a launcher shows under the icon (home screens truncate around 12 chars,
// so keep it short). Both are required for a usable install prompt.
assert.ok(typeof manifest.name === 'string' && manifest.name.trim().length > 0, 'manifest name must be a non-empty string');
assert.ok(
  typeof manifest.short_name === 'string' && manifest.short_name.trim().length > 0,
  'manifest short_name must be a non-empty string',
);
assert.ok(
  manifest.short_name.length <= 12,
  `manifest short_name should be <= 12 chars so launchers do not truncate it (got "${manifest.short_name}")`,
);
assert.ok(
  typeof manifest.description === 'string' && manifest.description.trim().length > 0,
  'manifest description must be a non-empty string',
);

// start_url must be a same-origin root-relative path so the installed app opens
// on the site itself (never an absolute off-site URL).
assert.ok(typeof manifest.start_url === 'string' && manifest.start_url.startsWith('/'), 'manifest start_url must be a root-relative path');
assert.ok(!/^https?:\/\//.test(manifest.start_url), 'manifest start_url must not be an absolute URL');

// display must be one of the four W3C-defined modes.
assert.ok(
  VALID_DISPLAY.has(manifest.display),
  `manifest display must be one of ${[...VALID_DISPLAY].join(', ')} (got ${JSON.stringify(manifest.display)})`,
);

// Colors drive the install splash + browser chrome; both must be 6-digit hex so
// the OS renders them (3-digit / named colors are not universally honored).
assert.ok(HEX6.test(manifest.background_color), `manifest background_color must be a 6-digit hex color (got ${JSON.stringify(manifest.background_color)})`);
assert.ok(HEX6.test(manifest.theme_color), `manifest theme_color must be a 6-digit hex color (got ${JSON.stringify(manifest.theme_color)})`);

// ---- 2) Every icon is well-formed and its file exists ----------------------
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest icons must be a non-empty array');

const seenSrc = new Set();
let pngCount = 0;
let svgIcon = null;
for (let i = 0; i < manifest.icons.length; i += 1) {
  const icon = manifest.icons[i];
  assert.ok(icon && typeof icon === 'object', `icon ${i} must be an object`);
  assert.ok(typeof icon.src === 'string' && icon.src.startsWith('/'), `icon ${i} src must be a root-relative path (got ${JSON.stringify(icon.src)})`);
  assert.ok(!seenSrc.has(icon.src), `icon ${i} src ${icon.src} is duplicated`);
  seenSrc.add(icon.src);
  assert.ok(typeof icon.sizes === 'string' && icon.sizes.length > 0, `icon ${i} (${icon.src}) must declare sizes`);
  assert.ok(typeof icon.type === 'string' && /^image\//.test(icon.type), `icon ${i} (${icon.src}) must declare an image/* type`);

  // The referenced file must actually exist in public/ — the whole point of the
  // check: a renamed or deleted icon asset is otherwise a silent install break.
  const iconFile = path.join(publicDir, icon.src.replace(/^\//, ''));
  assert.ok(fs.existsSync(iconFile), `icon ${i} src ${icon.src} does not resolve to a file in public/`);

  if (icon.type === 'image/svg+xml') {
    svgIcon = icon;
    // A scalable icon covers every launcher density, so it declares sizes "any".
    assert.equal(icon.sizes, 'any', `the SVG icon (${icon.src}) must declare sizes "any"`);
  } else if (icon.type === 'image/png') {
    pngCount += 1;
    // Raster icons must spell out concrete WxH dimensions (e.g. 32x32).
    assert.match(icon.sizes, /^\d+x\d+$/, `PNG icon ${icon.src} must declare concrete WxH sizes (got ${JSON.stringify(icon.sizes)})`);
  }
}
assert.ok(pngCount > 0, 'manifest must list at least one PNG icon for launchers without SVG support');
assert.ok(svgIcon, 'manifest must list a scalable image/svg+xml icon so install surfaces get a resolution-independent icon');

// ---- 3) Stay consistent with the <head> the site actually emits ------------
assert.ok(fs.existsSync(seoPath), 'src/components/Seo.astro must exist');
const seo = fs.readFileSync(seoPath, 'utf8');

// The manifest must be advertised, or no browser ever reads it.
assert.match(
  seo,
  /<link\s+rel="manifest"\s+href="\/site\.webmanifest"\s*\/>/,
  'Seo head must advertise the manifest with <link rel="manifest" href="/site.webmanifest" />',
);

// The scalable SVG icon in the manifest must be the same file the head declares
// as its rel="icon" type="image/svg+xml", so the install icon and the browser
// tab icon never diverge.
const headSvg = seo.match(/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="([^"]+)"\s*\/>/);
assert.ok(headSvg, 'Seo head must declare a scalable rel="icon" type="image/svg+xml" link');
assert.equal(
  svgIcon.src,
  headSvg[1],
  `manifest SVG icon (${svgIcon.src}) must match the head's rel="icon" svg href (${headSvg[1]})`,
);

// The apple-touch-icon the head points at should also be one of the manifest's
// icons, so iOS "Add to Home Screen" and the manifest agree on the touch icon.
const headApple = seo.match(/<link\s+rel="apple-touch-icon"\s+href="([^"]+)"\s*\/>/);
if (headApple) {
  assert.ok(
    seenSrc.has(headApple[1]),
    `the head's apple-touch-icon (${headApple[1]}) should also be listed in the manifest icons`,
  );
}

// ---- 4) If a build is present, the served copy must match the source -------
const distManifest = path.join(projectRoot, 'dist', 'site.webmanifest');
if (fs.existsSync(distManifest)) {
  assert.equal(
    fs.readFileSync(distManifest, 'utf8'),
    raw,
    'the built dist/site.webmanifest must be a verbatim copy of public/site.webmanifest',
  );
}

console.log(`check-webmanifest: OK (${manifest.icons.length} icons, ${pngCount} png + 1 svg, all files resolve)`);
