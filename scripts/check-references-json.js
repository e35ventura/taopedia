import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildArticleReferences, getArticleReferences } from '../src/lib/article-references.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const ORIGIN = 'https://taopedia.org';

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

  const doc = buildArticleReferences({ slug: 'source', title: 'Source', origin: ORIGIN, references });
  assert.equal(doc.slug, 'source', 'builder: slug field');
  assert.equal(doc.title, 'Source', 'builder: title field');
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
  assert.equal(doc.count, 4, 'builder: count field');
  assert.deepEqual(
    doc.references,
    [
      {
        slug: 'delta',
        title: 'Delta',
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
      },
      {
        slug: 'alpha',
        title: 'Subnet 2',
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
      },
      {
        slug: 'gamma',
        title: 'Subnet 9',
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
      },
      {
        slug: 'beta',
        title: 'Subnet 10',
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
      },
    ],
    'builder: reference entry shape',
  );

  const empty = buildArticleReferences({ slug: 'orphan', title: 'Orphan', origin: ORIGIN });
  assert.equal(empty.count, 0, 'builder: empty count is 0');
  assert.deepEqual(empty.references, [], 'builder: empty references is []');
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
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
  }

  if (doc.count > 0) withReferences++;
  else withEmpty++;
}

assert.ok(withReferences > 0, 'expected at least one article with outbound references to verify correctness');
assert.ok(withEmpty > 0, 'expected at least one article with no outbound references to verify the empty state');

console.log(
  `References JSON check passed (${articleSlugs.length} articles: ${withReferences} with outbound references, ${withEmpty} with none; ground-truth parity verified)`,
);
