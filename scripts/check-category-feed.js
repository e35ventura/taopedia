import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The site ships a category-scoped RSS / Atom / JSON Feed at
// /wiki/category/<category>/{rss.xml,atom.xml,feed.json}
// (src/pages/wiki/category/[category]/rss.xml.ts and its atom / feed.json
// siblings). After the #1442 syndication refactor the slugifier
// (categoryName → underscore slug) and the per-category filter both moved
// into the shared buildCategoryFeedStaticPaths helper in
// src/lib/category-feed-context.ts; the three route files now each just
// delegate to it. This guard locks the delegation + helper invariants down so
// a refactor or deletion fails fast.
//
// The previous version of this check looked for the literal inline patterns
// ("replace(/ /g, '_')", "category: categorySlug(categoryName)",
// "page.data.categories?.includes(categoryName)") inside rss.xml.ts itself.
// After #1442 those literals moved into the helper, so the old assertions
// fail on every clean run — the check has been silently broken since the
// refactor. This rewrite keeps the same invariants by checking them where
// they now live (the helper and the hub), plus asserts each route delegates
// to the helper instead of reimplementing the slugifier inline.

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const categoryDir = path.join(projectRoot, 'src', 'pages', 'wiki', 'category');
const routes = [
  { file: path.join(categoryDir, '[category]', 'rss.xml.ts'), serializer: 'buildRssFeed' },
  { file: path.join(categoryDir, '[category]', 'atom.xml.ts'), serializer: 'buildAtomFeed' },
  { file: path.join(categoryDir, '[category]', 'feed.json.ts'), serializer: 'buildJsonFeed' },
];

// The shared helper is the single source of truth for the slugifier and the
// per-category membership filter — both invariants the prior check was
// asserting inside rss.xml.ts now live here, so lock them down where they
// actually live.
const helperPath = path.join(projectRoot, 'src', 'lib', 'category-feed-context.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');

assert.ok(
  /export const categoryPathFromName\s*=\s*\(\s*categoryName\s*:\s*string\s*\)\s*=>\s*categoryName\.replace\(\s*\/\s\s*\/\s*g\s*,\s*'_'\s*\)/m.test(
    helperSource,
  ),
  'categoryPathFromName must slugify category labels with the space-to-underscore convention (the source of truth after the #1442 refactor)',
);

assert.ok(
  helperSource.includes('getCategoryArticles'),
  'buildCategoryFeedStaticPaths must filter items to the requested category (the only place per-category membership is applied)',
);

// Each route file must delegate to the shared helper for static paths —
// prevents a future refactor from re-introducing a hand-rolled slugifier or
// membership filter that drifts from the helper.
for (const { file, serializer } of routes) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(
    source.includes("buildCategoryFeedStaticPaths") && source.includes("category-feed-context"),
    `${path.relative(projectRoot, file)} must build static paths through the shared buildCategoryFeedStaticPaths helper`,
  );

  // The shared, determinism/escape-tested serializer — not hand-rolled XML /
  // JSON output — so per-category feeds stay byte-compatible with the site-
  // wide feeds.
  assert.ok(
    source.includes(serializer),
    `${path.relative(projectRoot, file)} must render its body through ${serializer}`,
  );
}

// The rss route still hardcodes its channel link and feedPath (the
// serializer-derived URL must mirror the category hub slug). Lock the literal
// channel-link and feed-path conventions so a refactor that drops them is
// caught.
const rssSource = fs.readFileSync(path.join(categoryDir, '[category]', 'rss.xml.ts'), 'utf8');
assert.ok(
  rssSource.includes('channelLink: `${origin}/wiki/category/${categoryPath}/`'),
  'category RSS feed must point its channel link at the matching category hub',
);
assert.ok(
  rssSource.includes('feedPath: `/wiki/category/${categoryPath}/rss.xml`'),
  'category RSS feed must advertise its nested atom:self URL on the feed endpoint',
);

// Cross-route consistency: the feed's channel link points at the category hub,
// so the hub must slugify with the SAME convention — otherwise the channel URL
// would 404 and orphan the feed from the topic it covers. Assert the
// convention is present in the hub (not the exact param-line syntax, so an
// unrelated hub refactor that keeps the convention does not trip this check).
const hubPath = path.join(categoryDir, '[category].astro');
const hubSource = fs.readFileSync(hubPath, 'utf8');
assert.ok(
  hubSource.includes("replace(/ /g, '_')"),
  'category hub must slugify with the same space-to-underscore convention as the feed',
);

console.log('Category feed check passed');
