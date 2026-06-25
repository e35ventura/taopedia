import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const articlePage = path.join(projectRoot, 'src', 'pages', 'wiki', '[...slug].astro');
const source = fs.readFileSync(articlePage, 'utf8');

// The Topics section must wrap the categories array in `new Set(...)` before
// mapping so a frontmatter list that repeats a category (a valid but degenerate
// input) never renders the same chip twice or emits a duplicate
// data-pagefind-filter="category" attribute.  The sibling fix for the
// statistics page (which counts per-topic members) used the same idiom.
assert.ok(
  /\[\s*\.\.\.\s*new Set\s*\(\s*page\.data\.categories\s*\)\s*\]\s*\.map/.test(source),
  'src/pages/wiki/[...slug].astro: the Topics section must use [...new Set(page.data.categories)].map(...) to deduplicate repeated categories',
);

console.log('Article topics dedupe check passed');
