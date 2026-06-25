import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const layoutPath = path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro');
const searchSourcePath = path.join(projectRoot, 'src', 'pages', 'search.astro');
const searchPagePath = path.join(projectRoot, 'dist', 'search', 'index.html');

const layout = fs.readFileSync(layoutPath, 'utf8');
const searchSource = fs.readFileSync(searchSourcePath, 'utf8');

assert.match(
  layout,
  /URLSearchParams\(window\.location\.search\)\.get\('q'\)/,
  'wiki layout must read the q parameter from the URL',
);
assert.match(
  layout,
  /document\.querySelector\('\.mw-search-input'\)/,
  'wiki layout must target the header search input',
);
assert.match(
  layout,
  /searchInput\.value = query/,
  'wiki layout must assign the query as plain text to the input value',
);
assert.match(
  layout,
  /\.get\('q'\)\?\.trim\(\)/,
  'wiki layout must trim the q parameter so whitespace-only values are ignored',
);

assert.ok(fs.existsSync(searchPagePath), 'dist/search/index.html must exist; run npm run build first');

const searchHtml = fs.readFileSync(searchPagePath, 'utf8');
assert.match(
  searchHtml,
  /URLSearchParams\(window\.location\.search\)\.get\('q'\)/,
  'built search page must ship the header search prefill script',
);
assert.match(
  searchSource,
  /\.get\('q'\)[^;]*\.trim\(\)/,
  'search page must trim the q parameter so whitespace-only queries do not run a search',
);
assert.match(
  searchSource,
  /function normalize\(value\)[\s\S]*\.trim\(\)\.toLowerCase\(\)/,
  'search metadata fallback must trim query and haystack text before matching',
);
assert.match(searchHtml, /class="mw-search-input"/, 'built search page must include the header search input');

console.log('Search prefill check passed');
