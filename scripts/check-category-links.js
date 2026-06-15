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

console.log('Category links check passed');
