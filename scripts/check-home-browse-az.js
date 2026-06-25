import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run after `npm run build`: the landing-page hero should link to the on-page
// alphabetical article index so readers can jump there from the first screen.
// Refs #521.

const homeHtml = path.join(process.cwd(), 'dist', 'index.html');

assert.ok(fs.existsSync(homeHtml), 'dist/index.html not found; run the build first');

const html = fs.readFileSync(homeHtml, 'utf8');

assert.ok(
  html.includes('href="#article-index"'),
  'home page hero must link to the #article-index section',
);
assert.ok(html.includes('Browse A–Z'), 'home page hero must show a Browse A–Z label');
assert.ok(html.includes('id="article-index"'), 'home page must ship the article-index anchor target');

console.log('Home browse A–Z check passed');
