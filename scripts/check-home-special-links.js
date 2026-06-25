import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run after `npm run build`: the landing page should surface high-value special
// pages in its primary nav so readers can reach them without hunting. Refs #521.
const homeHtml = path.join(process.cwd(), 'dist', 'index.html');

assert.ok(fs.existsSync(homeHtml), 'dist/index.html not found; run the build first');

const html = fs.readFileSync(homeHtml, 'utf8');

const requiredLinks = [
  '/wiki/special/statistics',
  '/wiki/special/random',
];

for (const href of requiredLinks) {
  assert.ok(
    html.includes(`href="${href}"`),
    `home page nav must link to ${href}`,
  );
}

console.log('Home special links check passed');
