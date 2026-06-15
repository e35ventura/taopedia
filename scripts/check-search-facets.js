import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for the search-results topic facets. The facets are
// rendered client-side from Pagefind's `category` filter, so this pins the
// contract the runtime relies on: the search page ships the facet script + its
// styles, the articles carry the `data-pagefind-filter="category"` the facet
// counts come from, and the Pagefind index was built. It fails if the facet UI,
// the filter data, or the index regresses.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const searchFile = path.join(distDir, 'search', 'index.html');
assert.ok(fs.existsSync(searchFile), 'dist/search/index.html not found; run the build first');
const html = fs.readFileSync(searchFile, 'utf8');

// The facet UI script must ship.
assert.ok(html.includes('renderFacets'), 'the search page must ship the renderFacets() facet builder');
assert.ok(html.includes('Filter by topic'), 'the facets must be labelled "Filter by topic"');
assert.ok(html.includes("class = 'search-facet'") || html.includes('search-facet'), 'the search page must ship the facet buttons (search-facet)');
// The production path must filter Pagefind by the category filter.
assert.match(
  html,
  /filters:\s*\{\s*category:/,
  'the search page must query Pagefind with the { filters: { category } } selection',
);

// The facet styles must ship (theme-token based, light + dark).
assert.match(html, /\.search-facet\b[^{]*\{/, 'the search page must ship the .search-facet styles');
assert.match(html, /\.search-facet\.is-active\b[^{]*\{/, 'the active-facet style must ship');

// The data the facet counts come from: articles must expose the Pagefind
// `category` filter. Spot-check a built article (it is template-generated, but
// assert it is actually present in the output).
const wikiDir = path.join(distDir, 'wiki');
const article = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .find(
    (e) =>
      e.isDirectory() &&
      e.name !== 'special' &&
      e.name !== 'category' &&
      fs.existsSync(path.join(wikiDir, e.name, 'index.html')),
  );
assert.ok(article, 'no built article page found to spot-check');
const articleHtml = fs.readFileSync(path.join(wikiDir, article.name, 'index.html'), 'utf8');
assert.ok(
  articleHtml.includes('data-pagefind-filter="category"'),
  'articles must carry data-pagefind-filter="category" so the search facets have counts to show',
);

// The Pagefind index (which serves the filter at runtime) must be built.
assert.ok(fs.existsSync(path.join(distDir, 'pagefind')), 'dist/pagefind/ not found; the Pagefind index must be built');

console.log('Search facets check passed (facet script + styles ship; articles expose the category filter; Pagefind index built)');
