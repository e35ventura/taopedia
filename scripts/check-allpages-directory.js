import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const slugMapPath = path.join(process.cwd(), 'dist', 'data', 'slugmap.json');
const allPagesPath = path.join(process.cwd(), 'dist', 'wiki', 'Special', 'AllPages', 'index.html');

const slugMap = JSON.parse(fs.readFileSync(slugMapPath, 'utf8'));
const html = fs.readFileSync(allPagesPath, 'utf8');
const cardSlugs = [...html.matchAll(/class="article-card"\s+href="\/wiki\/([^"]+)"/g)].map((match) => match[1]);
const expectedSlugs = Object.keys(slugMap).sort();

assert.deepEqual(
  [...cardSlugs].sort(),
  expectedSlugs,
  'All pages directory must render exactly one card for every article slug'
);

const duplicates = cardSlugs.filter((slug, index) => cardSlugs.indexOf(slug) !== index);
assert.deepEqual(duplicates, [], 'All pages directory must not duplicate article cards');

console.log('All pages directory completeness check passed');
