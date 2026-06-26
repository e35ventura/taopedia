import assert from 'node:assert/strict';
import {
  buildRecentChangesAtomItems,
  buildRecentChangesJsonFeedItems,
  buildRecentChangesRssItems,
} from '../src/lib/recent-changes-feed.js';
import { buildAtomFeed } from './atom-feed.js';
import { buildJsonFeed } from './json-feed.js';
import { buildRssFeed } from './rss-feed.js';

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
  'alpha_tokens/notes': ['TAO', 'TAO', '  TAO  ', 'Concepts'],
};

const atomItems = buildRecentChangesAtomItems({ changes: [change], origin: ORIGIN, categoriesBySlug });
assert.equal(atomItems[0].url, `${ORIGIN}/wiki/alpha_tokens/notes/`, 'atom items use wikiArticleHref for nested slugs');
assert.deepEqual(atomItems[0].categories, ['TAO', 'Concepts'], 'atom items dedupe repeated categories');

const rssItems = buildRecentChangesRssItems({ changes: [change], origin: ORIGIN, categoriesBySlug });
assert.equal(rssItems[0].url, `${ORIGIN}/wiki/alpha_tokens/notes/`, 'rss items use wikiArticleHref for nested slugs');
assert.deepEqual(rssItems[0].categories, ['TAO', 'Concepts'], 'rss items dedupe repeated categories');

const jsonItems = buildRecentChangesJsonFeedItems({ changes: [change], origin: ORIGIN, categoriesBySlug });
assert.equal(jsonItems[0].url, `${ORIGIN}/wiki/alpha_tokens/notes/`, 'json feed items use wikiArticleHref for nested slugs');
assert.deepEqual(jsonItems[0].categories, ['TAO', 'Concepts'], 'json feed items dedupe repeated categories');

const atomXml = buildAtomFeed({ siteUrl: `${ORIGIN}/`, items: atomItems });
assert.equal((atomXml.match(/<category term="TAO"/g) || []).length, 1, 'atom feed emits each category once');

const rssXml = buildRssFeed({ siteUrl: `${ORIGIN}/`, items: rssItems });
assert.equal((rssXml.match(/<category>TAO<\/category>/g) || []).length, 1, 'rss feed emits each category once');

const jsonFeed = buildJsonFeed({ siteUrl: `${ORIGIN}/`, items: jsonItems });
const parsed = JSON.parse(jsonFeed);
assert.deepEqual(parsed.items[0].tags, ['TAO', 'Concepts'], 'json feed tags are deduped');

console.log('Recent changes feed helper check passed');
