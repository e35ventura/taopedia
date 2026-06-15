import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Guard the Pagefind search index against indexing the per-article utility
// sub-pages (/cite/, /history/, /backlinks/, /info/) or the special/category hubs.
// Those pages render full layouts that repeat the article title and (for cite)
// citation text; if they were indexed, a search could surface a citation or
// history utility page instead of — or ahead of — the canonical article.
//
// Only the canonical article page opts into indexing via `data-pagefind-body`,
// so Pagefind excludes every page that lacks it. This check proves that holds
// for the *generated* index (not just the markup) and fails if it ever
// regresses — e.g. a sub-page gains `data-pagefind-body`, or the article page
// loses it. It reads the emitted Pagefind fragments, each a gzipped record
// prefixed with a short marker before its JSON `{ "url", ... }` payload.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const fragmentDir = path.join(projectRoot, 'dist', 'pagefind', 'fragment');

assert.ok(fs.existsSync(fragmentDir), 'dist/pagefind/fragment not found; run the build (it runs pagefind in postbuild) first');

const fragmentFiles = fs.readdirSync(fragmentDir).filter((f) => f.endsWith('.pf_fragment'));
assert.ok(fragmentFiles.length > 0, 'no Pagefind fragments found; the search index is empty');

const indexedUrls = fragmentFiles.map((file) => {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(fragmentDir, file))).toString('utf8');
  const start = text.indexOf('{');
  assert.ok(start !== -1, `Pagefind fragment ${file} has no JSON payload`);
  const url = JSON.parse(text.slice(start)).url;
  assert.ok(typeof url === 'string' && url, `Pagefind fragment ${file} has no url`);
  return url;
});

// The canonical article pages are whatever the filesystem walk yields — the
// same recursive discovery the other per-article checks use, so this stays
// correct for a future nested slug (/wiki/foo/bar/) instead of assuming a single
// slug segment. A page is an article unless it is a special/category hub or ends
// in a /history/, /backlinks/, /cite/, or /info/ utility segment.
const builtArticles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.name !== 'index.html') continue;
    const segs = path.relative(wikiDir, full).split(path.sep);
    if (segs.length < 2) continue;
    if (segs[0] === 'special' || segs[0] === 'category') continue;
    const parent = segs[segs.length - 2];
    if (parent === 'history' || parent === 'backlinks' || parent === 'cite' || parent === 'info') continue;
    builtArticles.push(`/wiki/${segs.slice(0, -1).join('/')}/`);
  }
};
walk(wikiDir);
assert.ok(builtArticles.length > 0, 'no built article pages found to compare the index against');
const articleSet = new Set(builtArticles);

// Nesting-correct exclusion predicates (match the final path segment / the hub
// prefix at any depth) so the failure messages name the offending page class.
const isUtility = (u) => /\/(cite|history|backlinks|info)\/$/.test(u);
const isHub = (u) => /^\/wiki\/(special|category)\//.test(u);

const subPage = indexedUrls.filter(isUtility);
assert.equal(subPage.length, 0, `the search index must not contain cite/history/backlinks/info sub-pages: ${subPage.slice(0, 5).join(', ')}`);
const hub = indexedUrls.filter(isHub);
assert.equal(hub.length, 0, `the search index must not contain special/category hubs: ${hub.slice(0, 5).join(', ')}`);

// Every indexed URL must be a built canonical article page — derived from the
// walk, so this matches discovery (including nested slugs) rather than a
// single-segment URL shape.
for (const url of indexedUrls) {
  assert.ok(articleSet.has(url), `the search index must contain only canonical article pages, found: ${url}`);
}

// Exactly one index entry per article: no duplicates, and no article dropped.
assert.equal(indexedUrls.length, new Set(indexedUrls).size, 'the search index must not contain duplicate URLs');
assert.equal(
  indexedUrls.length,
  builtArticles.length,
  `the search index must contain exactly one entry per article (indexed ${indexedUrls.length}, built ${builtArticles.length})`,
);
const indexedSet = new Set(indexedUrls);
for (const url of builtArticles) {
  assert.ok(indexedSet.has(url), `article ${url} is missing from the search index`);
}

console.log(`Search-index check passed (${indexedUrls.length} canonical article pages indexed; no cite/history/backlinks/info/special pages)`);
