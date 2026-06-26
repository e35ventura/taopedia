import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleRelatedPages, getRelatedPages } from '../src/lib/related-pages.ts';
import { publishedInboundLinkCount } from '../scripts/most-linked.js';
import { getArticleReferences } from '../src/lib/article-references.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const categoriesFile = path.join(projectRoot, 'public', 'data', 'categories.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const historyDir = path.join(projectRoot, 'public', 'history');
const ORIGIN = 'https://taopedia.org';
// Each entry's revision stats are re-derived from the raw history file (history
// is newest-first: [0] is the latest revision, the last entry is the original).
const historyOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return [];
  const history = JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
  return Array.isArray(history) ? history : [];
};
const lastEditedOf = (slug) => historyOf(slug)[0]?.date ?? null;
// Each entry's wordCount mirrors the related article's own info.json.wordCount
// (itself cross-checked against the article footer's data-word-count).
const wordCountOf = (slug) => {
  const file = path.join(wikiDir, slug, 'info.json');
  if (!fs.existsSync(file)) return 0;
  const info = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Number.isInteger(info.wordCount) ? info.wordCount : 0;
};
// Each entry's sectionCount mirrors the related article's own info.json.sectionCount
// (itself the toc.json `count`).
const sectionCountOf = (slug) => {
  const file = path.join(wikiDir, slug, 'info.json');
  if (!fs.existsSync(file)) return 0;
  const info = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Number.isInteger(info.sectionCount) ? info.sectionCount : 0;
};

