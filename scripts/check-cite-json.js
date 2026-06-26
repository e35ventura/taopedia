import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getArticleReferences } from '../src/lib/article-references.js';
import { buildCiteJson } from './cite-json.js';
import { buildCitations, CITATION_FORMATS, CITATION_META } from './citations.js';
import { publishedInboundLinkCount } from './most-linked.js';
import {
  wikiArticleHref,
  wikiCompanionFileHref,
  wikiCompanionHref,
  wikiCompanionJsonHref,
} from '../src/lib/wiki-article-path.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const ORIGIN = 'https://taopedia.org';
const CITE_KEYS = CITATION_FORMATS.map((format) => format.key);

{
  const dated = buildCitations({
    title: 'Yuma Consensus',
    url: 'https://taopedia.org/wiki/yuma_consensus/',
    slug: 'yuma_consensus',
    date: '2024-06-01T12:00:00.000Z',
  });
  assert.equal(dated.apa, 'Taopedia contributors. (2024, June 1). Yuma Consensus. Taopedia. https://taopedia.org/wiki/yuma_consensus/');
  assert.equal(dated.mla, '"Yuma Consensus." Taopedia, 1 June 2024, https://taopedia.org/wiki/yuma_consensus/.');
  assert.equal(dated.bibtex.split('\n')[0], '@misc{taopedia:yuma_consensus,');

  const undated = buildCitations({
    title: 'Yuma Consensus',
    url: 'https://taopedia.org/wiki/yuma_consensus/',
    slug: 'yuma_consensus',
    date: '',
  });
  assert.ok(undated.apa.includes('(n.d.)'), 'APA must use (n.d.) when there is no date');
  assert.ok(!/year\s*=/.test(undated.bibtex), 'BibTeX must omit the year field when there is no date');

  const tricky = buildCitations({
    title: 'A "Quoted" \\ Title {x}',
    url: 'https://taopedia.org/wiki/x/',
    slug: 'x',
    date: '',
  });
  assert.ok(
    tricky.bibtex.includes('  title        = {A "Quoted" \\textbackslash{} Title \\{x\\} --- Taopedia},'),
    'BibTeX title must brace-delimit and escape \\, { and } while leaving a literal quote intact',
  );
}

