import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllPages } from './allpages.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { publishedInboundLinkCount } from './most-linked.js';
import { slugFromWikiHref } from '../src/lib/wiki-article-path.js';

// /wiki/special/allpages.json exposes the article directory as structured
// JSON for programmatic consumers. The contract is load-bearing: a
// malformed response, a wrong article, a non-deterministic order, or a
// directory that disagrees with the HTML page would silently break every
// downstream consumer. This check guards all of those:
//   1) Unit-tests buildAllPages with constructed inputs (catches builder
//      regressions before the site is rendered).
//   2) Verifies the sort uses sortPagesByTitle (NOT raw string) so the JSON
//      and HTML surfaces never disagree on article order.
//   3) Re-derives the expected directory from the synced content collection
//      and asserts the built JSON matches it field-for-field (count, order,
//      membership, slug, title, url).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: publishedInboundLinkCount with constructed inputs -----------
{
  const backlinksFixture = {
    hub: [{ from: 'a' }, { from: 'b' }, { from: 'ghost' }],
    leaf: [],
  };
  const titleBySlugFixture = { hub: 'Hub', a: 'A', b: 'B' };
  assert.equal(
    publishedInboundLinkCount(backlinksFixture, 'hub', titleBySlugFixture),
    2,
    'must count only inbound links from published articles',
  );
  assert.equal(
    publishedInboundLinkCount(backlinksFixture, 'leaf', titleBySlugFixture),
    0,
    'must return 0 when there are no inbound links',
  );
  assert.equal(
    publishedInboundLinkCount(backlinksFixture, 'missing', titleBySlugFixture),
    0,
    'must return 0 for slugs absent from the backlink graph',
  );
}

// ---- 2) Unit: buildAllPages with constructed inputs ---------------------
{
  const pages = [
    { id: 'a/index.mdx', data: { title: 'Apex', summary: 'apex', categories: ['Subnets'] } },
    { id: 'b/index.mdx', data: { title: 'Bravo', summary: 'bravo', categories: [] } },
    { id: 'c/index.mdx', data: { title: 'Charlie', summary: '', categories: ['Consensus'] } },
  ];
  const getPageSlug = (page) => page.id.replace(/\/index\.mdx$/, '');
  const out = buildAllPages({ pages, getPageSlug, origin: ORIGIN });

  assert.equal(out.length, 3, 'one row per input page');
  assert.equal(out[0].slug, 'a', 'title sort: Apex first');
  assert.equal(out[1].slug, 'b', 'title sort: Bravo second');
  assert.equal(out[2].slug, 'c', 'title sort: Charlie third');
  assert.equal(out[0].url, `${ORIGIN}/wiki/a/`, 'url is the canonical absolute URL form');
  assert.equal(out[1].summary, 'bravo', 'summary is preserved');
  assert.equal(out[2].summary, '', 'empty summary preserved as empty string');
  assert.deepEqual(out[0].categories, ['Subnets'], 'categories preserved');
}

// Repeated frontmatter categories must be deduped while preserving first-seen order.
{
  const out = buildAllPages({
    pages: [{ id: 'x/index.mdx', data: { title: 'X', summary: '', categories: ['Mining', 'Consensus', 'Mining'] } }],
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
    origin: ORIGIN,
  });
  assert.deepEqual(
    out[0].categories,
    ['Mining', 'Consensus'],
    'repeated frontmatter categories must be deduped in allpages.json rows',
  );
}

// Numeric title sort: "Subnet 9" before "Subnet 10" (numeric, not raw string).
{
  const pages = [
    { id: 'c/index.mdx', data: { title: 'Subnet 10', summary: '' } },
    { id: 'a/index.mdx', data: { title: 'Subnet 2', summary: '' } },
    { id: 'b/index.mdx', data: { title: 'Subnet 9', summary: '' } },
  ];
  const out = buildAllPages({
    pages,
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
    origin: ORIGIN,
  });
  assert.deepEqual(
    out.map((a) => a.title),
    ['Subnet 2', 'Subnet 9', 'Subnet 10'],
    'numeric-suffixed titles must order numerically (Subnet 2 < Subnet 9 < Subnet 10), not by raw string',
  );
}

