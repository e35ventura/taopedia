import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { RECENT_LIMIT } from '../src/lib/recent-changes.js';
import { publishedInboundLinkCount } from './most-linked.js';
import { getArticleReferences } from '../src/lib/article-references.js';

const collectRecentChanges = (historyBySlug, titleBySlug, limit) => {
  const changes = [];
  for (const [slug, history] of Object.entries(historyBySlug)) {
    const title = titleBySlug[slug];
    if (!title) continue;
    for (const entry of history) {
      if (typeof entry?.date !== 'string' || !entry.date) continue;
      if (typeof entry?.sha !== 'string' || !entry.sha) continue;
      changes.push({
        slug,
        title,
        date: entry.date,
        authorName: entry.authorName,
        sha: entry.sha,
        message: entry.message ?? '',
      });
    }
  }
  changes.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return compareTitles(a.slug, b.slug);
  });
  return limit > 0 ? changes.slice(0, limit) : changes;
};

// Builder contract: a recent change is only valid if its entry carries both a
// date AND a sha (the sha is the stable event-id component
// urn:taopedia:recentchanges:<slug>:<sha>). Entries missing either are dropped,
// matching the rss/atom/json-feed harnesses — so a date-only entry can never
// leak a `…:undefined` event id into the JSON feed.
{
  const built = collectRecentChanges(
    {
      ok: [{ date: '2024-01-02T00:00:00Z', sha: 'abc123', message: 'm' }],
      nosha: [{ date: '2024-01-03T00:00:00Z', message: 'no sha here' }],
      nodate: [{ sha: 'def456', message: 'no date here' }],
    },
    { ok: 'Ok', nosha: 'No Sha', nodate: 'No Date' },
    50,
  );
  assert.deepEqual(
    built.map((c) => c.slug),
    ['ok'],
    'collectRecentChanges must drop entries missing a sha or a date (only the complete entry survives)',
  );
}

// /wiki/special/recentchanges.json exposes the site-wide recent-changes feed as
// structured JSON, mirroring Special:RecentChanges for programmatic consumers
// (alongside statistics.json / categories.json / mostlinkedpages.json /
// allpages.json). The contract is load-bearing: a malformed response, a wrong or
// extra change, a non-deterministic order, an orphaned slug, an off-by-one limit,
// or a feed that disagrees with the HTML page would silently break consumers.
// This validates all of those against the REAL history data and the rendered HTML
// page — independent ground truth, so a buggy builder cannot satisfy it by
// agreeing with itself. (The builder's same-date tiebreak itself is guarded in
// check-title-sort.js; the HTML feed in check-recent-changes.js.)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const distFile = path.join(wikiDir, 'special', 'recentchanges.json');
const htmlFile = path.join(wikiDir, 'special', 'recentchanges', 'index.html');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(distFile), 'dist/wiki/special/recentchanges.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const titleBySlug = Object.fromEntries(Object.entries(slugmap).map(([slug, entry]) => [slug, entry.title]));
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
const backlinksGraph = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
// linkgraph drives referencesCount (the published OUTBOUND reference count),
// re-derived with the same getArticleReferences helper the endpoint uses.
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const outboundCountFor = (slug) => getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;
const historyBySlug = {};
for (const file of fs.readdirSync(historyDir)) {
  if (!file.endsWith('.json')) continue;
  const slug = file.replace(/\.json$/, '');
  if (!fs.existsSync(path.join(wikiDir, slug, 'index.html'))) continue;
  historyBySlug[slug] = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8')).history || [];
}
const expectedChanges = collectRecentChanges(historyBySlug, titleBySlug, RECENT_LIMIT);

// ---- 1) Shape + per-change field contract ---------------------------------
assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(
  data.recentchangesJsonUrl,
  `${data.site}/wiki/special/recentchanges.json`,
  `recentchangesJsonUrl must be the canonical absolute URL of the endpoint itself`,
);
// feedUrl / atomUrl / rssUrl advertise the recent-changes syndication feeds (the
// same trio categories.json exposes per category), so a feed reader can
// subscribe straight from the structured endpoint. The routes exist under
// /wiki/special/recentchanges/ and are already listed in feeds.opml.
assert.equal(data.feedUrl, `${data.site}/wiki/special/recentchanges/feed.json`, 'feedUrl must be the recent-changes JSON Feed URL');
assert.equal(data.atomUrl, `${data.site}/wiki/special/recentchanges/atom.xml`, 'atomUrl must be the recent-changes Atom feed URL');
assert.equal(data.rssUrl, `${data.site}/wiki/special/recentchanges/rss.xml`, 'rssUrl must be the recent-changes RSS feed URL');
assert.equal(data.limit, RECENT_LIMIT, `limit must be the shared RECENT_LIMIT (${RECENT_LIMIT})`);
assert.ok(Array.isArray(data.changes), 'changes must be an array');
assert.equal(data.count, data.changes.length, 'count must equal changes.length');
assert.ok(data.changes.length > 0, 'recentchanges.json must list at least one change');
assert.ok(data.changes.length <= RECENT_LIMIT, `must list at most ${RECENT_LIMIT} changes (got ${data.changes.length})`);

