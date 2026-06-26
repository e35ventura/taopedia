import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleHistory } from './article-history-json.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { publishedInboundLinkCount } from './most-linked.js';

// Load-bearing check for /wiki/<slug>/history.json: the machine-readable
// companion to the revision-history HTML page. It (1) unit-tests the builder,
// (2) confirms every article has a built history.json with the correct shape,
// (3) verifies the revision list matches the ground-truth public/history/ files,
// (4) checks firstEdited/lastEdited and revisionCount agree with the array,
// (5) checks referencesCount agrees with the shared outbound-reference helper
// and the sibling references.json envelope,
// (6) checks the empty state (no history → count 0, null dates, empty array),
// and (7) confirms HTML/JSON parity — the JSON entry count and short SHAs must
// match what history.astro rendered so the two surfaces cannot drift.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: builder produces the correct JSON shape ----------------------
{
  const revs = [
    { sha: 'abc1234def5678', date: '2026-06-01T12:00:00.000Z', authorName: 'alice', message: 'initial commit' },
    { sha: '000aaabbbccc11', date: '2025-01-10T08:00:00.000Z', authorName: 'bob', message: 'update' },
  ];
  const result = buildArticleHistory({ slug: 'recycling', title: 'Recycling', origin: ORIGIN, summary: 'Reclaiming emitted TAO.', categories: ['Consensus'], incomingLinks: 5, referencesCount: 3, sectionCount: 4, wordCount: 812, revisions: revs });
  assert.equal(result.slug, 'recycling', 'builder: slug');
  assert.equal(result.title, 'Recycling', 'builder: title');
  assert.equal(result.summary, 'Reclaiming emitted TAO.', 'builder: summary');
  assert.equal(result.url, `${ORIGIN}/wiki/recycling/`, 'builder: url');
  assert.equal(result.infoUrl, `${ORIGIN}/wiki/recycling/info/`, 'builder: infoUrl');
  assert.equal(result.infoJsonUrl, `${ORIGIN}/wiki/recycling/info.json`, 'builder: infoJsonUrl');
  assert.equal(result.historyUrl, `${ORIGIN}/wiki/recycling/history/`, 'builder: historyUrl');
  assert.equal(result.historyJsonUrl, `${ORIGIN}/wiki/recycling/history.json`, 'builder: historyJsonUrl');
  assert.equal(result.backlinksUrl, `${ORIGIN}/wiki/recycling/backlinks/`, 'builder: backlinksUrl');
  assert.equal(result.backlinksJsonUrl, `${ORIGIN}/wiki/recycling/backlinks.json`, 'builder: backlinksJsonUrl');
  assert.equal(result.citeUrl, `${ORIGIN}/wiki/recycling/cite/`, 'builder: citeUrl');
  assert.equal(result.citeJsonUrl, `${ORIGIN}/wiki/recycling/cite.json`, 'builder: citeJsonUrl');
  assert.equal(result.bibtexUrl, `${ORIGIN}/wiki/recycling/cite.bib`, 'builder: bibtexUrl');
  assert.equal(result.referencesUrl, `${ORIGIN}/wiki/recycling/references.json`, 'builder: referencesUrl');
  assert.equal(result.relatedUrl, `${ORIGIN}/wiki/recycling/related.json`, 'builder: relatedUrl');
  assert.equal(result.referencesJsonUrl, `${ORIGIN}/wiki/recycling/references.json`, 'builder: referencesJsonUrl alias');
  assert.equal(result.relatedJsonUrl, `${ORIGIN}/wiki/recycling/related.json`, 'builder: relatedJsonUrl alias');
  assert.equal(result.tocJsonUrl, `${ORIGIN}/wiki/recycling/toc.json`, 'builder: tocJsonUrl');
  assert.equal(result.imageUrl, `${ORIGIN}/og/recycling.png`, 'builder: imageUrl');
  assert.deepEqual(result.categories, ['Consensus'], 'builder: categories');
  assert.equal(result.incomingLinks, 5, 'builder: incomingLinks');
  assert.equal(result.referencesCount, 3, 'builder: referencesCount');
  assert.equal(result.sectionCount, 4, 'builder: sectionCount');
  assert.equal(result.wordCount, 812, 'builder: wordCount');
  assert.equal(result.readingMinutes, 5, 'builder: readingMinutes from wordCount (ceil(812/200))');
  assert.equal(result.revisionCount, 2, 'builder: revisionCount');
  assert.equal(result.lastEdited, '2026-06-01T12:00:00.000Z', 'builder: lastEdited is revisions[0].date');
  assert.equal(result.firstEdited, '2025-01-10T08:00:00.000Z', 'builder: firstEdited is revisions[last].date');
  assert.equal(result.revisions.length, 2, 'builder: revisions array length');
  assert.equal(result.revisions[0].sha, 'abc1234def5678', 'builder: revisions[0].sha');
  assert.equal(result.revisions[0].date, '2026-06-01T12:00:00.000Z', 'builder: revisions[0].date');
  assert.equal(result.revisions[0].authorName, 'alice', 'builder: revisions[0].authorName');
  assert.equal(result.revisions[0].message, 'initial commit', 'builder: revisions[0].message');
  assert.equal(result.revisions[1].sha, '000aaabbbccc11', 'builder: revisions[1].sha');
  assert.equal(result.revisions[1].date, '2025-01-10T08:00:00.000Z', 'builder: revisions[1].date');
  assert.equal(result.revisions[1].authorName, 'bob', 'builder: revisions[1].authorName');
  assert.equal(result.revisions[1].message, 'update', 'builder: revisions[1].message');

  const empty = buildArticleHistory({ slug: 'orphan', title: 'Orphan', origin: ORIGIN });
  assert.equal(empty.revisionCount, 0, 'builder: empty revisionCount is 0');
  assert.equal(empty.firstEdited, null, 'builder: empty firstEdited is null');
  assert.equal(empty.lastEdited, null, 'builder: empty lastEdited is null');
  assert.deepEqual(empty.revisions, [], 'builder: empty revisions is []');
  assert.deepEqual(empty.categories, [], 'builder: default categories is []');
  const deduped = buildArticleHistory({
    slug: 'dup',
    title: 'Dup',
    origin: ORIGIN,
    categories: ['Consensus', 'Mining', 'Consensus'],
  });
  assert.deepEqual(
    deduped.categories,
    ['Consensus', 'Mining'],
    'builder: repeated frontmatter categories must be deduped while preserving first-seen order',
  );
  assert.equal(empty.summary, null, 'builder: default summary is null');
  assert.equal(empty.incomingLinks, 0, 'builder: default incomingLinks is 0');
  assert.equal(empty.referencesCount, 0, 'builder: default referencesCount is 0');
  assert.equal(empty.sectionCount, 0, 'builder: default sectionCount is 0');
  assert.equal(empty.wordCount, 0, 'builder: default wordCount is 0');
  assert.equal(empty.readingMinutes, 1, 'builder: default readingMinutes is 1 (ceil(0/200))');

  const badSection = buildArticleHistory({ slug: 'x', title: 'X', origin: ORIGIN, sectionCount: NaN });
  assert.equal(badSection.sectionCount, 0, 'builder: non-finite sectionCount defaults to 0');

  const badWords = buildArticleHistory({ slug: 'x', title: 'X', origin: ORIGIN, wordCount: NaN });
  assert.equal(badWords.wordCount, 0, 'builder: non-finite wordCount defaults to 0');

  const badCount = buildArticleHistory({ slug: 'x', title: 'X', origin: ORIGIN, referencesCount: NaN });
  assert.equal(badCount.referencesCount, 0, 'builder: non-finite referencesCount defaults to 0');

  // message defaults to '' when absent in raw data
  const noMsg = buildArticleHistory({
    slug: 'x', title: 'X', origin: ORIGIN,
    revisions: [{ sha: 'aaa', date: '2026-01-01T00:00:00.000Z', authorName: 'x' }],
  });
  assert.equal(noMsg.revisions[0].message, '', 'builder: missing message defaults to empty string');
}

