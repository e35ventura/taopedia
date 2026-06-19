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
    absPath: path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'),
  },
  {
    name: 'standalone homepage',
    absPath: path.join(projectRoot, 'src', 'pages', 'index.astro'),
  },
];

for (const surface of surfaces) {
  const source = fs.readFileSync(surface.absPath, 'utf8');

  // WCAG 3.1.1: the document element must declare its language. The attribute
  // must be on <html> (not <body> or a child) so it covers the whole document,
  // including <head> metadata read aloud by assistive tech. The regex allows
  // any other attributes on <html> (class, dir, ARIA roles added later) as long
  // as lang="en" is also present — guarding the invariant, not the attribute
  // order.
  assert.match(
    source,
    /<html\b[^>]*\blang="en"[^>]*>/,
    `${surface.name}: <html> must declare lang="en" (WCAG 3.1.1 Level A) so screen readers pronounce content correctly`,
  );

  // Encoding declaration must be a <meta charset> tag inside <head>. Allow any
  // other attributes on the tag (e.g. a future id or data-* hook); only the
  // charset="UTF-8" attribute is the load-bearing invariant.
  assert.match(
    source,
    /<meta\b[^>]*\bcharset="UTF-8"[^>]*>/,
    `${surface.name}: <head> must declare <meta charset="UTF-8"> so the browser does not guess a legacy encoding`,
  );

  // Mobile viewport: a single <meta> tag must carry BOTH name="viewport" and
  // content="width=device-width, initial-scale=1.0" — the name/value pairing
  // is what makes it a viewport declaration. Attribute order is not fixed by
  // spec, so extract all <meta> tags and check both attributes land on the
  // same one. A tag with name="viewport" but a different content (or vice
  // versa) would silently mis-render on mobile.
  const metaTags = [...source.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const hasViewport = metaTags.some(
    (tag) =>
      /\bname="viewport"/.test(tag) &&
      /\bcontent="width=device-width,\s*initial-scale=1\.0"/.test(tag),
  );
  assert.ok(
    hasViewport,
    `${surface.name}: <head> must declare the mobile viewport via a single <meta> carrying name="viewport" and content="width=device-width, initial-scale=1.0"`,
  );
}

console.log('Document base check passed');
