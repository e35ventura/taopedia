import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildArticleBacklinks, sortInboundBacklinkEntries } from './article-backlinks.js';
import { publishedInboundLinkCount } from './most-linked.js';
import { getArticleReferences } from '../src/lib/article-references.js';

// Load-bearing check for /wiki/<slug>/backlinks.json: the machine-readable
// companion to the What-links-here HTML page. It (1) unit-tests the builder,
// (2) confirms every article has a built backlinks.json with the correct shape
// and a count that matches the array length, (3) verifies the entries match the
// ground-truth link graph (published-only join, same as the HTML page), (4)
// checks sort order, (5) checks the empty-state (count 0, empty array), and (6)
// confirms JSON/HTML parity — the JSON and HTML page must list the same set of
// linking articles so the two surfaces cannot drift.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const historyDir = path.join(projectRoot, 'public', 'history');
const ORIGIN = 'https://taopedia.org';
const revisionStatsOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) {
    return { revisionCount: 0, firstEdited: null, lastEdited: null };
  }
  const history = JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
  return {
    revisionCount: Array.isArray(history) ? history.length : 0,
    firstEdited: Array.isArray(history) && history.length > 0 ? history[history.length - 1].date : null,
    lastEdited: Array.isArray(history) && history.length > 0 ? history[0].date : null,
  };
};

