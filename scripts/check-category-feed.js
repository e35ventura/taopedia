import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The site ships a category-scoped RSS feed at
// /wiki/category/<category>/rss.xml (src/pages/wiki/category/[category]/rss.xml.ts).
// It is the only syndication route WITHOUT a route-level regression check: the
// shared builder is covered by check-rss-feed.js, but that test feeds hardcoded
// items in and so cannot tell whether the endpoint actually scopes its output to
// the requested category. The load-bearing behavior here is the per-category
// filter — a regression that dropped it would silently publish every article in
// every category feed, which the builder check would not catch. This guard locks
// the endpoint's invariants down so a refactor or deletion fails fast.

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const endpointPath = path.join(
  projectRoot,
  'src',
  'pages',
  'wiki',
  'category',
  '[category]',
  'rss.xml.ts',
);
const source = fs.readFileSync(endpointPath, 'utf8');

// Reuse the shared, determinism/escape-tested serializer rather than hand-rolling
// RSS output, so category feeds stay byte-compatible with the site-wide feed.
assert.ok(
  source.includes("import { buildRssFeed }") && source.includes('scripts/rss-feed.js'),
  'category feed must build its output through the shared buildRssFeed serializer',
);

// The route slug maps category label spaces to underscores. This must match the
// category hub (wiki/category/[category].astro) and the sitemap's category loc
// derivation exactly, or the feed URL would diverge from the hub it advertises.
assert.ok(
  source.includes("replace(/ /g, '_')"),
  'category feed must slugify category names with the space-to-underscore convention',
);

// One feed route per category, param derived through the slugifier — not a fixed
// route, and not keyed on the raw label (which can contain spaces).
assert.ok(
  source.includes('category: categorySlug(categoryName)'),
  'getStaticPaths must generate one slugified route param per category',
);

// THE load-bearing invariant: items are scoped to the requested category. Without
// this filter every category feed would contain the full article corpus.
assert.ok(
  source.includes('page.data.categories?.includes(categoryName)'),
  'category feed must filter items to articles whose categories include the route category',
);

// The feed must identify itself against the category hub: the channel link points
// at the hub URL while the atom:self link points at the nested feed endpoint, so
// readers and crawlers resolve the feed relative to the topic it covers.
assert.ok(
  source.includes('channelLink: `${origin}/wiki/category/${categoryPath}/`'),
  'category feed must point its channel link at the matching category hub',
);
assert.ok(
  source.includes('feedPath: `/wiki/category/${categoryPath}/rss.xml`'),
  'category feed must advertise its nested atom:self URL on the feed endpoint',
);

// Cross-route consistency: the feed's channel link points at the category hub,
// so the hub must slugify with the SAME convention — otherwise the channel URL
// would 404 and orphan the feed from the topic it covers. Assert the convention
// is present in the hub (not the exact param-line syntax, so an unrelated hub
// refactor that keeps the convention does not trip this feed check).
const hubPath = path.join(projectRoot, 'src', 'pages', 'wiki', 'category', '[category].astro');
const hubSource = fs.readFileSync(hubPath, 'utf8');
assert.ok(
  hubSource.includes("replace(/ /g, '_')"),
  'category hub must slugify with the same space-to-underscore convention as the feed',
);

console.log('Category feed check passed');
