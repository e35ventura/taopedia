import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The site ships a category-scoped Atom 1.0 feed at
// /wiki/category/<category>/atom.xml (src/pages/wiki/category/[category]/atom.xml.ts),
// added as the per-topic parallel of the site-wide /atom.xml. The shared Atom
// builder is covered by check-atom-feed.js, but that test feeds hardcoded items
// in and so cannot tell whether the per-category endpoint actually scopes its
// output to the requested category. The load-bearing behavior here is the
// per-category filter — a regression that dropped it would silently publish
// every article in every category feed, which the builder check would not catch.
//
// This is the Atom parallel of check-category-feed.js (RSS) and
// check-category-json-feed.js (JSON Feed): same invariants, different format.

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const endpointPath = path.join(
  projectRoot,
  'src',
  'pages',
  'wiki',
  'category',
  '[category]',
  'atom.xml.ts',
);
const source = fs.readFileSync(endpointPath, 'utf8');

// Reuse the shared, escape/RFC-4287-tested serializer rather than hand-rolling
// Atom output, so category feeds stay byte-compatible with the site-wide feed.
assert.ok(
  source.includes("import { buildAtomFeed }") && source.includes('scripts/atom-feed.js'),
  'category Atom feed must build its output through the shared buildAtomFeed serializer',
);

// The route slug maps category label spaces to underscores. This must match the
// category hub (wiki/category/[category].astro) and the sitemap's category loc
// derivation exactly, or the feed URL would diverge from the hub it advertises.
assert.ok(
  source.includes("replace(/ /g, '_')"),
  'category Atom feed must slugify category names with the space-to-underscore convention',
);

// One feed route per category, param derived through the slugifier — not a fixed
// route, and not keyed on the raw label (which can contain spaces).
assert.ok(
  source.includes('category: categorySlug(categoryName)'),
  'getStaticPaths must generate one slugified route param per category',
);

// THE load-bearing invariant: items are scoped to the requested category.
// Without this filter every category Atom feed would contain the full article
// corpus — the same regression class guarded for RSS by check-category-feed.js.
assert.ok(
  source.includes('page.data.categories?.includes(categoryName)'),
  'category Atom feed must filter items to articles whose categories include the route category',
);

// Atom carries both <published> and <updated>, so the endpoint must derive the
// same history pair as the JSON feed (newest commit = dateModified, oldest =
// datePublished), not the single lastmod the RSS feed uses. A regression that
// dropped this to a single date would silently lose <published> in every entry.
assert.ok(
  source.includes('historyForSlug(slug)') &&
    source.includes('history[history.length - 1]?.date') &&
    source.includes('history[0]?.date'),
  'category Atom feed must derive datePublished (oldest) and dateModified (newest) from article history',
);

// The feed must identify itself against the category hub: the channel
// alternate link points at the hub URL while the atom:self link points at the
// nested feed endpoint, so readers and crawlers resolve the feed relative to
// the topic it covers. Asserts the same link contract as the RSS/JSON feeds.
assert.ok(
  source.includes('homePageUrl: `${origin}/wiki/category/${categoryPath}/`'),
  'category Atom feed must point its alternate link at the matching category hub',
);
assert.ok(
  source.includes('feedPath: `/wiki/category/${categoryPath}/atom.xml`'),
  'category Atom feed must advertise its nested atom:self URL on the feed endpoint',
);

// Cross-route consistency: the feed's alternate link points at the category
// hub, so the hub must slugify with the SAME convention — otherwise the link
// would 404 and orphan the feed from the topic it covers. Asserts the
// convention is present in the hub (not the exact param-line syntax, so an
// unrelated hub refactor that keeps the convention does not trip this check).
const hubPath = path.join(projectRoot, 'src', 'pages', 'wiki', 'category', '[category].astro');
const hubSource = fs.readFileSync(hubPath, 'utf8');
assert.ok(
  hubSource.includes("replace(/ /g, '_')"),
  'category hub must slugify with the same space-to-underscore convention as the Atom feed',
);

// The hub must also advertise the Atom feed alongside the RSS and JSON feeds in
// its <head>, so a feed reader landing on the category page can auto-discover
// all three scoped formats. Without this the endpoint is only reachable by URL.
assert.ok(
  hubSource.includes("type: 'application/atom+xml'") &&
    hubSource.includes('`/wiki/category/${category}/atom.xml`'),
  'category hub must advertise the Atom feed in its feeds array alongside RSS and JSON',
);

console.log('Category Atom feed check passed');
