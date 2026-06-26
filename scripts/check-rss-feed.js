import assert from 'node:assert/strict';
import { buildRssFeed } from './rss-feed.js';

const siteUrl = 'https://taopedia.org/';

// Items are intentionally passed out of chronological order, and with no explicit
// lastBuildDate, so the test exercises the builder's ordering and date defaulting.
const feed = buildRssFeed({
  siteUrl,
  items: [
    {
      title: 'Older Article',
      url: 'https://taopedia.org/wiki/older/',
      description: 'Older.',
      date: '2026-06-01T00:00:00Z',
    },
    {
      title: 'Dynamic TAO & <Subnets>',
      url: 'https://taopedia.org/wiki/dynamic_tao/',
      description: 'How "Dynamic TAO" works.',
      categories: ['Concepts', 'TAO & <Subnets>'],
      date: '2026-06-10T20:06:02Z',
    },
    {
      title: 'Undated Article',
      url: 'https://taopedia.org/wiki/undated/',
      description: '',
      date: '',
    },
  ],
});

// Well-formed RSS 2.0 channel envelope.
assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'declares the XML prolog');
assert.match(feed, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom" xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/">/, 'is RSS 2.0 with the atom and Media RSS namespaces');
assert.match(feed, /<channel>[\s\S]*<\/channel>/, 'wraps items in a channel');
assert.match(feed, /<title>Taopedia<\/title>/, 'channel advertises the site name');
assert.match(feed, /<link>https:\/\/taopedia\.org\/<\/link>/, 'channel links to the site root');
assert.match(feed, /<language>en<\/language>/, 'declares the language');
assert.match(
  feed,
  /<image>\s*<url>https:\/\/taopedia\.org\/favicon-32x32\.png<\/url>\s*<title>Taopedia<\/title>\s*<link>https:\/\/taopedia\.org\/<\/link>\s*<\/image>/,
  'channel carries a branding image (favicon) with url, title, and link',
);
assert.match(
  feed,
  /<atom:link href="https:\/\/taopedia\.org\/rss\.xml" rel="self" type="application\/rss\+xml" \/>/,
  'advertises a self atom:link so readers can locate the feed',
);

// lastBuildDate defaults to the newest item date, formatted as RFC 822.
assert.match(
  feed,
  /<lastBuildDate>Wed, 10 Jun 2026 20:06:02 GMT<\/lastBuildDate>/,
  'defaults lastBuildDate to the newest item and formats it as RFC 822',
);

// Newest-updated first; the undated item sorts last.
const order = ['Dynamic TAO &amp; &lt;Subnets&gt;', 'Older Article', 'Undated Article'].map((t) =>
  feed.indexOf(`<title>${t}</title>`),
);
assert.ok(order.every((i) => i >= 0), 'every item appears in the feed');
assert.deepEqual(order, [...order].sort((a, b) => a - b), 'items are ordered newest-first, undated last');

// Item content: title/link/guid/description/category/pubDate, all XML-escaped.
assert.match(feed, /<title>Dynamic TAO &amp; &lt;Subnets&gt;<\/title>/, 'escapes special characters in titles');
assert.match(feed, /<link>https:\/\/taopedia\.org\/wiki\/dynamic_tao\/<\/link>/, 'links to the canonical trailing-slash article URL');
assert.match(
  feed,
  /<guid isPermaLink="true">https:\/\/taopedia\.org\/wiki\/dynamic_tao\/<\/guid>/,
  'uses the canonical URL as a permalink guid',
);
assert.match(feed, /<description>How &quot;Dynamic TAO&quot; works\.<\/description>/, 'escapes quotes in descriptions');
assert.match(feed, /<category>Concepts<\/category>/, 'emits item categories');
assert.match(feed, /<category>TAO &amp; &lt;Subnets&gt;<\/category>/, 'escapes special characters in categories');
assert.match(feed, /<pubDate>Wed, 10 Jun 2026 20:06:02 GMT<\/pubDate>/, 'formats pubDate as RFC 822');

// The undated item omits the optional pubDate/description rather than emitting empties.
const undated = feed.slice(feed.indexOf('<title>Undated Article</title>'));
assert.ok(!undated.slice(0, undated.indexOf('</item>')).includes('<pubDate>'), 'omits pubDate when no date is known');
assert.ok(!/<description>\s*<\/description>/.test(feed), 'never emits an empty description tag');

// Empty/blank categories are also omitted rather than emitted as empty XML.
{
  const blankCategoryFeed = buildRssFeed({
    siteUrl,
    items: [{ title: 'Blank Category', url: 'https://taopedia.org/wiki/blank_category/', categories: ['  '] }],
  });
  assert.ok(!/<category>\s*<\/category>/.test(blankCategoryFeed), 'never emits an empty category tag');
}