for (let i = 0; i < data.changes.length; i++) {
  const change = data.changes[i];
  const expected = expectedChanges[i];
  assert.equal(
    change.id,
    `urn:taopedia:recentchanges:${expected.slug}:${expected.sha}`,
    `change ${i} id must use the stable per-event identifier`,
  );
  assert.ok(typeof change.slug === 'string' && change.slug, 'each change must carry a slug');
  assert.ok(
    fs.existsSync(path.join(wikiDir, change.slug, 'index.html')),
    `change links to /wiki/${change.slug}/ but no such article page was built (orphaned history must be skipped)`,
  );
  // Every change url must be absolute and start with the envelope site, the
  // same self-contained contract the merged allpages.json / mostlinkedpages.json
  // fixes (#580 and follow-up) established for every other per-article JSON
  // endpoint: a programmatic consumer should never need to combine a relative
  // url with the envelope site to reach the article.
  assert.ok(
    change.url.startsWith(`${data.site}/wiki/`),
    `change url must be absolute and start with the envelope site (got ${change.url})`,
  );
  assert.equal(
    change.url,
    `${data.site}/wiki/${change.slug}/`,
    `change url must equal ${data.site}/wiki/${change.slug}/ for ${change.slug}`,
  );
  // infoUrl / backlinksUrl point at the changed article's Page-information and
  // What-links-here pages, so a consumer watching recent changes can reach a
  // page's metadata and inbound links without reconstructing the route.
  assert.equal(
    change.infoUrl,
    `${data.site}/wiki/${change.slug}/info/`,
    `change infoUrl must equal ${data.site}/wiki/${change.slug}/info/ for ${change.slug}`,
  );
  assert.equal(
    change.infoJsonUrl,
    `${data.site}/wiki/${change.slug}/info.json`,
    `change infoJsonUrl must equal ${data.site}/wiki/${change.slug}/info.json for ${change.slug}`,
  );
  assert.equal(
    change.backlinksUrl,
    `${data.site}/wiki/${change.slug}/backlinks/`,
    `change backlinksUrl must equal ${data.site}/wiki/${change.slug}/backlinks/ for ${change.slug}`,
  );
  // backlinksJsonUrl is the JSON companion of backlinksUrl — the same HTML+JSON
  // pairing subnets.json / mostlinkedpages.json expose for backlinks, and the
  // /wiki/<slug>/backlinks.json endpoint exists, so a consumer can fetch the
  // changed page's machine-readable inbound links without rebuilding the route.
  assert.equal(
    change.backlinksJsonUrl,
    `${data.site}/wiki/${change.slug}/backlinks.json`,
    `change backlinksJsonUrl must equal ${data.site}/wiki/${change.slug}/backlinks.json for ${change.slug}`,
  );
  assert.ok(
    change.historyUrl.startsWith(`${data.site}/wiki/`),
    `change historyUrl must be absolute and start with the envelope site (got ${change.historyUrl})`,
  );
  assert.equal(
    change.historyUrl,
    `${data.site}/wiki/${change.slug}/history/`,
    `change historyUrl must equal ${data.site}/wiki/${change.slug}/history/ for ${change.slug}`,
  );
  assert.ok(
    change.historyJsonUrl.startsWith(`${data.site}/wiki/`),
    `change historyJsonUrl must be absolute and start with the envelope site (got ${change.historyJsonUrl})`,
  );
  assert.equal(
    change.historyJsonUrl,
    `${data.site}/wiki/${change.slug}/history.json`,
    `change historyJsonUrl must equal ${data.site}/wiki/${change.slug}/history.json for ${change.slug}`,
  );
  // citeUrl / referencesUrl / relatedUrl complete the per-article API surface:
  // the citation page (/cite/), the outbound-reference index (references.json),
  // and the related-pages set (related.json) all exist per article, so a
  // consumer watching changes can reach them without reconstructing the routes.
  assert.equal(
    change.citeUrl,
    `${data.site}/wiki/${change.slug}/cite/`,
    `change citeUrl must equal ${data.site}/wiki/${change.slug}/cite/ for ${change.slug}`,
  );
  // citeJsonUrl / bibtexUrl are the machine-readable citation companions of
  // citeUrl: structured citation metadata (cite.json) and a BibTeX record
  // (cite.bib), both of which exist per article — the trio info.json exposes —
  // so a consumer watching changes can fetch a citation directly.
  assert.equal(
    change.citeJsonUrl,
    `${data.site}/wiki/${change.slug}/cite.json`,
    `change citeJsonUrl must equal ${data.site}/wiki/${change.slug}/cite.json for ${change.slug}`,
  );
  assert.equal(
    change.bibtexUrl,
    `${data.site}/wiki/${change.slug}/cite.bib`,
    `change bibtexUrl must equal ${data.site}/wiki/${change.slug}/cite.bib for ${change.slug}`,
  );
  assert.equal(
    change.referencesUrl,
    `${data.site}/wiki/${change.slug}/references.json`,
    `change referencesUrl must equal ${data.site}/wiki/${change.slug}/references.json for ${change.slug}`,
  );
  assert.equal(
    change.relatedUrl,
    `${data.site}/wiki/${change.slug}/related.json`,
    `change relatedUrl must equal ${data.site}/wiki/${change.slug}/related.json for ${change.slug}`,
  );
  // tocJsonUrl links the changed article's table-of-contents endpoint — the
  // same per-article companion allpages.json and mostlinkedpages.json expose,
  // so a consumer watching changes can fetch the section outline directly.
  assert.equal(
    change.tocJsonUrl,
    `${data.site}/wiki/${change.slug}/toc.json`,
    `change tocJsonUrl must equal ${data.site}/wiki/${change.slug}/toc.json for ${change.slug}`,
  );
  // imageUrl is the article's OG share-card image — the same /og/<slug>.png the
  // recentchanges RSS/Atom/JSON feeds already embed per item. The structured
  // endpoint must expose it too so a consumer renders the same per-change
  // thumbnail instead of falling back to the homepage card.
  assert.equal(
    change.imageUrl,
    `${data.site}/og/${change.slug}.png`,
    `change imageUrl must equal ${data.site}/og/${change.slug}.png for ${change.slug}`,
  );
  assert.equal(change.title, slugmap[change.slug]?.title, `change title must match the article title for ${change.slug}`);
  // summary mirrors the changed article's one-line description (null when blank)
  // — the same per-entry field allpages.json / mostlinkedpages.json /
  // subnets.json / category-articles expose, so a change monitor can show a
  // preview without a second fetch. Source of truth is the slug map.
  assert.equal(
    change.summary,
    slugmap[change.slug]?.summary || null,
    `change ${i} summary must be the slug-map summary (null when blank) for ${change.slug}`,
  );
  // categories mirrors the changed article's topics — the same per-item category
  // set the recentchanges RSS/Atom/JSON feeds attach (recent-changes-feed.js), so
  // the structured endpoint and the feeds agree. Source of truth is the slug map.
  assert.ok(Array.isArray(change.categories), `change ${i} categories must be an array`);
  assert.deepEqual(
    change.categories,
    slugmap[change.slug]?.categories ?? [],
    `change ${i} categories must match the article's topics in the slug map for ${change.slug}`,
  );
  // backlinks is the changed article's inbound-link count from OTHER published
  // articles — the same published-only, orphan-skipping metric allpages.json /
  // mostlinkedpages.json / subnets.json / related.json expose per entry,
  // computed with the shared publishedInboundLinkCount helper. Re-derive it from
  // the raw backlink graph (independent source) so it cannot drift.
  assert.ok(
    Number.isInteger(change.backlinks) && change.backlinks >= 0,
    `change ${i} backlinks must be a non-negative integer (got ${JSON.stringify(change.backlinks)})`,
  );
  assert.equal(
    change.backlinks,
    publishedInboundLinkCount(backlinksGraph, change.slug, titleBySlug),
    `change ${i} backlinks must equal the published inbound-link count for ${change.slug}`,
  );
  // referencesCount is the changed article's published OUTBOUND reference count —
  // the complement of backlinks — re-derived with the same getArticleReferences
  // helper the endpoint uses (published-only join), so the feed and references.json
  // / cite.json / info.json can't disagree on outbound degree.
  assert.ok(
    Number.isInteger(change.referencesCount) && change.referencesCount >= 0,
    `change ${i} referencesCount must be a non-negative integer (got ${JSON.stringify(change.referencesCount)})`,
  );
  assert.equal(
    change.referencesCount,
    outboundCountFor(change.slug),
    `change ${i} referencesCount must equal the published outbound-reference count for ${change.slug}`,
  );
  assert.equal(change.authorName, expected.authorName, `change ${i} authorName must match the revision history`);
  assert.equal(change.sha, expected.sha, `change ${i} sha must match the revision history`);
  assert.ok(typeof change.sha === 'string' && change.sha.length > 0, `change ${i} sha must be a non-empty string`);
  assert.equal(change.message, expected.message, `change ${i} message must match the revision history`);
  assert.ok(typeof change.message === 'string', `change ${i} message must be a string`);
  assert.ok(typeof change.date === 'string' && !Number.isNaN(Date.parse(change.date)), `change has an invalid date: ${change.date}`);
}

