import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every built article page (dist/wiki/<slug>/index.html, excluding the
// special/ and category/ listing trees) must appear in every site-wide
// syndication feed the site advertises: /atom.xml, /rss.xml, and /feed.json.
// A feed that silently drops an article — or that publishes a stale entry for
// an article that no longer exists — would mislead every reader who
// bulk-subscribed to the feed and erode trust in the subscription index
// (/feeds.opml) that lists them.
//
// The existing feed checks are unit tests of the shared builders
// (check-{atom,rss,json}-feed.js feed hardcoded items into buildXxxFeed and so
// cannot detect a wiring regression between the build pipeline and the
// emitted file). The sitemap check (check-sitemap.js) covers the sitemap
// image-extension invariant but not feed completeness. This guard closes the
// gap with a built-output bijection between the set of canonical article
// paths (/wiki/<slug>/) and the set of canonical paths the three feeds
// publish, for each feed independently. A regression that drops an article
// from any feed fails only that feed's direction, so a single offender is
// easy to identify.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distWiki = path.join(projectRoot, 'dist', 'wiki');
const atomPath = path.join(projectRoot, 'dist', 'atom.xml');
const rssPath = path.join(projectRoot, 'dist', 'rss.xml');
const jsonPath = path.join(projectRoot, 'dist', 'feed.json');

assert.ok(fs.existsSync(distWiki), 'dist/wiki/ not found; run the build first');
assert.ok(fs.existsSync(atomPath), 'dist/atom.xml not found; run the build first');
assert.ok(fs.existsSync(rssPath), 'dist/rss.xml not found; run the build first');
assert.ok(fs.existsSync(jsonPath), 'dist/feed.json not found; run the build first');

const ARTICLE_PATH_PREFIX = '/wiki/';
const LISTING_DIRS = new Set(['special', 'category']);

// Built article slugs: every directory under dist/wiki/ with an index.html,
// excluding the listing trees (special/ and category/) which are hub pages,
// not articles, and do not appear in the site-wide feeds.
const builtArticlePaths = new Set();
for (const entry of fs.readdirSync(distWiki, { withFileTypes: true })) {
  if (!entry.isDirectory() || LISTING_DIRS.has(entry.name)) continue;
  if (fs.existsSync(path.join(distWiki, entry.name, 'index.html'))) {
    builtArticlePaths.add(`${ARTICLE_PATH_PREFIX}${entry.name}/`);
  }
}
assert.ok(builtArticlePaths.size > 0, 'no built article pages found in dist/wiki/');

// Extract every canonical /wiki/<slug>/ path from one site-wide feed's source
// text. Only paths that look like article canonicals (exactly one slug
// segment after /wiki/) are returned; this skips the feed-level <id>/<link>
// values (e.g. /atom.xml, /) and any incidental references to category hubs
// so the comparison stays scoped to the article corpus.
function articlePathsFromFeedText(text) {
  const articlePaths = new Set();
  const pathRegex = /\/wiki\/([^/<>"'\s]+)\//g;
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    articlePaths.add(match[0]);
  }
  return articlePaths;
}

// --- /atom.xml -----------------------------------------------------------
// Each <entry> carries the article's canonical URL as <id>. The site-level
// <id> is /atom.xml and is filtered out by the /wiki/ requirement above.
const atomText = fs.readFileSync(atomPath, 'utf8');
const atomArticlePaths = articlePathsFromFeedText(atomText);
assert.deepEqual(
  [...atomArticlePaths].sort(),
  [...builtArticlePaths].sort(),
  `dist/atom.xml must publish exactly the built article set (${builtArticlePaths.size} articles). Missing: ${[...builtArticlePaths].filter((p) => !atomArticlePaths.has(p)).join(', ') || '(none)'}. Extra: ${[...atomArticlePaths].filter((p) => !builtArticlePaths.has(p)).join(', ') || '(none)'}.`,
);

// --- /rss.xml ------------------------------------------------------------
// Each <item> carries the article's canonical URL as <link>.
const rssText = fs.readFileSync(rssPath, 'utf8');
const rssArticlePaths = articlePathsFromFeedText(rssText);
assert.deepEqual(
  [...rssArticlePaths].sort(),
  [...builtArticlePaths].sort(),
  `dist/rss.xml must publish exactly the built article set (${builtArticlePaths.size} articles). Missing: ${[...builtArticlePaths].filter((p) => !rssArticlePaths.has(p)).join(', ') || '(none)'}. Extra: ${[...rssArticlePaths].filter((p) => !builtArticlePaths.has(p)).join(', ') || '(none)'}.`,
);

// --- /feed.json ----------------------------------------------------------
// JSON Feed 1.1: each item carries the canonical URL as `id` (and `url`,
// asserted equal in check-json-feed.js). Use `id` as the authoritative
// canonical and fall back to `url` for any item that omits `id`.
const jsonFeed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
assert.ok(Array.isArray(jsonFeed.items), 'dist/feed.json `items` must be an array');
const jsonArticlePaths = new Set();
for (const item of jsonFeed.items) {
  const canonical = item?.id ?? item?.url;
  assert.equal(typeof canonical, 'string', 'every JSON Feed item must have a string `id` (or `url`) canonical');
  try {
    const url = new URL(canonical);
    if (url.pathname.startsWith(ARTICLE_PATH_PREFIX)) {
      jsonArticlePaths.add(url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`);
    }
  } catch {
    assert.fail(`JSON Feed item canonical must be an absolute URL: ${canonical}`);
  }
}
assert.deepEqual(
  [...jsonArticlePaths].sort(),
  [...builtArticlePaths].sort(),
  `dist/feed.json must publish exactly the built article set (${builtArticlePaths.size} articles). Missing: ${[...builtArticlePaths].filter((p) => !jsonArticlePaths.has(p)).join(', ') || '(none)'}. Extra: ${[...jsonArticlePaths].filter((p) => !builtArticlePaths.has(p)).join(', ') || '(none)'}.`,
);

console.log(`Site-wide feed completeness check passed (${builtArticlePaths.size} articles published in /atom.xml, /rss.xml, and /feed.json)`);