// ---- Unit: buildCiteJson envelope shape ------------------------------------
{
  const doc = buildCiteJson({
    title: 'Yuma Consensus',
    slug: 'yuma_consensus',
    origin: ORIGIN,
    summary: 'Bittensor consensus.',
    categories: ['Consensus'],
    incomingLinks: 4,
    referencesCount: 7,
    sectionCount: 5,
    wordCount: 420,
    revisionCount: 3,
    firstEdited: '2024-01-01T00:00:00.000Z',
    lastEdited: '2024-06-01T12:00:00.000Z',
    date: '2024-06-01T12:00:00.000Z',
  });
  assert.equal(doc.title, 'Yuma Consensus', 'builder: title');
  assert.equal(doc.slug, 'yuma_consensus', 'builder: slug');
  assert.equal(doc.summary, 'Bittensor consensus.', 'builder: summary');
  assert.equal(doc.url, `${ORIGIN}/wiki/yuma_consensus/`, 'builder: url');
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/yuma_consensus/cite.json`, 'builder: citeJsonUrl self-link');
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/yuma_consensus/cite/`, 'builder: citeUrl');
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/yuma_consensus/cite.bib`, 'builder: bibtexUrl');
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/yuma_consensus/history/`, 'builder: historyUrl');
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/yuma_consensus/history.json`, 'builder: historyJsonUrl');
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/yuma_consensus/backlinks/`, 'builder: backlinksUrl');
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/yuma_consensus/backlinks.json`, 'builder: backlinksJsonUrl');
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/yuma_consensus/info/`, 'builder: infoUrl');
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/yuma_consensus/info.json`, 'builder: infoJsonUrl');
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/yuma_consensus/toc.json`, 'builder: tocJsonUrl');
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/yuma_consensus/references.json`, 'builder: referencesUrl');
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/yuma_consensus/related.json`, 'builder: relatedUrl');
  assert.equal(doc.referencesJsonUrl, `${ORIGIN}/wiki/yuma_consensus/references.json`, 'builder: referencesJsonUrl alias');
  assert.equal(doc.relatedJsonUrl, `${ORIGIN}/wiki/yuma_consensus/related.json`, 'builder: relatedJsonUrl alias');
  assert.equal(doc.referencesJsonUrl, doc.referencesUrl, 'builder: referencesJsonUrl must equal referencesUrl');
  assert.equal(doc.relatedJsonUrl, doc.relatedUrl, 'builder: relatedJsonUrl must equal relatedUrl');
  assert.equal(doc.imageUrl, `${ORIGIN}/og/yuma_consensus.png`, 'builder: imageUrl');
  assert.deepEqual(doc.categories, ['Consensus'], 'builder: categories');
  assert.equal(doc.incomingLinks, 4, 'builder: incomingLinks');
  assert.equal(doc.referencesCount, 7, 'builder: referencesCount');
  assert.equal(doc.sectionCount, 5, 'builder: sectionCount');
  assert.equal(doc.wordCount, 420, 'builder: wordCount');
  assert.equal(doc.readingMinutes, 3, 'builder: readingMinutes from wordCount (ceil(420/200))');
  assert.equal(doc.revisionCount, 3, 'builder: revisionCount');
  assert.equal(doc.firstEdited, '2024-01-01T00:00:00.000Z', 'builder: firstEdited');
  assert.equal(doc.lastEdited, '2024-06-01T12:00:00.000Z', 'builder: lastEdited');
  assert.equal(doc.date, '2024-06-01T12:00:00.000Z', 'builder: date when history exists');
  assert.equal(doc.author, CITATION_META.author, 'builder: author from CITATION_META');
  assert.equal(doc.publisher, CITATION_META.publisher, 'builder: publisher from CITATION_META');
  assert.deepEqual(Object.keys(doc.citations), CITE_KEYS, 'builder: citations keys');
  assert.equal(
    doc.citations.apa,
    buildCitations({
      title: 'Yuma Consensus',
      url: `${ORIGIN}/wiki/yuma_consensus/`,
      slug: 'yuma_consensus',
      date: '2024-06-01T12:00:00.000Z',
    }).apa,
    'builder: citations.apa must match buildCitations()',
  );

  const undated = buildCiteJson({ title: 'Orphan', slug: 'orphan', origin: ORIGIN });
  assert.equal(undated.summary, null, 'builder: default summary is null');
  assert.deepEqual(undated.categories, [], 'builder: default categories is []');
  assert.equal(undated.incomingLinks, 0, 'builder: default incomingLinks is 0');
  assert.equal(undated.referencesCount, 0, 'builder: default referencesCount is 0');
  assert.equal(undated.sectionCount, 0, 'builder: default sectionCount is 0');
  assert.equal(undated.wordCount, 0, 'builder: default wordCount is 0');
  assert.equal(undated.readingMinutes, 1, 'builder: default readingMinutes is 1');
  assert.equal(undated.revisionCount, 0, 'builder: default revisionCount is 0');
  assert.equal(undated.firstEdited, null, 'builder: default firstEdited is null');
  assert.equal(undated.lastEdited, null, 'builder: default lastEdited is null');
  assert.ok(!('date' in undated), 'builder: undated article must omit date key');

  // Non-finite counts coerce to 0 across all count fields — matching the
  // info.json sibling — so cite.json's numeric fields are never emitted as JSON null.
  const nonFinite = buildCiteJson({ title: 'NF', slug: 'nf', origin: ORIGIN, incomingLinks: NaN, referencesCount: Infinity, revisionCount: NaN, sectionCount: NaN, wordCount: -Infinity });
  assert.equal(nonFinite.incomingLinks, 0, 'builder: non-finite incomingLinks coerces to 0');
  assert.equal(nonFinite.referencesCount, 0, 'builder: non-finite referencesCount coerces to 0');
  assert.equal(nonFinite.revisionCount, 0, 'builder: non-finite revisionCount coerces to 0');
  assert.equal(nonFinite.sectionCount, 0, 'builder: non-finite sectionCount coerces to 0');
  assert.equal(nonFinite.wordCount, 0, 'builder: non-finite wordCount coerces to 0');

  const deduped = buildCiteJson({
    title: 'Dup',
    slug: 'dup',
    origin: ORIGIN,
    categories: ['Mining', 'Consensus', 'Mining'],
  });
  assert.deepEqual(
    deduped.categories,
    ['Mining', 'Consensus'],
    'builder: repeated frontmatter categories must be deduped while preserving first-seen order',
  );
}

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, meta]) => [slug, typeof meta?.title === 'string' ? meta.title : slug]),
);

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

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const htmlCiteText = (html, key) => {
  const m = html.match(new RegExp(`<pre[^>]*data-cite="${key}"[^>]*>([\\s\\S]*?)</pre>`));
  return m ? decode(m[1]) : null;
};

const lastRevisionOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return '';
  const history = JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
  return typeof history[0]?.date === 'string' ? history[0].date : '';
};

const revisionCountOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return 0;
  const history = JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
  return Array.isArray(history) ? history.length : 0;
};

let datedVerified = 0;
let undatedVerified = 0;
for (const slug of articleSlugs) {
  const jsonFile = path.join(wikiDir, slug, 'cite.json');
  const bibFile = path.join(wikiDir, slug, 'cite.bib');
  assert.ok(fs.existsSync(jsonFile), `every article must have a cite.json, but /wiki/${slug}/cite.json was not built`);
  assert.ok(fs.existsSync(bibFile), `every article must have a cite.bib, but /wiki/${slug}/cite.bib was not built`);

  const title = slugmap[slug]?.title;
  assert.ok(title, `slugmap is missing a title for ${slug}`);
  const date = lastRevisionOf(slug);
  const url = wikiArticleHref(ORIGIN, slug);
  const expected = buildCitations({ title, url, slug, date });

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  assert.equal(doc.title, title, `cite.json title must equal the article title for ${slug}`);
  assert.equal(doc.slug, slug, `cite.json slug must equal ${slug}`);
  assert.equal(doc.url, url, `cite.json url must be the canonical trailing-slash article URL for ${slug}`);
  assert.equal(
    doc.citeJsonUrl,
    wikiCompanionJsonHref(ORIGIN, slug, 'cite'),
    `cite.json citeJsonUrl must point at the canonical JSON citation endpoint for ${slug}`,
  );
  assert.equal(
    doc.citeUrl,
    wikiCompanionHref(ORIGIN, slug, 'cite'),
    `cite.json citeUrl must point at the sibling HTML cite page for ${slug}`,
  );
  assert.equal(
    doc.bibtexUrl,
    wikiCompanionFileHref(ORIGIN, slug, 'cite.bib'),
    `cite.json bibtexUrl must point at the sibling cite.bib export for ${slug}`,
  );
  assert.equal(
    doc.historyUrl,
    wikiCompanionHref(ORIGIN, slug, 'history'),
    `cite.json historyUrl must point at the sibling HTML history page for ${slug}`,
  );
  // historyJsonUrl is the JSON companion of historyUrl — cite.json already
  // pairs citeUrl with citeJsonUrl, and /wiki/<slug>/history.json exists and is
  // exposed by recentchanges.json / subnets.json, so expose it here too.
  assert.equal(
    doc.historyJsonUrl,
    wikiCompanionJsonHref(ORIGIN, slug, 'history'),
    `cite.json historyJsonUrl must point at the sibling machine-readable history endpoint for ${slug}`,
  );
  assert.equal(
    doc.backlinksUrl,
    wikiCompanionHref(ORIGIN, slug, 'backlinks'),
    `cite.json backlinksUrl must point at the sibling HTML backlinks page for ${slug}`,
  );
  // backlinksJsonUrl is the JSON companion of backlinksUrl — cite.json already
  // pairs citeUrl/citeJsonUrl and historyUrl/historyJsonUrl, and
  // /wiki/<slug>/backlinks.json exists and is exposed by recentchanges.json /
  // subnets.json, so pair backlinksUrl with its machine-readable companion too.
  assert.equal(
    doc.backlinksJsonUrl,
    wikiCompanionJsonHref(ORIGIN, slug, 'backlinks'),
    `cite.json backlinksJsonUrl must point at the sibling machine-readable backlinks endpoint for ${slug}`,
  );
  assert.equal(
    doc.infoUrl,
    wikiCompanionHref(ORIGIN, slug, 'info'),
    `cite.json infoUrl must point at the sibling HTML info page for ${slug}`,
  );
  assert.equal(
    doc.infoJsonUrl,
    wikiCompanionJsonHref(ORIGIN, slug, 'info'),
    `cite.json infoJsonUrl must point at the sibling machine-readable info endpoint for ${slug}`,
  );
  assert.equal(
    doc.tocJsonUrl,
    wikiCompanionJsonHref(ORIGIN, slug, 'toc'),
    `cite.json tocJsonUrl must point at the article's machine-readable table-of-contents endpoint for ${slug}`,
  );
  assert.equal(
    doc.referencesUrl,
    wikiCompanionJsonHref(ORIGIN, slug, 'references'),
    `cite.json referencesUrl must point at the sibling references.json endpoint for ${slug}`,
  );
  assert.equal(
    doc.relatedUrl,
    wikiCompanionJsonHref(ORIGIN, slug, 'related'),
    `cite.json relatedUrl must point at the sibling related.json endpoint for ${slug}`,
  );
  assert.equal(
    doc.referencesJsonUrl,
    wikiCompanionJsonHref(ORIGIN, slug, 'references'),
    `cite.json referencesJsonUrl must point at the sibling references.json endpoint for ${slug}`,
  );
  assert.equal(doc.referencesJsonUrl, doc.referencesUrl, `cite.json referencesJsonUrl must equal referencesUrl for ${slug}`);
  assert.equal(
    doc.relatedJsonUrl,
    wikiCompanionJsonHref(ORIGIN, slug, 'related'),
    `cite.json relatedJsonUrl must point at the sibling related.json endpoint for ${slug}`,
  );
  assert.equal(doc.relatedJsonUrl, doc.relatedUrl, `cite.json relatedJsonUrl must equal relatedUrl for ${slug}`);
  // imageUrl is the article's own OG share-card (/og/<slug>.png), the same
  // companion the info/history/toc/references/backlinks/related envelopes expose.
  assert.equal(
    doc.imageUrl,
    `${ORIGIN}/og/${slug}.png`,
    `cite.json imageUrl must be the article's OG share-card URL for ${slug}`,
  );
  // categories must match the article's own topic categories from the slug map,
  // the same field history.json / backlinks.json / toc.json / references.json
  // expose on their envelopes.
  const expectedCategories = [...new Set(slugmap[slug]?.categories ?? [])];
  assert.deepEqual(
    doc.categories,
    expectedCategories,
    `cite.json categories must match the article's topic categories from the slug map for ${slug}`,
  );
  // summary is the article's own slug-map summary (null when blank), the same
  // per-article field the sibling envelopes (backlinks/toc/references) expose.
  const expectedSummary = slugmap[slug]?.summary || null;
  assert.deepEqual(
    doc.summary,
    expectedSummary,
    `cite.json summary must match the article's slug-map summary (or null) for ${slug}`,
  );
  // incomingLinks is the article's published inbound-link count — the same figure
  // info.json and history.json expose, computed via the shared helper.
  assert.equal(
    doc.incomingLinks,
    publishedInboundLinkCount(backlinksData, slug, titleBySlug),
    `cite.json incomingLinks must match the published inbound-link count for ${slug}`,
  );
  assert.ok(Number.isInteger(doc.incomingLinks) && doc.incomingLinks >= 0, `cite.json incomingLinks must be a non-negative integer for ${slug}`);
  // revisionCount is the article's revision count — the same figure info.json
  // and history.json expose (the length of the article's commit history).
  // Re-derive it from the raw history file (independent source) so it can't drift.
  assert.ok(
    Number.isInteger(doc.revisionCount) && doc.revisionCount >= 0,
    `cite.json revisionCount must be a non-negative integer for ${slug}`,
  );
  assert.equal(
    doc.revisionCount,
    revisionCountOf(slug),
    `cite.json revisionCount must equal the article's commit-history length for ${slug}`,
  );
  // referencesCount is the article's published outbound-reference count — the
  // same figure history.json and references.json expose, computed via the shared helper.
  assert.equal(
    doc.referencesCount,
    getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
    `cite.json referencesCount must match the published outbound-reference count for ${slug}`,
  );
  assert.ok(Number.isInteger(doc.referencesCount) && doc.referencesCount >= 0, `cite.json referencesCount must be a non-negative integer for ${slug}`);
  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count`, derived from the shared getArticleToc helper.
  assert.ok(Number.isInteger(doc.sectionCount) && doc.sectionCount >= 0, `cite.json sectionCount must be a non-negative integer for ${slug}`);
  const tocJsonFile = path.join(wikiDir, slug, 'toc.json');
  if (fs.existsSync(tocJsonFile)) {
    const tocDoc = JSON.parse(fs.readFileSync(tocJsonFile, 'utf8'));
    assert.equal(
      doc.sectionCount,
      tocDoc.count,
      `cite.json sectionCount must agree with the sibling toc.json envelope for ${slug}`,
    );
  }
  // wordCount is the article body's word count — the same figure info.json /
  // history.json expose and the article footer renders. Cross-check against the
  // sibling info.json envelope (independent source).
  assert.ok(Number.isInteger(doc.wordCount) && doc.wordCount >= 0, `cite.json wordCount must be a non-negative integer for ${slug}`);
  const citeInfoJsonFile = path.join(wikiDir, slug, 'info.json');
  if (fs.existsSync(citeInfoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(citeInfoJsonFile, 'utf8'));
    assert.equal(
      doc.wordCount,
      infoDoc.wordCount,
      `cite.json wordCount must agree with the sibling info.json envelope for ${slug}`,
    );
    assert.ok(
      Number.isInteger(doc.readingMinutes) && doc.readingMinutes >= 1,
      `cite.json readingMinutes must be a positive integer for ${slug}`,
    );
    assert.equal(
      doc.readingMinutes,
      infoDoc.readingMinutes,
      `cite.json readingMinutes must agree with the sibling info.json envelope for ${slug}`,
    );
  }
  const citeArticleHtmlFile = path.join(wikiDir, slug, 'index.html');
  if (fs.existsSync(citeArticleHtmlFile)) {
    const articleHtml = fs.readFileSync(citeArticleHtmlFile, 'utf8');
    const readingMatch = articleHtml.match(/(\d+) min read/);
    if (readingMatch) {
      assert.equal(
        doc.readingMinutes,
        Number(readingMatch[1]),
        `cite.json readingMinutes must match the article footer's rendered reading time for ${slug}`,
      );
    }
  }
  const historyJsonFile = path.join(wikiDir, slug, 'history.json');
  if (fs.existsSync(historyJsonFile)) {
    const historyDoc = JSON.parse(fs.readFileSync(historyJsonFile, 'utf8'));
    assert.equal(
      doc.referencesCount,
      historyDoc.referencesCount,
      `cite.json referencesCount must agree with the sibling history.json envelope for ${slug}`,
    );
  }
  const referencesJsonFile = path.join(wikiDir, slug, 'references.json');
  if (fs.existsSync(referencesJsonFile)) {
    const referencesDoc = JSON.parse(fs.readFileSync(referencesJsonFile, 'utf8'));
    assert.equal(
      doc.referencesCount,
      referencesDoc.count,
      `cite.json referencesCount must agree with the sibling references.json envelope for ${slug}`,
    );
  }
  const infoJsonFile = path.join(wikiDir, slug, 'info.json');
  if (fs.existsSync(infoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
    assert.equal(
      doc.incomingLinks,
      infoDoc.incomingLinks,
      `cite.json incomingLinks must agree with the sibling info.json envelope for ${slug}`,
    );
    assert.equal(
      doc.revisionCount,
      infoDoc.revisionCount,
      `cite.json revisionCount must agree with the sibling info.json envelope for ${slug}`,
    );
    // firstEdited / lastEdited bracket the revision history — the same pair
    // info.json exposes; they must agree with the sibling envelope. The keys must
    // ALWAYS be present as a string date or null (never omitted): a dateless
    // history entry accessed without optional chaining yields `undefined`, which
    // JSON.stringify drops, silently breaking this string|null contract.
    assert.ok(
      'firstEdited' in doc && (doc.firstEdited === null || typeof doc.firstEdited === 'string'),
      `cite.json firstEdited must always be present as a string date or null for ${slug} (got ${JSON.stringify(doc.firstEdited)})`,
    );
    assert.ok(
      'lastEdited' in doc && (doc.lastEdited === null || typeof doc.lastEdited === 'string'),
      `cite.json lastEdited must always be present as a string date or null for ${slug} (got ${JSON.stringify(doc.lastEdited)})`,
    );
    assert.equal(
      doc.firstEdited,
      infoDoc.firstEdited,
      `cite.json firstEdited must agree with the sibling info.json envelope for ${slug}`,
    );
    assert.equal(
      doc.lastEdited,
      infoDoc.lastEdited,
      `cite.json lastEdited must agree with the sibling info.json envelope for ${slug}`,
    );
  }
  if (date) {
    assert.equal(doc.date, date, `cite.json date must equal the article's last-revision date for ${slug}`);
  } else {
    assert.ok(!('date' in doc), `cite.json must omit date when ${slug} has no recorded history`);
  }
  assert.equal(doc.author, CITATION_META.author, `cite.json author must be "${CITATION_META.author}" for ${slug}`);
  assert.equal(doc.publisher, CITATION_META.publisher, `cite.json publisher must be "${CITATION_META.publisher}" for ${slug}`);
  assert.ok(doc.citations && typeof doc.citations === 'object', `cite.json must carry a citations object for ${slug}`);
  assert.deepEqual(Object.keys(doc.citations), CITE_KEYS, `cite.json citations must carry exactly [${CITE_KEYS.join(', ')}] for ${slug}`);

  const html = fs.readFileSync(path.join(wikiDir, slug, 'cite', 'index.html'), 'utf8');
  assert.ok(
    html.includes(`href="/wiki/${slug}/history/"`),
    `/wiki/${slug}/cite/ toolbar must link to the article history page`,
  );
  assert.ok(
    html.includes(`href="/wiki/${slug}/backlinks/"`),
    `/wiki/${slug}/cite/ toolbar must link to the article backlinks page`,
  );
  for (const key of CITE_KEYS) {
    assert.equal(doc.citations[key], expected[key], `cite.json ${key.toUpperCase()} must equal buildCitations() for ${slug}`);
    assert.equal(
      htmlCiteText(html, key),
      expected[key],
      `the HTML cite page ${key.toUpperCase()} must equal buildCitations() for ${slug} (JSON/HTML parity)`,
    );
  }

  const bib = fs.readFileSync(bibFile, 'utf8');
  assert.equal(bib, `${expected.bibtex}\n`, `cite.bib must be the BibTeX entry with a trailing newline for ${slug}`);

  if (date) datedVerified++;
  else undatedVerified++;
}
assert.ok(datedVerified > 0, 'expected at least one article with a revision date to verify a dated citation');

console.log(
  `Cite export check passed (${articleSlugs.length} articles: ${datedVerified} dated, ${undatedVerified} undated; cite.json + cite.bib verified against buildCitations() and the HTML cite page)`,
);
