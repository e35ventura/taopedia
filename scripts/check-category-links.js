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

// Accessibility: the per-category page's heading hierarchy must not skip a level.
// Its only top-level heading is the <h1> category name, so the article-card
// titles directly under it must be <h2> — the same h1 -> h2 structure
// allpages.astro uses for its directory. A jump from <h1> straight to <h3>
// (with no <h2>) breaks the document outline for screen-reader users navigating
// by heading level (WCAG 1.3.1 / 2.4.10).
{
  const categoryPage = path.join(projectRoot, 'src', 'pages', 'wiki', 'category', '[category].astro');
  const source = fs.readFileSync(categoryPage, 'utf8');
  assert.match(
    source,
    /<h2 class="card-title">/,
    'category page article-card titles must be <h2> (the level directly under the page <h1>), not skip to <h3>',
  );
  assert.ok(
    !/<h3\b/.test(source),
    'category page must not introduce an <h3> below the <h1> without an intervening <h2> (heading-level skip)',
  );
}

console.log('Category links check passed');