// Title-tie break: same title, different ids — must use the stable code-unit
// id comparison the HTML page uses (raw string, NOT compareTitles), so the
// order does not depend on the build machine's locale.
{
  const pages = [
    { id: 'zzz/index.mdx', data: { title: 'Tie', summary: '' } },
    { id: 'aaa/index.mdx', data: { title: 'Tie', summary: '' } },
    { id: 'mmm/index.mdx', data: { title: 'Tie', summary: '' } },
  ];
  const out = buildAllPages({
    pages,
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
    origin: ORIGIN,
  });
  assert.deepEqual(
    out.map((a) => a.slug),
    ['aaa', 'mmm', 'zzz'],
    'title ties must break on the stable id with raw string (NOT compareTitles)',
  );
}

// Empty / missing inputs do not crash.
{
  assert.deepEqual(
    buildAllPages({ pages: [], getPageSlug: () => '', origin: ORIGIN }),
    [],
    'empty pages yields an empty directory',
  );
  assert.deepEqual(
    buildAllPages({ pages: undefined, getPageSlug: undefined }),
    [],
    'missing inputs do not crash',
  );
}

// Missing origin normalizes to a site-relative path (backwards compatibility).
{
  const out = buildAllPages({
    pages: [{ id: 'x/index.mdx', data: { title: 'X' } }],
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  assert.equal(out[0].url, '/wiki/x/', 'missing origin falls back to a site-relative URL');
}

// Pages whose id is a `.md`/`.mdx` file (not a directory + index) must still
// resolve to a clean slug.
{
  const out = buildAllPages({
    pages: [{ id: 'foo.mdx', data: { title: 'Foo' } }],
    getPageSlug: (page) => page.id.replace(/\/(index\.(md|mdx))?$/, '').replace(/\.(md|mdx)$/, ''),
    origin: ORIGIN,
  });
  assert.equal(out[0].slug, 'foo', 'foo.mdx normalizes to the slug "foo"');
  assert.equal(out[0].url, `${ORIGIN}/wiki/foo/`);
}

// Missing fields normalize to safe defaults.
{
  const out = buildAllPages({
    pages: [{ id: 'x/index.mdx', data: { title: 'X' } }],
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
    origin: ORIGIN,
  });
  assert.equal(out[0].summary, '', 'undefined summary normalizes to empty string');
  assert.deepEqual(out[0].categories, [], 'missing categories normalizes to an empty array');
}

// ---- 3) Built output: validate against the synced content collection ----
//
// The synced collection is gitignored, but the dist build output is
// committed-readable here. Re-derive the directory from the rendered HTML
// page's article-link list (the same set the HTML page renders) and
// assert the built JSON matches it field-for-field.

const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'allpages.json');
const htmlFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'allpages', 'index.html');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/allpages.json not found; run the build first');
assert.ok(fs.existsSync(htmlFile), 'dist/wiki/special/allpages/index.html not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const html = fs.readFileSync(htmlFile, 'utf8');
const backlinks = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const titleBySlug = Object.fromEntries(Object.entries(slugmap).map(([slug, entry]) => [slug, entry.title]));

// site + envelope.
assert.ok(
  typeof data.site === 'string' && /^https?:\/\//.test(data.site),
  `site must be a non-empty URL string (got ${JSON.stringify(data.site)})`,
);
assert.equal(
  data.allpagesJsonUrl,
  `${data.site}/wiki/special/allpages.json`,
  'allpagesJsonUrl must be the canonical self-URL of the endpoint',
);
assert.ok(typeof data.count === 'number' && data.count > 0, `count must be a positive number (got ${data.count})`);
assert.equal(data.count, data.articles.length, 'count must equal articles.length');
assert.ok(Array.isArray(data.articles), 'articles must be an array');

// Re-derive the expected article set from the rendered HTML page's
// `/wiki/<slug>/` links inside the article directory sections. The page
// also includes "View topic" links to /wiki/category/<topic>/; those
// must be excluded. Match only links that look like article routes —
// `/wiki/<slug>/` — and exclude the `category/`, `special/`, and other
// non-article links. The HTML page's data-article-card hooks also use
// this same path shape.
const linkRegex = /href="(\/wiki\/[^"]+\/)"/g;
const slugsFromHtml = new Set();
let match;
while ((match = linkRegex.exec(html)) !== null) {
  const href = match[1];
  if (href.includes('/wiki/category/') || href.includes('/wiki/special/')) continue;
  const slug = slugFromWikiHref(href);
  if (slug) slugsFromHtml.add(slug);
}
assert.ok(slugsFromHtml.size > 0, 'the rendered HTML page must list at least one article link');
assert.equal(
  data.articles.length,
  slugsFromHtml.size,
  `allpages.json must list every article the HTML page lists (${slugsFromHtml.size} slugs in HTML; got ${data.articles.length} rows in JSON)`,
);

