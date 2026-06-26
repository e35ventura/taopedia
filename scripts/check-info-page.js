import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleInfo } from './article-info.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { publishedInboundLinkCount } from './most-linked.js';
import {
  wikiArticleHref,
  wikiCompanionFileHref,
  wikiCompanionHref,
  wikiCompanionJsonHref,
} from '../src/lib/wiki-article-path.js';

// Load-bearing regression check for the per-article "Page information"
// (action=info) pages at /wiki/<slug>/info/ and their machine-readable companion
// at /wiki/<slug>/info.json. It pins each rendered page's metadata to the
// ground-truth build data: topics (slugmap), incoming links (backlinks.json,
// published-only — the same join Special:WhatLinksHere uses), and revision
// count + creation/latest dates (public/history/<slug>.json) — plus coverage,
// the toolbar discovery link, and the JSON endpoint's companion-URL contract.
// If the page faked a figure, listed the wrong topics/links/revisions, lost a
// date, the toolbar stopped linking to it, or the JSON dropped a companion URL,
// this fails the build's test suite.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const ORIGIN = 'https://taopedia.org';

// ---- 0) Unit: buildArticleInfo produces the correct JSON shape -------------
{
  const result = buildArticleInfo({
    title: 'Recycling',
    slug: 'recycling',
    origin: ORIGIN,
    summary: 'Recycling is a consensus mechanism.',
    categories: ['Consensus'],
    incomingLinks: 5,
    referencesCount: 7,
    sectionCount: 5,
    wordCount: 1234,
    revisionCount: 3,
    firstEdited: '2024-01-01T00:00:00.000Z',
    lastEdited: '2024-06-01T00:00:00.000Z',
  });
  assert.equal(result.summary, 'Recycling is a consensus mechanism.', 'builder: summary');
  assert.equal(result.url, `${ORIGIN}/wiki/recycling/`, 'builder: url');
  assert.equal(result.backlinksUrl, `${ORIGIN}/wiki/recycling/backlinks/`, 'builder: backlinksUrl');
  assert.equal(result.backlinksJsonUrl, `${ORIGIN}/wiki/recycling/backlinks.json`, 'builder: backlinksJsonUrl');
  assert.equal(result.citeUrl, `${ORIGIN}/wiki/recycling/cite/`, 'builder: citeUrl');
  assert.equal(result.citeJsonUrl, `${ORIGIN}/wiki/recycling/cite.json`, 'builder: citeJsonUrl');
  assert.equal(result.bibtexUrl, `${ORIGIN}/wiki/recycling/cite.bib`, 'builder: bibtexUrl');
  assert.equal(result.infoUrl, `${ORIGIN}/wiki/recycling/info/`, 'builder: infoUrl');
  assert.equal(result.infoJsonUrl, `${ORIGIN}/wiki/recycling/info.json`, 'builder: infoJsonUrl');
  assert.equal(result.historyJsonUrl, `${ORIGIN}/wiki/recycling/history.json`, 'builder: historyJsonUrl');
  assert.equal(result.historyUrl, `${ORIGIN}/wiki/recycling/history/`, 'builder: historyUrl');
  assert.equal(result.referencesUrl, `${ORIGIN}/wiki/recycling/references.json`, 'builder: referencesUrl');
  assert.equal(result.relatedUrl, `${ORIGIN}/wiki/recycling/related.json`, 'builder: relatedUrl');
  assert.equal(result.referencesJsonUrl, `${ORIGIN}/wiki/recycling/references.json`, 'builder: referencesJsonUrl alias');
  assert.equal(result.relatedJsonUrl, `${ORIGIN}/wiki/recycling/related.json`, 'builder: relatedJsonUrl alias');
  assert.equal(result.tocJsonUrl, `${ORIGIN}/wiki/recycling/toc.json`, 'builder: tocJsonUrl');
  assert.equal(result.imageUrl, `${ORIGIN}/og/recycling.png`, 'builder: imageUrl');
  assert.deepEqual(result.categories, ['Consensus'], 'builder: categories');
  assert.equal(result.incomingLinks, 5, 'builder: incomingLinks');
  assert.equal(result.referencesCount, 7, 'builder: referencesCount');
  assert.equal(result.sectionCount, 5, 'builder: sectionCount');
  assert.equal(result.wordCount, 1234, 'builder: wordCount');
  assert.equal(result.readingMinutes, 7, 'builder: readingMinutes from wordCount (ceil(1234/200))');
  assert.equal(result.revisionCount, 3, 'builder: revisionCount');

  const empty = buildArticleInfo({ title: 'X', slug: 'x', origin: ORIGIN });
  assert.equal(empty.incomingLinks, 0, 'builder: default incomingLinks is 0');
  assert.equal(empty.referencesCount, 0, 'builder: default referencesCount is 0');
  assert.equal(empty.sectionCount, 0, 'builder: default sectionCount is 0');
  assert.equal(empty.wordCount, 0, 'builder: default wordCount is 0');
  assert.equal(empty.readingMinutes, 1, 'builder: default readingMinutes is 1 (ceil(0/200))');
  assert.equal(empty.revisionCount, 0, 'builder: default revisionCount is 0');
  assert.equal(empty.firstEdited, null, 'builder: default firstEdited is null');
  assert.equal(empty.lastEdited, null, 'builder: default lastEdited is null');
  assert.equal(empty.summary, null, 'builder: default summary is null');
  assert.deepEqual(empty.categories, [], 'builder: default categories is []');

  // Non-finite counts coerce to 0 across ALL five count fields (incomingLinks,
  // referencesCount, revisionCount, sectionCount, wordCount) — matching the
  // cite.json sibling — so info.json's numeric fields are never emitted as JSON
  // null. Defaults only catch `undefined`, so an explicit NaN/Infinity would
  // otherwise leak through.
  const nonFinite = buildArticleInfo({
    title: 'NF',
    slug: 'nf',
    origin: ORIGIN,
    incomingLinks: NaN,
    referencesCount: Infinity,
    revisionCount: NaN,
    sectionCount: NaN,
    wordCount: -Infinity,
  });
  assert.equal(nonFinite.incomingLinks, 0, 'builder: non-finite incomingLinks coerces to 0');
  assert.equal(nonFinite.referencesCount, 0, 'builder: non-finite referencesCount coerces to 0');
  assert.equal(nonFinite.revisionCount, 0, 'builder: non-finite revisionCount coerces to 0');
  assert.equal(nonFinite.sectionCount, 0, 'builder: non-finite sectionCount coerces to 0');
  assert.equal(nonFinite.wordCount, 0, 'builder: non-finite wordCount coerces to 0');
  assert.equal(nonFinite.readingMinutes, 1, 'builder: non-finite wordCount yields readingMinutes 1 (ceil(0/200))');
  const deduped = buildArticleInfo({
    title: 'Dup',
    slug: 'dup',
    origin: ORIGIN,
    categories: ['Consensus', 'Mining', 'Consensus'],
  });
  assert.deepEqual(
    deduped.categories,
    ['Consensus', 'Mining'],
    'builder: repeated frontmatter categories must be deduped while preserving first-seen order',
  );
  assert.equal(empty.backlinksJsonUrl, `${ORIGIN}/wiki/x/backlinks.json`, 'builder: backlinksJsonUrl with defaults');
  assert.equal(empty.citeUrl, `${ORIGIN}/wiki/x/cite/`, 'builder: citeUrl with defaults');
  assert.equal(empty.citeJsonUrl, `${ORIGIN}/wiki/x/cite.json`, 'builder: citeJsonUrl with defaults');
  assert.equal(empty.bibtexUrl, `${ORIGIN}/wiki/x/cite.bib`, 'builder: bibtexUrl with defaults');
  assert.equal(empty.infoUrl, `${ORIGIN}/wiki/x/info/`, 'builder: infoUrl with defaults');
  assert.equal(empty.infoJsonUrl, `${ORIGIN}/wiki/x/info.json`, 'builder: infoJsonUrl with defaults');
  assert.equal(empty.historyJsonUrl, `${ORIGIN}/wiki/x/history.json`, 'builder: historyJsonUrl with defaults');
  assert.equal(empty.referencesUrl, `${ORIGIN}/wiki/x/references.json`, 'builder: referencesUrl with defaults');
  assert.equal(empty.relatedUrl, `${ORIGIN}/wiki/x/related.json`, 'builder: relatedUrl with defaults');
  assert.equal(empty.referencesJsonUrl, `${ORIGIN}/wiki/x/references.json`, 'builder: referencesJsonUrl with defaults');
  assert.equal(empty.relatedJsonUrl, `${ORIGIN}/wiki/x/related.json`, 'builder: relatedJsonUrl with defaults');
  assert.equal(empty.tocJsonUrl, `${ORIGIN}/wiki/x/toc.json`, 'builder: tocJsonUrl with defaults');
  assert.equal(empty.imageUrl, `${ORIGIN}/og/x.png`, 'builder: imageUrl with defaults');
}
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');