assert.equal(
  new Set(data.changes.map((change) => change.id)).size,
  data.changes.length,
  'each recentchanges.json id must be unique',
);

// ---- 2) dateRange summarizes the feed window (newest-first changes[]) -------
assert.ok(data.dateRange && typeof data.dateRange === 'object', 'dateRange must be an object');
assert.ok(typeof data.dateRange.newest === 'string', 'dateRange.newest must be a string');
assert.ok(typeof data.dateRange.oldest === 'string', 'dateRange.oldest must be a string');
if (data.changes.length > 0) {
  assert.equal(data.dateRange.newest, data.changes[0].date, 'dateRange.newest must equal the newest change in the feed');
  assert.equal(
    data.dateRange.oldest,
    data.changes[data.changes.length - 1].date,
    'dateRange.oldest must equal the oldest change in the feed window',
  );
  assert.ok(
    data.dateRange.oldest <= data.dateRange.newest,
    `dateRange.oldest must not be after dateRange.newest (${data.dateRange.oldest} > ${data.dateRange.newest})`,
  );
} else {
  assert.equal(data.dateRange.newest, '', 'dateRange.newest must be empty when the feed has no changes');
  assert.equal(data.dateRange.oldest, '', 'dateRange.oldest must be empty when the feed has no changes');
}