// A duplicated frontmatter category (categories: ['TAO', 'TAO']) — the same data
// condition buildCategories/buildStatistics were fixed to count distinctly (#1472)
// — must emit a single <category> element, not one per occurrence. Whitespace-only
// variants collapse to the same category because blanks are trimmed before dedupe.
{
  const dupCategoryFeed = buildRssFeed({
    siteUrl,
    items: [
      {
        title: 'Duplicated Category',
        url: 'https://taopedia.org/wiki/duplicated_category/',
        categories: ['TAO', 'TAO', '  TAO  ', 'Concepts'],
        date: '2026-06-05T00:00:00Z',
      },
    ],
  });
  assert.equal(
    (dupCategoryFeed.match(/<category>TAO<\/category>/g) || []).length,
    1,
    'a duplicated category is emitted only once',
  );
  assert.equal(
    (dupCategoryFeed.match(/<category>Concepts<\/category>/g) || []).length,
    1,
    'distinct categories are still each emitted once',
  );
}

// Revision-event feeds can point multiple items at the same article URL, so the
// shared serializer must support a caller-supplied non-permalink guid.
{
  const revisionFeed = buildRssFeed({
    siteUrl,
    items: [
      {
        title: 'Dynamic TAO revision',
        url: 'https://taopedia.org/wiki/dynamic_tao/',
        guid: 'urn:sha1:abc123',
        description: 'Edited by Alice',
        date: '2026-06-10T20:06:02Z',
      },
    ],
  });
  assert.match(
    revisionFeed,
    /<guid isPermaLink="false">urn:sha1:abc123<\/guid>/,
    'supports an explicit non-permalink guid when multiple feed items share one article URL',
  );
}

// Category-scoped feeds reuse the same builder but point the channel at the
// category hub while keeping the atom:self URL on the nested feed endpoint.
{
  const categoryFeed = buildRssFeed({
    siteUrl,
    feedPath: '/wiki/category/Smart_Contracts/rss.xml',
    channelLink: 'https://taopedia.org/wiki/category/Smart_Contracts/',
    title: 'Taopedia - Smart Contracts articles',
    description: 'Recently updated Taopedia articles in the Smart Contracts topic.',
    items: [
      {
        title: 'Bittensor EVM Smart Contracts',
        url: 'https://taopedia.org/wiki/bittensor_evm_smart_contracts/',
        description: 'Smart contract support.',
        categories: ['Smart Contracts'],
        date: '2026-06-02T00:00:00Z',
      },
    ],
  });
  assert.match(categoryFeed, /<title>Taopedia - Smart Contracts articles<\/title>/, 'supports custom feed titles');
  assert.match(
    categoryFeed,
    /<description>Recently updated Taopedia articles in the Smart Contracts topic\.<\/description>/,
    'supports custom feed descriptions',
  );
  assert.match(
    categoryFeed,
    /<link>https:\/\/taopedia\.org\/wiki\/category\/Smart_Contracts\/<\/link>/,
    'lets category feeds point the channel link at the category hub',
  );
  assert.match(
    categoryFeed,
    /<atom:link href="https:\/\/taopedia\.org\/wiki\/category\/Smart_Contracts\/rss\.xml" rel="self" type="application\/rss\+xml" \/>/,
    'lets category feeds advertise their nested self URL',
  );
}

// An empty feed still produces a valid, item-less channel with no lastBuildDate.
const empty = buildRssFeed({ siteUrl, items: [] });
assert.match(empty, /<channel>[\s\S]*<\/channel>/, 'an empty feed is still a valid channel');
assert.ok(!empty.includes('<item>'), 'an empty feed contains no items');
assert.ok(!empty.includes('<lastBuildDate>'), 'an empty feed omits lastBuildDate');

// Determinism: several articles share an identical revision timestamp, and the
// endpoint passes items in getCollection() order, which Astro does not guarantee
// to be stable. Same-timestamp items must therefore break ties by canonical URL
// (with locale-independent string comparison) so the feed is byte-identical
// regardless of input order — otherwise a content-neutral rebuild can reorder the
// feed and churn downstream caches. (Without the tiebreak the stable date-only
// sort just preserves input order, so this fails.)
{
  const sameDate = '2026-06-01T06:01:22Z';
  const a = { title: 'Alpha', url: 'https://taopedia.org/wiki/alpha/', description: '', date: sameDate };
  const b = { title: 'Bravo', url: 'https://taopedia.org/wiki/bravo/', description: '', date: sameDate };
  const c = { title: 'Charlie', url: 'https://taopedia.org/wiki/charlie/', description: '', date: sameDate };
  const feedForward = buildRssFeed({ siteUrl, items: [a, b, c] });
  const feedReversed = buildRssFeed({ siteUrl, items: [c, b, a] });
  assert.equal(
    feedForward,
    feedReversed,
    'same-timestamp items must produce a byte-identical feed regardless of input order',
  );
  const linkOrder = ['alpha', 'bravo', 'charlie'].map((slug) => feedForward.indexOf(`/wiki/${slug}/`));
  assert.ok(linkOrder.every((i) => i >= 0), 'every same-timestamp item appears in the feed');
  assert.deepEqual(
    linkOrder,
    [...linkOrder].sort((x, y) => x - y),
    'same-timestamp items are ordered by canonical URL',
  );
}

