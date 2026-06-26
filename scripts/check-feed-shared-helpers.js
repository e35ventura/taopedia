import assert from 'node:assert/strict';
import { itemDate, toRfc3339 } from '../src/lib/feed-item-date.js';
import { uniqueFeedCategories } from '../src/lib/feed-categories.js';

assert.equal(itemDate(null), '', 'missing item yields no date');
assert.equal(itemDate({ dateModified: '', date: '', datePublished: '' }), '', 'all-empty strings yield no date');
assert.equal(
  itemDate({ dateModified: '', datePublished: '2026-06-02T00:00:00Z' }),
  '2026-06-02T00:00:00Z',
  'empty dateModified must fall through to datePublished',
);
assert.equal(
  itemDate({ dateModified: '2026-06-01T00:00:00Z', datePublished: '2026-06-02T00:00:00Z' }),
  '2026-06-01T00:00:00Z',
  'dateModified wins when present',
);
assert.equal(toRfc3339('2026-06-10T20:06:02Z'), '2026-06-10T20:06:02.000Z', 'valid ISO dates normalize to RFC 3339');
assert.equal(toRfc3339(''), '', 'empty dates are dropped');

assert.deepEqual(
  uniqueFeedCategories(['TAO', 'TAO', '  TAO  ', 'Concepts']),
  ['TAO', 'Concepts'],
  'duplicate categories collapse to distinct values in first-seen order',
);
assert.deepEqual(uniqueFeedCategories(['  ', '']), [], 'blank categories are omitted');

console.log('Feed shared helper check passed');
