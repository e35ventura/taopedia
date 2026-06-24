import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildArticleReferences, getArticleReferences } from '../src/lib/article-references.js';
import { publishedInboundLinkCount } from './most-linked.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const historyDir = path.join(projectRoot, 'public', 'history');
const ORIGIN = 'https://taopedia.org';
// Each entry's revision stats come from the referenced article's raw history
// file (history is newest-first), so the checker does not trust the built JSON.
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

// ---- 1) Unit: helper and builder behavior ---------------------------------
{
  const titleBySlug = {
    alpha: 'Subnet 2',
    beta: 'Subnet 10',
    gamma: 'Subnet 9',
    delta: 'Delta',
  };
  const linkGraph = {
    source: [
      { target: 'source' },
      { target: 'beta' },
      { target: 'gamma' },
      { target: 'alpha' },
      { target: 'alpha' },
      { target: 'missing' },
      { target: 'delta' },
    ],
  };

  const references = getArticleReferences({ slug: 'source', linkGraph, titleBySlug });
  assert.deepEqual(
    references,
    [
      { slug: 'delta', title: 'Delta' },
      { slug: 'alpha', title: 'Subnet 2' },
      { slug: 'gamma', title: 'Subnet 9' },
      { slug: 'beta', title: 'Subnet 10' },
    ],
    'helper must exclude self/missing targets, dedupe repeated targets, and sort numerically by title',
  );

  const doc = buildArticleReferences({
    slug: 'source',
    title: 'Source',
    origin: ORIGIN,
    summary: 'The source article.',
    categories: ['Consensus', 'Security'],
    incomingLinks: 5,
    revisionCount: 12,
    firstEdited: '2024-01-01T00:00:00.000Z',
    lastEdited: '2024-06-01T00:00:00.000Z',
    sectionCount: 7,
    references: references.map((entry, index) => ({
      ...entry,
      referencesCount: index + 1,
    })),
  });
  assert.equal(doc.slug, 'source', 'builder: slug field');
  assert.equal(doc.title, 'Source', 'builder: title field');
  assert.equal(doc.summary, 'The source article.', 'builder: summary field');
  assert.equal(doc.url, `${ORIGIN}/wiki/source/`, 'builder: url field');
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/source/references.json`, 'builder: referencesUrl self field');
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/source/history/`, 'builder: historyUrl cross-link');
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/source/history.json`, 'builder: historyJsonUrl cross-link');
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/source/backlinks/`, 'builder: backlinksUrl cross-link');
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/source/backlinks.json`, 'builder: backlinksJsonUrl cross-link');
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/source/info/`, 'builder: infoUrl cross-link');
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/source/info.json`, 'builder: infoJsonUrl cross-link');
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/source/cite/`, 'builder: citeUrl cross-link');
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/source/cite.json`, 'builder: citeJsonUrl cross-link');
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/source/cite.bib`, 'builder: bibtexUrl cross-link');
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/source/related.json`, 'builder: relatedUrl cross-link');
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/source/toc.json`, 'builder: tocJsonUrl cross-link');
  assert.equal(doc.imageUrl, `${ORIGIN}/og/source.png`, 'builder: imageUrl');
  assert.deepEqual(doc.categories, ['Consensus', 'Security'], 'builder: categories field');
  assert.equal(doc.incomingLinks, 5, 'builder: incomingLinks field');
  assert.equal(doc.revisionCount, 12, 'builder: revisionCount field threaded verbatim');
  assert.equal(doc.firstEdited, '2024-01-01T00:00:00.000Z', 'builder: firstEdited field threaded verbatim');
  assert.equal(doc.lastEdited, '2024-06-01T00:00:00.000Z', 'builder: lastEdited field threaded verbatim');
  assert.equal(doc.sectionCount, 7, 'builder: sectionCount field threaded verbatim');
  assert.equal(doc.count, 4, 'builder: count field');
  assert.deepEqual(
    doc.references,
    [
      {
        slug: 'delta',
        title: 'Delta',
        summary: null,
        categories: [],
        backlinks: 0,
        referencesCount: 1,
        revisionCount: 0,
        firstEdited: null,
        lastEdited: null,
        url: `${ORIGIN}/wiki/delta/`,
        infoUrl: `${ORIGIN}/wiki/delta/info/`,
        infoJsonUrl: `${ORIGIN}/wiki/delta/info.json`,
        backlinksUrl: `${ORIGIN}/wiki/delta/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/delta/backlinks.json`,
        historyUrl: `${ORIGIN}/wiki/delta/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/delta/history.json`,
        citeUrl: `${ORIGIN}/wiki/delta/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/delta/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/delta/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/delta/references.json`,
        relatedUrl: `${ORIGIN}/wiki/delta/related.json`,
        tocJsonUrl: `${ORIGIN}/wiki/delta/toc.json`,
        imageUrl: `${ORIGIN}/og/delta.png`,
      },
      {
        slug: 'alpha',
        title: 'Subnet 2',
        summary: null,
        categories: [],
        backlinks: 0,
        referencesCount: 2,
        revisionCount: 0,
        firstEdited: null,
        lastEdited: null,
        url: `${ORIGIN}/wiki/alpha/`,
        infoUrl: `${ORIGIN}/wiki/alpha/info/`,
        infoJsonUrl: `${ORIGIN}/wiki/alpha/info.json`,
        backlinksUrl: `${ORIGIN}/wiki/alpha/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/alpha/backlinks.json`,
        historyUrl: `${ORIGIN}/wiki/alpha/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/alpha/history.json`,
        citeUrl: `${ORIGIN}/wiki/alpha/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/alpha/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/alpha/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/alpha/references.json`,
        relatedUrl: `${ORIGIN}/wiki/alpha/related.json`,
        tocJsonUrl: `${ORIGIN}/wiki/alpha/toc.json`,
        imageUrl: `${ORIGIN}/og/alpha.png`,
      },
      {
        slug: 'gamma',
        title: 'Subnet 9',
        summary: null,
        categories: [],
        backlinks: 0,
        referencesCount: 3,
        revisionCount: 0,
        firstEdited: null,
        lastEdited: null,
        url: `${ORIGIN}/wiki/gamma/`,
        infoUrl: `${ORIGIN}/wiki/gamma/info/`,
        infoJsonUrl: `${ORIGIN}/wiki/gamma/info.json`,
        backlinksUrl: `${ORIGIN}/wiki/gamma/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/gamma/backlinks.json`,
        historyUrl: `${ORIGIN}/wiki/gamma/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/gamma/history.json`,
        citeUrl: `${ORIGIN}/wiki/gamma/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/gamma/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/gamma/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/gamma/references.json`,
        relatedUrl: `${ORIGIN}/wiki/gamma/related.json`,
        tocJsonUrl: `${ORIGIN}/wiki/gamma/toc.json`,
        imageUrl: `${ORIGIN}/og/gamma.png`,
      },
      {
        slug: 'beta',
        title: 'Subnet 10',
        summary: null,
        categories: [],
        backlinks: 0,
        referencesCount: 4,
        revisionCount: 0,
        firstEdited: null,
        lastEdited: null,
        url: `${ORIGIN}/wiki/beta/`,
        infoUrl: `${ORIGIN}/wiki/beta/info/`,
        infoJsonUrl: `${ORIGIN}/wiki/beta/info.json`,
        backlinksUrl: `${ORIGIN}/wiki/beta/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/beta/backlinks.json`,
        historyUrl: `${ORIGIN}/wiki/beta/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/beta/history.json`,
        citeUrl: `${ORIGIN}/wiki/beta/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/beta/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/beta/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/beta/references.json`,
        relatedUrl: `${ORIGIN}/wiki/beta/related.json`,
        tocJsonUrl: `${ORIGIN}/wiki/beta/toc.json`,
        imageUrl: `${ORIGIN}/og/beta.png`,
      },
    ],
    'builder: reference entry shape',
  );

  const empty = buildArticleReferences({ slug: 'orphan', title: 'Orphan', origin: ORIGIN });
  assert.deepEqual(empty.categories, [], 'builder: default categories is []');
  assert.equal(empty.summary, null, 'builder: default summary is null');
  assert.equal(empty.incomingLinks, 0, 'builder: default incomingLinks is 0');
  assert.equal(empty.revisionCount, 0, 'builder: default revisionCount is 0');
  assert.equal(empty.firstEdited, null, 'builder: default firstEdited is null');
  assert.equal(empty.lastEdited, null, 'builder: default lastEdited is null');
  assert.equal(empty.sectionCount, 0, 'builder: default sectionCount is 0');
  assert.equal(empty.count, 0, 'builder: empty count is 0');
  assert.deepEqual(empty.references, [], 'builder: empty references is []');
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, meta]) => [slug, typeof meta?.title === 'string' ? meta.title : slug]),
);
const expectedReferencesFor = (slug) => {
  const links = Array.isArray(linkgraphData[slug]) ? linkgraphData[slug] : [];
  const seen = new Set();
  const references = [];

  for (const link of links) {
    const target = typeof link?.target === 'string' ? link.target : '';
    if (!target || target === slug || !titleBySlug[target] || seen.has(target)) continue;

    seen.add(target);
    references.push({ slug: target, title: titleBySlug[target] });
  }

  return references.sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));
};

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

