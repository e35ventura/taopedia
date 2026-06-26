import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleToc, getArticleToc } from '../src/lib/article-toc.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { publishedInboundLinkCount } from './most-linked.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: helper + builder behavior -----------------------------------
{
  const sections = getArticleToc([
    { depth: 1, slug: 'top', text: 'Top' },
    { depth: 2, slug: 'alpha', text: 'Alpha' },
    { depth: 3, slug: 'beta', text: 'Beta' },
    { depth: 4, slug: 'gamma', text: 'Gamma' },
    { depth: 5, slug: 'ignored', text: 'Ignored' },
  ]);
  assert.deepEqual(
    sections,
    [
      {
        number: 1,
        depth: 2,
        slug: 'alpha',
        title: 'Alpha',
        hasSubsections: true,
        isSubsection: false,
        indent: 0,
      },
      {
        number: 2,
        depth: 3,
        slug: 'beta',
        title: 'Beta',
        hasSubsections: true,
        isSubsection: true,
        indent: 16,
      },
      {
        number: 3,
        depth: 4,
        slug: 'gamma',
        title: 'Gamma',
        hasSubsections: false,
        isSubsection: true,
        indent: 32,
      },
    ],
    'helper must keep only visible TOC heading depths, preserve order, and assign page/runtime metadata from one source of truth',
  );

  assert.deepEqual(
    getArticleToc([{ depth: 2, slug: 'solo', text: 'Solo' }]),
    [],
    'helper must return an empty TOC when the article would not render a multi-entry contents block',
  );

  const doc = buildArticleToc({
    slug: 'source',
    title: 'Source',
    origin: ORIGIN,
    summary: 'The source article.',
    categories: ['Consensus', 'Security'],
    incomingLinks: 5,
    revisionCount: 12,
    firstEdited: '2024-01-01T00:00:00.000Z',
    lastEdited: '2024-06-01T00:00:00.000Z',
    referencesCount: 4,
    wordCount: 812,
    sections,
  });
  assert.equal(doc.slug, 'source', 'builder: slug field');
  assert.equal(doc.title, 'Source', 'builder: title field');
  assert.equal(doc.url, `${ORIGIN}/wiki/source/`, 'builder: url field');
  assert.equal(doc.summary, 'The source article.', 'builder: summary field');
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/source/toc.json`, 'builder: tocJsonUrl self field');
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/source/info/`, 'builder: infoUrl cross-link');
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/source/info.json`, 'builder: infoJsonUrl cross-link');
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/source/history/`, 'builder: historyUrl cross-link');
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/source/history.json`, 'builder: historyJsonUrl cross-link');
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/source/backlinks/`, 'builder: backlinksUrl cross-link');
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/source/backlinks.json`, 'builder: backlinksJsonUrl cross-link');
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/source/cite/`, 'builder: citeUrl cross-link');
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/source/cite.json`, 'builder: citeJsonUrl cross-link');
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/source/cite.bib`, 'builder: bibtexUrl cross-link');
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/source/references.json`, 'builder: referencesUrl cross-link');
  assert.equal(doc.referencesJsonUrl, `${ORIGIN}/wiki/source/references.json`, 'builder: referencesJsonUrl alias cross-link');
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/source/related.json`, 'builder: relatedUrl cross-link');
  assert.equal(doc.relatedJsonUrl, `${ORIGIN}/wiki/source/related.json`, 'builder: relatedJsonUrl alias cross-link');
  assert.equal(doc.tocUrl, `${ORIGIN}/wiki/source/toc.json`, 'builder: tocUrl alias (toc has no HTML page, so it points at toc.json)');
  assert.equal(doc.imageUrl, `${ORIGIN}/og/source.png`, 'builder: imageUrl');
  assert.deepEqual(doc.categories, ['Consensus', 'Security'], 'builder: categories field');
  assert.equal(doc.incomingLinks, 5, 'builder: incomingLinks field');
  assert.equal(doc.revisionCount, 12, 'builder: revisionCount field');
  assert.equal(doc.firstEdited, '2024-01-01T00:00:00.000Z', 'builder: firstEdited field');
  assert.equal(doc.lastEdited, '2024-06-01T00:00:00.000Z', 'builder: lastEdited field');
  assert.equal(doc.referencesCount, 4, 'builder: referencesCount field');
  assert.equal(doc.wordCount, 812, 'builder: wordCount field');
  assert.equal(doc.readingMinutes, 5, 'builder: readingMinutes from wordCount (ceil(812/200))');
  assert.equal(doc.sectionCount, 3, 'builder: sectionCount equals sections.length');
  assert.equal(doc.count, doc.sectionCount, 'builder: count and sectionCount must agree');
  assert.equal(doc.count, 3, 'builder: count field');
  assert.deepEqual(
    doc.sections,
    [
      { number: 1, depth: 2, slug: 'alpha', title: 'Alpha', url: `${ORIGIN}/wiki/source/#alpha` },
      { number: 2, depth: 3, slug: 'beta', title: 'Beta', url: `${ORIGIN}/wiki/source/#beta` },
      { number: 3, depth: 4, slug: 'gamma', title: 'Gamma', url: `${ORIGIN}/wiki/source/#gamma` },
    ],
    'builder: section entry shape',
  );

  const badCount = buildArticleToc({ slug: 'x', title: 'X', origin: ORIGIN, referencesCount: NaN });
  assert.equal(badCount.referencesCount, 0, 'builder: non-finite referencesCount defaults to 0');

  const badWords = buildArticleToc({ slug: 'x', title: 'X', origin: ORIGIN, wordCount: NaN });
  assert.equal(badWords.wordCount, 0, 'builder: non-finite wordCount defaults to 0');

  const empty = buildArticleToc({ slug: 'x', title: 'X', origin: ORIGIN });
  assert.equal(empty.wordCount, 0, 'builder: default wordCount is 0');
  assert.equal(empty.readingMinutes, 1, 'builder: default readingMinutes is 1 (ceil(0/200))');

  const deduped = buildArticleToc({
    slug: 'dup',
    title: 'Dup',
    origin: ORIGIN,
    categories: ['Mining', 'Consensus', 'Mining'],
  });
  assert.deepEqual(
    deduped.categories,
    ['Mining', 'Consensus'],
    'builder: repeated frontmatter categories must be deduped while preserving first-seen order',
  );
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

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

const revisionCountOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return 0;
  const history = JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
  return Array.isArray(history) ? history.length : 0;
};

const decodeHtml = (text) =>
  text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity) => {
    if (entity === 'amp') return '&';
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return `&${entity};`;
  });

const parseRenderedToc = (html) =>
  [...html.matchAll(/<li class="toc-level-(\d+)[^"]*"[^>]*data-toc-level="(\d+)"[^>]*>[\s\S]*?<a href="#([^"]+)"[^>]*>[\s\S]*?<span class="toc-number">(\d+)<\/span>\s*([^<]+?)\s*<\/a>/g)].map(
    (match) => ({
      classDepth: Number(match[1]),
      depth: Number(match[2]),
      slug: match[3],
      number: Number(match[4]),
      title: decodeHtml(match[5].trim()),
    }),
  );

let withToc = 0;
let withEmpty = 0;

for (const slug of articleSlugs) {
  const jsonFile = path.join(wikiDir, slug, 'toc.json');
  const htmlFile = path.join(wikiDir, slug, 'index.html');
  assert.ok(fs.existsSync(jsonFile), `every article must have a toc.json, but /wiki/${slug}/toc.json was not built`);
  assert.ok(fs.existsSync(htmlFile), `missing built article page: /wiki/${slug}/`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const html = fs.readFileSync(htmlFile, 'utf8');
  const htmlSections = parseRenderedToc(html);

  assert.equal(typeof doc.slug, 'string', `${slug}: toc.json slug must be a string`);
  assert.equal(typeof doc.title, 'string', `${slug}: toc.json title must be a string`);
  assert.equal(doc.slug, slug, `${slug}: toc.json slug must equal the article slug`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: toc.json url must be the canonical article URL`);
  // tocJsonUrl is the endpoint's own canonical URL; infoUrl / infoJsonUrl link
  // back to the article's Page-information hub (the same self + info-hub
  // cross-links the sibling per-article JSON endpoints expose).
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/${slug}/toc.json`, `${slug}: toc.json must expose its own canonical tocJsonUrl`);
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/${slug}/info/`, `${slug}: toc.json infoUrl must point to the Page-information hub`);
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/${slug}/info.json`, `${slug}: toc.json infoJsonUrl must point to the info.json hub`);
  // historyUrl / historyJsonUrl cross-link to the article's revision history, the
  // same companion the cite/history/backlinks/references/related envelopes expose.
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/${slug}/history/`, `${slug}: toc.json historyUrl must point to the HTML history page`);
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/${slug}/history.json`, `${slug}: toc.json historyJsonUrl must point to the machine-readable history endpoint`);
  // backlinksUrl / backlinksJsonUrl cross-link to the article's What-links-here
  // endpoint, the same companion the sibling per-article JSON envelopes expose.
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/${slug}/backlinks/`, `${slug}: toc.json backlinksUrl must point to the HTML backlinks page`);
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/${slug}/backlinks.json`, `${slug}: toc.json backlinksJsonUrl must point to the machine-readable backlinks endpoint`);
  // cite / references / related cross-links complete the envelope's links to the
  // article's sibling endpoints — the full set info.json aggregates.
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/${slug}/cite/`, `${slug}: toc.json citeUrl must be canonical`);
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/${slug}/cite.json`, `${slug}: toc.json citeJsonUrl must be canonical`);
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/${slug}/cite.bib`, `${slug}: toc.json bibtexUrl must be canonical`);
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/${slug}/references.json`, `${slug}: toc.json referencesUrl must be canonical`);
  assert.equal(doc.referencesJsonUrl, `${ORIGIN}/wiki/${slug}/references.json`, `${slug}: toc.json referencesJsonUrl alias must be canonical`);
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/${slug}/related.json`, `${slug}: toc.json relatedUrl must be canonical`);
  assert.equal(doc.relatedJsonUrl, `${ORIGIN}/wiki/${slug}/related.json`, `${slug}: toc.json relatedJsonUrl alias must be canonical`);
  // tocUrl is the toc companion's own <name>Url alias — toc has no HTML page, so
  // it points at toc.json, the same convention referencesUrl / relatedUrl follow.
  assert.equal(doc.tocUrl, `${ORIGIN}/wiki/${slug}/toc.json`, `${slug}: toc.json tocUrl alias must be canonical`);
  // imageUrl is the article's own OG share-card (/og/<slug>.png).
  assert.equal(doc.imageUrl, `${ORIGIN}/og/${slug}.png`, `${slug}: toc.json imageUrl must be the article's OG share-card URL`);
  // categories must match the article's own topic categories from the slug map,
  // the same field history.json / backlinks.json expose on their envelopes.
  const expectedCategories = slugmap[slug]?.categories ?? [];
  assert.deepEqual(doc.categories, expectedCategories, `${slug}: toc.json categories must match the article's topic categories from the slug map`);
  // summary is the article's own slug-map summary (null when blank), the same
  // per-article field the listing endpoints / sibling envelopes expose.
  const expectedSummary = slugmap[slug]?.summary || null;
  assert.deepEqual(doc.summary, expectedSummary, `${slug}: toc.json summary must match the article's slug-map summary (or null)`);
  // incomingLinks is the article's published inbound-link count — the same figure
  // info.json / history.json / cite.json expose, computed via the shared helper.
  assert.equal(
    doc.incomingLinks,
    publishedInboundLinkCount(backlinksData, slug, titleBySlug),
    `${slug}: toc.json incomingLinks must match the published inbound-link count`,
  );
  assert.ok(Number.isInteger(doc.incomingLinks) && doc.incomingLinks >= 0, `${slug}: toc.json incomingLinks must be a non-negative integer`);
  const infoJsonFile = path.join(wikiDir, slug, 'info.json');
  if (fs.existsSync(infoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
    assert.equal(
      doc.incomingLinks,
      infoDoc.incomingLinks,
      `${slug}: toc.json incomingLinks must agree with the sibling info.json envelope`,
    );
  }
  // revisionCount is the article's revision count — the same figure info.json
  // and history.json expose (the length of the article's commit history).
  assert.ok(
    Number.isInteger(doc.revisionCount) && doc.revisionCount >= 0,
    `${slug}: toc.json revisionCount must be a non-negative integer`,
  );
  assert.equal(
    doc.revisionCount,
    revisionCountOf(slug),
    `${slug}: toc.json revisionCount must equal the article's commit-history length`,
  );
  if (fs.existsSync(infoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
    assert.equal(
      doc.revisionCount,
      infoDoc.revisionCount,
      `${slug}: toc.json revisionCount must agree with the sibling info.json envelope`,
    );
    assert.equal(
      doc.firstEdited,
      infoDoc.firstEdited,
      `${slug}: toc.json firstEdited must agree with the sibling info.json envelope`,
    );
    assert.equal(
      doc.lastEdited,
      infoDoc.lastEdited,
      `${slug}: toc.json lastEdited must agree with the sibling info.json envelope`,
    );
  }
  // referencesCount is the article's published outbound-reference count — the
  // same figure history.json and references.json expose, computed via the shared helper.
  assert.equal(
    doc.referencesCount,
    getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
    `${slug}: toc.json referencesCount must match the published outbound-reference count`,
  );
  assert.ok(Number.isInteger(doc.referencesCount) && doc.referencesCount >= 0, `${slug}: toc.json referencesCount must be a non-negative integer`);
  // wordCount is the article body's word count — the same figure info.json /
  // history.json / cite.json expose and the article footer renders. Cross-check
  // against the sibling info.json envelope (independent source).
  assert.ok(
    Number.isInteger(doc.wordCount) && doc.wordCount >= 0,
    `${slug}: toc.json wordCount must be a non-negative integer (got ${JSON.stringify(doc.wordCount)})`,
  );
  if (fs.existsSync(infoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
    assert.equal(
      doc.wordCount,
      infoDoc.wordCount,
      `${slug}: toc.json wordCount must agree with the sibling info.json envelope`,
    );
  }
  const wordCountAttr = html.match(/data-word-count="(\d+)"/);
  if (wordCountAttr) {
    assert.equal(
      doc.wordCount,
      Number(wordCountAttr[1]),
      `${slug}: toc.json wordCount must match the article footer's rendered data-word-count`,
    );
  }
  // readingMinutes is the ~200 wpm ceil estimate the article footer renders.
  assert.ok(
    Number.isInteger(doc.readingMinutes) && doc.readingMinutes >= 1,
    `${slug}: toc.json readingMinutes must be a positive integer`,
  );
  const readingMatch = html.match(/(\d+) min read/);
  if (readingMatch) {
    assert.equal(
      doc.readingMinutes,
      Number(readingMatch[1]),
      `${slug}: toc.json readingMinutes must match the article footer's rendered reading time`,
    );
  }
  if (fs.existsSync(infoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
    assert.equal(
      doc.readingMinutes,
      infoDoc.readingMinutes,
      `${slug}: toc.json readingMinutes must agree with the sibling info.json envelope`,
    );
  }
  const historyJsonFile = path.join(wikiDir, slug, 'history.json');
  if (fs.existsSync(historyJsonFile)) {
    const historyDoc = JSON.parse(fs.readFileSync(historyJsonFile, 'utf8'));
    assert.equal(
      doc.referencesCount,
      historyDoc.referencesCount,
      `${slug}: toc.json referencesCount must agree with the sibling history.json envelope`,
    );
  }
  const referencesJsonFile = path.join(wikiDir, slug, 'references.json');
  if (fs.existsSync(referencesJsonFile)) {
    const referencesDoc = JSON.parse(fs.readFileSync(referencesJsonFile, 'utf8'));
    assert.equal(
      doc.referencesCount,
      referencesDoc.count,
      `${slug}: toc.json referencesCount must agree with the sibling references.json envelope`,
    );
  }
  assert.equal(typeof doc.count, 'number', `${slug}: toc.json count must be a number`);
  assert.ok(Array.isArray(doc.sections), `${slug}: toc.json sections must be an array`);
  assert.equal(doc.count, doc.sections.length, `${slug}: toc.json count must equal sections.length`);
  // sectionCount mirrors info.json / history.json — the same figure as `count`.
  assert.ok(
    Number.isInteger(doc.sectionCount) && doc.sectionCount >= 0,
    `${slug}: toc.json sectionCount must be a non-negative integer`,
  );
  assert.equal(doc.sectionCount, doc.count, `${slug}: toc.json sectionCount must equal count`);
  if (fs.existsSync(infoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
    assert.equal(
      doc.sectionCount,
      infoDoc.sectionCount,
      `${slug}: toc.json sectionCount must agree with the sibling info.json envelope`,
    );
  }
  if (fs.existsSync(historyJsonFile)) {
    const historyDoc = JSON.parse(fs.readFileSync(historyJsonFile, 'utf8'));
    assert.equal(
      doc.sectionCount,
      historyDoc.sectionCount,
      `${slug}: toc.json sectionCount must agree with the sibling history.json envelope`,
    );
  }

  const normalizedHtmlSections = htmlSections.map((section) => ({
    number: section.number,
    depth: section.depth,
    slug: section.slug,
    title: section.title,
    url: `${ORIGIN}/wiki/${slug}/#${section.slug}`,
  }));

  assert.deepEqual(
    doc.sections,
    normalizedHtmlSections,
    `${slug}: toc.json sections must match the rendered contents sidebar exactly`,
  );

  for (const section of doc.sections) {
    assert.equal(typeof section.number, 'number', `${slug}: every TOC section must expose a numeric number`);
    assert.equal(typeof section.depth, 'number', `${slug}: every TOC section must expose a numeric depth`);
    assert.equal(typeof section.slug, 'string', `${slug}: every TOC section must expose a slug`);
    assert.equal(typeof section.title, 'string', `${slug}: every TOC section must expose a title`);
    assert.equal(
      section.url,
      `${ORIGIN}/wiki/${slug}/#${section.slug}`,
      `${slug}: every TOC section url must deep-link to its article heading`,
    );
    assert.ok(section.depth >= 2 && section.depth <= 4, `${slug}: TOC depth must stay within the rendered 2..4 range`);
  }

  for (const section of htmlSections) {
    assert.equal(
      section.classDepth,
      section.depth,
      `${slug}: rendered TOC class depth and data-toc-level must agree for ${section.slug}`,
    );
  }

  if (doc.count > 0) withToc++;
  else withEmpty++;
}

assert.ok(withToc > 0, 'expected at least one article with a rendered contents sidebar');
// The helper's empty-TOC contract is unit-tested above. When every published
// article has 2+ visible headings, none omit the contents sidebar.
if (withEmpty === 0) {
  assert.equal(
    withToc,
    articleSlugs.length,
    'when every article renders a contents sidebar, toc.json must be built for all of them',
  );
}

console.log(
  `TOC JSON check passed (${articleSlugs.length} articles: ${withToc} with a contents sidebar, ${withEmpty} without; shared-runtime parity verified)`,
);
