import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapCategoryFeedJsonAtomItems,
  mapCategoryFeedRssItems,
} from '../src/lib/category-feed-items.js';

const ORIGIN = 'https://taopedia.org';
const sampleItem = {
  slug: '/alpha_tokens/notes',
  title: 'Alpha Notes',
  summary: 'summary',
  categories: ['TAO', 'TAO', 'Concepts'],
  datePublished: '2026-06-05T00:00:00.000Z',
  dateModified: '2026-06-05T00:00:00.000Z',
  date: '2026-06-05T00:00:00.000Z',
};

const jsonAtom = mapCategoryFeedJsonAtomItems(ORIGIN, [sampleItem]);
assert.equal(
  jsonAtom[0].url,
  `${ORIGIN}/wiki/alpha_tokens/notes/`,
  'json/atom items use wikiArticleHref for nested slugs with a leading slash',
);
assert.deepEqual(jsonAtom[0].categories, ['TAO', 'Concepts'], 'json/atom items dedupe repeated categories');

const rss = mapCategoryFeedRssItems(ORIGIN, [sampleItem]);
assert.equal(rss[0].url, `${ORIGIN}/wiki/alpha_tokens/notes/`, 'rss items use wikiArticleHref');
assert.deepEqual(rss[0].categories, ['TAO', 'Concepts'], 'rss items dedupe repeated categories');

// Route-level guard: all three category syndication endpoints must delegate URL
// mapping to the shared helper instead of inlining /wiki/<slug>/ templates.
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const routeDir = path.join(projectRoot, 'src', 'pages', 'wiki', 'category', '[category]');
for (const file of ['feed.json.ts', 'atom.xml.ts', 'rss.xml.ts']) {
  const source = fs.readFileSync(path.join(routeDir, file), 'utf8');
  assert.ok(
    source.includes('mapCategoryFeed'),
    `${file} must map items through category-feed-items helpers`,
  );
  assert.ok(
    !source.includes('`${origin}/wiki/${item.slug}/`'),
    `${file} must not inline fragile /wiki/<slug>/ URL templates`,
  );
}

console.log('Category feed check passed');
