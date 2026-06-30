import assert from 'node:assert/strict';
import { globbedDefault, publishedSlugsFromSlugMap } from '../src/lib/wiki-route-data.ts';

assert.deepEqual(
  globbedDefault(
    {
      '/tmp/first.json': { default: { alpha: 1 } },
      '/tmp/second.json': { default: { alpha: 2 } },
    },
    {},
  ),
  { alpha: 1 },
  'globbedDefault must return the first eager module default'
);

assert.deepEqual(
  globbedDefault({}, { fallback: true }),
  { fallback: true },
  'globbedDefault must fall back when no eager module default exists'
);

assert.deepEqual(
  publishedSlugsFromSlugMap({
    alpha: { title: 'Alpha' },
    beta: { title: '' },
    gamma: {},
    delta: undefined,
  }),
  ['alpha'],
  'publishedSlugsFromSlugMap must keep only titled published slugs'
);

console.log('Wiki route data helper check passed');
