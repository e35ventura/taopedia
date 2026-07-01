import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, 'src', 'pages', 'wiki', 'category', '[category].astro');
const distCategoryDir = path.join(projectRoot, 'dist', 'wiki', 'category');

assert.ok(fs.existsSync(sourcePath), 'src/pages/wiki/category/[category].astro not found');
assert.ok(fs.existsSync(distCategoryDir), 'dist/wiki/category not found; run the build first');

const source = fs.readFileSync(sourcePath, 'utf8');

assert.match(source, /id="category-filter"/, 'the category hub must ship a filter input');
assert.match(source, /id="category-sort"/, 'the category hub must ship a sort control');
assert.match(source, /\.trim\(\)\.toLowerCase\(\)/, 'the category hub filter must trim whitespace-only input');
assert.match(source, /new Intl\.Collator\('en',\s*\{\s*numeric:\s*true/i, 'the category hub sort must use numeric title collation');
assert.match(source, /data-category-article/, 'the category hub must tag article cards for filtering and sorting');
assert.match(source, /data-visible-count/, 'the category hub must advertise its live visible-result count');
assert.match(source, /Backlinks/, 'the category hub must render visible backlink stats');
assert.match(source, /References/, 'the category hub must render visible reference stats');
assert.match(source, /Revisions/, 'the category hub must render visible revision stats');
assert.match(source, /Words/, 'the category hub must render visible word-count stats');
assert.match(source, /Sections/, 'the category hub must render visible section-count stats');
assert.match(source, /min read/, 'the category hub must render visible reading-time stats');
assert.match(source, /appendChild\(item\)/, 'the category hub script must reorder cards in the DOM when sorting changes');

const builtCategories = fs
  .readdirSync(distCategoryDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(distCategoryDir, name, 'index.html')));

assert.ok(builtCategories.length > 0, 'no built category hub pages found; run the build first');

const builtPagePath = path.join(distCategoryDir, builtCategories.includes('Subnets') ? 'Subnets' : builtCategories[0], 'index.html');
const html = fs.readFileSync(builtPagePath, 'utf8');

assert.ok(html.includes('id="category-filter"'), 'built category page must include the filter input');
assert.ok(html.includes('id="category-sort"'), 'built category page must include the sort control');
assert.ok(html.includes('data-visible-count'), 'built category page must include the visible-count indicator');
assert.ok(html.includes('data-category-article'), 'built category page must include article cards marked for filtering/sorting');
assert.ok(html.includes('Backlinks'), 'built category page must render visible backlink stats');
assert.ok(html.includes('References'), 'built category page must render visible reference stats');
assert.ok(html.includes('Revisions'), 'built category page must render visible revision stats');
assert.ok(html.includes('Words'), 'built category page must render visible word-count stats');
assert.ok(html.includes('Sections'), 'built category page must render visible section-count stats');
assert.ok(html.includes('min read'), 'built category page must render visible reading-time stats');
assert.match(html, /Showing\s*<strong[^>]*data-visible-count/i, 'built category page must advertise the live result count');

console.log(`Category page check passed (${path.relative(projectRoot, builtPagePath)} ships filter/sort controls and visible article stats)`);