// ---- 1) Unit: helper + builder behavior -----------------------------------
{
  const slugMap = {
    source: { title: 'Source', categories: ['Security'], summary: 'source summary' },
    alpha: { title: 'Subnet 2', categories: ['Security'], summary: 'alpha summary' },
    beta: { title: 'Subnet 10', categories: ['Security'], summary: 'beta summary' },
    gamma: { title: 'Subnet 9', categories: ['Security', 'Consensus'], summary: '' },
    delta: { title: 'Delta', categories: ['Consensus'], summary: 'delta summary' },
  };
  const categoriesIndex = {
    Security: ['source', 'beta', 'gamma', 'alpha'],
    Consensus: ['source', 'gamma', 'delta'],
  };
  const backlinks = {
    source: [{ from: 'delta' }],
  };
  const outgoing = {
    source: [{ target: 'beta' }, { target: 'missing' }],
  };
  const titleBySlug = Object.fromEntries(Object.entries(slugMap).map(([slug, meta]) => [slug, meta.title]));
  const publishedSlugs = new Set(['source', 'alpha', 'beta', 'gamma', 'delta']);

  const relatedPages = getRelatedPages({
    slug: 'source',
    slugMap,
    categoriesIndex,
    backlinks,
    outgoing,
    publishedSlugs,
    titleBySlug,
  });
  assert.deepEqual(
    relatedPages,
    [
      { slug: 'alpha', title: 'Subnet 2', summary: 'alpha summary', tags: ['Security'] },
      { slug: 'gamma', title: 'Subnet 9', summary: '', tags: ['Security'] },
      { slug: 'delta', title: 'Delta', summary: 'delta summary', tags: ['Consensus'] },
    ],
    'helper must exclude already-linked pages, keep published candidates only, rank by shared topics then backlinks, and sort numeric title ties correctly',
  );

  const tied = getRelatedPages({
    slug: 'source',
    slugMap: {
      source: { title: 'Source', categories: ['Mining'] },
      subnet_9: { title: 'Shared Title', categories: ['Mining'] },
      subnet_10: { title: 'Shared Title', categories: ['Mining'] },
    },
    categoriesIndex: { Mining: ['source', 'subnet_9', 'subnet_10'] },
    backlinks: {},
    outgoing: {},
    publishedSlugs: new Set(['source', 'subnet_9', 'subnet_10']),
    titleBySlug: { source: 'Source', subnet_9: 'Shared Title', subnet_10: 'Shared Title' },
    max: 10,
  });
  assert.deepEqual(
    tied.map((entry) => entry.slug),
    ['subnet_10', 'subnet_9'],
    'same-score same-title related pages must tiebreak on raw slug order (subnet_10 before subnet_9), matching references.json',
  );

  const doc = buildArticleRelatedPages({
    slug: 'source',
    title: 'Source',
    origin: ORIGIN,
    summary: 'The source article.',
    categories: ['Security', 'Consensus'],
    incomingLinks: 9,
    referencesCount: 11,
    sectionCount: 6,
    wordCount: 432,
    revisionCount: 14,
    firstEdited: '2024-01-01T00:00:00.000Z',
    lastEdited: '2024-06-01T00:00:00.000Z',
    relatedPages,
  });
  assert.equal(doc.slug, 'source', 'builder: slug field');
  assert.equal(doc.title, 'Source', 'builder: title field');
  assert.equal(doc.summary, 'The source article.', 'builder: summary field');
  // The article's own topics must be threaded through verbatim (non-empty),
  // the same field history.json / info.json envelopes expose.
  assert.deepEqual(doc.categories, ['Security', 'Consensus'], 'builder: categories field threaded verbatim');
  assert.equal(doc.incomingLinks, 9, 'builder: incomingLinks field');
  assert.equal(doc.referencesCount, 11, 'builder: referencesCount field threaded verbatim');
  assert.equal(doc.sectionCount, 6, 'builder: sectionCount field threaded verbatim');
  assert.equal(doc.wordCount, 432, 'builder: wordCount field threaded verbatim');
  assert.equal(doc.readingMinutes, 3, 'builder: readingMinutes from wordCount (ceil(432/200))');
  assert.equal(doc.revisionCount, 14, 'builder: revisionCount field threaded verbatim');
  assert.equal(doc.firstEdited, '2024-01-01T00:00:00.000Z', 'builder: firstEdited field threaded verbatim');
  assert.equal(doc.lastEdited, '2024-06-01T00:00:00.000Z', 'builder: lastEdited field threaded verbatim');
  assert.equal(doc.url, `${ORIGIN}/wiki/source/`, 'builder: url field');
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/source/related.json`, 'builder: relatedUrl self field');
  assert.equal(doc.relatedJsonUrl, `${ORIGIN}/wiki/source/related.json`, 'builder: relatedJsonUrl self-link (matches <name>JsonUrl convention)');
  assert.equal(doc.relatedJsonUrl, doc.relatedUrl, 'builder: relatedJsonUrl must equal the back-compat relatedUrl');
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/source/history/`, 'builder: historyUrl cross-link');
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/source/history.json`, 'builder: historyJsonUrl cross-link');
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/source/backlinks/`, 'builder: backlinksUrl cross-link');
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/source/backlinks.json`, 'builder: backlinksJsonUrl cross-link');
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/source/info/`, 'builder: infoUrl cross-link');
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/source/info.json`, 'builder: infoJsonUrl cross-link');
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/source/toc.json`, 'builder: tocJsonUrl cross-link');
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/source/cite/`, 'builder: citeUrl cross-link');
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/source/cite.json`, 'builder: citeJsonUrl cross-link');
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/source/cite.bib`, 'builder: bibtexUrl cross-link');
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/source/references.json`, 'builder: referencesUrl cross-link');
  assert.equal(doc.referencesJsonUrl, `${ORIGIN}/wiki/source/references.json`, 'builder: referencesJsonUrl cross-link (matches <name>JsonUrl convention)');
  assert.equal(doc.referencesJsonUrl, doc.referencesUrl, 'builder: referencesJsonUrl must equal the back-compat referencesUrl');
  assert.equal(doc.imageUrl, `${ORIGIN}/og/source.png`, 'builder: imageUrl cross-link');
  assert.equal(doc.count, 3, 'builder: count field');
  assert.deepEqual(
    doc.related,
    [
      {
        slug: 'alpha',
        title: 'Subnet 2',
        summary: 'alpha summary',
        tags: ['Security'],
        categories: [],
        backlinks: 0,
        incomingLinks: 0,
        referencesCount: 0,
        sectionCount: 0,
        wordCount: 0,
        readingMinutes: 1,
        revisionCount: 0,
        firstEdited: null,
        lastEdited: null,
        url: `${ORIGIN}/wiki/alpha/`,
        infoUrl: `${ORIGIN}/wiki/alpha/info/`,
        backlinksUrl: `${ORIGIN}/wiki/alpha/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/alpha/backlinks.json`,
        historyUrl: `${ORIGIN}/wiki/alpha/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/alpha/history.json`,
        citeUrl: `${ORIGIN}/wiki/alpha/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/alpha/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/alpha/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/alpha/references.json`,
        referencesJsonUrl: `${ORIGIN}/wiki/alpha/references.json`,
        relatedUrl: `${ORIGIN}/wiki/alpha/related.json`,
        relatedJsonUrl: `${ORIGIN}/wiki/alpha/related.json`,
        infoJsonUrl: `${ORIGIN}/wiki/alpha/info.json`,
        tocUrl: `${ORIGIN}/wiki/alpha/toc.json`,
        tocJsonUrl: `${ORIGIN}/wiki/alpha/toc.json`,
        imageUrl: `${ORIGIN}/og/alpha.png`,
      },
      {
        slug: 'gamma',
        title: 'Subnet 9',
        summary: null,
        tags: ['Security'],
        categories: [],
        backlinks: 0,
        incomingLinks: 0,
        referencesCount: 0,
        sectionCount: 0,
        wordCount: 0,
        readingMinutes: 1,
        revisionCount: 0,
        firstEdited: null,
        lastEdited: null,
        url: `${ORIGIN}/wiki/gamma/`,
        infoUrl: `${ORIGIN}/wiki/gamma/info/`,
        backlinksUrl: `${ORIGIN}/wiki/gamma/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/gamma/backlinks.json`,
        historyUrl: `${ORIGIN}/wiki/gamma/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/gamma/history.json`,
        citeUrl: `${ORIGIN}/wiki/gamma/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/gamma/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/gamma/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/gamma/references.json`,
        referencesJsonUrl: `${ORIGIN}/wiki/gamma/references.json`,
        relatedUrl: `${ORIGIN}/wiki/gamma/related.json`,
        relatedJsonUrl: `${ORIGIN}/wiki/gamma/related.json`,
        infoJsonUrl: `${ORIGIN}/wiki/gamma/info.json`,
        tocUrl: `${ORIGIN}/wiki/gamma/toc.json`,
        tocJsonUrl: `${ORIGIN}/wiki/gamma/toc.json`,
        imageUrl: `${ORIGIN}/og/gamma.png`,
      },
      {
        slug: 'delta',
        title: 'Delta',
        summary: 'delta summary',
        tags: ['Consensus'],
        categories: [],
        backlinks: 0,
        incomingLinks: 0,
        referencesCount: 0,
        sectionCount: 0,
        wordCount: 0,
        readingMinutes: 1,
        revisionCount: 0,
        firstEdited: null,
        lastEdited: null,
        url: `${ORIGIN}/wiki/delta/`,
        infoUrl: `${ORIGIN}/wiki/delta/info/`,
        backlinksUrl: `${ORIGIN}/wiki/delta/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/delta/backlinks.json`,
        historyUrl: `${ORIGIN}/wiki/delta/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/delta/history.json`,
        citeUrl: `${ORIGIN}/wiki/delta/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/delta/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/delta/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/delta/references.json`,
        referencesJsonUrl: `${ORIGIN}/wiki/delta/references.json`,
        relatedUrl: `${ORIGIN}/wiki/delta/related.json`,
        relatedJsonUrl: `${ORIGIN}/wiki/delta/related.json`,
        infoJsonUrl: `${ORIGIN}/wiki/delta/info.json`,
        tocUrl: `${ORIGIN}/wiki/delta/toc.json`,
        tocJsonUrl: `${ORIGIN}/wiki/delta/toc.json`,
        imageUrl: `${ORIGIN}/og/delta.png`,
      },
    ],
    'builder: related entry shape',
  );

  const empty = buildArticleRelatedPages({ slug: 'orphan', title: 'Orphan', origin: ORIGIN });
  assert.equal(empty.count, 0, 'builder: empty count is 0');
  assert.deepEqual(empty.related, [], 'builder: empty related array is []');
  assert.deepEqual(empty.categories, [], 'builder: categories defaults to [] when omitted');
  assert.equal(empty.summary, null, 'builder: summary defaults to null when omitted');
  assert.equal(empty.incomingLinks, 0, 'builder: incomingLinks defaults to 0 when omitted');
  assert.equal(empty.referencesCount, 0, 'builder: referencesCount defaults to 0 when omitted');
  assert.equal(empty.sectionCount, 0, 'builder: sectionCount defaults to 0 when omitted');
  assert.equal(empty.wordCount, 0, 'builder: wordCount defaults to 0 when omitted');
  assert.equal(empty.readingMinutes, 1, 'builder: default readingMinutes is 1 (ceil(0/200))');
  assert.equal(empty.revisionCount, 0, 'builder: revisionCount defaults to 0 when omitted');
  assert.equal(empty.firstEdited, null, 'builder: firstEdited defaults to null when omitted');
  assert.equal(empty.lastEdited, null, 'builder: lastEdited defaults to null when omitted');

  // Non-finite counts coerce to 0 on the envelope — matching every other count
  // field (and the per-related-entry incomingLinks) and the sibling info.json /
  // cite.json builders — so related.json's numeric fields are never emitted as
  // JSON null. The `= 0` defaults only catch `undefined`, so an explicit
  // NaN/Infinity would otherwise leak through (incomingLinks was the lone outlier).
  const nonFinite = buildArticleRelatedPages({
    slug: 'nf',
    title: 'NF',
    origin: ORIGIN,
    incomingLinks: NaN,
    referencesCount: Infinity,
    sectionCount: NaN,
    wordCount: -Infinity,
    revisionCount: NaN,
  });
  assert.equal(nonFinite.incomingLinks, 0, 'builder: non-finite incomingLinks coerces to 0');
  assert.equal(nonFinite.referencesCount, 0, 'builder: non-finite referencesCount coerces to 0');
  assert.equal(nonFinite.sectionCount, 0, 'builder: non-finite sectionCount coerces to 0');
  assert.equal(nonFinite.wordCount, 0, 'builder: non-finite wordCount coerces to 0');
  assert.equal(nonFinite.revisionCount, 0, 'builder: non-finite revisionCount coerces to 0');
  assert.equal(nonFinite.readingMinutes, 1, 'builder: non-finite wordCount yields readingMinutes 1 (ceil(0/200))');
}