// Numeric slugs in canonical URLs must use compareTitles, not raw string order
// (subnet_10 lexicographically precedes subnet_9).
{
  const sameDate = '2026-06-01T06:01:22Z';
  const nine = { title: 'Subnet 9', url: 'https://taopedia.org/wiki/subnet_9/', date: sameDate };
  const ten = { title: 'Subnet 10', url: 'https://taopedia.org/wiki/subnet_10/', date: sameDate };
  const feed = buildRssFeed({ siteUrl, items: [ten, nine] });
  const pos9 = feed.indexOf('/wiki/subnet_9/');
  const pos10 = feed.indexOf('/wiki/subnet_10/');
  assert.ok(
    pos9 >= 0 && pos10 >= 0 && pos9 < pos10,
    'same-timestamp numeric slugs must order with compareTitles (subnet_9 before subnet_10)',
  );
}

// Prefix slugs: site-wide feeds omit sortKey, so the tiebreak must extract the
// wiki slug from the canonical URL (alpha before alpha_beta). Comparing the full
// URL inverts this pair because the "/" boundary collates before "_".
{
  const sameDate = '2026-06-01T06:01:22Z';
  const alpha = { title: 'Shared', url: 'https://taopedia.org/wiki/alpha/', description: '', date: sameDate };
  const alphaBeta = { title: 'Shared', url: 'https://taopedia.org/wiki/alpha_beta/', description: '', date: sameDate };
  const feedForward = buildRssFeed({ siteUrl, items: [alphaBeta, alpha] });
  const feedReversed = buildRssFeed({ siteUrl, items: [alpha, alphaBeta] });
  assert.equal(feedForward, feedReversed, 'prefix-slug same-timestamp feeds must be input-order independent');
  const posAlpha = feedForward.indexOf('/wiki/alpha/');
  const posAlphaBeta = feedForward.indexOf('/wiki/alpha_beta/');
  assert.ok(
    posAlpha >= 0 && posAlphaBeta >= 0 && posAlpha < posAlphaBeta,
    'prefix slugs must tiebreak on wiki slug (alpha before alpha_beta), not full URL order',
  );
}

// RSS callers that have structured article dates should get the same known-date
// fallback as Atom and JSON Feed: modified first, legacy date next, published
// date last. Otherwise a published-only item sorts as undated and loses pubDate.
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
  const feed = buildRssFeed({ siteUrl, items: [modifiedOlder, publishedOnlyNewer] });
  const publishedPos = feed.indexOf('/wiki/published_only_newer/');
  const modifiedPos = feed.indexOf('/wiki/modified_older/');
  assert.ok(
    publishedPos >= 0 && modifiedPos >= 0 && publishedPos < modifiedPos,
    'items with only datePublished must still sort by their known article date',
  );
  assert.match(
    feed.slice(publishedPos, feed.indexOf('</item>', publishedPos)),
    /<pubDate>Tue, 02 Jun 2026 00:00:00 GMT<\/pubDate>/,
    'published-only RSS items still emit pubDate from their known article date',
  );
}

// Per-category endpoints pass dateModified as '' (empty string) when an article
// has no recorded history. The shared itemDate helper treats empty/whitespace
// values as missing so the published-date fallback still fires — the same way
// the JSON feed's date_modified does (#510).
{
  const emptyDateModified = {
    title: 'Empty Modified',
    url: 'https://taopedia.org/wiki/empty_modified/',
    datePublished: '2026-06-02T00:00:00Z',
    dateModified: '',
  };
  const feed = buildRssFeed({ siteUrl, items: [emptyDateModified] });
  assert.match(
    feed,
    /<title>Empty Modified<\/title>[\s\S]*<pubDate>Tue, 02 Jun 2026 00:00:00 GMT<\/pubDate>/,
    'items with dateModified="" still fall back to datePublished for the RSS pubDate',
  );
}

console.log('check-rss-feed: all assertions passed');
