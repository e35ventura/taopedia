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
assert.match(feed, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/, 'is RSS 2.0 with the atom namespace');
assert.match(feed, /<channel>[\s\S]*<\/channel>/, 'wraps items in a channel');
assert.match(feed, /<title>Taopedia<\/title>/, 'channel advertises the site name');
assert.match(feed, /<link>https:\/\/taopedia\.org\/<\/link>/, 'channel links to the site root');
assert.match(feed, /<language>en<\/language>/, 'declares the language');
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

// Item content: title/link/guid/description/pubDate, all XML-escaped.
assert.match(feed, /<title>Dynamic TAO &amp; &lt;Subnets&gt;<\/title>/, 'escapes special characters in titles');
assert.match(feed, /<link>https:\/\/taopedia\.org\/wiki\/dynamic_tao\/<\/link>/, 'links to the canonical trailing-slash article URL');
assert.match(
  feed,
  /<guid isPermaLink="true">https:\/\/taopedia\.org\/wiki\/dynamic_tao\/<\/guid>/,
  'uses the canonical URL as a permalink guid',
);
assert.match(feed, /<description>How &quot;Dynamic TAO&quot; works\.<\/description>/, 'escapes quotes in descriptions');
assert.match(feed, /<pubDate>Wed, 10 Jun 2026 20:06:02 GMT<\/pubDate>/, 'formats pubDate as RFC 822');

// The undated item omits the optional pubDate/description rather than emitting empties.
const undated = feed.slice(feed.indexOf('<title>Undated Article</title>'));
assert.ok(!undated.slice(0, undated.indexOf('</item>')).includes('<pubDate>'), 'omits pubDate when no date is known');
assert.ok(!/<description>\s*<\/description>/.test(feed), 'never emits an empty description tag');

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

console.log('check-rss-feed: all assertions passed');