// ---- 1) Unit: builder produces the correct JSON shape ----------------------
{
  const result = buildArticleBacklinks({
    slug: 'recycling',
    title: 'Recycling',
    origin: ORIGIN,
    summary: 'Reclaiming emitted TAO.',
    categories: ['Consensus'],
    incomingLinks: 2,
    referencesCount: 6,
    sectionCount: 4,
    wordCount: 789,
    revisionCount: 8,
    firstEdited: '2024-01-01T00:00:00.000Z',
    lastEdited: '2024-06-01T00:00:00.000Z',
    backlinks: [
      { slug: 'neuron', title: 'Neuron', summary: 'A node in the network.', categories: ['Mechanism'], referencesCount: 5, sectionCount: 7, wordCount: 200, revisionCount: 3, firstEdited: '2024-02-01T00:00:00.000Z', lastEdited: '2024-03-02T00:00:00.000Z' },
      { slug: 'subnet_1', title: 'Subnet 1', summary: '' },
    ],
  });
  assert.equal(result.slug, 'recycling', 'builder: slug field');
  assert.equal(result.title, 'Recycling', 'builder: title field');
  assert.equal(result.summary, 'Reclaiming emitted TAO.', 'builder: summary field');
  assert.equal(result.url, `${ORIGIN}/wiki/recycling/`, 'builder: url field');
  assert.equal(result.backlinksUrl, `${ORIGIN}/wiki/recycling/backlinks/`, 'builder: backlinksUrl field');
  assert.equal(result.backlinksJsonUrl, `${ORIGIN}/wiki/recycling/backlinks.json`, 'builder: backlinksJsonUrl field');
  assert.equal(result.historyUrl, `${ORIGIN}/wiki/recycling/history/`, 'builder: historyUrl field');
  assert.equal(result.historyJsonUrl, `${ORIGIN}/wiki/recycling/history.json`, 'builder: historyJsonUrl field');
  assert.equal(result.infoUrl, `${ORIGIN}/wiki/recycling/info/`, 'builder: infoUrl field');
  assert.equal(result.infoJsonUrl, `${ORIGIN}/wiki/recycling/info.json`, 'builder: infoJsonUrl field');
  assert.equal(result.citeUrl, `${ORIGIN}/wiki/recycling/cite/`, 'builder: citeUrl field');
  assert.equal(result.citeJsonUrl, `${ORIGIN}/wiki/recycling/cite.json`, 'builder: citeJsonUrl field');
  assert.equal(result.bibtexUrl, `${ORIGIN}/wiki/recycling/cite.bib`, 'builder: bibtexUrl field');
  assert.equal(result.referencesUrl, `${ORIGIN}/wiki/recycling/references.json`, 'builder: referencesUrl field');
  assert.equal(result.relatedUrl, `${ORIGIN}/wiki/recycling/related.json`, 'builder: relatedUrl field');
  assert.equal(result.referencesJsonUrl, `${ORIGIN}/wiki/recycling/references.json`, 'builder: referencesJsonUrl alias');
  assert.equal(result.referencesJsonUrl, result.referencesUrl, 'builder: referencesJsonUrl must equal referencesUrl');
  assert.equal(result.relatedJsonUrl, `${ORIGIN}/wiki/recycling/related.json`, 'builder: relatedJsonUrl alias');
  assert.equal(result.relatedJsonUrl, result.relatedUrl, 'builder: relatedJsonUrl must equal relatedUrl');
  assert.equal(result.tocJsonUrl, `${ORIGIN}/wiki/recycling/toc.json`, 'builder: tocJsonUrl field');
  assert.equal(result.imageUrl, `${ORIGIN}/og/recycling.png`, 'builder: imageUrl field');
  assert.deepEqual(result.categories, ['Consensus'], 'builder: categories field');
  assert.equal(result.incomingLinks, 2, 'builder: incomingLinks field');
  assert.equal(result.referencesCount, 6, 'builder: referencesCount field threaded verbatim');
  assert.equal(result.sectionCount, 4, 'builder: sectionCount field threaded verbatim');
  assert.equal(result.wordCount, 789, 'builder: wordCount field threaded verbatim');
  assert.equal(result.readingMinutes, 4, 'builder: readingMinutes is ceil(789/200)');
  assert.equal(result.revisionCount, 8, 'builder: revisionCount field threaded verbatim');
  assert.equal(result.firstEdited, '2024-01-01T00:00:00.000Z', 'builder: firstEdited field threaded verbatim');
  assert.equal(result.lastEdited, '2024-06-01T00:00:00.000Z', 'builder: lastEdited field threaded verbatim');
  assert.equal(result.count, 2, 'builder: count equals backlinks length');
  assert.equal(result.backlinks.length, 2, 'builder: backlinks array length');
  assert.equal(result.backlinks[0].slug, 'neuron', 'builder: backlinks[0].slug');
  assert.equal(result.backlinks[0].title, 'Neuron', 'builder: backlinks[0].title');
  assert.equal(result.backlinks[0].summary, 'A node in the network.', 'builder: backlinks[0].summary');
  assert.deepEqual(result.backlinks[0].categories, ['Mechanism'], 'builder: backlinks[0].categories');
  assert.equal(result.backlinks[0].backlinks, 0, 'builder: backlinks[0].backlinks defaults to 0 when omitted');
  assert.equal(result.backlinks[0].incomingLinks, 0, 'builder: backlinks[0].incomingLinks equals backlinks (alias)');
  assert.equal(result.backlinks[0].url, `${ORIGIN}/wiki/neuron/`, 'builder: backlinks[0].url');
  assert.equal(result.backlinks[0].infoUrl, `${ORIGIN}/wiki/neuron/info/`, 'builder: backlinks[0].infoUrl');
  assert.equal(result.backlinks[0].infoJsonUrl, `${ORIGIN}/wiki/neuron/info.json`, 'builder: backlinks[0].infoJsonUrl');
  assert.equal(result.backlinks[0].backlinksUrl, `${ORIGIN}/wiki/neuron/backlinks/`, 'builder: backlinks[0].backlinksUrl');
  assert.equal(result.backlinks[0].backlinksJsonUrl, `${ORIGIN}/wiki/neuron/backlinks.json`, 'builder: backlinks[0].backlinksJsonUrl');
  assert.equal(result.backlinks[0].historyUrl, `${ORIGIN}/wiki/neuron/history/`, 'builder: backlinks[0].historyUrl');
  assert.equal(result.backlinks[0].historyJsonUrl, `${ORIGIN}/wiki/neuron/history.json`, 'builder: backlinks[0].historyJsonUrl');
  assert.equal(result.backlinks[0].citeUrl, `${ORIGIN}/wiki/neuron/cite/`, 'builder: backlinks[0].citeUrl');
  assert.equal(result.backlinks[0].citeJsonUrl, `${ORIGIN}/wiki/neuron/cite.json`, 'builder: backlinks[0].citeJsonUrl');
  assert.equal(result.backlinks[0].bibtexUrl, `${ORIGIN}/wiki/neuron/cite.bib`, 'builder: backlinks[0].bibtexUrl');
  assert.equal(result.backlinks[0].referencesUrl, `${ORIGIN}/wiki/neuron/references.json`, 'builder: backlinks[0].referencesUrl');
  assert.equal(result.backlinks[0].referencesJsonUrl, `${ORIGIN}/wiki/neuron/references.json`, 'builder: backlinks[0].referencesJsonUrl');
  assert.equal(result.backlinks[0].relatedUrl, `${ORIGIN}/wiki/neuron/related.json`, 'builder: backlinks[0].relatedUrl');
  assert.equal(result.backlinks[0].relatedJsonUrl, `${ORIGIN}/wiki/neuron/related.json`, 'builder: backlinks[0].relatedJsonUrl');
  assert.equal(result.backlinks[0].tocJsonUrl, `${ORIGIN}/wiki/neuron/toc.json`, 'builder: backlinks[0].tocJsonUrl');
  assert.equal(result.backlinks[0].imageUrl, `${ORIGIN}/og/neuron.png`, 'builder: backlinks[0].imageUrl');
  assert.equal(result.backlinks[0].referencesCount, 5, 'builder: backlinks[0].referencesCount threaded verbatim');
  assert.equal(result.backlinks[0].sectionCount, 7, 'builder: backlinks[0].sectionCount threaded verbatim');
  assert.equal(result.backlinks[0].wordCount, 200, 'builder: backlinks[0].wordCount threaded verbatim');
  assert.equal(result.backlinks[0].readingMinutes, 1, 'builder: backlinks[0].readingMinutes = ceil(200/200)');
  assert.equal(result.backlinks[0].revisionCount, 3, 'builder: backlinks[0].revisionCount threaded verbatim');
  assert.equal(result.backlinks[0].firstEdited, '2024-02-01T00:00:00.000Z', 'builder: backlinks[0].firstEdited threaded verbatim');
  assert.equal(result.backlinks[0].lastEdited, '2024-03-02T00:00:00.000Z', 'builder: backlinks[0].lastEdited threaded verbatim');
  assert.equal(result.backlinks[1].referencesCount, 0, 'builder: backlinks[1].referencesCount defaults to 0 when omitted');
  assert.equal(result.backlinks[1].sectionCount, 0, 'builder: backlinks[1].sectionCount defaults to 0 when omitted');
  assert.equal(result.backlinks[1].wordCount, 0, 'builder: backlinks[1].wordCount defaults to 0 when omitted');
  assert.equal(result.backlinks[1].readingMinutes, 1, 'builder: backlinks[1].readingMinutes = ceil(0/200) min 1');
  assert.equal(result.backlinks[1].revisionCount, 0, 'builder: backlinks[1].revisionCount defaults to 0 when omitted');
  assert.equal(result.backlinks[1].firstEdited, null, 'builder: backlinks[1].firstEdited defaults to null when omitted');
  assert.equal(result.backlinks[1].lastEdited, null, 'builder: backlinks[1].lastEdited defaults to null when omitted');
  assert.equal(result.backlinks[1].slug, 'subnet_1', 'builder: backlinks[1].slug');
  assert.equal(result.backlinks[1].title, 'Subnet 1', 'builder: backlinks[1].title');
  assert.equal(result.backlinks[1].summary, null, 'builder: backlinks[1].summary is null when empty');
  assert.deepEqual(result.backlinks[1].categories, [], 'builder: backlinks[1].categories defaults to [] when omitted');
  assert.equal(result.backlinks[1].backlinks, 0, 'builder: backlinks[1].backlinks defaults to 0 when omitted');
  assert.equal(result.backlinks[1].incomingLinks, 0, 'builder: backlinks[1].incomingLinks equals backlinks (alias)');
  assert.equal(result.backlinks[1].url, `${ORIGIN}/wiki/subnet_1/`, 'builder: backlinks[1].url');
  assert.equal(result.backlinks[1].historyUrl, `${ORIGIN}/wiki/subnet_1/history/`, 'builder: backlinks[1].historyUrl');
  assert.equal(result.backlinks[1].historyJsonUrl, `${ORIGIN}/wiki/subnet_1/history.json`, 'builder: backlinks[1].historyJsonUrl');
  assert.equal(result.backlinks[1].citeUrl, `${ORIGIN}/wiki/subnet_1/cite/`, 'builder: backlinks[1].citeUrl');
  assert.equal(result.backlinks[1].citeJsonUrl, `${ORIGIN}/wiki/subnet_1/cite.json`, 'builder: backlinks[1].citeJsonUrl');
  assert.equal(result.backlinks[1].bibtexUrl, `${ORIGIN}/wiki/subnet_1/cite.bib`, 'builder: backlinks[1].bibtexUrl');
  assert.equal(result.backlinks[1].referencesUrl, `${ORIGIN}/wiki/subnet_1/references.json`, 'builder: backlinks[1].referencesUrl');
  assert.equal(result.backlinks[1].referencesJsonUrl, `${ORIGIN}/wiki/subnet_1/references.json`, 'builder: backlinks[1].referencesJsonUrl');
  assert.equal(result.backlinks[1].relatedUrl, `${ORIGIN}/wiki/subnet_1/related.json`, 'builder: backlinks[1].relatedUrl');
  assert.equal(result.backlinks[1].relatedJsonUrl, `${ORIGIN}/wiki/subnet_1/related.json`, 'builder: backlinks[1].relatedJsonUrl');
  assert.equal(result.backlinks[1].tocJsonUrl, `${ORIGIN}/wiki/subnet_1/toc.json`, 'builder: backlinks[1].tocJsonUrl');
  assert.equal(result.backlinks[1].imageUrl, `${ORIGIN}/og/subnet_1.png`, 'builder: backlinks[1].imageUrl');

  const empty = buildArticleBacklinks({ slug: 'orphan', title: 'Orphan', origin: ORIGIN });
  assert.equal(empty.count, 0, 'builder: empty count is 0');
  assert.deepEqual(empty.backlinks, [], 'builder: empty backlinks is []');
  assert.deepEqual(empty.categories, [], 'builder: default categories is []');
  assert.equal(empty.summary, null, 'builder: default summary is null');
  assert.equal(empty.incomingLinks, 0, 'builder: default incomingLinks is 0');
  assert.equal(empty.referencesCount, 0, 'builder: default referencesCount is 0');
  assert.equal(empty.sectionCount, 0, 'builder: default sectionCount is 0');
  assert.equal(empty.wordCount, 0, 'builder: default wordCount is 0');
  assert.equal(empty.readingMinutes, 1, 'builder: default readingMinutes is 1 (ceil(0/200))');
  assert.equal(empty.revisionCount, 0, 'builder: default revisionCount is 0');
  assert.equal(empty.firstEdited, null, 'builder: default firstEdited is null');
  assert.equal(empty.lastEdited, null, 'builder: default lastEdited is null');
}

