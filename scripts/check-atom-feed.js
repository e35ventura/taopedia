import assert from 'node:assert/strict';
import { buildAtomFeed } from './atom-feed.js';

const siteUrl = 'https://taopedia.org/';

const feed = buildAtomFeed({
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

assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'declares the XML prolog');
assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom" xml:lang="en">/, 'declares Atom 1.0');
assert.match(feed, /<id>https:\/\/taopedia\.org\/atom\.xml<\/id>/, 'feed id is the canonical Atom URL');
assert.match(feed, /<title>Taopedia<\/title>/, 'feed advertises the site name');
assert.match(
  feed,
  /<subtitle>Recently updated articles from Taopedia, a Bittensor-focused knowledge base\.<\/subtitle>/,
  'feed carries the default description',
);
assert.match(feed, /<link rel="alternate" href="https:\/\/taopedia\.org\/" \/>/, 'feed links to the site root');
assert.match(feed, /<logo>https:\/\/taopedia\.org\/logo\.svg<\/logo>/, 'feed advertises the brand logo');
assert.match(feed, /<icon>https:\/\/taopedia\.org\/favicon-32x32\.png<\/icon>/, 'feed advertises the favicon icon');
assert.match(
  feed,
  /<link rel="self" type="application\/atom\+xml" href="https:\/\/taopedia\.org\/atom\.xml" \/>/,
  'feed advertises its self URL',
);
assert.match(
  feed,
  /<updated>2026-06-10T20:06:02\.000Z<\/updated>/,
  'feed updated defaults to the newest item update date',
);
assert.match(feed, /<author><name>Taopedia<\/name><\/author>/, 'feed declares the required Atom author');

const order = ['Dynamic TAO &amp; &lt;Subnets&gt;', 'Older Article', 'Undated Article'].map((title) =>
  feed.indexOf(`<title>${title}</title>`),
);
assert.ok(order.every((index) => index >= 0), 'every item appears in the feed');
assert.deepEqual(order, [...order].sort((a, b) => a - b), 'items are ordered newest-first, undated last');

assert.match(feed, /<title>Dynamic TAO &amp; &lt;Subnets&gt;<\/title>/, 'escapes special characters in titles');
assert.match(
  feed,
  /<id>https:\/\/taopedia\.org\/wiki\/dynamic_tao\/<\/id>/,
  'defaults entry id to the canonical article URL',
);
assert.match(
  feed,
  /<link rel="alternate" href="https:\/\/taopedia\.org\/wiki\/dynamic_tao\/" \/>/,
  'entry links to the canonical trailing-slash article URL',
);
assert.match(feed, /<summary>How &quot;Dynamic TAO&quot; works\.<\/summary>/, 'escapes quotes in summaries');
assert.match(feed, /<published>2026-06-01T00:00:00\.000Z<\/published>/, 'formats published dates as RFC 3339');
assert.match(feed, /<updated>2026-06-10T20:06:02\.000Z<\/updated>/, 'formats updated dates as RFC 3339');
assert.match(feed, /<category term="Concepts" \/>/, 'emits entry categories');
assert.match(feed, /<category term="TAO &amp; &lt;Subnets&gt;" \/>/, 'escapes special characters in categories');

const undated = feed.slice(feed.indexOf('<title>Undated Article</title>'));
const undatedEntry = undated.slice(0, undated.indexOf('</entry>'));
assert.match(
  undatedEntry,
  /<updated>2026-06-10T20:06:02\.000Z<\/updated>/,
  'undated entries fall back to the feed updated date so Atom required fields stay valid',
);
assert.ok(!undatedEntry.includes('<published>'), 'undated entries omit published dates');
assert.ok(!/<summary>\s*<\/summary>/.test(feed), 'never emits an empty summary tag');
assert.ok(!/<category term="\s*" \/>/.test(feed), 'never emits an empty category');

// A duplicated frontmatter category (categories: ['TAO', 'TAO']) — the same data
// condition buildCategories/buildStatistics were fixed to count distinctly (#1472)
// — must emit a single <category> element. Whitespace-only variants collapse to
// the same category because blanks are trimmed before dedupe.
{
  const dupCategoryFeed = buildAtomFeed({
    siteUrl,
    items: [
      {
        title: 'Duplicated Category',
        url: 'https://taopedia.org/wiki/duplicated_category/',
        categories: ['TAO', 'TAO', '  TAO  ', 'Concepts'],
        dateModified: '2026-06-05T00:00:00Z',
      },
    ],
  });
  assert.equal(
    (dupCategoryFeed.match(/<category term="TAO" \/>/g) || []).length,
    1,
    'a duplicated category is emitted only once',
  );
  assert.equal(
    (dupCategoryFeed.match(/<category term="Concepts" \/>/g) || []).length,
    1,
    'distinct categories are still each emitted once',
  );
}

{
  const categoryFeed = buildAtomFeed({
    siteUrl,
    feedPath: '/wiki/category/Smart_Contracts/atom.xml',
    homePageUrl: 'https://taopedia.org/wiki/category/Smart_Contracts/',
    title: 'Taopedia - Smart Contracts articles',
    description: 'Recently updated Taopedia articles in the Smart Contracts topic.',
    items: [
      {
        title: 'Bittensor EVM Smart Contracts',
        url: 'https://taopedia.org/wiki/bittensor_evm_smart_contracts/',
        description: 'Smart contract support.',
        categories: ['Smart Contracts'],
        dateModified: '2026-06-02T00:00:00Z',
      },
    ],
  });
  assert.match(categoryFeed, /<title>Taopedia - Smart Contracts articles<\/title>/, 'supports custom feed titles');
  assert.match(
    categoryFeed,
    /<subtitle>Recently updated Taopedia articles in the Smart Contracts topic\.<\/subtitle>/,
    'supports custom feed descriptions',
  );
  assert.match(
    categoryFeed,
    /<link rel="alternate" href="https:\/\/taopedia\.org\/wiki\/category\/Smart_Contracts\/" \/>/,
    'supports custom home page URLs',
  );
  assert.match(
    categoryFeed,
    /<link rel="self" type="application\/atom\+xml" href="https:\/\/taopedia\.org\/wiki\/category\/Smart_Contracts\/atom\.xml" \/>/,
    'supports custom feed paths',
  );
  assert.match(
    categoryFeed,
    /<author><name>Taopedia<\/name><\/author>/,
    'custom feed titles still use the site as the stable Atom author',
  );
}

{
  const empty = buildAtomFeed({ siteUrl, items: [] });
  assert.match(empty, /<feed[\s\S]*<\/feed>/, 'an empty feed is still valid XML');
  assert.ok(!empty.includes('<entry>'), 'an empty feed contains no entries');
  assert.match(empty, /<updated>1970-01-01T00:00:00\.000Z<\/updated>/, 'empty feeds keep Atom updated deterministic');
}

{
  const sameDate = '2026-06-01T06:01:22Z';
  const a = { title: 'Alpha', url: 'https://taopedia.org/wiki/alpha/', description: 'Alpha.', dateModified: sameDate };
  const b = { title: 'Bravo', url: 'https://taopedia.org/wiki/bravo/', description: 'Bravo.', dateModified: sameDate };
  const c = { title: 'Charlie', url: 'https://taopedia.org/wiki/charlie/', description: 'Charlie.', dateModified: sameDate };
  const feedForward = buildAtomFeed({ siteUrl, items: [a, b, c] });
  const feedReversed = buildAtomFeed({ siteUrl, items: [c, b, a] });
  assert.equal(
    feedForward,
    feedReversed,
    'same-timestamp items must produce a byte-identical Atom feed regardless of input order',
  );
  const linkOrder = ['alpha', 'bravo', 'charlie'].map((slug) => feedForward.indexOf(`/wiki/${slug}/`));
  assert.ok(linkOrder.every((index) => index >= 0), 'every same-timestamp item appears in the feed');
  assert.deepEqual(
    linkOrder,
    [...linkOrder].sort((a, b) => a - b),
    'same-timestamp items are ordered by canonical URL',
  );
}

{
  const sameDate = '2026-06-01T06:01:22Z';
  const nine = { title: 'Subnet 9', url: 'https://taopedia.org/wiki/subnet_9/', dateModified: sameDate };
  const ten = { title: 'Subnet 10', url: 'https://taopedia.org/wiki/subnet_10/', dateModified: sameDate };
  const feed = buildAtomFeed({ siteUrl, items: [ten, nine] });
  const pos9 = feed.indexOf('/wiki/subnet_9/');
  const pos10 = feed.indexOf('/wiki/subnet_10/');
  assert.ok(
    pos9 >= 0 && pos10 >= 0 && pos9 < pos10,
    'same-timestamp numeric slugs must order with compareTitles (subnet_9 before subnet_10)',
  );
}

{
  const sameDate = '2026-06-01T06:01:22Z';
  const alpha = { title: 'Shared', url: 'https://taopedia.org/wiki/alpha/', dateModified: sameDate };
  const alphaBeta = { title: 'Shared', url: 'https://taopedia.org/wiki/alpha_beta/', dateModified: sameDate };
  const feed = buildAtomFeed({ siteUrl, items: [alphaBeta, alpha] });
  const posAlpha = feed.indexOf('/wiki/alpha/');
  const posAlphaBeta = feed.indexOf('/wiki/alpha_beta/');
  assert.ok(
    posAlpha >= 0 && posAlphaBeta >= 0 && posAlpha < posAlphaBeta,
    'prefix slugs must tiebreak on wiki slug (alpha before alpha_beta), not full URL order',
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
    datePublished: '2026-06-02T00:00:00.000Z',
    dateModified: '',
  };
  const feed = buildAtomFeed({ siteUrl, items: [emptyDateModified] });
  assert.match(
    feed,
    /<title>Empty Modified<\/title>[\s\S]*<updated>2026-06-02T00:00:00\.000Z<\/updated>/,
    'items with dateModified="" still fall back to datePublished for the Atom updated date',
  );
}

console.log('check-atom-feed: all assertions passed');
