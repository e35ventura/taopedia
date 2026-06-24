import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourceFiles = [
  path.join(projectRoot, 'src', 'pages', 'index.astro'),
  path.join(projectRoot, 'src', 'pages', 'wiki', '[...slug].astro'),
  path.join(projectRoot, 'src', 'pages', 'wiki', '[...slug]', 'info.astro'),
  path.join(projectRoot, 'src', 'pages', 'wiki', 'special', 'categories.astro'),
  path.join(projectRoot, 'src', 'pages', 'wiki', 'special', 'allpages.astro'),
];
const categoryPageFile = path.join(projectRoot, 'src', 'pages', 'wiki', 'category', '[category].astro');

const bareCategoryLinks = [];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(projectRoot, file);

  for (const match of source.matchAll(/href="(\/wiki\/category\/[^"/]+)"/g)) {
    if (!match[1].endsWith('/')) {
      bareCategoryLinks.push(`${rel}: ${match[1]}`);
    }
  }

  for (const match of source.matchAll(/href=\{`(\/wiki\/category\/[^`]+)`\}/g)) {
    if (!match[1].endsWith('/')) {
      bareCategoryLinks.push(`${rel}: ${match[1]}`);
    }
  }

  for (const match of source.matchAll(/categoryHref:\s*`(\/wiki\/category\/[^`]+)`/g)) {
    if (!match[1].endsWith('/')) {
      bareCategoryLinks.push(`${rel}: ${match[1]}`);
    }
  }
}

assert.deepEqual(
  bareCategoryLinks,
  [],
  'category hub links must use the canonical trailing-slash URL (/wiki/category/<name>/)',
);

// The category page's <h1> is the category name; article-card titles are the next
// level down and must be <h2> so the heading hierarchy doesn't skip a level
// (WCAG 1.3.1 / 2.4.10). The .card-title CSS rule targets the class, not the tag,
// so this is a pure semantic check with no visual effect.
const categoryPageSource = fs.readFileSync(categoryPageFile, 'utf8');
assert.match(
  categoryPageSource,
  /<h2 class="card-title">/,
  'category page article-card titles must be <h2>, directly under the page <h1>',
);
assert.doesNotMatch(
  categoryPageSource,
  /<h3 class="card-title">/,
  'category page article-card titles must not be <h3> (skips the h2 level)',
);

console.log('Category links check passed');