// ---- 2–6) Built-output checks ----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(historyDir), 'public/history not found; run the build first');

const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, meta]) => [slug, typeof meta?.title === 'string' ? meta.title : slug]),
);

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

// Parse the 7-char short SHAs from a rendered history HTML page.
const htmlShortShas = (html) =>
  [...html.matchAll(/<code[^>]*>[\s\S]*?([0-9a-f]{7})[\s\S]*?<\/code>/g)].map(([, sha]) => sha);

const footerWordCount = (html) => {
  const match = html.match(/<div class="mw-article-meta"[^>]*data-word-count="(\d+)"/);
  return match ? Number(match[1]) : null;
};

const footerReadingMinutes = (html) => {
  const match = html.match(/(\d+) min read/);
  return match ? Number(match[1]) : null;
};

let withHistory = 0;
let withEmpty = 0;

for (const slug of articleSlugs) {
  // 2) COVERAGE
  const jsonFile = path.join(wikiDir, slug, 'history.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have a history.json, but /wiki/${slug}/history.json was not built`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  // 3) SHAPE
  assert.equal(doc.slug, slug, `${slug}: history.json slug must equal the article slug`);
  assert.equal(typeof doc.title, 'string', `${slug}: history.json title must be a string`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: history.json url must be the canonical article URL`);
  // infoUrl / infoJsonUrl link the envelope back to the article's Page-information
  // hub (the same cross-link references.json exposes), so a consumer of
  // history.json can reach the article's metadata overview and its JSON form.
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/${slug}/info/`, `${slug}: history.json infoUrl must point to the Page-information hub`);
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/${slug}/info.json`, `${slug}: history.json infoJsonUrl must point to the info.json hub`);
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/${slug}/history/`, `${slug}: history.json historyUrl must point to the HTML page`);
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/${slug}/history.json`, `${slug}: history.json must expose its own canonical historyJsonUrl`);
  // backlinksUrl / backlinksJsonUrl cross-link to the sibling What-links-here
  // endpoint, symmetric with how backlinks.json already cross-links to history
  // (historyUrl + historyJsonUrl). So a consumer on either page reaches the other.
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/${slug}/backlinks/`, `${slug}: history.json backlinksUrl must point to the sibling HTML backlinks page`);
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/${slug}/backlinks.json`, `${slug}: history.json backlinksJsonUrl must point to the sibling machine-readable backlinks endpoint`);
  // citeUrl / citeJsonUrl / bibtexUrl cross-link to the article's Cite-this-page
  // hub, symmetric with how references.json and cite.json already expose the
  // history siblings so consumers can reach citation metadata from revision history.
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/${slug}/cite/`, `${slug}: history.json citeUrl must point to the Cite-this-page hub`);
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/${slug}/cite.json`, `${slug}: history.json citeJsonUrl must point to the cite.json hub`);
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/${slug}/cite.bib`, `${slug}: history.json bibtexUrl must point to the BibTeX export`);
  // referencesUrl / relatedUrl cross-link to the article's outbound-link and
  // related-pages JSON endpoints, symmetric with how references.json and
  // related.json already expose history siblings.
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/${slug}/references.json`, `${slug}: history.json referencesUrl must point to the references.json hub`);
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/${slug}/related.json`, `${slug}: history.json relatedUrl must point to the related.json hub`);
  // referencesJsonUrl / relatedJsonUrl are the consistently-named *JsonUrl aliases
  // for referencesUrl / relatedUrl; each must equal the canonical .json URL and its counterpart.
  assert.equal(doc.referencesJsonUrl, `${ORIGIN}/wiki/${slug}/references.json`, `${slug}: history.json referencesJsonUrl must point to the references.json hub`);
  assert.equal(doc.referencesJsonUrl, doc.referencesUrl, `${slug}: history.json referencesJsonUrl must equal referencesUrl`);
  assert.equal(doc.relatedJsonUrl, `${ORIGIN}/wiki/${slug}/related.json`, `${slug}: history.json relatedJsonUrl must point to the related.json hub`);
  assert.equal(doc.relatedJsonUrl, doc.relatedUrl, `${slug}: history.json relatedJsonUrl must equal relatedUrl`);
  // tocJsonUrl links the article's machine-readable table-of-contents endpoint,
  // letting consumers navigate from revision history to heading structure.
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/${slug}/toc.json`, `${slug}: history.json tocJsonUrl must point to the article's table-of-contents endpoint`);
  // imageUrl is the article's own OG share-card (/og/<slug>.png) — the same
  // per-article image the directory entries and feeds expose.
  assert.equal(doc.imageUrl, `${ORIGIN}/og/${slug}.png`, `${slug}: history.json imageUrl must be the article's OG share-card URL`);
  // categories must match the article's topic categories from the slug map,
  // symmetric with info.json which already exposes the same field.
  const expectedCategories = slugmap[slug]?.categories ?? [];
  assert.deepEqual(doc.categories, expectedCategories, `${slug}: history.json categories must match the article's topic categories from the slug map`);
  // summary is the article's own slug-map summary (null when blank), the same
  // per-article field the sibling envelopes (backlinks/toc/references/cite/related) expose.
  const expectedSummary = slugmap[slug]?.summary || null;
  assert.deepEqual(doc.summary, expectedSummary, `${slug}: history.json summary must match the article's slug-map summary (or null)`);
  // incomingLinks is the article's published inbound-link count — the same figure
  // info.json exposes, computed via the shared publishedInboundLinkCount helper.
  assert.equal(
    doc.incomingLinks,
    publishedInboundLinkCount(backlinksData, slug, titleBySlug),
    `${slug}: history.json incomingLinks must match the published inbound-link count`,
  );
  assert.ok(Number.isInteger(doc.incomingLinks) && doc.incomingLinks >= 0, `${slug}: history.json incomingLinks must be a non-negative integer`);
  // referencesCount is the article's published outbound-reference count — the
  // same figure references.json exposes as `count`, computed via the shared helper.
  assert.equal(
    doc.referencesCount,
    getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
    `${slug}: history.json referencesCount must match the published outbound-reference count`,
  );
  assert.ok(Number.isInteger(doc.referencesCount) && doc.referencesCount >= 0, `${slug}: history.json referencesCount must be a non-negative integer`);
  const referencesJsonFile = path.join(wikiDir, slug, 'references.json');
  if (fs.existsSync(referencesJsonFile)) {
    const referencesDoc = JSON.parse(fs.readFileSync(referencesJsonFile, 'utf8'));
    assert.equal(
      doc.referencesCount,
      referencesDoc.count,
      `${slug}: history.json referencesCount must agree with the sibling references.json envelope`,
    );
  }
  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count`, derived from the shared getArticleToc helper.
  assert.ok(Number.isInteger(doc.sectionCount) && doc.sectionCount >= 0, `${slug}: history.json sectionCount must be a non-negative integer`);
  const tocJsonFile = path.join(wikiDir, slug, 'toc.json');
  if (fs.existsSync(tocJsonFile)) {
    const tocDoc = JSON.parse(fs.readFileSync(tocJsonFile, 'utf8'));
    assert.equal(
      doc.sectionCount,
      tocDoc.count,
      `${slug}: history.json sectionCount must agree with the sibling toc.json envelope`,
    );
  }
  // wordCount is the article's word count — the same figure the article footer
  // exposes as data-word-count on the canonical article page.
  assert.ok(Number.isInteger(doc.wordCount) && doc.wordCount >= 0, `${slug}: history.json wordCount must be a non-negative integer`);
  const articleHtmlFile = path.join(wikiDir, slug, 'index.html');
  if (fs.existsSync(articleHtmlFile)) {
    const articleHtml = fs.readFileSync(articleHtmlFile, 'utf8');
    const expectedWordCount = footerWordCount(articleHtml);
    assert.equal(
      doc.wordCount,
      expectedWordCount,
      `${slug}: history.json wordCount must match the article footer's data-word-count`,
    );
    const expectedReadingMinutes = footerReadingMinutes(articleHtml);
    if (expectedReadingMinutes !== null) {
      assert.equal(
        doc.readingMinutes,
        expectedReadingMinutes,
        `${slug}: history.json readingMinutes must match the article footer's rendered reading time`,
      );
    }
  }
  assert.ok(
    Number.isInteger(doc.readingMinutes) && doc.readingMinutes >= 1,
    `${slug}: history.json readingMinutes must be a positive integer`,
  );
  const infoJsonFile = path.join(wikiDir, slug, 'info.json');
  if (fs.existsSync(infoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
    assert.equal(
      doc.incomingLinks,
      infoDoc.incomingLinks,
      `${slug}: history.json incomingLinks must agree with the sibling info.json envelope`,
    );
    assert.equal(
      doc.readingMinutes,
      infoDoc.readingMinutes,
      `${slug}: history.json readingMinutes must agree with the sibling info.json envelope`,
    );
  }
  assert.equal(typeof doc.revisionCount, 'number', `${slug}: history.json revisionCount must be a number`);
  assert.ok(Array.isArray(doc.revisions), `${slug}: history.json revisions must be an array`);
  assert.equal(doc.revisionCount, doc.revisions.length, `${slug}: history.json revisionCount must equal revisions.length`);

  // 4) CORRECTNESS against ground truth
  const rawFile = path.join(historyDir, `${slug}.json`);
  const rawRevisions = fs.existsSync(rawFile) ? (JSON.parse(fs.readFileSync(rawFile, 'utf8')).history ?? []) : [];

  assert.equal(doc.revisions.length, rawRevisions.length, `${slug}: history.json revision count must match ground-truth public/history/${slug}.json`);

  if (rawRevisions.length > 0) {
    // firstEdited = last entry's date (oldest), lastEdited = first entry's date (newest)
    assert.equal(doc.lastEdited, rawRevisions[0].date, `${slug}: history.json lastEdited must equal the newest revision date`);
    assert.equal(doc.firstEdited, rawRevisions[rawRevisions.length - 1].date, `${slug}: history.json firstEdited must equal the oldest revision date`);

    // Per-revision shape and sha/date/author correctness
    for (let i = 0; i < rawRevisions.length; i++) {
      const raw = rawRevisions[i];
      const rev = doc.revisions[i];
      assert.equal(typeof rev.sha, 'string', `${slug}: revision[${i}].sha must be a string`);
      assert.equal(typeof rev.date, 'string', `${slug}: revision[${i}].date must be a string`);
      assert.equal(typeof rev.authorName, 'string', `${slug}: revision[${i}].authorName must be a string`);
      assert.equal(typeof rev.message, 'string', `${slug}: revision[${i}].message must be a string`);
      assert.equal(rev.sha, raw.sha, `${slug}: revision[${i}].sha must match ground truth`);
      assert.equal(rev.date, raw.date, `${slug}: revision[${i}].date must match ground truth`);
      assert.equal(rev.authorName, raw.authorName, `${slug}: revision[${i}].authorName must match ground truth`);
      assert.equal(rev.message, raw.message ?? '', `${slug}: revision[${i}].message must match ground truth`);
    }
  } else {
    // 5) EMPTY STATE
    assert.equal(doc.firstEdited, null, `${slug}: history.json firstEdited must be null when there are no revisions`);
    assert.equal(doc.lastEdited, null, `${slug}: history.json lastEdited must be null when there are no revisions`);
  }

  // 6) HTML/JSON PARITY: entry count and short SHAs must match the HTML page
  const htmlFile = path.join(wikiDir, slug, 'history', 'index.html');
  if (fs.existsSync(htmlFile) && doc.revisions.length > 0) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const shortShas = htmlShortShas(html);
    assert.equal(
      shortShas.length,
      doc.revisions.length,
      `/wiki/${slug}/history.json and /wiki/${slug}/history/ must have the same number of revisions`,
    );
    for (let i = 0; i < doc.revisions.length; i++) {
      assert.equal(
        doc.revisions[i].sha.substring(0, 7),
        shortShas[i],
        `/wiki/${slug}/history.json revision[${i}] SHA must match the short SHA on the HTML history page`,
      );
    }
  }

  if (doc.revisionCount > 0) withHistory++;
  else withEmpty++;
}

assert.ok(withHistory > 0, 'expected at least one article with revision history to verify correctness');
assert.ok(withEmpty >= 0); // articles without history are fine but not required

console.log(
  `History JSON check passed (${articleSlugs.length} articles: ${withHistory} with revision history, ${articleSlugs.length - withHistory} without; ground-truth + HTML/JSON parity verified)`,
);