// Same-title inbound links must tiebreak on raw slug order, matching references.json.
{
  const sorted = sortInboundBacklinkEntries([
    { slug: 'subnet_9', title: 'Shared Title' },
    { slug: 'subnet_10', title: 'Shared Title' },
  ]);
  assert.deepEqual(
    sorted.map((entry) => entry.slug),
    ['subnet_10', 'subnet_9'],
    'inbound backlink sort must use raw slug order (subnet_10 before subnet_9), not compareTitles numeric slug collation',
  );
}

// Repeated frontmatter categories must be deduped on the envelope and entries.
{
  const result = buildArticleBacklinks({
    slug: 'hub',
    title: 'Hub',
    origin: ORIGIN,
    categories: ['Mining', 'Consensus', 'Mining'],
    backlinks: [
      { slug: 'leaf', title: 'Leaf', categories: ['Subnets', 'Mining', 'Subnets'] },
    ],
  });
  assert.deepEqual(
    result.categories,
    ['Mining', 'Consensus'],
    'builder: envelope categories must be deduped while preserving first-seen order',
  );
  assert.deepEqual(
    result.backlinks[0].categories,
    ['Subnets', 'Mining'],
    'builder: backlink entry categories must be deduped while preserving first-seen order',
  );
}

// ---- 2–6) Built-output checks ----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');