// Repeated frontmatter categories must be deduped on the envelope and entries.
{
  const result = buildArticleRelatedPages({
    slug: 'hub',
    title: 'Hub',
    origin: ORIGIN,
    categories: ['Mining', 'Consensus', 'Mining'],
    relatedPages: [
      { slug: 'leaf', title: 'Leaf', summary: '', tags: ['Subnets'], categories: ['Subnets', 'Mining', 'Subnets'], backlinks: 0 },
    ],
  });
  assert.deepEqual(
    result.categories,
    ['Mining', 'Consensus'],
    'builder: envelope categories must be deduped while preserving first-seen order',
  );
  assert.deepEqual(
    result.related[0].categories,
    ['Subnets', 'Mining'],
    'builder: related entry categories must be deduped while preserving first-seen order',
  );
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(categoriesFile), 'public/data/categories.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');

const slugMap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const categoriesIndex = JSON.parse(fs.readFileSync(categoriesFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));

const SUBPAGES = new Set(['history', 'backlinks', 'cite', 'info']);
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
    if (SUBPAGES.has(segs[segs.length - 2])) continue;
    articleSlugs.push(segs.slice(0, -1).join('/'));
  }
};
walk(wikiDir);
assert.ok(articleSlugs.length > 0, 'no built article pages found to verify');