// ---- 3) Ordering: newest-first, same-date ties by compareTitles(slug) -----
for (let i = 1; i < data.changes.length; i++) {
  const prev = data.changes[i - 1];
  const cur = data.changes[i];
  assert.ok(prev.date >= cur.date, `changes must be newest-first (row ${i - 1} ${prev.date} < row ${i} ${cur.date})`);
  if (prev.date === cur.date) {
    assert.ok(
      compareTitles(prev.slug, cur.slug) <= 0,
      `same-timestamp changes must be ordered by compareTitles (numeric): ${prev.slug} > ${cur.slug} at ${cur.date}`,
    );
  }
}

// ---- 4) Independent ground truth from the real history data ---------------
const dated = [];
for (const file of fs.readdirSync(historyDir)) {
  if (!file.endsWith('.json')) continue;
  const slug = file.replace(/\.json$/, '');
  if (!fs.existsSync(path.join(wikiDir, slug, 'index.html'))) continue; // unpublished/orphaned
  const history = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8')).history || [];
  for (const entry of history) {
    if (typeof entry.date === 'string' && entry.date) dated.push(entry.date);
  }
}
dated.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
assert.equal(
  data.count,
  Math.min(dated.length, RECENT_LIMIT),
  `recentchanges.json must list ${Math.min(dated.length, RECENT_LIMIT)} changes (min of ${dated.length} published dated commits and ${RECENT_LIMIT})`,
);
assert.equal(data.changes[0].date, dated[0], `newest change (${data.changes[0].date}) must equal the newest commit across published articles (${dated[0]})`);

// ---- 5) JSON/HTML parity: independent render path, proves no drift --------
assert.ok(fs.existsSync(htmlFile), 'dist/wiki/special/recentchanges/index.html not found; run the build first');
const html = fs.readFileSync(htmlFile, 'utf8');
const htmlRows = [...html.matchAll(/<li[^>]*class="mw-rc-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  date: (block.match(/datetime="([^"]+)"/) || [])[1],
  slug: ((block.match(/mw-rc-title[^>]*href="([^"]+)"/) || [])[1] || '').split('/')[2],
  historyPath: (block.match(/mw-rc-hist[^>]*href="([^"]+)"/) || [])[1],
  authorName: (block.match(/mw-rc-author[^>]*>([^<]*)</) || [])[1]?.trim() || '',
}));
assert.equal(htmlRows.length, data.changes.length, `the JSON feed (${data.changes.length}) and HTML page (${htmlRows.length}) must list the same number of changes`);
htmlRows.forEach((row, i) => {
  assert.equal(data.changes[i].slug, row.slug, `change ${i}: JSON slug (${data.changes[i].slug}) must equal the HTML row slug (${row.slug})`);
  assert.equal(data.changes[i].date, row.date, `change ${i}: JSON date must equal the HTML row date`);
  assert.equal(
    data.changes[i].historyUrl,
    `${data.site}${row.historyPath}`,
    `change ${i}: JSON historyUrl must match the HTML hist link`,
  );
  assert.equal(
    data.changes[i].authorName ?? '',
    row.authorName,
    `change ${i}: JSON authorName must match the HTML author when rendered`,
  );
});

console.log(`Recent changes JSON check passed (${data.count} changes, newest ${data.changes[0].date}; validated against history + HTML page)`);
