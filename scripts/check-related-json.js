import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleRelatedPages, getRelatedPages } from '../src/lib/related-pages.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const categoriesFile = path.join(projectRoot, 'public', 'data', 'categories.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const ORIGIN = 'https://taopedia.org';

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

  const doc = buildArticleRelatedPages({
    slug: 'source',
    title: 'Source',
    origin: ORIGIN,
    relatedPages,
  });
  assert.equal(doc.slug, 'source', 'builder: slug field');
  assert.equal(doc.title, 'Source', 'builder: title field');
  assert.equal(doc.url, `${ORIGIN}/wiki/source/`, 'builder: url field');
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/source/related.json`, 'builder: relatedUrl self field');
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
  assert.equal(doc.count, 3, 'builder: count field');
  assert.deepEqual(
    doc.related,
    [
      {
        slug: 'alpha',
        title: 'Subnet 2',
        summary: 'alpha summary',
        tags: ['Security'],
        url: `${ORIGIN}/wiki/alpha/`,
        infoUrl: `${ORIGIN}/wiki/alpha/info/`,
        backlinksUrl: `${ORIGIN}/wiki/alpha/backlinks/`,
        historyUrl: `${ORIGIN}/wiki/alpha/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/alpha/history.json`,
      },
      {
        slug: 'gamma',
        title: 'Subnet 9',
        summary: null,
        tags: ['Security'],
        url: `${ORIGIN}/wiki/gamma/`,
        infoUrl: `${ORIGIN}/wiki/gamma/info/`,
        backlinksUrl: `${ORIGIN}/wiki/gamma/backlinks/`,
        historyUrl: `${ORIGIN}/wiki/gamma/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/gamma/history.json`,
      },
      {
        slug: 'delta',
        title: 'Delta',
        summary: 'delta summary',
        tags: ['Consensus'],
        url: `${ORIGIN}/wiki/delta/`,
        infoUrl: `${ORIGIN}/wiki/delta/info/`,
        backlinksUrl: `${ORIGIN}/wiki/delta/backlinks/`,
        historyUrl: `${ORIGIN}/wiki/delta/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/delta/history.json`,
      },
    ],
    'builder: related entry shape',
  );

  const empty = buildArticleRelatedPages({ slug: 'orphan', title: 'Orphan', origin: ORIGIN });
  assert.equal(empty.count, 0, 'builder: empty count is 0');
  assert.deepEqual(empty.related, [], 'builder: empty related array is []');
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
  });
  const expectedDoc = buildArticleRelatedPages({
    slug,
    title: titleBySlug[slug],
    origin: ORIGIN,
    relatedPages: expectedRelatedPages,
  });

  assert.equal(typeof doc.slug, 'string', `${slug}: related.json slug must be a string`);
  assert.equal(typeof doc.title, 'string', `${slug}: related.json title must be a string`);
  assert.equal(doc.slug, slug, `${slug}: related.json slug must equal the article slug`);
  assert.equal(doc.title, titleBySlug[slug], `${slug}: related.json title must equal the article title`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: related.json url must be the canonical article URL`);
  assert.equal(
    doc.relatedUrl,
    `${ORIGIN}/wiki/${slug}/related.json`,
    `${slug}: related.json must expose its own canonical relatedUrl`,
  );
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
    assert.ok(Array.isArray(entry.tags), `${slug}: every related entry must expose tags as an array`);
    assert.ok(entry.tags.length <= 2, `${slug}: related entry ${entry.slug} must expose at most two tags`);
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