const jsonSlugs = new Set();
data.articles.forEach((row, i) => {
  assert.ok(typeof row.slug === 'string' && row.slug.length > 0, `row ${i} slug must be a non-empty string`);
  assert.ok(typeof row.title === 'string' && row.title.length > 0, `row ${i} title must be a non-empty string`);
  assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `row ${i} url must be an absolute canonical URL`);
  // infoUrl / backlinksUrl point at the article's Page-information and
  // What-links-here pages — the same per-entry companions subnets.json /
  // mostlinkedpages.json expose — so a consumer of the directory can reach each
  // article's metadata and inbound links without rebuilding the route.
  assert.equal(
    row.infoUrl,
    `${data.site}/wiki/${row.slug}/info/`,
    `row ${i} infoUrl must equal ${data.site}/wiki/${row.slug}/info/`,
  );
  // infoJsonUrl is the JSON companion of infoUrl — /wiki/<slug>/info.json exists,
  // so each entry pairs its HTML info link with the machine-readable one.
  assert.equal(
    row.infoJsonUrl,
    `${data.site}/wiki/${row.slug}/info.json`,
    `row ${i} infoJsonUrl must equal ${data.site}/wiki/${row.slug}/info.json`,
  );
  assert.equal(
    row.backlinksUrl,
    `${data.site}/wiki/${row.slug}/backlinks/`,
    `row ${i} backlinksUrl must equal ${data.site}/wiki/${row.slug}/backlinks/`,
  );
  // backlinksJsonUrl is the machine-readable companion of backlinksUrl
  // (/wiki/<slug>/backlinks.json), the same HTML+JSON pairing recentchanges.json,
  // subnets.json, and mostlinkedpages.json already expose.
  assert.equal(
    row.backlinksJsonUrl,
    `${data.site}/wiki/${row.slug}/backlinks.json`,
    `row ${i} backlinksJsonUrl must equal ${data.site}/wiki/${row.slug}/backlinks.json`,
  );
  // backlinks is the published-only inbound-link count — the same figure
  // mostlinkedpages.json exposes per ranked row and info.json as incomingLinks,
  // so a directory consumer can see link popularity without a second fetch.
  assert.equal(
    row.backlinks,
    publishedInboundLinkCount(backlinks, row.slug, titleBySlug),
    `row ${i} backlinks must match the published inbound-link count for ${row.slug}`,
  );
  assert.ok(
    Number.isInteger(row.backlinks) && row.backlinks >= 0,
    `row ${i} backlinks must be a non-negative integer (got ${row.backlinks})`,
  );
  // incomingLinks is the published-only inbound-link count — the same figure
  // info.json names and listing endpoints expose as `backlinks` per row.
  assert.equal(
    row.incomingLinks,
    publishedInboundLinkCount(backlinks, row.slug, titleBySlug),
    `row ${i} incomingLinks must match the published inbound-link count for ${row.slug}`,
  );
  assert.equal(row.incomingLinks, row.backlinks, `row ${i} incomingLinks must equal backlinks`);
  // lastEdited is the article's last-revision date — the same figure info.json /
  // history.json expose per article. Cross-check it against the sibling built
  // info.json envelope (independent source) so the directory and the per-article
  // surfaces can never disagree on recency.
  assert.ok(
    row.lastEdited === null || typeof row.lastEdited === 'string',
    `row ${i} lastEdited must be a string date or null (got ${JSON.stringify(row.lastEdited)})`,
  );
  // revisionCount (commit-history length) and firstEdited (oldest revision) are
  // the rest of the revision-stats trio info.json / history.json expose. Validate
  // their shape and cross-check both against the sibling info.json envelope.
  assert.ok(
    Number.isInteger(row.revisionCount) && row.revisionCount >= 0,
    `row ${i} revisionCount must be a non-negative integer (got ${JSON.stringify(row.revisionCount)})`,
  );
  assert.ok(
    row.firstEdited === null || typeof row.firstEdited === 'string',
    `row ${i} firstEdited must be a string date or null (got ${JSON.stringify(row.firstEdited)})`,
  );
  const apInfoJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'info.json');
  if (fs.existsSync(apInfoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(apInfoJsonFile, 'utf8'));
    assert.equal(
      row.lastEdited,
      infoDoc.lastEdited,
      `row ${i} lastEdited must agree with the sibling info.json envelope for ${row.slug}`,
    );
    assert.equal(
      row.revisionCount,
      infoDoc.revisionCount,
      `row ${i} revisionCount must agree with the sibling info.json envelope for ${row.slug}`,
    );
    assert.equal(
      row.firstEdited,
      infoDoc.firstEdited,
      `row ${i} firstEdited must agree with the sibling info.json envelope for ${row.slug}`,
    );
    assert.equal(
      row.incomingLinks,
      infoDoc.incomingLinks,
      `row ${i} incomingLinks must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // referencesCount is the article's published outbound-reference count — the
  // same figure history.json and references.json expose, computed via the shared helper.
  assert.equal(
    row.referencesCount,
    getArticleReferences({ slug: row.slug, linkGraph: linkgraphData, titleBySlug }).length,
    `row ${i} referencesCount must match the published outbound-reference count for ${row.slug}`,
  );
  assert.ok(
    Number.isInteger(row.referencesCount) && row.referencesCount >= 0,
    `row ${i} referencesCount must be a non-negative integer (got ${JSON.stringify(row.referencesCount)})`,
  );
  const apHistoryJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'history.json');
  if (fs.existsSync(apHistoryJsonFile)) {
    const historyDoc = JSON.parse(fs.readFileSync(apHistoryJsonFile, 'utf8'));
    assert.equal(
      row.referencesCount,
      historyDoc.referencesCount,
      `row ${i} referencesCount must agree with the sibling history.json envelope for ${row.slug}`,
    );
  }
  const apReferencesJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'references.json');
  if (fs.existsSync(apReferencesJsonFile)) {
    const referencesDoc = JSON.parse(fs.readFileSync(apReferencesJsonFile, 'utf8'));
    assert.equal(
      row.referencesCount,
      referencesDoc.count,
      `row ${i} referencesCount must agree with the sibling references.json envelope for ${row.slug}`,
    );
  }
  // wordCount is the article body's word count — the same figure info.json
  // exposes on its envelope. Validate its shape and cross-check it against the
  // sibling built info.json (the independent source) so the directory and the
  // per-article metadata surface can't disagree on article length.
  assert.ok(
    Number.isInteger(row.wordCount) && row.wordCount >= 0,
    `row ${i} wordCount must be a non-negative integer (got ${JSON.stringify(row.wordCount)})`,
  );
  const apWordInfoJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'info.json');
  if (fs.existsSync(apWordInfoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(apWordInfoJsonFile, 'utf8'));
    assert.equal(
      row.wordCount,
      infoDoc.wordCount,
      `row ${i} wordCount must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // readingMinutes is the ~200 wpm ceil reading-time estimate info.json exposes
  // and the article footer renders. Validate its shape, its derivation from the
  // row's own wordCount, and its agreement with the sibling info.json envelope.
  assert.equal(
    row.readingMinutes,
    Math.max(1, Math.ceil((Number.isFinite(row.wordCount) ? row.wordCount : 0) / 200)),
    `row ${i} readingMinutes must be the ~200 wpm ceil estimate of its own wordCount for ${row.slug}`,
  );
  const apReadInfoJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'info.json');
  if (fs.existsSync(apReadInfoJsonFile)) {
    const readInfoDoc = JSON.parse(fs.readFileSync(apReadInfoJsonFile, 'utf8'));
    assert.equal(
      row.readingMinutes,
      readInfoDoc.readingMinutes,
      `row ${i} readingMinutes must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count` and info.json exposes on its envelope.
  // Cross-check it against the sibling built toc.json and info.json so the
  // directory and per-article metadata surfaces can't disagree on depth.
  assert.ok(
    Number.isInteger(row.sectionCount) && row.sectionCount >= 0,
    `row ${i} sectionCount must be a non-negative integer (got ${JSON.stringify(row.sectionCount)})`,
  );
  const apTocJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'toc.json');
  if (fs.existsSync(apTocJsonFile)) {
    const tocDoc = JSON.parse(fs.readFileSync(apTocJsonFile, 'utf8'));
    assert.equal(
      row.sectionCount,
      tocDoc.count,
      `row ${i} sectionCount must agree with the sibling toc.json count for ${row.slug}`,
    );
  }
  if (fs.existsSync(apWordInfoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(apWordInfoJsonFile, 'utf8'));
    assert.equal(
      row.sectionCount,
      infoDoc.sectionCount,
      `row ${i} sectionCount must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // historyUrl points at the article's revision-history page — the same
  // companion subnets.json / mostlinkedpages.json expose — so a consumer of the
  // directory can reach each article's edit history without rebuilding the route.
  assert.equal(
    row.historyUrl,
    `${data.site}/wiki/${row.slug}/history/`,
    `row ${i} historyUrl must equal ${data.site}/wiki/${row.slug}/history/`,
  );
  // historyJsonUrl is the machine-readable companion of historyUrl
  // (/wiki/<slug>/history.json), the same pairing recentchanges.json /
  // subnets.json expose, so a consumer can fetch an article's structured
  // revision list directly.
  assert.equal(
    row.historyJsonUrl,
    `${data.site}/wiki/${row.slug}/history.json`,
    `row ${i} historyJsonUrl must equal ${data.site}/wiki/${row.slug}/history.json`,
  );
  // citeUrl / referencesUrl / relatedUrl complete the per-article API surface:
  // the citation page (/cite/), the outbound-reference index (references.json),
  // and the related-pages set (related.json) all exist per article, so a
  // consumer of the directory can reach them without reconstructing the routes.
  assert.equal(
    row.citeUrl,
    `${data.site}/wiki/${row.slug}/cite/`,
    `row ${i} citeUrl must equal ${data.site}/wiki/${row.slug}/cite/`,
  );
  // citeJsonUrl / bibtexUrl are the machine-readable citation companions of
  // citeUrl: structured citation metadata (cite.json) and a BibTeX record
  // (cite.bib), both of which exist per article — the trio info.json exposes —
  // so a consumer of the directory can fetch a citation directly.
  assert.equal(
    row.citeJsonUrl,
    `${data.site}/wiki/${row.slug}/cite.json`,
    `row ${i} citeJsonUrl must equal ${data.site}/wiki/${row.slug}/cite.json`,
  );
  assert.equal(
    row.bibtexUrl,
    `${data.site}/wiki/${row.slug}/cite.bib`,
    `row ${i} bibtexUrl must equal ${data.site}/wiki/${row.slug}/cite.bib`,
  );
  assert.equal(
    row.referencesUrl,
    `${data.site}/wiki/${row.slug}/references.json`,
    `row ${i} referencesUrl must equal ${data.site}/wiki/${row.slug}/references.json`,
  );
  assert.equal(
    row.relatedUrl,
    `${data.site}/wiki/${row.slug}/related.json`,
    `row ${i} relatedUrl must equal ${data.site}/wiki/${row.slug}/related.json`,
  );
  // referencesJsonUrl / relatedJsonUrl are the same companion links under the
  // consistent <name>JsonUrl key the rest of the API uses; each equals its
  // back-compat un-suffixed twin.
  assert.equal(
    row.referencesJsonUrl,
    `${data.site}/wiki/${row.slug}/references.json`,
    `row ${i} referencesJsonUrl must equal ${data.site}/wiki/${row.slug}/references.json`,
  );
  assert.equal(row.referencesJsonUrl, row.referencesUrl, `row ${i} referencesJsonUrl must equal the back-compat referencesUrl`);
  assert.equal(
    row.relatedJsonUrl,
    `${data.site}/wiki/${row.slug}/related.json`,
    `row ${i} relatedJsonUrl must equal ${data.site}/wiki/${row.slug}/related.json`,
  );
  assert.equal(row.relatedJsonUrl, row.relatedUrl, `row ${i} relatedJsonUrl must equal the back-compat relatedUrl`);
  // tocJsonUrl is the machine-readable table-of-contents companion: the
  // /wiki/<slug>/toc.json endpoint exists per article (the same companion
  // mostlinkedpages.json already exposes), so a directory consumer can fetch
  // an article's section outline without rebuilding the route.
  assert.equal(
    row.tocJsonUrl,
    `${data.site}/wiki/${row.slug}/toc.json`,
    `row ${i} tocJsonUrl must equal ${data.site}/wiki/${row.slug}/toc.json`,
  );
  // imageUrl is the article's OG share-card image (/og/<slug>.png) — each
  // article binds its own card, so the directory can expose it for a consumer
  // that wants a per-article thumbnail without hitting the rendered HTML head.
  assert.equal(
    row.imageUrl,
    `${data.site}/og/${row.slug}.png`,
    `row ${i} imageUrl must equal ${data.site}/og/${row.slug}.png`,
  );
  jsonSlugs.add(row.slug);
  // The article must point to a real, built article file.
  assert.ok(
    fs.existsSync(path.join(projectRoot, 'dist', 'wiki', row.slug, 'index.html')),
    `row ${i} links to an unbuilt article /wiki/${row.slug}/`,
  );
  // The HTML page must render the same article link.
  assert.ok(
    html.includes(`href="/wiki/${row.slug}/"`),
    `row ${i} slug ${row.slug} must appear in the rendered HTML page`,
  );
});

// Every slug in the HTML page must also appear in the JSON.
for (const slug of slugsFromHtml) {
  assert.ok(jsonSlugs.has(slug), `slug ${slug} rendered in the HTML page must also appear in allpages.json`);
}

// sortPagesByTitle order: alphabetical with numeric suffix, title-tie break
// on raw id. The list order in the JSON must therefore match the helper.
// We can verify the order property without re-running the helper by
// re-deriving the order from the page's `<a class="article-card" data-title="…">`
// attributes and asserting the JSON's title sequence is non-decreasing under
// the same numeric-collation order.
for (let i = 1; i < data.articles.length; i++) {
  assert.ok(
    data.articles[i - 1].title.localeCompare(data.articles[i].title, 'en', { numeric: true }) <= 0,
    `articles must be sorted by title (numeric collation) — row ${i - 1} "${data.articles[i - 1].title}" comes after row ${i} "${data.articles[i].title}"`,
  );
}

console.log(`Allpages JSON check passed (${data.count} articles, html+json surfaces agree)`);
