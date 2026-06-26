import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const searchDataPage = path.join(projectRoot, 'src', 'pages', 'search-data.json.ts');
const source = fs.readFileSync(searchDataPage, 'utf8');

// The search-data endpoint feeds the live search topic-facet filter
// (search.astro appendTopics) and the typeahead (SearchSuggest.astro).
// A frontmatter categories list that repeats a category would inflate that
// facet's document count and produce duplicate category chips in the UI.
// Wrap the categories value in [...new Set(...)] so each category appears
// at most once per entry, matching the dedup already applied in the
// statistics page (#1502) and the site-wide feeds (#1494).
assert.ok(
  /\[\s*\.\.\.\s*new Set\s*\(/.test(source),
  'src/pages/search-data.json.ts: categories must be deduplicated with [...new Set(...)] before serialization',
);

console.log('Search-data categories dedupe check passed');
