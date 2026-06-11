import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// In the overlay sizes (<=1500px) the table-of-contents sidebar opens as a
// fixed drawer over the article. Tapping a contents link must close that
// drawer, otherwise the section the reader jumped to stays hidden behind it.
// The overlay click and the hide button already close the drawer; this guards
// the same behaviour for the contents links.

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const layout = fs.readFileSync(
  path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'),
  'utf8',
);

// The contents links the handler is wired to.
assert.ok(
  layout.includes('.toc-list a[href^="#"]'),
  'WikiLayout must select the table-of-contents links',
);

// A click handler bound to those links (the scrollspy map builder uses an
// arrow callback, so `function(link)` is unique to the close handler) that,
// only in the overlay sizes, removes the drawer and overlay classes.
assert.match(
  layout,
  /tocLinks\.forEach\(\s*function\s*\(\s*link\s*\)[\s\S]*?addEventListener\(\s*['"]click['"][\s\S]*?isMobile\(\)\s*\|\|\s*isMidSize\(\)[\s\S]*?classList\.remove\(\s*['"]mobile-active['"]\s*\)/,
  'tapping a contents link must close the mobile drawer (guarded to the overlay sizes)',
);

assert.match(
  layout,
  /tocLinks\.forEach\(\s*function\s*\(\s*link\s*\)[\s\S]*?sidebarOverlay\.classList\.remove\(\s*['"]active['"]\s*\)/,
  'closing the drawer on a contents link must also clear the dimming overlay',
);

console.log('TOC drawer check passed');
