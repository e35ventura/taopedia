import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Non-content routes must declare noindex in the shared <head> so crawlers that
// discover them via inbound links do not index thin or error pages. /search is
// already Disallow'd in robots.txt; the 404 page is omitted from the sitemap.
// robots.txt alone is not a reliable noindex signal, so the HTML must say so too.
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');
const layout = fs.readFileSync(path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'), 'utf8');
const notFoundPage = fs.readFileSync(path.join(projectRoot, 'src', 'pages', '404.astro'), 'utf8');
const searchPage = fs.readFileSync(path.join(projectRoot, 'src', 'pages', 'search.astro'), 'utf8');

assert.match(
  seo,
  /robots\?: string/,
  'Seo.astro must accept an optional robots prop for non-indexable pages',
);
assert.match(
  seo,
  /\{robots && <meta name="robots" content=\{robots\} \/>\}/,
  'Seo.astro must render a robots meta tag when the prop is set',
);
assert.match(
  layout,
  /robots=\{robots\}/,
  'WikiLayout must forward the robots prop to Seo',
);
assert.match(
  notFoundPage,
  /robots="noindex"/,
  'the not-found page must request noindex',
);
assert.match(
  searchPage,
  /robots="noindex"/,
  'the search page must request noindex to match robots.txt crawl policy',
);

console.log('robots meta check passed');
