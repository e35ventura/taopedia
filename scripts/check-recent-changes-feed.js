import assert from 'node:assert/strict';
import {
  buildRecentChangesAtomItems,
  buildRecentChangesJsonFeedItems,
  buildRecentChangesRssItems,
} from '../src/lib/recent-changes-feed.js';

const ORIGIN = 'https://taopedia.org';
const change = {
  slug: 'alpha_tokens/notes',
  title: 'Alpha Notes',
  date: '2026-06-05T00:00:00.000Z',
  sha: 'abc',
  authorName: 'editor',
  message: 'update',
};
const categoriesBySlug = {
  'alpha_tokens/notes': ['TAO', 'TAO', 'Concepts'],
};

const atomItems = buildRecentChangesAtomItems({ changes: [change], origin: ORIGIN, categoriesBySlug });
assert.equal(atomItems[0].url, `${ORIGIN}/wiki/alpha_tokens/notes/`, 'atom items use wikiArticleHref for nested slugs');
assert.deepEqual(atomItems[0].categories, ['TAO', 'Concepts'], 'atom items dedupe repeated categories');

const rssItems = buildRecentChangesRssItems({ changes: [change], origin: ORIGIN, categoriesBySlug });
assert.deepEqual(rssItems[0].categories, ['TAO', 'Concepts'], 'rss items dedupe repeated categories');

const jsonItems = buildRecentChangesJsonFeedItems({ changes: [change], origin: ORIGIN, categoriesBySlug });
assert.equal(jsonItems[0].url, `${ORIGIN}/wiki/alpha_tokens/notes/`, 'json feed items use wikiArticleHref');

console.log('Recent changes feed helper check passed');
