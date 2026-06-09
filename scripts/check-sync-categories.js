import assert from 'node:assert/strict';
import { toCategories } from './sync-articles.js';

assert.deepEqual(
  toCategories({
    categories: [' Wallets ', 'Security'],
  }),
  ['Wallets', 'Security'],
  'schema-supported plural categories should survive sync normalization',
);

assert.deepEqual(
  toCategories({
    category: ' Wallets ',
    categories: ['wallets', 'Security', 'Bittensor', 42, null, ''],
    tags: ['security', 'Tools', 'tools', false],
  }),
  ['Wallets', 'Security', 'Tools'],
  'categories should share trimming, hidden-topic filtering, non-string filtering, and case-insensitive dedupe',
);

console.log('Sync category normalization check passed');
