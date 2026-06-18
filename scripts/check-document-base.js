import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Every Taopedia page renders through one of two <html>-emitting surfaces:
//   - src/layouts/WikiLayout.astro — the shared layout used by article pages,
//     category hubs, special pages, search, and the 404 page.
//   - src/pages/index.astro — the standalone homepage, which renders its own
//     <html>/<head> directly (it does not import WikiLayout).
//
// Each surface must emit three document-base invariants in <head>:
//   1. <html lang="en">       — WCAG 3.1.1 (Level A): screen readers need the
//                               language to pronounce content; without it they
//                               guess, often wrongly. Also a SEO signal.
//   2. <meta charset="UTF-8"> — declared encoding; without it the browser
//                               guesses (and may pick a legacy encoding),
//                               which can silently mojibake non-ASCII article
//                               text and break CSP/spec compliance checks.
//   3. <meta name="viewport"> — mobile responsiveness; without it mobile
//                               browsers render at a desktop viewport width
//                               and scale down, producing an unreadable page.
//
// None of these has an existing regression check: they are not "visible" so a
// removal produces no build error and no visible symptom on a desktop preview
// at full width, but each is a silent a11y/encoding/mobile regression. This
// guards them in both surfaces so a refactor or deletion fails fast.

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);

const surfaces = [
  {
    name: 'shared layout',
    rel: path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'),
  },
  {
    name: 'standalone homepage',
    rel: path.join(projectRoot, 'src', 'pages', 'index.astro'),
  },
];

for (const surface of surfaces) {
  const source = fs.readFileSync(surface.rel, 'utf8');

  // WCAG 3.1.1: the document element must declare its language. The attribute
  // must be on <html> (not <body> or a child) so it covers the whole document,
  // including <head> metadata read aloud by assistive tech.
  assert.match(
    source,
    /<html\s+lang="en">/,
    `${surface.name}: <html> must declare lang="en" (WCAG 3.1.1 Level A) so screen readers pronounce content correctly`,
  );

  // Encoding declaration must be a <meta charset> tag inside <head>. The HTML
  // spec recommends UTF-8; the rest of the build (feed builders, JSON-LD
  // serializer, OG image text) assumes UTF-8 throughout.
  assert.match(
    source,
    /<meta\s+charset="UTF-8"\s*\/?>/,
    `${surface.name}: <head> must declare <meta charset="UTF-8"> so the browser does not guess a legacy encoding`,
  );

  // Mobile viewport declaration. The exact content value matches the page's
  // responsive layout: width follows the device, initial scale 1.0 (no zoom
  // hijack). Removing it silently breaks mobile rendering.
  assert.match(
    source,
    /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0"\s*\/?>/,
    `${surface.name}: <head> must declare the mobile viewport so phones render at the device width instead of a scaled-down desktop layout`,
  );
}

console.log('Document base check passed');
