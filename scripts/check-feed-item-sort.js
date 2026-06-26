import assert from 'node:assert/strict';
import { compareFeedItemsByDateAndKey, feedItemSortKey } from '../src/lib/feed-item-sort.js';

const itemDate = (item) => String(item?.dateModified ?? item?.date ?? item?.datePublished ?? '');

assert.equal(
  feedItemSortKey({ sortKey: 'subnet_9', url: 'https://taopedia.org/wiki/subnet_10/' }),
  'subnet_9',
  'explicit sortKey wins over URL',
);

assert.equal(
  feedItemSortKey({ sortKey: '  ', url: 'https://taopedia.org/wiki/alpha/' }),
  'alpha',
  'whitespace-only sortKey falls through to wiki slug extraction',
);

assert.equal(
  feedItemSortKey({ url: 'https://taopedia.org/wiki/alpha_beta/' }),
  'alpha_beta',
  'wiki slug is extracted from canonical article URLs',
);

assert.equal(
  feedItemSortKey({ url: 'https://taopedia.org/about/' }),
  'https://taopedia.org/about/',
  'non-wiki URLs fall back to the full URL string',
);

assert.equal(
  feedItemSortKey({ url: 'https://taopedia.org/wiki/subnet_9#section' }),
  'subnet_9',
  'wiki slug extraction ignores URL fragments',
);

assert.equal(
  feedItemSortKey({ url: 'https://taopedia.org/wiki/alpha_tokens/notes/' }),
  'alpha_tokens/notes',
  'wiki slug extraction preserves nested multi-segment paths',
);

const sameDate = '2026-06-01T06:01:22Z';
const alpha = { title: 'Shared', url: 'https://taopedia.org/wiki/alpha/', date: sameDate };
const alphaBeta = { title: 'Shared', url: 'https://taopedia.org/wiki/alpha_beta/', date: sameDate };

assert.ok(
  compareFeedItemsByDateAndKey(alpha, alphaBeta, itemDate) < 0,
  'prefix slugs must order alpha before alpha_beta when sortKey is absent',
);
assert.ok(
  compareFeedItemsByDateAndKey(alphaBeta, alpha, itemDate) > 0,
  'prefix slug ordering must be independent of input order',
);

const nestedA = { title: 'A', url: 'https://taopedia.org/wiki/alpha_tokens/a/', date: sameDate };
const nestedB = { title: 'B', url: 'https://taopedia.org/wiki/alpha_tokens/b/', date: sameDate };
assert.ok(
  compareFeedItemsByDateAndKey(nestedA, nestedB, itemDate) < 0,
  'nested slugs must tiebreak on the full path (alpha_tokens/a before alpha_tokens/b)',
);
assert.notEqual(
  feedItemSortKey(nestedA),
  feedItemSortKey({ url: 'https://taopedia.org/wiki/alpha_tokens/' }),
  'nested slug tiebreak must not collapse to the first path segment only',
);

const nine = { title: 'Subnet 9', url: 'https://taopedia.org/wiki/subnet_9/', date: sameDate };
const ten = { title: 'Subnet 10', url: 'https://taopedia.org/wiki/subnet_10/', date: sameDate };
assert.ok(
  compareFeedItemsByDateAndKey(nine, ten, itemDate) < 0,
  'numeric slugs must order subnet_9 before subnet_10 via compareTitles on extracted slug',
);

const newer = { ...alpha, date: '2026-06-02T00:00:00Z' };
assert.ok(
  compareFeedItemsByDateAndKey(newer, alpha, itemDate) < 0,
  'newer dates sort before older regardless of slug tiebreak',
);

const rcItem = { sortKey: 'subnet_10', url: 'https://taopedia.org/wiki/subnet_9/', date: sameDate };
const rcOther = { sortKey: 'subnet_9', url: 'https://taopedia.org/wiki/subnet_10/', date: sameDate };
assert.ok(
  compareFeedItemsByDateAndKey(rcOther, rcItem, itemDate) < 0,
  'explicit sortKey from recent-changes feeds is honored unchanged',
);

console.log('Feed item sort check passed');