const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');

const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, meta]) => [slug, typeof meta?.title === 'string' ? meta.title : slug]),
);
// referencesCount = the article's published outbound-reference count, re-derived
// with the same getArticleReferences helper the endpoint uses (published-only join).
const outboundCountFor = (slug) => getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;

const articleSlugs = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
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

const articleBuilt = (slug) => fs.existsSync(path.join(wikiDir, slug, 'index.html'));

// Parse linking-article slugs from a rendered backlinks HTML page.
const htmlBacklinkSlugs = (html) =>
  [...html.matchAll(/<li[^>]*class="mw-wlh-row"[^>]*>[\s\S]*?href="\/wiki\/([^"]+)\/"[\s\S]*?<\/li>/g)].map(
    ([, slug]) => slug,
  );

let withLinks = 0;
let withEmpty = 0;

for (const slug of articleSlugs) {
  // 2) COVERAGE: every article must have a backlinks.json
  const jsonFile = path.join(wikiDir, slug, 'backlinks.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have a backlinks.json, but /wiki/${slug}/backlinks.json was not built`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  // 3) SHAPE: required fields present and correctly typed
  assert.equal(typeof doc.slug, 'string', `${slug}: backlinks.json slug must be a string`);
  assert.equal(typeof doc.title, 'string', `${slug}: backlinks.json title must be a string`);
  assert.equal(doc.slug, slug, `${slug}: backlinks.json slug must equal the article slug`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: backlinks.json url must be the canonical article URL`);
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/${slug}/backlinks/`, `${slug}: backlinks.json backlinksUrl must point to the HTML page`);
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/${slug}/backlinks.json`, `${slug}: backlinks.json must expose its own canonical backlinksJsonUrl`);
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/${slug}/history/`, `${slug}: backlinks.json historyUrl must point to the HTML history page`);
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/${slug}/history.json`, `${slug}: backlinks.json historyJsonUrl must point to the machine-readable history page`);
  // infoUrl / infoJsonUrl link back to the canonical Page-information hub (which
  // links out to every sibling), so a consumer of backlinks.json can reach it.
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/${slug}/info/`, `${slug}: backlinks.json infoUrl must point to the article info page`);
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/${slug}/info.json`, `${slug}: backlinks.json infoJsonUrl must point to the machine-readable info endpoint`);
  // citeUrl / citeJsonUrl / bibtexUrl cross-link to the article's Cite-this-page
  // hub on the envelope (entries already expose cite siblings per linking article).
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/${slug}/cite/`, `${slug}: backlinks.json citeUrl must point to the Cite-this-page hub`);
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/${slug}/cite.json`, `${slug}: backlinks.json citeJsonUrl must point to the cite.json hub`);
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/${slug}/cite.bib`, `${slug}: backlinks.json bibtexUrl must point to the BibTeX export`);
  // referencesUrl / relatedUrl cross-link to the article's outbound-link and
  // related-pages JSON endpoints on the envelope (entries already expose both).
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/${slug}/references.json`, `${slug}: backlinks.json referencesUrl must point to the references.json hub`);
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/${slug}/related.json`, `${slug}: backlinks.json relatedUrl must point to the related.json hub`);
  // referencesJsonUrl / relatedJsonUrl are the consistently-named *JsonUrl aliases
  // for referencesUrl / relatedUrl; each must equal the canonical .json URL and its counterpart.
  assert.equal(doc.referencesJsonUrl, `${ORIGIN}/wiki/${slug}/references.json`, `${slug}: backlinks.json referencesJsonUrl must point to the references.json hub`);
  assert.equal(doc.referencesJsonUrl, doc.referencesUrl, `${slug}: backlinks.json referencesJsonUrl must equal referencesUrl`);
  assert.equal(doc.relatedJsonUrl, `${ORIGIN}/wiki/${slug}/related.json`, `${slug}: backlinks.json relatedJsonUrl must point to the related.json hub`);
  assert.equal(doc.relatedJsonUrl, doc.relatedUrl, `${slug}: backlinks.json relatedJsonUrl must equal relatedUrl`);
  const backlinksHistoryJsonFile = path.join(wikiDir, slug, 'history.json');
  if (fs.existsSync(backlinksHistoryJsonFile)) {
    const historyDoc = JSON.parse(fs.readFileSync(backlinksHistoryJsonFile, 'utf8'));
    assert.equal(
      doc.referencesJsonUrl,
      historyDoc.referencesJsonUrl,
      `${slug}: backlinks.json referencesJsonUrl must agree with the sibling history.json envelope`,
    );
    assert.equal(
      doc.relatedJsonUrl,
      historyDoc.relatedJsonUrl,
      `${slug}: backlinks.json relatedJsonUrl must agree with the sibling history.json envelope`,
    );
  }
  // tocJsonUrl cross-links to the article's table-of-contents JSON, the same
  // companion the history.json / related.json envelopes and the directory
  // entries expose, so a consumer of backlinks.json can reach the article's TOC.
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/${slug}/toc.json`, `${slug}: backlinks.json tocJsonUrl must point to the article's toc.json endpoint`);
  // imageUrl is the article's own OG share-card (/og/<slug>.png), the same
  // companion the info/history/toc/references envelopes already expose.
  assert.equal(doc.imageUrl, `${ORIGIN}/og/${slug}.png`, `${slug}: backlinks.json imageUrl must be the article's OG share-card URL`);
  // categories must match the article's topic categories from the slug map,
  // symmetric with info.json and history.json which already expose the same field.
  const expectedCategories = slugmap[slug]?.categories ?? [];
  assert.deepEqual(doc.categories, expectedCategories, `${slug}: backlinks.json categories must match the article's topic categories from the slug map`);
  // summary is the article's own slug-map summary (null when blank), the same
  // per-article field the listing endpoints expose for each entry.
  const expectedSummary = slugmap[slug]?.summary || null;
  assert.deepEqual(doc.summary, expectedSummary, `${slug}: backlinks.json summary must match the article's slug-map summary (or null)`);
  // incomingLinks is the article's own published inbound-link count — the same
  // figure info.json exposes (and equals count, the listed linking-page total).
  assert.equal(
    doc.incomingLinks,
    publishedInboundLinkCount(backlinksData, slug, titleBySlug),
    `${slug}: backlinks.json incomingLinks must equal the published inbound-link count`,
  );
  assert.equal(doc.incomingLinks, doc.count, `${slug}: backlinks.json incomingLinks must equal count`);
  // referencesCount is the article's published OUTBOUND reference count (the
  // complement of incomingLinks) — the same figure info.json / history.json /
  // cite.json / related.json expose — derived from the same getArticleReferences join.
  assert.equal(
    doc.referencesCount,
    outboundCountFor(slug),
    `${slug}: backlinks.json referencesCount must equal the published outbound-reference count`,
  );
  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count`, derived from the shared getArticleToc helper.
  assert.ok(
    Number.isInteger(doc.sectionCount) && doc.sectionCount >= 0,
    `${slug}: backlinks.json sectionCount must be a non-negative integer (got ${JSON.stringify(doc.sectionCount)})`,
  );
  const blTocJsonFile = path.join(wikiDir, slug, 'toc.json');
  if (fs.existsSync(blTocJsonFile)) {
    const tocDoc = JSON.parse(fs.readFileSync(blTocJsonFile, 'utf8'));
    assert.equal(
      doc.sectionCount,
      tocDoc.count,
      `${slug}: backlinks.json sectionCount must agree with the sibling toc.json envelope`,
    );
  }
  // revisionCount is the article's revision count (its commit-history length) —
  // the same figure info.json / history.json / cite.json expose on their
  // envelopes. Cross-check it against the sibling info.json (independent source).
  assert.ok(
    Number.isInteger(doc.revisionCount) && doc.revisionCount >= 0,
    `${slug}: backlinks.json revisionCount must be a non-negative integer (got ${JSON.stringify(doc.revisionCount)})`,
  );
  const blInfoJsonFile = path.join(wikiDir, slug, 'info.json');
  if (fs.existsSync(blInfoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(blInfoJsonFile, 'utf8'));
    assert.equal(
      doc.revisionCount,
      infoDoc.revisionCount,
      `${slug}: backlinks.json revisionCount must agree with the sibling info.json envelope`,
    );
    // firstEdited / lastEdited are the article's first and last revision dates —
    // the same pair info.json / history.json expose. Cross-check both against the
    // sibling info.json (independent source).
    assert.equal(
      doc.firstEdited,
      infoDoc.firstEdited,
      `${slug}: backlinks.json firstEdited must agree with the sibling info.json envelope`,
    );
    assert.equal(
      doc.lastEdited,
      infoDoc.lastEdited,
      `${slug}: backlinks.json lastEdited must agree with the sibling info.json envelope`,
    );
    // wordCount is the article body's word count — the same figure info.json /
    // history.json expose and the article footer renders. Cross-check against the
    // sibling info.json (independent source).
    assert.ok(
      Number.isInteger(doc.wordCount) && doc.wordCount >= 0,
      `${slug}: backlinks.json wordCount must be a non-negative integer (got ${JSON.stringify(doc.wordCount)})`,
    );
    assert.equal(
      doc.wordCount,
      infoDoc.wordCount,
      `${slug}: backlinks.json wordCount must agree with the sibling info.json envelope`,
    );
    // readingMinutes is the ~200 wpm ceil estimate info.json exposes and the
    // article-page footer ("N min read") renders from wordCount.
    assert.ok(
      Number.isInteger(doc.readingMinutes) && doc.readingMinutes >= 1,
      `${slug}: backlinks.json readingMinutes must be a positive integer`,
    );
    assert.equal(
      doc.readingMinutes,
      Math.max(1, Math.ceil(doc.wordCount / 200)),
      `${slug}: backlinks.json readingMinutes must equal ceil(wordCount/200)`,
    );
    assert.equal(
      doc.readingMinutes,
      infoDoc.readingMinutes,
      `${slug}: backlinks.json readingMinutes must agree with the sibling info.json envelope`,
    );
  }
  assert.equal(typeof doc.count, 'number', `${slug}: backlinks.json count must be a number`);
  assert.ok(Array.isArray(doc.backlinks), `${slug}: backlinks.json backlinks must be an array`);
  assert.equal(doc.count, doc.backlinks.length, `${slug}: backlinks.json count must equal backlinks.length`);

  // 4) CORRECTNESS against ground truth (published-only join)
  const expected = new Set(
    (backlinksData[slug] ?? []).map((e) => e.from).filter(articleBuilt),
  );
  const rendered = new Set(doc.backlinks.map((e) => e.slug));
  assert.deepEqual(rendered, expected, `/wiki/${slug}/backlinks.json must list exactly the published linking articles from the link graph`);

  // Per-entry shape
  for (const entry of doc.backlinks) {
    assert.equal(typeof entry.slug, 'string', `${slug}: every backlink entry must have a slug`);
    assert.equal(typeof entry.title, 'string', `${slug}: every backlink entry must have a title`);
    assert.equal(entry.url, `${ORIGIN}/wiki/${entry.slug}/`, `${slug}: every backlink entry url must be the canonical article URL`);
    // summary mirrors the linking article's own summary from the slug map (null
    // when blank), the same per-entry field the listing endpoints expose.
    const expectedSummary = slugmap[entry.slug]?.summary || null;
    assert.deepEqual(entry.summary, expectedSummary, `${slug}: every backlink entry summary must match the linking article's slug-map summary (or null)`);
    // categories mirror the linking article's own topic categories from the slug
    // map, the same per-entry field the listing endpoints (subnets/allpages) expose.
    const expectedEntryCategories = Array.isArray(slugmap[entry.slug]?.categories) ? slugmap[entry.slug].categories : [];
    assert.deepEqual(entry.categories, expectedEntryCategories, `${slug}: every backlink entry categories must match the linking article's slug-map categories`);
    // backlinks is the linking article's published inbound-link count — the
    // same figure allpages.json / references.json / related.json expose per row.
    assert.equal(
      entry.backlinks,
      publishedInboundLinkCount(backlinksData, entry.slug, titleBySlug),
      `${slug}: every backlink entry backlinks must match the published inbound-link count`,
    );
    assert.ok(Number.isInteger(entry.backlinks) && entry.backlinks >= 0, `${slug}: every backlink entry backlinks must be a non-negative integer`);
    // incomingLinks is the info.json-named alias of the same inbound count, the
    // per-entry field related.json / references.json / allpages.json also carry.
    assert.equal(entry.incomingLinks, entry.backlinks, `${slug}: every backlink entry incomingLinks must equal its backlinks (the published inbound-link count)`);
    // referencesCount is the linking article's published OUTBOUND reference count
    // (the inbound complement of backlinks) — the same per-entry figure
    // allpages.json / subnets.json expose — from the same getArticleReferences join.
    assert.equal(
      entry.referencesCount,
      outboundCountFor(entry.slug),
      `${slug}: every backlink entry referencesCount must equal the linking article's published outbound-reference count`,
    );
    const stats = revisionStatsOf(entry.slug);
    assert.ok(
      Number.isInteger(entry.revisionCount) && entry.revisionCount >= 0,
      `${slug}: every backlink entry revisionCount must be a non-negative integer (got ${JSON.stringify(entry.revisionCount)})`,
    );
    assert.equal(
      entry.revisionCount,
      stats.revisionCount,
      `${slug}: every backlink entry revisionCount must equal the linking article's commit-history length`,
    );
    assert.equal(
      entry.firstEdited,
      stats.firstEdited,
      `${slug}: every backlink entry firstEdited must equal the linking article's oldest revision date (or null)`,
    );
    // lastEdited is the linking article's latest revision date. Cross-check the
    // full revision-stats trio against raw history and the linking article's own
    // info.json so the surfaces cannot disagree.
    assert.ok(
      entry.lastEdited === null || typeof entry.lastEdited === 'string',
      `${slug}: every backlink entry lastEdited must be a string date or null (got ${JSON.stringify(entry.lastEdited)})`,
    );
    const entryInfoJsonFile = path.join(wikiDir, entry.slug, 'info.json');
    if (fs.existsSync(entryInfoJsonFile)) {
      const entryInfoDoc = JSON.parse(fs.readFileSync(entryInfoJsonFile, 'utf8'));
      assert.equal(
        entry.revisionCount,
        entryInfoDoc.revisionCount,
        `${slug}: backlink entry ${entry.slug} revisionCount must agree with its sibling info.json envelope`,
      );
      assert.equal(
        entry.firstEdited,
        entryInfoDoc.firstEdited,
        `${slug}: backlink entry ${entry.slug} firstEdited must agree with its sibling info.json envelope`,
      );
      assert.equal(
        entry.lastEdited,
        entryInfoDoc.lastEdited,
        `${slug}: backlink entry ${entry.slug} lastEdited must agree with its sibling info.json envelope`,
      );
      // wordCount is the linking article's body word count — the same figure its
      // own info.json / history.json envelope exposes.
      assert.ok(
        Number.isInteger(entry.wordCount) && entry.wordCount >= 0,
        `${slug}: backlink entry ${entry.slug} wordCount must be a non-negative integer (got ${JSON.stringify(entry.wordCount)})`,
      );
      assert.equal(
        entry.wordCount,
        entryInfoDoc.wordCount,
        `${slug}: backlink entry ${entry.slug} wordCount must agree with its sibling info.json envelope`,
      );
      // sectionCount is the linking article's table-of-contents section count —
      // the same figure its own info.json / toc.json envelope exposes.
      assert.ok(
        Number.isInteger(entry.sectionCount) && entry.sectionCount >= 0,
        `${slug}: backlink entry ${entry.slug} sectionCount must be a non-negative integer (got ${JSON.stringify(entry.sectionCount)})`,
      );
      assert.equal(
        entry.sectionCount,
        entryInfoDoc.sectionCount,
        `${slug}: backlink entry ${entry.slug} sectionCount must agree with its sibling info.json envelope`,
      );
      // readingMinutes is the ~200-wpm estimate derived from the entry's wordCount.
      assert.equal(
        entry.readingMinutes,
        Math.max(1, Math.ceil(entry.wordCount / 200)),
        `${slug}: backlink entry ${entry.slug} readingMinutes must equal ceil(wordCount/200) (min 1)`,
      );
    }
    // infoUrl / infoJsonUrl point at the linking article's Page-information hub
    // and its machine-readable companion, so a consumer can reach a backlinking
    // page's metadata without reconstructing the route.
    assert.equal(
      entry.infoUrl,
      `${ORIGIN}/wiki/${entry.slug}/info/`,
      `${slug}: every backlink entry infoUrl must be the canonical article info URL`,
    );
    assert.equal(
      entry.infoJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/info.json`,
      `${slug}: every backlink entry infoJsonUrl must be the canonical article info.json URL`,
    );
    // backlinksUrl / backlinksJsonUrl point at the linking article's own
    // What-links-here page and its JSON companion, so a consumer can traverse
    // the inbound-link graph without rebuilding the route.
    assert.equal(
      entry.backlinksUrl,
      `${ORIGIN}/wiki/${entry.slug}/backlinks/`,
      `${slug}: every backlink entry backlinksUrl must be the canonical article backlinks URL`,
    );
    assert.equal(
      entry.backlinksJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/backlinks.json`,
      `${slug}: every backlink entry backlinksJsonUrl must be the canonical article backlinks.json URL`,
    );
    // historyUrl points at the linking article's revision-history page — the
    // same companion references.json / related.json expose per entry — so a
    // consumer can reach a backlinking page's history without rebuilding the route.
    assert.equal(
      entry.historyUrl,
      `${ORIGIN}/wiki/${entry.slug}/history/`,
      `${slug}: every backlink entry historyUrl must be the canonical article history URL`,
    );
    // historyJsonUrl is the JSON companion of historyUrl — references.json /
    // related.json already pair both per entry, so backlink entries match.
    assert.equal(
      entry.historyJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/history.json`,
      `${slug}: every backlink entry historyJsonUrl must be the canonical article history.json URL`,
    );
    assert.equal(
      entry.citeUrl,
      `${ORIGIN}/wiki/${entry.slug}/cite/`,
      `${slug}: every backlink entry citeUrl must be the canonical article cite page`,
    );
    assert.equal(
      entry.citeJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/cite.json`,
      `${slug}: every backlink entry citeJsonUrl must be the canonical article cite.json URL`,
    );
    assert.equal(
      entry.bibtexUrl,
      `${ORIGIN}/wiki/${entry.slug}/cite.bib`,
      `${slug}: every backlink entry bibtexUrl must be the canonical article cite.bib URL`,
    );
    assert.equal(
      entry.referencesUrl,
      `${ORIGIN}/wiki/${entry.slug}/references.json`,
      `${slug}: every backlink entry referencesUrl must be the canonical article references.json URL`,
    );
    assert.equal(
      entry.relatedUrl,
      `${ORIGIN}/wiki/${entry.slug}/related.json`,
      `${slug}: every backlink entry relatedUrl must be the canonical article related.json URL`,
    );
    // referencesJsonUrl / relatedJsonUrl are the same companion links under the
    // consistent <name>JsonUrl key the rest of the API uses; each equals its
    // back-compat un-suffixed twin.
    assert.equal(
      entry.referencesJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/references.json`,
      `${slug}: every backlink entry referencesJsonUrl must be the canonical article references.json URL`,
    );
    assert.equal(entry.referencesJsonUrl, entry.referencesUrl, `${slug}: every backlink entry referencesJsonUrl must equal the back-compat referencesUrl`);
    assert.equal(
      entry.relatedJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/related.json`,
      `${slug}: every backlink entry relatedJsonUrl must be the canonical article related.json URL`,
    );
    assert.equal(entry.relatedJsonUrl, entry.relatedUrl, `${slug}: every backlink entry relatedJsonUrl must equal the back-compat relatedUrl`);
    // tocJsonUrl cross-links to the linking article's table-of-contents JSON,
    // the same companion the directory entries (allpages, mostlinkedpages)
    // already expose per article.
    assert.equal(
      entry.tocJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/toc.json`,
      `${slug}: every backlink entry tocJsonUrl must be the canonical article toc.json URL`,
    );
    // imageUrl is each linking article's own OG share-card (/og/<slug>.png),
    // the same companion the listing-endpoint entries expose, so a consumer can
    // render a thumbnail per linking article without rebuilding the route.
    assert.equal(
      entry.imageUrl,
      `${ORIGIN}/og/${entry.slug}.png`,
      `${slug}: every backlink entry imageUrl must be the linking article's OG share-card URL`,
    );
    assert.ok(articleBuilt(entry.slug), `${slug}: backlink entry ${entry.slug} references an unbuilt article`);
  }

  // 5) SORT ORDER: same compareTitles order as the HTML page
  for (let i = 1; i < doc.backlinks.length; i++) {
    const a = doc.backlinks[i - 1];
    const b = doc.backlinks[i];
    assert.ok(
      compareTitles(a.title, b.title) <= 0,
      `/wiki/${slug}/backlinks.json entries must be sorted by numeric title collation ("${a.title}" before "${b.title}")`,
    );
  }

  // 6) HTML/JSON PARITY: same set of linking slugs as the HTML backlinks page
  const htmlFile = path.join(wikiDir, slug, 'backlinks', 'index.html');
  if (fs.existsSync(htmlFile)) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const htmlSlugs = new Set(htmlBacklinkSlugs(html));
    assert.deepEqual(
      rendered,
      htmlSlugs,
      `/wiki/${slug}/backlinks.json and /wiki/${slug}/backlinks/ must list the same set of linking articles`,
    );
    assert.ok(
      html.includes(`href="/wiki/${slug}/history/"`),
      `/wiki/${slug}/backlinks/ toolbar must link to the article history page`,
    );
  }

  if (doc.count > 0) withLinks++;
  else withEmpty++;
}

assert.ok(withLinks > 0, 'expected at least one article with inbound links to verify correctness');
assert.ok(withEmpty > 0, 'expected at least one article with no inbound links to verify the empty state');

console.log(
  `Backlinks JSON check passed (${articleSlugs.length} articles: ${withLinks} with inbound links, ${withEmpty} with none; ground-truth + HTML/JSON parity verified)`,
);
