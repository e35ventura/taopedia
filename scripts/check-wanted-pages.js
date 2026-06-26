import assert from 'node:assert/strict';
import { buildWantedPages, collectWantedRequesters, isWantedTarget } from './wanted-pages.js';

// titleBySlug = the published articles. linkGraph = each article's resolved
// outbound targets (build-linkgraph.js shape), where a target absent from
// titleBySlug is a red link / wanted page.
const titleBySlug = { a: 'A', b: 'B', c: 'C' };
const linkGraph = {
  a: [{ target: 'missing_x' }, { target: 'b' }, { target: 'missing_y' }],
  b: [{ target: 'missing_x' }, { target: 'missing_x' }, { target: 'c' }], // repeated target
  c: [{ target: 'missing_y' }, { target: 'c' }], // self-link 'c' is never wanted
  draft: [{ target: 'missing_x' }], // source not published -> must not count
};

// isWantedTarget: non-empty, unsatisfied by a published article, not a self-link.
assert.equal(isWantedTarget('missing_x', 'a', titleBySlug), true, 'unresolved target is wanted');
assert.equal(isWantedTarget('b', 'a', titleBySlug), false, 'published target is not wanted');
assert.equal(isWantedTarget('c', 'c', titleBySlug), false, 'self-link target is not wanted');
assert.equal(isWantedTarget('', 'a', titleBySlug), false, 'empty target is not wanted');

// collectWantedRequesters: distinct published requesters per wanted target; a
// repeated target counts a requester once; an unpublished source is ignored.
const requesters = collectWantedRequesters({ linkGraph, titleBySlug });
assert.deepEqual([...requesters.get('missing_x')].sort(), ['a', 'b'], 'missing_x wanted by a and b (draft ignored, dup counted once)');
assert.deepEqual([...requesters.get('missing_y')].sort(), ['a', 'c'], 'missing_y wanted by a and c');
assert.equal(requesters.has('b'), false, 'a published target never becomes a wanted page');
assert.equal(requesters.has('c'), false, 'a self-linked published target never becomes a wanted page');

// buildWantedPages: rank by distinct-requester count desc, then slug; each entry
// lists the requesting article slugs sorted.
const ranked = buildWantedPages({ linkGraph, titleBySlug });
assert.deepEqual(
  ranked,
  [
    { slug: 'missing_x', count: 2, requestedBy: ['a', 'b'] },
    { slug: 'missing_y', count: 2, requestedBy: ['a', 'c'] },
  ],
  'wanted pages ranked by distinct published requesters (count desc, then slug), excluding published targets, self-links, and unpublished sources',
);

// A graph with no red links yields no wanted pages.
assert.deepEqual(
  buildWantedPages({ linkGraph: { a: [{ target: 'b' }], b: [{ target: 'a' }] }, titleBySlug }),
  [],
  'no wanted pages when every target resolves to a published article',
);

console.log('Wanted pages check passed');
