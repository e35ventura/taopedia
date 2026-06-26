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
assert.equal(feed.icon, 'https://taopedia.org/apple-touch-icon.png', 'feed advertises the large brand icon');
assert.equal(feed.favicon, 'https://taopedia.org/favicon-32x32.png', 'feed advertises the small favicon');
assert.equal(
  feed.description,
  'Recently updated articles from Taopedia, a Bittensor-focused knowledge base.',
  'feed carries the default description',
);
assert.equal(feed.language, 'en', 'declares the language');
// JSON Feed 1.1 authors mirror the Atom feed's <author><name>Taopedia</name>
// (check-atom-feed.js) so a JSON Feed reader gets the same author attribution.
// The 1.1 plural `authors` array is used (singular `author` is deprecated in 1.1),
// name only — no url/email — consistent with the site keeping contributor
// identities private. RSS omits author because RSS 2.0 author fields require an email.
assert.deepEqual(feed.authors, [{ name: 'Taopedia' }], 'feed declares the JSON Feed 1.1 authors array with the site name, matching the Atom author');
assert.equal('author' in feed, false, 'uses the JSON Feed 1.1 plural authors, not the deprecated singular author');
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

// A duplicated frontmatter category (categories: ['TAO', 'TAO']) — the same data
// condition buildCategories/buildStatistics were fixed to count distinctly (#1472)
// — must map to a single tag. Whitespace-only variants collapse to the same tag
// because blanks are trimmed before dedupe.
{
  const dupFeed = JSON.parse(
    buildJsonFeed({
      siteUrl,
      items: [
        {
          title: 'Duplicated Category',
          url: 'https://taopedia.org/wiki/duplicated_category/',
          categories: ['TAO', 'TAO', '  TAO  ', 'Concepts'],
          dateModified: '2026-06-05T00:00:00Z',
        },
      ],
    }),
  );
  assert.deepEqual(
    dupFeed.items[0].tags,
    ['TAO', 'Concepts'],
    'duplicated categories collapse to distinct tags in first-seen order',
  );
}

// Revision-event feeds can point multiple items at the same canonical article
// URL, so the shared serializer must preserve a caller-supplied distinct id.
{
  const revisionFeed = JSON.parse(
    buildJsonFeed({
      siteUrl,
      items: [
        {
          id: 'urn:taopedia:recentchanges:dynamic_tao:abc123',
          title: 'Dynamic TAO revision A',
          url: 'https://taopedia.org/wiki/dynamic_tao/',
          description: 'Edited by Alice',
          dateModified: '2026-06-10T20:06:02Z',
        },
        {
          id: 'urn:taopedia:recentchanges:dynamic_tao:def456',
          title: 'Dynamic TAO revision B',
          url: 'https://taopedia.org/wiki/dynamic_tao/',
          description: 'Edited by Bob',
          dateModified: '2026-06-10T20:06:01Z',
        },
      ],
    }),
  );
  assert.deepEqual(
    revisionFeed.items.map((item) => item.id),
    [
      'urn:taopedia:recentchanges:dynamic_tao:abc123',
      'urn:taopedia:recentchanges:dynamic_tao:def456',
    ],
    'preserves explicit per-event item ids when multiple feed items share one article URL',
  );
}

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
  const publishedOnlyNewer = {
    title: 'Published Only Newer',
    url: 'https://taopedia.org/wiki/published_only_newer/',
    datePublished: '2026-06-02T00:00:00Z',
  };
  const modifiedOlder = {
    title: 'Modified Older',
    url: 'https://taopedia.org/wiki/modified_older/',
    dateModified: '2026-06-01T00:00:00Z',
  };
  const items = JSON.parse(buildJsonFeed({ siteUrl, items: [modifiedOlder, publishedOnlyNewer] })).items;
  const urls = items.map((item) => item.url);
  assert.deepEqual(
    urls,
    ['https://taopedia.org/wiki/published_only_newer/', 'https://taopedia.org/wiki/modified_older/'],
    'items with only datePublished must still sort by their known article date',
  );
  // date_modified on the published-only item should fall back to datePublished,
  // matching the RSS (<pubDate>) and Atom (<updated>) fallback so all three
  // feeds expose the same known-article date for the same article.
  const publishedItem = items.find((item) => item.url === 'https://taopedia.org/wiki/published_only_newer/');
  assert.equal(
    publishedItem.date_modified,
    '2026-06-02T00:00:00.000Z',
    'published-only JSON Feed items must still emit date_modified from their known article date',
  );
  assert.equal(
    publishedItem.date_published,
    '2026-06-02T00:00:00.000Z',
    'published-only JSON Feed items must still emit date_published unchanged',
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

{
  const sameDate = '2026-06-01T06:01:22Z';
  const alpha = { title: 'Shared', url: 'https://taopedia.org/wiki/alpha/', dateModified: sameDate };
  const alphaBeta = { title: 'Shared', url: 'https://taopedia.org/wiki/alpha_beta/', dateModified: sameDate };
  const urls = JSON.parse(buildJsonFeed({ siteUrl, items: [alphaBeta, alpha] })).items.map((item) => item.url);
  assert.deepEqual(
    urls,
    ['https://taopedia.org/wiki/alpha/', 'https://taopedia.org/wiki/alpha_beta/'],
    'prefix slugs must tiebreak on wiki slug (alpha before alpha_beta), not full URL order',
  );
}

// Per-category endpoints pass dateModified as '' (empty string) when an article
// has no recorded history. The shared itemDate helper treats empty/whitespace
// values as missing so the published-date fallback still fires — otherwise the
// empty dateModified would shadow datePublished and the article would render
// with no date_modified even though date_published is set. The RSS and Atom
// feeds carry the same fix in scripts/rss-feed.js / scripts/atom-feed.js.
{
  const emptyDateModified = {
    title: 'Empty Modified',
    url: 'https://taopedia.org/wiki/empty_modified/',
    datePublished: '2026-06-02T00:00:00.000Z',
    dateModified: '',
  };
  const item = JSON.parse(buildJsonFeed({ siteUrl, items: [emptyDateModified] })).items[0];
  assert.equal(
    item.date_modified,
    '2026-06-02T00:00:00.000Z',
    'items with dateModified="" still fall back to datePublished for date_modified',
  );
  assert.equal(
    item.date_published,
    '2026-06-02T00:00:00.000Z',
    'date_published is unchanged when the empty date_modified falls through to datePublished',
  );
}

// A caller-supplied authorName (e.g. a per-category feed) flows through to the
// authors array, the same way the Atom builder threads a custom author.
{
  const customAuthor = JSON.parse(
    buildJsonFeed({
      siteUrl,
      authorName: 'Taopedia — Concepts',
      items: [{ title: 'X', url: 'https://taopedia.org/wiki/x/', dateModified: '2026-06-05T00:00:00Z' }],
    }),
  );
  assert.deepEqual(
    customAuthor.authors,
    [{ name: 'Taopedia — Concepts' }],
    'a caller-supplied authorName is threaded into the JSON Feed authors array',
  );
}

console.log('check-json-feed: all assertions passed');