const titleBySlug = Object.fromEntries(
  articleSlugs.map((slug) => [slug, typeof slugMap[slug]?.title === 'string' ? slugMap[slug].title : slug]),
);
const publishedSlugs = new Set(articleSlugs);

let withRelated = 0;
let withEmpty = 0;

for (const slug of articleSlugs) {
  const jsonFile = path.join(wikiDir, slug, 'related.json');
  const htmlFile = path.join(wikiDir, slug, 'index.html');
  assert.ok(fs.existsSync(jsonFile), `every article must have a related.json, but /wiki/${slug}/related.json was not built`);
  assert.ok(fs.existsSync(htmlFile), `missing built article page: /wiki/${slug}/`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const expectedRelatedPages = getRelatedPages({
    slug,
    slugMap,
    categoriesIndex,
    backlinks: backlinksData,
    outgoing: linkgraphData,
    publishedSlugs,
    titleBySlug,
  }).map((entry) => {
    const entryHistory = historyOf(entry.slug);
    return {
      ...entry,
      categories: slugMap[entry.slug]?.categories ?? [],
      backlinks: publishedInboundLinkCount(backlinksData, entry.slug, titleBySlug),
      referencesCount: getArticleReferences({ slug: entry.slug, linkGraph: linkgraphData, titleBySlug }).length,
      sectionCount: sectionCountOf(entry.slug),
      wordCount: wordCountOf(entry.slug),
      readingMinutes: Math.max(1, Math.ceil(wordCountOf(entry.slug) / 200)),
      revisionCount: entryHistory.length,
      firstEdited: entryHistory[entryHistory.length - 1]?.date ?? null,
      lastEdited: entryHistory[0]?.date ?? null,
    };
  });
  const expectedDoc = buildArticleRelatedPages({
    slug,
    title: titleBySlug[slug],
    origin: ORIGIN,
    summary: slugMap[slug]?.summary ?? '',
    categories: slugMap[slug]?.categories ?? [],
    incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
    referencesCount: getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
    relatedPages: expectedRelatedPages,
  });

  assert.equal(typeof doc.slug, 'string', `${slug}: related.json slug must be a string`);
  assert.equal(typeof doc.title, 'string', `${slug}: related.json title must be a string`);
  assert.equal(doc.slug, slug, `${slug}: related.json slug must equal the article slug`);
  assert.equal(doc.title, titleBySlug[slug], `${slug}: related.json title must equal the article title`);
  // categories is the article's own topic set, the same field history.json /
  // info.json envelopes expose. Assert it against the raw slug map (independent
  // source, not the builder's own output) so the article's real, non-empty
  // topics are proven to flow end-to-end into the built JSON.
  assert.deepEqual(
    doc.categories,
    slugMap[slug]?.categories ?? [],
    `${slug}: related.json categories must equal the article's topics in the slug map`,
  );
  // summary is the article's own slug-map summary (null when blank), the same
  // per-article field the sibling envelopes (backlinks/toc/references/cite) expose.
  assert.deepEqual(
    doc.summary,
    slugMap[slug]?.summary || null,
    `${slug}: related.json summary must equal the article's slug-map summary (or null)`,
  );
  // incomingLinks is the article's own published inbound-link count — the same
  // figure info.json / history.json / cite.json expose on their envelopes.
  assert.equal(
    doc.incomingLinks,
    publishedInboundLinkCount(backlinksData, slug, titleBySlug),
    `${slug}: related.json incomingLinks must equal the published inbound-link count`,
  );
  // referencesCount is the article's published OUTBOUND reference count (the
  // complement of incomingLinks) — the same figure info.json / history.json /
  // cite.json expose — derived from the same getArticleReferences join.
  assert.equal(
    doc.referencesCount,
    getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
    `${slug}: related.json referencesCount must equal the published outbound-reference count`,
  );
  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count`, derived from the shared getArticleToc helper.
  assert.ok(
    Number.isInteger(doc.sectionCount) && doc.sectionCount >= 0,
    `${slug}: related.json sectionCount must be a non-negative integer (got ${JSON.stringify(doc.sectionCount)})`,
  );
  const relTocJsonFile = path.join(wikiDir, slug, 'toc.json');
  if (fs.existsSync(relTocJsonFile)) {
    const tocDoc = JSON.parse(fs.readFileSync(relTocJsonFile, 'utf8'));
    assert.equal(
      doc.sectionCount,
      tocDoc.count,
      `${slug}: related.json sectionCount must agree with the sibling toc.json envelope`,
    );
  }
  // revisionCount is the article's revision count (its commit-history length) —
  // the same figure info.json / history.json / cite.json expose on their
  // envelopes. Cross-check it against the sibling built info.json (independent
  // source) so the two envelopes can never disagree.
  assert.ok(
    Number.isInteger(doc.revisionCount) && doc.revisionCount >= 0,
    `${slug}: related.json revisionCount must be a non-negative integer (got ${JSON.stringify(doc.revisionCount)})`,
  );
  const relInfoJsonFile = path.join(wikiDir, slug, 'info.json');
  if (fs.existsSync(relInfoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(relInfoJsonFile, 'utf8'));
    assert.equal(
      doc.revisionCount,
      infoDoc.revisionCount,
      `${slug}: related.json revisionCount must agree with the sibling info.json envelope`,
    );
    // firstEdited / lastEdited are the article's first and last revision dates —
    // the same pair info.json / history.json expose. Cross-check both against the
    // sibling info.json (independent source).
    assert.equal(
      doc.firstEdited,
      infoDoc.firstEdited,
      `${slug}: related.json firstEdited must agree with the sibling info.json envelope`,
    );
    assert.equal(
      doc.lastEdited,
      infoDoc.lastEdited,
      `${slug}: related.json lastEdited must agree with the sibling info.json envelope`,
    );
    // wordCount is the article body's word count — the same figure info.json /
    // history.json expose and the article footer renders. Cross-check against the
    // sibling info.json (independent source).
    assert.ok(
      Number.isInteger(doc.wordCount) && doc.wordCount >= 0,
      `${slug}: related.json wordCount must be a non-negative integer (got ${JSON.stringify(doc.wordCount)})`,
    );
    assert.equal(
      doc.wordCount,
      infoDoc.wordCount,
      `${slug}: related.json wordCount must agree with the sibling info.json envelope`,
    );
    // readingMinutes is the ~200 wpm ceil estimate the article footer renders
    // from wordCount — the same figure info.json / toc.json / history.json
    // expose. It must be a positive integer, equal ceil(wordCount / 200), and
    // agree with the sibling info.json envelope.
    assert.ok(
      Number.isInteger(doc.readingMinutes) && doc.readingMinutes >= 1,
      `${slug}: related.json readingMinutes must be a positive integer (got ${JSON.stringify(doc.readingMinutes)})`,
    );
    assert.equal(
      doc.readingMinutes,
      Math.max(1, Math.ceil(doc.wordCount / 200)),
      `${slug}: related.json readingMinutes must equal ceil(wordCount / 200)`,
    );
    assert.equal(
      doc.readingMinutes,
      infoDoc.readingMinutes,
      `${slug}: related.json readingMinutes must agree with the sibling info.json envelope`,
    );
  }
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: related.json url must be the canonical article URL`);
  assert.equal(
    doc.relatedUrl,
    `${ORIGIN}/wiki/${slug}/related.json`,
    `${slug}: related.json must expose its own canonical relatedUrl`,
  );
  // relatedJsonUrl is the same canonical self-link under the consistent
  // <name>JsonUrl key every sibling endpoint uses; it must equal relatedUrl.
  assert.equal(
    doc.relatedJsonUrl,
    `${ORIGIN}/wiki/${slug}/related.json`,
    `${slug}: related.json must expose its canonical relatedJsonUrl self-link`,
  );
  assert.equal(doc.relatedJsonUrl, doc.relatedUrl, `${slug}: relatedJsonUrl must equal the back-compat relatedUrl`);
  // historyUrl / historyJsonUrl cross-link to the article's own revision history,
  // the same self cross-link cite.json / backlinks.json / history.json /
  // references.json envelopes expose, so a consumer of related.json can reach it too.
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/${slug}/history/`, `${slug}: related.json historyUrl must be the canonical article history URL`);
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/${slug}/history.json`, `${slug}: related.json historyJsonUrl must be the canonical article history.json URL`);
  // backlinksUrl / backlinksJsonUrl complete the same history+backlinks self
  // cross-link cite.json / references.json envelopes expose.
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/${slug}/backlinks/`, `${slug}: related.json backlinksUrl must be the canonical article backlinks URL`);
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/${slug}/backlinks.json`, `${slug}: related.json backlinksJsonUrl must be the canonical article backlinks.json URL`);
  // infoUrl / infoJsonUrl link back to the canonical Page-information hub (which
  // links out to every sibling), so a consumer of related.json can reach it.
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/${slug}/info/`, `${slug}: related.json infoUrl must be the canonical article info URL`);
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/${slug}/info.json`, `${slug}: related.json infoJsonUrl must be the canonical article info.json URL`);
  // tocJsonUrl cross-links to the article's table-of-contents JSON, the same
  // companion the history.json envelope and the allpages/recentchanges entries
  // expose, so a consumer of related.json can reach the article's TOC too.
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/${slug}/toc.json`, `${slug}: related.json tocJsonUrl must be the canonical article toc.json URL`);
  // citeUrl / citeJsonUrl / bibtexUrl / referencesUrl complete the envelope's
  // cross-links to the article's citation endpoints and outbound-reference index,
  // the same siblings info.json aggregates, so a consumer of related.json can
  // reach them without reconstructing the routes.
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/${slug}/cite/`, `${slug}: related.json citeUrl must be the canonical article cite URL`);
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/${slug}/cite.json`, `${slug}: related.json citeJsonUrl must be the canonical article cite.json URL`);
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/${slug}/cite.bib`, `${slug}: related.json bibtexUrl must be the canonical article cite.bib URL`);
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/${slug}/references.json`, `${slug}: related.json referencesUrl must be the canonical article references.json URL`);
  // referencesJsonUrl is the same references.json cross-link under the consistent
  // <name>JsonUrl key every sibling envelope exposes at top level; it must equal
  // referencesUrl. related.json's top level was the lone envelope missing it.
  assert.equal(doc.referencesJsonUrl, `${ORIGIN}/wiki/${slug}/references.json`, `${slug}: related.json must expose its canonical referencesJsonUrl cross-link`);
  assert.equal(doc.referencesJsonUrl, doc.referencesUrl, `${slug}: referencesJsonUrl must equal the back-compat referencesUrl`);
  // imageUrl is the article's own OG share-card (/og/<slug>.png), the same
  // companion the info/history/toc/references/backlinks envelopes expose.
  assert.equal(doc.imageUrl, `${ORIGIN}/og/${slug}.png`, `${slug}: related.json imageUrl must be the article's OG share-card URL`);
  assert.equal(typeof doc.count, 'number', `${slug}: related.json count must be a number`);
  assert.ok(Array.isArray(doc.related), `${slug}: related.json related must be an array`);
  assert.equal(doc.count, doc.related.length, `${slug}: related.json count must equal related.length`);
  assert.ok(doc.count <= 4, `${slug}: related.json must cap related results at 4`);
  assert.deepEqual(
    doc.related,
    expectedDoc.related,
    `${slug}: related.json rows must match the shared related-pages helper exactly`,
  );

  for (const entry of doc.related) {
    assert.equal(typeof entry.slug, 'string', `${slug}: every related entry must have a slug`);
    assert.equal(typeof entry.title, 'string', `${slug}: every related entry must have a title`);
    assert.equal(entry.url, `${ORIGIN}/wiki/${entry.slug}/`, `${slug}: every related entry url must be canonical`);
    // infoUrl / backlinksUrl point at the related article's Page-information and
    // What-links-here pages, so a consumer can reach a related page's metadata
    // and inbound links without reconstructing the route.
    assert.equal(
      entry.infoUrl,
      `${ORIGIN}/wiki/${entry.slug}/info/`,
      `${slug}: every related entry infoUrl must be the canonical article info URL`,
    );
    assert.equal(
      entry.backlinksUrl,
      `${ORIGIN}/wiki/${entry.slug}/backlinks/`,
      `${slug}: every related entry backlinksUrl must be the canonical article backlinks URL`,
    );
    // backlinksJsonUrl is the machine-readable companion of backlinksUrl — the
    // same HTML+JSON pairing each related entry already exposes for info
    // (infoUrl + infoJsonUrl), history (historyUrl + historyJsonUrl), and cite
    // (citeUrl + citeJsonUrl), and that the references.json / backlinks.json
    // entries expose for backlinks. It was the lone HTML link in the entry
    // without its .json companion.
    assert.equal(
      entry.backlinksJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/backlinks.json`,
      `${slug}: every related entry backlinksJsonUrl must be the canonical article backlinks.json URL`,
    );
    // historyUrl points at the related article's revision-history page — the
    // same companion references.json exposes per referenced article — so a
    // consumer can reach a related page's edit history without rebuilding the route.
    assert.equal(
      entry.historyUrl,
      `${ORIGIN}/wiki/${entry.slug}/history/`,
      `${slug}: every related entry historyUrl must be the canonical article history URL`,
    );
    // historyJsonUrl is the JSON companion of historyUrl — references.json
    // already pairs both per entry, so related.json entries match.
    assert.equal(
      entry.historyJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/history.json`,
      `${slug}: every related entry historyJsonUrl must be the canonical article history.json URL`,
    );
    // citeUrl / citeJsonUrl / bibtexUrl / referencesUrl / relatedUrl complete the
    // per-entry companions to match the backlinks.json / references.json entry
    // shape, so a consumer can reach a related article's citation, references, and
    // related endpoints without reconstructing the routes.
    assert.equal(entry.citeUrl, `${ORIGIN}/wiki/${entry.slug}/cite/`, `${slug}: every related entry citeUrl must be canonical`);
    assert.equal(entry.citeJsonUrl, `${ORIGIN}/wiki/${entry.slug}/cite.json`, `${slug}: every related entry citeJsonUrl must be canonical`);
    assert.equal(entry.bibtexUrl, `${ORIGIN}/wiki/${entry.slug}/cite.bib`, `${slug}: every related entry bibtexUrl must be canonical`);
    assert.equal(entry.referencesUrl, `${ORIGIN}/wiki/${entry.slug}/references.json`, `${slug}: every related entry referencesUrl must be canonical`);
    assert.equal(entry.relatedUrl, `${ORIGIN}/wiki/${entry.slug}/related.json`, `${slug}: every related entry relatedUrl must be canonical`);
    assert.equal(entry.referencesJsonUrl, `${ORIGIN}/wiki/${entry.slug}/references.json`, `${slug}: every related entry referencesJsonUrl must be canonical`);
    assert.equal(entry.referencesJsonUrl, entry.referencesUrl, `${slug}: every related entry referencesJsonUrl must equal the back-compat referencesUrl`);
    assert.equal(entry.relatedJsonUrl, `${ORIGIN}/wiki/${entry.slug}/related.json`, `${slug}: every related entry relatedJsonUrl must be canonical`);
    assert.equal(entry.relatedJsonUrl, entry.relatedUrl, `${slug}: every related entry relatedJsonUrl must equal the back-compat relatedUrl`);
    assert.equal(entry.infoJsonUrl, `${ORIGIN}/wiki/${entry.slug}/info.json`, `${slug}: every related entry infoJsonUrl must be canonical`);
    assert.equal(entry.tocJsonUrl, `${ORIGIN}/wiki/${entry.slug}/toc.json`, `${slug}: every related entry tocJsonUrl must be canonical`);
    assert.equal(entry.imageUrl, `${ORIGIN}/og/${entry.slug}.png`, `${slug}: every related entry imageUrl must be the related article's OG share-card URL`);
    assert.ok(Array.isArray(entry.tags), `${slug}: every related entry must expose tags as an array`);
    assert.ok(entry.tags.length <= 2, `${slug}: related entry ${entry.slug} must expose at most two tags`);
    // incomingLinks is the related article's published inbound-link count — the
    // same figure info.json names and backlinks exposes as `backlinks` per row.
    assert.equal(
      entry.incomingLinks,
      publishedInboundLinkCount(backlinksData, entry.slug, titleBySlug),
      `${slug}: every related entry incomingLinks must match the published inbound-link count`,
    );
    assert.equal(entry.incomingLinks, entry.backlinks, `${slug}: every related entry incomingLinks must equal backlinks`);
    const entryInfoJson = path.join(wikiDir, entry.slug, 'info.json');
    if (fs.existsSync(entryInfoJson)) {
      const entryInfo = JSON.parse(fs.readFileSync(entryInfoJson, 'utf8'));
      assert.equal(
        entry.incomingLinks,
        entryInfo.incomingLinks,
        `${slug}: related entry ${entry.slug} incomingLinks must agree with sibling info.json`,
      );
    }
  }

  const html = fs.readFileSync(htmlFile, 'utf8');
  const sectionMatch = html.match(/<section class="related-pages"[\s\S]*?<\/section>/);
  if (!sectionMatch) {
    assert.equal(doc.count, 0, `${slug}: related.json must be empty when the article page hides the related-pages block`);
    assert.deepEqual(doc.related, [], `${slug}: related.json must be [] when no related-pages block is rendered`);
  } else {
    const orderedHtmlSlugs = [...sectionMatch[0].matchAll(/<a\b[^>]*>/g)]
      .map((match) => {
        const tag = match[0];
        if (!tag.includes('related-pages-card')) return null;
        return tag.match(/href="\/wiki\/([^"/]+)\/"/)?.[1] ?? null;
      })
      .filter(Boolean);
    const orderedJsonSlugs = doc.related.map((entry) => entry.slug);

    assert.equal(
      orderedHtmlSlugs.length,
      orderedJsonSlugs.length,
      `${slug}: related.json and the rendered related-pages block must list the same number of entries`,
    );
    assert.deepEqual(
      orderedJsonSlugs,
      orderedHtmlSlugs,
      `${slug}: related.json order must match the rendered related-pages block order exactly`,
    );
  }

  if (doc.count > 0) withRelated++;
  else withEmpty++;
}

assert.ok(withRelated > 0, 'expected at least one article with related pages to verify correctness');
assert.ok(withEmpty > 0, 'expected at least one article with no related pages to verify the empty state');

console.log(
  `Related JSON check passed (${articleSlugs.length} articles: ${withRelated} with related pages, ${withEmpty} without; helper parity + HTML-order parity verified)`,
);