const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
// referencesCount = the article's published outbound-reference count, re-derived
// with the same getArticleReferences helper the endpoint uses (published-only
// join), so the JSON figure can't drift from the link graph.
const titleBySlug = Object.fromEntries(Object.entries(slugmap).map(([slug, entry]) => [slug, entry?.title ?? slug]));
const outboundCountFor = (slug) => getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Article slugs: the same recursive walk + sub-page exclusion the sibling checks
// use, now including 'info' so the info pages themselves are not treated as
// articles needing their own info page.
const articleSlugs = [];
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
    articleSlugs.push(segs.slice(0, -1).join('/'));
  }
};
walk(wikiDir);
assert.ok(articleSlugs.length > 0, 'no built article pages found to verify');

// Use the same shared published-inbound-link counter the info page, info.json,
// backlinks.json and mostlinkedpages.json all use, so this regression check
// asserts the exact rule the surfaces produce (published-only AND self-links
// excluded, `from !== slug`) rather than re-deriving a subtly different count.
const inboundCountFor = (slug) => publishedInboundLinkCount(backlinksData, slug, slugmap);
const historyOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
};

// Pull a single <dd data-info="key"> ... </dd> block out of the rendered page.
const infoField = (html, key) => {
  const m = html.match(new RegExp(`<dd[^>]*data-info="${key}"[^>]*>([\\s\\S]*?)</dd>`));
  return m ? m[1] : null;
};
// Parse the count from a field's visible text only — strip tags first so digits
// inside an href (e.g. /wiki/ss58_encoded/backlinks/) cannot pollute the number.
const toNumber = (block) => Number((block || '').replace(/<[^>]*>/g, '').replace(/[^0-9]/g, ''));

