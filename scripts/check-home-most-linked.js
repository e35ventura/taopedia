import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMostLinkedPages } from './most-linked.js';

// Run after `npm run build`: the landing page should surface a short most-linked
// taster that matches Special:MostLinkedPages ranking. Refs #521.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const homeHtml = path.join(projectRoot, 'dist', 'index.html');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(homeHtml), 'dist/index.html not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const html = fs.readFileSync(homeHtml, 'utf8');
const backlinks = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, entry]) => [slug, entry?.title ?? slug]),
);

assert.ok(html.includes('>Most Linked<'), 'home page must render a Most Linked section heading');
assert.ok(
  html.includes('href="/wiki/special/mostlinkedpages"'),
  'home page Most Linked section must link to Special:MostLinkedPages',
);

const featuredSlugs = new Set([
  'dynamic_tao',
  'yuma_consensus',
  'wallets_coldkey_hotkey',
  'mining_and_validating',
]);

const expectedTop = buildMostLinkedPages({ backlinks, titleBySlug })
  .filter((entry) => !featuredSlugs.has(entry.slug))
  .slice(0, 6);

assert.ok(expectedTop.length > 0, 'expected at least one most-linked homepage preview entry');

for (const entry of expectedTop) {
  assert.ok(
    html.includes(`href="/wiki/${entry.slug}/"`),
    `home page must link to most-linked preview article /wiki/${entry.slug}/`,
  );
  assert.ok(
    html.includes(entry.title),
    `home page must show the title for most-linked preview article ${entry.slug}`,
  );
}

console.log(`Home most-linked check passed (${expectedTop.length} preview entries, top=${expectedTop[0].slug})`);