let withReferences = 0;
let withEmpty = 0;

for (const slug of articleSlugs) {
  const jsonFile = path.join(wikiDir, slug, 'references.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have a references.json, but /wiki/${slug}/references.json was not built`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const expectedReferences = expectedReferencesFor(slug);

  assert.equal(typeof doc.slug, 'string', `${slug}: references.json slug must be a string`);
  assert.equal(typeof doc.title, 'string', `${slug}: references.json title must be a string`);
  assert.equal(doc.slug, slug, `${slug}: references.json slug must equal the article slug`);
  assert.equal(doc.title, titleBySlug[slug], `${slug}: references.json title must equal the published article title`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: references.json url must be the canonical article URL`);
  assert.equal(
    doc.referencesUrl,
    `${ORIGIN}/wiki/${slug}/references.json`,
    `${slug}: references.json must expose its own canonical referencesUrl`,
  );
  // historyUrl / historyJsonUrl cross-link to the article's own revision history,
  // the same self cross-link cite.json / backlinks.json / history.json envelopes
  // expose, so a consumer of references.json can reach the article's history too.
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/${slug}/history/`, `${slug}: references.json historyUrl must be the canonical article history URL`);
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/${slug}/history.json`, `${slug}: references.json historyJsonUrl must be the canonical article history.json URL`);
  // backlinksUrl / backlinksJsonUrl cross-link to the article's What-links-here
  // endpoint, completing the same history+backlinks self cross-link cite.json
  // exposes, so a consumer of references.json can reach the article's backlinks too.
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/${slug}/backlinks/`, `${slug}: references.json backlinksUrl must be the canonical article backlinks URL`);
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/${slug}/backlinks.json`, `${slug}: references.json backlinksJsonUrl must be the canonical article backlinks.json URL`);
  // infoUrl / infoJsonUrl link back to the canonical Page-information hub (which
  // links out to every sibling), so a consumer of references.json can reach it.
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/${slug}/info/`, `${slug}: references.json infoUrl must be the canonical article info URL`);
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/${slug}/info.json`, `${slug}: references.json infoJsonUrl must be the canonical article info.json URL`);
  // citeUrl / citeJsonUrl / bibtexUrl / relatedUrl complete the envelope's
  // cross-links to the article's other endpoints (citation page + structured
  // citation + BibTeX, and the related-pages set), the same siblings info.json
  // aggregates, so a consumer of references.json can reach them too.
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/${slug}/cite/`, `${slug}: references.json citeUrl must be the canonical article cite URL`);
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/${slug}/cite.json`, `${slug}: references.json citeJsonUrl must be the canonical article cite.json URL`);
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/${slug}/cite.bib`, `${slug}: references.json bibtexUrl must be the canonical article cite.bib URL`);
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/${slug}/related.json`, `${slug}: references.json relatedUrl must be the canonical article related.json URL`);
  // tocJsonUrl cross-links to the article's table-of-contents endpoint, the
  // same companion cite.json already exposes, so a consumer of references.json
  // can reach the section-level outline without an extra info.json round-trip.
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/${slug}/toc.json`, `${slug}: references.json tocJsonUrl must be the canonical article toc.json URL`);
  // imageUrl is the article's own OG share-card (/og/<slug>.png).
  assert.equal(doc.imageUrl, `${ORIGIN}/og/${slug}.png`, `${slug}: references.json imageUrl must be the article's OG share-card URL`);
  // categories must match the article's own topic categories from the slug map,
  // the same field history.json / backlinks.json / toc.json expose on their envelopes.
  const expectedCategories = Array.isArray(slugmap[slug]?.categories) ? slugmap[slug].categories : [];
  assert.deepEqual(doc.categories, expectedCategories, `${slug}: references.json categories must match the article's topic categories from the slug map`);
  // summary is the article's own slug-map summary (null when blank), the same
  // per-article field the sibling envelopes (backlinks/toc) and listing endpoints expose.
  const expectedSummary = slugmap[slug]?.summary || null;
  assert.deepEqual(doc.summary, expectedSummary, `${slug}: references.json summary must match the article's slug-map summary (or null)`);
  // incomingLinks is the article's own published inbound-link count — the same
  // figure info.json / history.json / cite.json expose on their envelopes.
  assert.equal(doc.incomingLinks, publishedInboundLinkCount(backlinksData, slug, titleBySlug), `${slug}: references.json incomingLinks must equal the published inbound-link count`);
  // revisionCount is the article's revision count (its commit-history length) —
  // the same figure info.json / history.json / cite.json expose on their
  // envelopes. Cross-check it against the sibling built info.json (independent
  // source) so the two envelopes can never disagree.
  assert.ok(
    Number.isInteger(doc.revisionCount) && doc.revisionCount >= 0,
    `${slug}: references.json revisionCount must be a non-negative integer (got ${JSON.stringify(doc.revisionCount)})`,
  );
  const refInfoJsonFile = path.join(wikiDir, slug, 'info.json');
  assert.ok(
    Number.isInteger(doc.sectionCount) && doc.sectionCount >= 0,
    `${slug}: references.json sectionCount must be a non-negative integer (got ${JSON.stringify(doc.sectionCount)})`,
  );
  const refTocJsonFile = path.join(wikiDir, slug, 'toc.json');
  if (fs.existsSync(refTocJsonFile)) {
    const tocDoc = JSON.parse(fs.readFileSync(refTocJsonFile, 'utf8'));
    assert.equal(
      doc.sectionCount,
      tocDoc.count,
      `${slug}: references.json sectionCount must agree with the sibling toc.json count`,
    );
  }
  if (fs.existsSync(refInfoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(refInfoJsonFile, 'utf8'));
    assert.equal(
      doc.revisionCount,
      infoDoc.revisionCount,
      `${slug}: references.json revisionCount must agree with the sibling info.json envelope`,
    );
    // firstEdited / lastEdited are the article's first and last revision dates —
    // the same pair info.json / history.json expose. Cross-check both against the
    // sibling info.json (independent source) so the envelopes can't disagree.
    assert.equal(
      doc.firstEdited,
      infoDoc.firstEdited,
      `${slug}: references.json firstEdited must agree with the sibling info.json envelope`,
    );
    assert.equal(
      doc.lastEdited,
      infoDoc.lastEdited,
      `${slug}: references.json lastEdited must agree with the sibling info.json envelope`,
    );
  }
  assert.equal(typeof doc.count, 'number', `${slug}: references.json count must be a number`);
  assert.ok(Array.isArray(doc.references), `${slug}: references.json references must be an array`);
  assert.equal(doc.count, doc.references.length, `${slug}: references.json count must equal references.length`);

  const actualReferences = doc.references.map((entry) => ({
    slug: entry.slug,
    title: entry.title,
  }));
  assert.deepEqual(
    actualReferences,
    expectedReferences,
    `/wiki/${slug}/references.json must list exactly the published outbound references from the link graph`,
  );

  for (const entry of doc.references) {
    assert.equal(typeof entry.slug, 'string', `${slug}: every reference entry must have a slug`);
    assert.equal(typeof entry.title, 'string', `${slug}: every reference entry must have a title`);
    assert.equal(entry.url, `${ORIGIN}/wiki/${entry.slug}/`, `${slug}: every reference entry url must be the canonical article URL`);
    // summary mirrors the referenced article's own summary from the slug map (null
    // when blank), the same per-entry field the listing endpoints / related.json expose.
    const expectedSummary = slugmap[entry.slug]?.summary || null;
    assert.deepEqual(entry.summary, expectedSummary, `${slug}: every reference entry summary must match the referenced article's slug-map summary (or null)`);
    // categories mirror the referenced article's own topic categories from the
    // slug map, the same per-entry field the listing endpoints / backlinks entries expose.
    const expectedEntryCategories = Array.isArray(slugmap[entry.slug]?.categories) ? slugmap[entry.slug].categories : [];
    assert.deepEqual(entry.categories, expectedEntryCategories, `${slug}: every reference entry categories must match the referenced article's slug-map categories`);
    // backlinks is the referenced article's published inbound-link count — the
    // same figure allpages.json / subnets.json / related.json expose per row.
    assert.equal(entry.backlinks, publishedInboundLinkCount(backlinksData, entry.slug, titleBySlug), `${slug}: every reference entry backlinks must match the published inbound-link count`);
    assert.ok(Number.isInteger(entry.backlinks) && entry.backlinks >= 0, `${slug}: every reference entry backlinks must be a non-negative integer`);
    // referencesCount is the referenced article's own published outbound-link
    // count — the same figure its references.json / info.json / history.json /
    // cite.json envelope exposes — so a consumer can compare the referenced
    // article's inbound and outbound link totals without another fetch.
    const expectedEntryReferences = expectedReferencesFor(entry.slug);
    assert.ok(
      Number.isInteger(entry.referencesCount) && entry.referencesCount >= 0,
      `${slug}: every reference entry referencesCount must be a non-negative integer (got ${JSON.stringify(entry.referencesCount)})`,
    );
    assert.equal(
      entry.referencesCount,
      expectedEntryReferences.length,
      `${slug}: every reference entry referencesCount must equal the referenced article's published outbound-reference count`,
    );
    // revisionCount / firstEdited / lastEdited mirror the referenced article's
    // revision-history summary, so consumers can sort or filter references by
    // age and edit activity without a second fetch.
    const entryStats = revisionStatsOf(entry.slug);
    assert.ok(
      Number.isInteger(entry.revisionCount) && entry.revisionCount >= 0,
      `${slug}: every reference entry revisionCount must be a non-negative integer (got ${JSON.stringify(entry.revisionCount)})`,
    );
    assert.equal(
      entry.revisionCount,
      entryStats.revisionCount,
      `${slug}: every reference entry revisionCount must equal the referenced article's commit-history length`,
    );
    assert.equal(
      entry.firstEdited,
      entryStats.firstEdited,
      `${slug}: every reference entry firstEdited must equal the referenced article's oldest revision date (or null)`,
    );
    assert.equal(
      entry.lastEdited,
      entryStats.lastEdited,
      `${slug}: every reference entry lastEdited must equal the referenced article's latest revision date (or null)`,
    );
    const entryInfoJsonFile = path.join(wikiDir, entry.slug, 'info.json');
    assert.ok(fs.existsSync(entryInfoJsonFile), `${slug}: every reference entry must have a sibling info.json for cross-surface stat parity`);
    const entryInfoDoc = JSON.parse(fs.readFileSync(entryInfoJsonFile, 'utf8'));
    const entryReferencesJsonFile = path.join(wikiDir, entry.slug, 'references.json');
    assert.ok(fs.existsSync(entryReferencesJsonFile), `${slug}: every reference entry must have a sibling references.json for outbound-count parity`);
    const entryReferencesDoc = JSON.parse(fs.readFileSync(entryReferencesJsonFile, 'utf8'));
    assert.equal(
      entry.referencesCount,
      entryReferencesDoc.count,
      `${slug}: every reference entry referencesCount must agree with its sibling references.json envelope`,
    );
    assert.equal(
      entry.revisionCount,
      entryInfoDoc.revisionCount,
      `${slug}: every reference entry revisionCount must agree with its sibling info.json envelope`,
    );
    assert.equal(
      entry.firstEdited,
      entryInfoDoc.firstEdited,
      `${slug}: every reference entry firstEdited must agree with its sibling info.json envelope`,
    );
    assert.equal(
      entry.lastEdited,
      entryInfoDoc.lastEdited,
      `${slug}: every reference entry lastEdited must agree with its sibling info.json envelope`,
    );
    assert.equal(
      entry.infoUrl,
      `${ORIGIN}/wiki/${entry.slug}/info/`,
      `${slug}: every reference entry infoUrl must be the canonical article info URL`,
    );
    assert.equal(
      entry.infoJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/info.json`,
      `${slug}: every reference entry infoJsonUrl must be the canonical article info.json URL`,
    );
    assert.equal(
      entry.backlinksUrl,
      `${ORIGIN}/wiki/${entry.slug}/backlinks/`,
      `${slug}: every reference entry backlinksUrl must be the canonical article backlinks URL`,
    );
    assert.equal(
      entry.backlinksJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/backlinks.json`,
      `${slug}: every reference entry backlinksJsonUrl must be the canonical article backlinks.json URL`,
    );
    assert.equal(
      entry.historyUrl,
      `${ORIGIN}/wiki/${entry.slug}/history/`,
      `${slug}: every reference entry historyUrl must be the canonical article history URL`,
    );
    // historyJsonUrl is the JSON companion of historyUrl — /wiki/<slug>/history.json
    // exists and is exposed by backlinks.json / recentchanges.json, so each
    // reference entry pairs its HTML history link with the machine-readable one.
    assert.equal(
      entry.historyJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/history.json`,
      `${slug}: every reference entry historyJsonUrl must be the canonical article history.json URL`,
    );
    // citeUrl / citeJsonUrl / bibtexUrl / referencesUrl / relatedUrl complete the
    // per-entry companions to match what backlinks.json entries expose, so a
    // consumer can reach a referenced article's citation, references, and related
    // endpoints without reconstructing the routes.
    assert.equal(entry.citeUrl, `${ORIGIN}/wiki/${entry.slug}/cite/`, `${slug}: every reference entry citeUrl must be canonical`);
    assert.equal(entry.citeJsonUrl, `${ORIGIN}/wiki/${entry.slug}/cite.json`, `${slug}: every reference entry citeJsonUrl must be canonical`);
    assert.equal(entry.bibtexUrl, `${ORIGIN}/wiki/${entry.slug}/cite.bib`, `${slug}: every reference entry bibtexUrl must be canonical`);
    assert.equal(entry.referencesUrl, `${ORIGIN}/wiki/${entry.slug}/references.json`, `${slug}: every reference entry referencesUrl must be canonical`);
    assert.equal(entry.relatedUrl, `${ORIGIN}/wiki/${entry.slug}/related.json`, `${slug}: every reference entry relatedUrl must be canonical`);
    assert.equal(entry.tocJsonUrl, `${ORIGIN}/wiki/${entry.slug}/toc.json`, `${slug}: every reference entry tocJsonUrl must be the canonical article toc.json URL`);
    assert.equal(entry.imageUrl, `${ORIGIN}/og/${entry.slug}.png`, `${slug}: every reference entry imageUrl must be the referenced article's OG share-card URL`);
  }

  if (doc.count > 0) withReferences++;
  else withEmpty++;
}

assert.ok(withReferences > 0, 'expected at least one article with outbound references to verify correctness');
assert.ok(withEmpty > 0, 'expected at least one article with no outbound references to verify the empty state');

console.log(
  `References JSON check passed (${articleSlugs.length} articles: ${withReferences} with outbound references, ${withEmpty} with none; ground-truth parity verified)`,
);
