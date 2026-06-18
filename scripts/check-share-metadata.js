import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The shared <head> (src/components/Seo.astro) emits an OpenGraph + Twitter
// Card meta block that Facebook, LinkedIn, Telegram, Slack, Discord, and X read
// to render Taopedia share previews. The existing test suite guards the
// *content* consumed by other surfaces but not these tags directly:
//   - check-structured-data.js guards JSON-LD, which social crawlers do not read
//   - check-og-text-layout.js guards the generated /og/<slug>.png SVG text layout
// None of those would fail if a tag in the share-card block were dropped or
// mis-typed, so a refactor that removed e.g. og:image:width would silently
// regress social previews (Facebook/LinkedIn would fall back to slow async
// image fetch and render a blank card first) while the test suite stayed green.
//
// This check locks the tags whose removal is a SILENT regression — image
// dimensions, Twitter card style, image alt text, and locale — so they fail
// fast. It mirrors check-rss-discovery.js / check-opensearch-discovery.js on
// the same component. Title/description/url bindings are covered indirectly by
// check-structured-data.js and are intentionally not re-asserted here.

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');

// og:image dimensions must match the generated /og/<slug>.png aspect ratio
// (1200x630, see src/lib/og-image.ts). Crawlers that fetch images
// asynchronously (Facebook, LinkedIn) use width/height to reserve layout space
// before the image bytes arrive; without them the share card renders blank
// first and reflows when the image finally loads.
assert.match(
  seo,
  /<meta\s+property="og:image:width"\s+content="1200"\s*\/>/,
  'Seo head must declare og:image:width as 1200 (matches the generated OG PNG width)',
);
assert.match(
  seo,
  /<meta\s+property="og:image:height"\s+content="630"\s*\/>/,
  'Seo head must declare og:image:height as 630 (matches the generated OG PNG height)',
);

// twitter:card must explicitly request the large-image card style. Omitting it
// (or changing it) silently downgrades X/Twitter previews to the small
// "summary" card that crops the OG preview to a tiny thumbnail.
assert.match(
  seo,
  /<meta\s+name="twitter:card"\s+content="summary_large_image"\s*\/>/,
  'Seo head must request the Twitter large-image card so the OG preview renders full-width',
);

// og:image:alt and twitter:image:alt must both bind to the same backing
// variable (imageAlt) so the preview image is described to screen readers and
// to agents that cannot load images, and so the two stay in sync if the alt
// wording is ever revised.
assert.match(
  seo,
  /<meta\s+property="og:image:alt"\s+content=\{imageAlt\}\s*\/>/,
  'Seo head must bind og:image:alt to imageAlt so the preview image has a description',
);
assert.match(
  seo,
  /<meta\s+name="twitter:image:alt"\s+content=\{imageAlt\}\s*\/>/,
  'Seo head must bind twitter:image:alt to imageAlt, mirroring og:image:alt',
);

// og:locale tells social crawlers which locale to use when formatting dates and
// numbers inside the card. The site is English-only, so this is fixed at en_US;
// dropping it lets crawlers guess (often incorrectly) from the Accept-Language
// header of whatever bot fetched the page.
assert.match(
  seo,
  /<meta\s+property="og:locale"\s+content="en_US"\s*\/>/,
  'Seo head must declare og:locale as en_US so social crawlers render the card in the site locale',
);

console.log('Share metadata check passed');