let verifiedWithLinks = 0;
let verifiedMultiRevision = 0;
for (const slug of articleSlugs) {
  const infoFile = path.join(wikiDir, slug, 'info', 'index.html');
  assert.ok(fs.existsSync(infoFile), `every article must have a Page-information page, but /wiki/${slug}/info/ was not built`);
  const html = fs.readFileSync(infoFile, 'utf8');

  // Topics: the rendered category links (text + order) must equal the article's
  // categories from the slug map.
  const categoriesField = infoField(html, 'categories');
  assert.ok(categoriesField !== null, `/wiki/${slug}/info/ is missing the topics field`);
  const renderedCategories = [...categoriesField.matchAll(/<a[^>]*href="\/wiki\/category\/[^"]*"[^>]*>([^<]*)<\/a>/g)].map((m) => decode(m[1]));
  const expectedCategories = [...new Set(slugmap[slug]?.categories ?? [])];
  assert.deepEqual(renderedCategories, expectedCategories, `/wiki/${slug}/info/ topics must match the article's categories`);

  // Incoming links: the rendered count must equal the published inbound-link
  // count from the link graph, and must link to this article's backlinks page.
  const inboundField = infoField(html, 'inbound');
  assert.ok(inboundField !== null, `/wiki/${slug}/info/ is missing the incoming-links field`);
  assert.ok(
    inboundField.includes(`href="/wiki/${slug}/backlinks/"`),
    `/wiki/${slug}/info/ incoming links must link to its What-links-here page`,
  );
  assert.equal(toNumber(inboundField), inboundCountFor(slug), `/wiki/${slug}/info/ incoming-link count must match the link graph`);

  // Revisions: the rendered count must equal the article's history length, and
  // must link to its History page.
  const revisionsField = infoField(html, 'revisions');
  const history = historyOf(slug);
  assert.ok(revisionsField !== null, `/wiki/${slug}/info/ is missing the revisions field`);
  assert.ok(
    revisionsField.includes(`href="/wiki/${slug}/history/"`),
    `/wiki/${slug}/info/ revisions must link to its History page`,
  );
  assert.equal(toNumber(revisionsField), history.length, `/wiki/${slug}/info/ revision count must match the article's history`);

  // Dates: when history exists, the page must show the creation date (oldest
  // revision) and the latest-revision date (newest) as <time> datetime values.
  if (history.length > 0) {
    const times = [...html.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
    const oldest = history[history.length - 1]?.date;
    const newest = history[0]?.date;
    assert.ok(times.includes(oldest), `/wiki/${slug}/info/ must show the creation date (oldest revision ${oldest})`);
    assert.ok(times.includes(newest), `/wiki/${slug}/info/ must show the latest-revision date (${newest})`);
  }

  // Discovery: the article's own toolbar must link to its info page, so it is
  // reachable on-site rather than only by guessing the URL.
  const articleHtml = fs.readFileSync(path.join(wikiDir, slug, 'index.html'), 'utf8');
  assert.ok(
    articleHtml.includes(`href="/wiki/${slug}/info/"`),
    `the article toolbar for /wiki/${slug}/ must link to its Page information (discovery path)`,
  );

  // info.json: the machine-readable companion must include every companion URL
  // that the HTML toolbar advertises (article, backlinks, cite, history, info) so
  // programmatic consumers can navigate the same link set.
  const infoJsonFile = path.join(wikiDir, slug, 'info.json');
  assert.ok(fs.existsSync(infoJsonFile), `/wiki/${slug}/info.json must be built alongside the HTML info page`);
  const infoJson = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
  assert.equal(infoJson.slug, slug, `/wiki/${slug}/info.json slug must match`);
  // summary is the article's frontmatter summary (or null when absent), matching
  // the same field backlinks.json and toc.json already expose on their envelopes.
  const expectedSummary = slugmap[slug]?.summary || null;
  assert.equal(infoJson.summary, expectedSummary, `/wiki/${slug}/info.json summary must match the article's frontmatter summary`);
  assert.ok(
    typeof infoJson.url === 'string' && /^https?:\/\//.test(infoJson.url),
    `/wiki/${slug}/info.json url must be an absolute URL`,
  );
  // incomingLinks must use the same published-only inbound-link join as the HTML
  // info page (and Special:WhatLinksHere), so the two surfaces cannot drift.
  assert.equal(
    infoJson.incomingLinks,
    inboundCountFor(slug),
    `/wiki/${slug}/info.json incomingLinks must match the published inbound-link count shown on the HTML info page`,
  );
  // referencesCount is the published OUTBOUND reference count (the complement of
  // incomingLinks) — the same figure history.json / cite.json expose — derived
  // from the same getArticleReferences join so the surfaces cannot drift.
  assert.equal(
    infoJson.referencesCount,
    outboundCountFor(slug),
    `/wiki/${slug}/info.json referencesCount must match the published outbound-reference count`,
  );
  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count`, derived from the shared getArticleToc helper.
  assert.ok(
    Number.isInteger(infoJson.sectionCount) && infoJson.sectionCount >= 0,
    `/wiki/${slug}/info.json sectionCount must be a non-negative integer`,
  );
  const infoTocJsonFile = path.join(wikiDir, slug, 'toc.json');
  if (fs.existsSync(infoTocJsonFile)) {
    const tocDoc = JSON.parse(fs.readFileSync(infoTocJsonFile, 'utf8'));
    assert.equal(
      infoJson.sectionCount,
      tocDoc.count,
      `/wiki/${slug}/info.json sectionCount must agree with the sibling toc.json envelope`,
    );
  }
  // wordCount is the article body's word count — the same figure the article-page
  // footer renders as data-word-count. Cross-check against that rendered value
  // (independent source) so info.json and the footer can never disagree.
  assert.ok(
    Number.isInteger(infoJson.wordCount) && infoJson.wordCount >= 0,
    `/wiki/${slug}/info.json wordCount must be a non-negative integer`,
  );
  const wordCountAttr = articleHtml.match(/data-word-count="(\d+)"/);
  if (wordCountAttr) {
    assert.equal(
      infoJson.wordCount,
      Number(wordCountAttr[1]),
      `/wiki/${slug}/info.json wordCount must match the article footer's rendered data-word-count`,
    );
  }
  // readingMinutes is the ~200 wpm ceil estimate the article footer renders.
  assert.ok(
    Number.isInteger(infoJson.readingMinutes) && infoJson.readingMinutes >= 1,
    `/wiki/${slug}/info.json readingMinutes must be a positive integer`,
  );
  const readingMatch = articleHtml.match(/(\d+) min read/);
  if (readingMatch) {
    assert.equal(
      infoJson.readingMinutes,
      Number(readingMatch[1]),
      `/wiki/${slug}/info.json readingMinutes must match the article footer's rendered reading time`,
    );
  }
  // Extract the origin from the article URL so the companion-URL checks are
  // independent of the configured site value.
  const jsonOrigin = new URL(infoJson.url).origin;
  assert.equal(infoJson.backlinksUrl, wikiCompanionHref(jsonOrigin, slug, 'backlinks'), `/wiki/${slug}/info.json backlinksUrl`);
  assert.equal(
    infoJson.backlinksJsonUrl,
    wikiCompanionJsonHref(jsonOrigin, slug, 'backlinks'),
    `/wiki/${slug}/info.json backlinksJsonUrl`,
  );
  assert.equal(infoJson.citeUrl, wikiCompanionHref(jsonOrigin, slug, 'cite'), `/wiki/${slug}/info.json citeUrl`);
  assert.equal(infoJson.citeJsonUrl, wikiCompanionJsonHref(jsonOrigin, slug, 'cite'), `/wiki/${slug}/info.json citeJsonUrl`);
  assert.equal(infoJson.bibtexUrl, wikiCompanionFileHref(jsonOrigin, slug, 'cite.bib'), `/wiki/${slug}/info.json bibtexUrl`);
  assert.equal(infoJson.infoUrl, wikiCompanionHref(jsonOrigin, slug, 'info'), `/wiki/${slug}/info.json infoUrl`);
  assert.equal(infoJson.infoJsonUrl, wikiCompanionJsonHref(jsonOrigin, slug, 'info'), `/wiki/${slug}/info.json infoJsonUrl (self)`);
  assert.equal(infoJson.historyJsonUrl, wikiCompanionJsonHref(jsonOrigin, slug, 'history'), `/wiki/${slug}/info.json historyJsonUrl`);
  assert.equal(infoJson.historyUrl, wikiCompanionHref(jsonOrigin, slug, 'history'), `/wiki/${slug}/info.json historyUrl`);
  assert.equal(infoJson.referencesUrl, wikiCompanionJsonHref(jsonOrigin, slug, 'references'), `/wiki/${slug}/info.json referencesUrl`);
  assert.equal(infoJson.relatedUrl, wikiCompanionJsonHref(jsonOrigin, slug, 'related'), `/wiki/${slug}/info.json relatedUrl`);
  assert.equal(infoJson.referencesJsonUrl, wikiCompanionJsonHref(jsonOrigin, slug, 'references'), `/wiki/${slug}/info.json referencesJsonUrl alias`);
  assert.equal(infoJson.referencesJsonUrl, infoJson.referencesUrl, `/wiki/${slug}/info.json referencesJsonUrl must equal referencesUrl`);
  assert.equal(infoJson.relatedJsonUrl, wikiCompanionJsonHref(jsonOrigin, slug, 'related'), `/wiki/${slug}/info.json relatedJsonUrl alias`);
  assert.equal(infoJson.relatedJsonUrl, infoJson.relatedUrl, `/wiki/${slug}/info.json relatedJsonUrl must equal relatedUrl`);
  assert.equal(infoJson.tocJsonUrl, wikiCompanionJsonHref(jsonOrigin, slug, 'toc'), `/wiki/${slug}/info.json tocJsonUrl`);
  // imageUrl is the article's own OG share-card (/og/<slug>.png) — the same
  // per-article image the allpages/mostlinkedpages/recentchanges directory
  // entries and the feeds expose, so a consumer of info.json gets a thumbnail.
  assert.equal(infoJson.imageUrl, `${jsonOrigin}/og/${slug}.png`, `/wiki/${slug}/info.json imageUrl`);

  if (inboundCountFor(slug) > 0) verifiedWithLinks++;
  if (history.length > 1) verifiedMultiRevision++;
}
assert.ok(verifiedWithLinks > 0, 'expected at least one article with inbound links to verify against the link graph');
assert.ok(verifiedMultiRevision > 0, 'expected at least one article with multiple revisions to verify the revision count');

console.log(
  `Page-information check passed (${articleSlugs.length} pages; ${verifiedWithLinks} with inbound links and ${verifiedMultiRevision} with multiple revisions verified against the build data; toolbar discovery on every article)`,
);
