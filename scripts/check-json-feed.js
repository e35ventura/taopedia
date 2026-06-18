import assert from 'node:assert/strict';
import { buildJsonFeed } from './json-feed.js';

const siteUrl = 'https://taopedia.org/';

const rawFeed = buildJsonFeed({
  siteUrl,
  items: [
    {
      title: 'Older Article',
      url: 'https://taopedia.org/wiki/older/',
      description: 'Older summary.',
      categories: ['Reference'],
      datePublished: '2026-05-30T00:00:00Z',
      dateModified: '2026-06-01T00:00:00Z',
    },
    {
      title: 'Dynamic TAO & <Subnets>',
      url: 'https://taopedia.org/wiki/dynamic_tao/',
      description: 'How "Dynamic TAO" works.',
      categories: ['Concepts', 'TAO & <Subnets>'],
      datePublished: '2026-06-01T00:00:00Z',
      dateModified: '2026-06-10T20:06:02Z',
    },
    {
      title: 'Undated Article',
      url: 'https://taopedia.org/wiki/undated/',
      description: '',
      categories: ['  '],
      datePublished: '',
      dateModified: '',
    },
  ],
});

assert.ok(rawFeed.endsWith('\n'), 'serializes with a trailing newline');

const feed = JSON.parse(rawFeed);

assert.equal(feed.version, 'https://jsonfeed.org/version/1.1', 'declares JSON Feed 1.1');
assert.equal(feed.title, 'Taopedia', 'feed advertises the site name');
assert.equal(feed.home_page_url, 'https://taopedia.org/', 'feed links to the site root');
assert.equal(feed.feed_url, 'https://taopedia.org/feed.json', 'feed_url points to /feed.json');
assert.equal(
  feed.description,
  'Recently updated articles from Taopedia, a Bittensor-focused knowledge base.',
  'feed carries the default description',
);
assert.equal(feed.language, 'en', 'declares the language');
assert.ok(Array.isArray(feed.items), 'items must be an array');

// Newest-updated first; undated items sort last.
assert.deepEqual(
  feed.items.map((item) => item.title),
  ['Dynamic TAO & <Subnets>', 'Older Article', 'Undated Article'],
  'items are ordered newest-first, undated last',
);

const dynamic = feed.items[0];
assert.equal(dynamic.id, 'https://taopedia.org/wiki/dynamic_tao/', 'defaults item id to canonical URL');
assert.equal(dynamic.url, 'https://taopedia.org/wiki/dynamic_tao/', 'uses canonical article URL');
assert.equal(dynamic.content_text, 'How "Dynamic TAO" works.', 'uses article summary as content_text');
assert.equal(dynamic.summary, 'How "Dynamic TAO" works.', 'uses article summary as summary');
assert.equal(dynamic.date_published, '2026-06-01T00:00:00.000Z', 'formats date_published as RFC 3339');
assert.equal(dynamic.date_modified, '2026-06-10T20:06:02.000Z', 'formats date_modified as RFC 3339');
assert.deepEqual(dynamic.tags, ['Concepts', 'TAO & <Subnets>'], 'maps article categories to JSON Feed tags');

const undated = feed.items[2];
assert.equal(undated.content_text, 'Undated Article', 'falls back to title when summary/content_text are blank');
assert.equal('summary' in undated, false, 'omits blank summary values');
assert.equal('date_published' in undated, false, 'omits blank date_published values');
assert.equal('date_modified' in undated, false, 'omits blank date_modified values');
assert.equal('tags' in undated, false, 'omits blank tags');

// Determinism: same-timestamp items must not depend on input order.
{
  const sameDate = '2026-06-01T06:01:22Z';
  const a = { title: 'Alpha', url: 'https://taopedia.org/wiki/alpha/', description: 'Alpha.', dateModified: sameDate };
  const b = { title: 'Bravo', url: 'https://taopedia.org/wiki/bravo/', description: 'Bravo.', dateModified: sameDate };
  const c = { title: 'Charlie', url: 'https://taopedia.org/wiki/charlie/', description: 'Charlie.', dateModified: sameDate };
  const feedForward = buildJsonFeed({ siteUrl, items: [a, b, c] });
  const feedReversed = buildJsonFeed({ siteUrl, items: [c, b, a] });
  assert.equal(
    feedForward,
    feedReversed,
    'same-timestamp items must produce a byte-identical JSON feed regardless of input order',
  );
  assert.deepEqual(
    JSON.parse(feedForward).items.map((item) => item.url),
    ['https://taopedia.org/wiki/alpha/', 'https://taopedia.org/wiki/bravo/', 'https://taopedia.org/wiki/charlie/'],
    'same-timestamp items are ordered by canonical URL',
  );
}

{
  const sameDate = '2026-06-01T06:01:22Z';
  const nine = { title: 'Subnet 9', url: 'https://taopedia.org/wiki/subnet_9/', dateModified: sameDate };
  const ten = { title: 'Subnet 10', url: 'https://taopedia.org/wiki/subnet_10/', dateModified: sameDate };
  const urls = JSON.parse(buildJsonFeed({ siteUrl, items: [ten, nine] })).items.map((item) => item.url);
  assert.deepEqual(
    urls,
    ['https://taopedia.org/wiki/subnet_9/', 'https://taopedia.org/wiki/subnet_10/'],
    'same-timestamp numeric slugs must order with compareTitles (subnet_9 before subnet_10)',
  );
}

console.log('check-json-feed: all assertions passed');
