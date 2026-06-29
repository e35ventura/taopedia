import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSubnets } from './subnets.js';
import { publishedInboundLinkCount } from './most-linked.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { uniqueFeedCategories } from '../src/lib/feed-categories.js';

// /wiki/special/subnets.json exposes the by-netuid subnet registry as
// structured JSON for programmatic consumers. The contract is load-bearing: a
// malformed response, a wrong netuid, a non-deterministic order, or a JSON that
// disagrees with the HTML page's parsing would silently break every downstream
// consumer. This check guards all of those:
//   1) Unit-tests buildSubnets with constructed inputs (catches builder
//      regressions before the site is rendered).
//   2) Verifies the netuid parser rejects non-subnet titles and bare "Subnet <n>"
//      titles (those render as normal titles, not as a netuid/name split).
//   3) Verifies the netuid sort is numeric ascending (Subnet 1 before Subnet 10).
//   4) Re-derives the expected registry from public/data/slugmap.json and
//      asserts the built JSON matches it field-for-field (count, order,
//      membership, netuid, name, slug, url).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildSubnets with constructed inputs ----------------------
{
  const pages = [
    { id: 'subnet_1/index.mdx', data: { title: 'Subnet 1: Apex', summary: 'apex subnet' } },
    { id: 'subnet_10/index.mdx', data: { title: 'Subnet 10: Sturdy', summary: '' } },
    { id: 'subnet_86/index.mdx', data: { title: 'Subnet 86: ⚒', summary: 'forge subnet' } },
    { id: 'yuma/index.mdx', data: { title: 'Yuma Consensus', summary: 'consensus' } },
    { id: 'subnets/index.mdx', data: { title: 'Subnet', summary: 'concept article' } },
  ];
  const out = buildSubnets({
    pages,
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  // "Subnet <n>: <name>" titles become subnets; "Subnet" alone and "Yuma
  // Consensus" don't match the pattern at all.
  assert.deepEqual(
    out.map((s) => s.slug),
    ['subnet_1', 'subnet_10', 'subnet_86'],
    'only "Subnet <n>: <name>" titles (not "Subnet" alone) are subnets',
  );
  assert.deepEqual(
    out.map((s) => s.netuid),
    [1, 10, 86],
    'subnets are sorted by netuid ascending (numeric, not lexicographic)',
  );
  assert.equal(out[0].name, 'Apex');
  assert.equal(out[1].name, 'Sturdy');
  assert.equal(out[2].name, '⚒', 'emoji name passes through (matches the HTML page)');
  assert.equal(out[1].summary, '');
  assert.deepEqual(out[0].categories, [], 'categories defaults to [] when not present');
}

// Categories pass through from page data.
{
  const out = buildSubnets({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Subnet 1: Apex', categories: ['Subnets'] } },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  assert.deepEqual(out[0].categories, ['Subnets'], 'categories pass through from page data');
}

// Repeated frontmatter categories must be deduped while preserving first-seen order.
{
  const out = buildSubnets({
    pages: [
      {
        id: 'a/index.mdx',
        data: { title: 'Subnet 1: Apex', categories: ['Subnets', 'Mining', 'Subnets'] },
      },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  assert.deepEqual(
    out[0].categories,
    ['Subnets', 'Mining'],
    'repeated frontmatter categories must be deduped in subnets.json rows',
  );
}

// Whitespace tolerance around the colon (the HTML page's regex accepts `\s*`).
{
  const out = buildSubnets({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Subnet 12:   TAO Private Network', summary: '' } },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'TAO Private Network', 'whitespace around the colon is trimmed');
}

// Bare "Subnet <n>" titles (no colon) match the regex too — the HTML page
// renders them as a normal subnet row with the name falling back to
// "Subnet <n>", so the builder must include them with the same fallback name.
{
  const out = buildSubnets({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Subnet 86', summary: '' } },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  assert.equal(out.length, 1, 'bare "Subnet <n>" titles are included with a fallback name');
  assert.equal(out[0].netuid, 86);
  assert.equal(out[0].name, 'Subnet 86', 'fallback name matches the HTML page');
}

// Empty input edge cases.
{
  assert.deepEqual(buildSubnets({ pages: [], getPageSlug: () => '' }), [], 'empty pages yields empty subnets');
  assert.deepEqual(
    buildSubnets({ pages: undefined, getPageSlug: undefined }),
    [],
    'missing inputs must not crash',
  );
}

// Missing summary normalizes to empty string (the JSON endpoint turns it into null).
{
  const out = buildSubnets({
    pages: [{ id: 'a/index.mdx', data: { title: 'Subnet 1: Apex' } }],
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  assert.equal(out[0].summary, '');
}

// ---- 2) Built output: validate against the slug map ---------------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'subnets.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/subnets.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const backlinks = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const titleBySlug = Object.fromEntries(Object.entries(slugmap).map(([slug, entry]) => [slug, entry.title]));
// linkgraph drives referencesCount (the published OUTBOUND reference count),
// re-derived with the same getArticleReferences helper the endpoint uses.
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const outboundCountFor = (slug) => getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;

// site — non-empty URL/origin string.
assert.ok(
  typeof data.site === 'string' && /^https?:\/\//.test(data.site),
  `site must be a non-empty URL string (got ${JSON.stringify(data.site)})`,
);

// url — the registry's own canonical endpoint URL (kept for back-compat).
assert.equal(
  data.url,
  `${data.site}/wiki/special/subnets.json`,
  `url must be the canonical subnets.json endpoint URL (got ${JSON.stringify(data.url)})`,
);

// subnetsJsonUrl — the same canonical self-link under the consistent
// <name>JsonUrl key every sibling special-listing endpoint uses
// (categoriesJsonUrl, allpagesJsonUrl, mostlinkedpagesJsonUrl,
// recentchangesJsonUrl, statisticsJsonUrl). It must equal `url`.
assert.equal(
  data.subnetsJsonUrl,
  `${data.site}/wiki/special/subnets.json`,
  `subnetsJsonUrl must be the canonical subnets.json endpoint URL (got ${JSON.stringify(data.subnetsJsonUrl)})`,
);
assert.equal(data.subnetsJsonUrl, data.url, 'subnetsJsonUrl must match the back-compat url field');

// count field.
assert.ok(typeof data.count === 'number' && data.count > 0, `count must be a positive number (got ${data.count})`);
assert.equal(data.count, data.subnets.length, 'count must equal subnets.length');

// subnets — non-empty array.
assert.ok(Array.isArray(data.subnets), 'subnets must be an array');
assert.ok(data.subnets.length > 0, 'subnets.json must list at least one subnet');

// Re-derive the expected registry from the slug map. Every entry whose title
// matches "Subnet <n>: <name>" should appear exactly once in the JSON, in
// numeric-netuid ascending order, with every per-row field agreeing.
const expected = buildSubnets({
  pages: Object.entries(slugmap).map(([slug, entry]) => ({
    id: `${slug}/index.mdx`,
    data: { title: entry.title, summary: entry.summary ?? '', categories: entry.categories ?? [] },
  })),
  getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
});

assert.equal(data.subnets.length, expected.length, `subnets.json must list all ${expected.length} subnets (got ${data.subnets.length})`);

data.subnets.forEach((row, i) => {
  assert.equal(row.netuid, expected[i].netuid, `row ${i} netuid must match the slug-map-derived registry`);
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the slug-map-derived registry`);
  assert.equal(row.name, expected[i].name, `row ${i} name must match the slug-map-derived registry`);
  assert.ok(
    row.url.startsWith(`${data.site}/wiki/`),
    `row ${i} url must be absolute and start with the envelope site (got ${row.url})`,
  );
  assert.equal(
    row.url,
    `${data.site}/wiki/${expected[i].slug}/`,
    `row ${i} url must equal ${data.site}/wiki/${expected[i].slug}/`,
  );
  // infoUrl points at the subnet article's Page-information page, so a registry
  // consumer can reach a subnet's metadata overview without rebuilding the route.
  assert.equal(
    row.infoUrl,
    `${data.site}/wiki/${expected[i].slug}/info/`,
    `row ${i} infoUrl must equal ${data.site}/wiki/${expected[i].slug}/info/`,
  );
  assert.equal(
    row.infoJsonUrl,
    `${data.site}/wiki/${expected[i].slug}/info.json`,
    `row ${i} infoJsonUrl must equal ${data.site}/wiki/${expected[i].slug}/info.json`,
  );
  // historyUrl points at the subnet article's revision-history page, the same
  // companion recentchanges.json exposes per change, so a registry/monitoring
  // consumer can reach a subnet's edit history without rebuilding the route.
  assert.equal(
    row.historyUrl,
    `${data.site}/wiki/${expected[i].slug}/history/`,
    `row ${i} historyUrl must equal ${data.site}/wiki/${expected[i].slug}/history/`,
  );
  // historyJsonUrl is the JSON companion of historyUrl — the same HTML+JSON
  // pairing the entry already exposes for backlinks (backlinksUrl +
  // backlinksJsonUrl) and that recentchanges.json exposes for history. The
  // /wiki/<slug>/history.json endpoint exists, so a consumer can fetch a
  // subnet's machine-readable revision history without rebuilding the route.
  assert.equal(
    row.historyJsonUrl,
    `${data.site}/wiki/${expected[i].slug}/history.json`,
    `row ${i} historyJsonUrl must equal ${data.site}/wiki/${expected[i].slug}/history.json`,
  );
  // backlinksUrl / backlinksJsonUrl point at the subnet article's
  // What-links-here page and its machine-readable companion, the same per-entry
  // companions mostlinkedpages.json exposes, so a consumer of the registry can
  // see what references each subnet without reconstructing the route.
  assert.equal(
    row.backlinksUrl,
    `${data.site}/wiki/${expected[i].slug}/backlinks/`,
    `row ${i} backlinksUrl must equal ${data.site}/wiki/${expected[i].slug}/backlinks/`,
  );
  assert.equal(
    row.backlinksJsonUrl,
    `${data.site}/wiki/${expected[i].slug}/backlinks.json`,
    `row ${i} backlinksJsonUrl must equal ${data.site}/wiki/${expected[i].slug}/backlinks.json`,
  );
  // backlinks is the published-only inbound-link count — the same figure
  // allpages.json / mostlinkedpages.json expose and info.json as incomingLinks,
  // so a registry consumer can see subnet link popularity without a second fetch.
  assert.equal(
    row.backlinks,
    publishedInboundLinkCount(backlinks, row.slug, titleBySlug),
    `row ${i} backlinks must match the published inbound-link count for ${row.slug}`,
  );
  assert.ok(
    Number.isInteger(row.backlinks) && row.backlinks >= 0,
    `row ${i} backlinks must be a non-negative integer (got ${row.backlinks})`,
  );
  // incomingLinks is the same published-only inbound-link count aliased to the
  // key name info.json / references.json / backlinks.json use; it must equal both
  // the published inbound count and the back-compat `backlinks` field.
  assert.equal(
    row.incomingLinks,
    publishedInboundLinkCount(backlinks, row.slug, titleBySlug),
    `row ${i} incomingLinks must match the published inbound-link count for ${row.slug}`,
  );
  assert.equal(row.incomingLinks, row.backlinks, `row ${i} incomingLinks must equal the back-compat backlinks field for ${row.slug}`);
  // referencesCount is the subnet article's published OUTBOUND reference count —
  // the complement of backlinks — re-derived with the same getArticleReferences
  // helper the endpoint uses (published-only join), so the registry and
  // references.json / cite.json / info.json can't disagree on outbound degree.
  assert.equal(
    row.referencesCount,
    outboundCountFor(row.slug),
    `row ${i} referencesCount must equal the published outbound-reference count for ${row.slug}`,
  );
  assert.ok(
    Number.isInteger(row.referencesCount) && row.referencesCount >= 0,
    `row ${i} referencesCount must be a non-negative integer (got ${row.referencesCount})`,
  );
  // sectionCount is the subnet article's table-of-contents section count — the
  // same figure toc.json exposes as `count` and info.json / history.json expose
  // on their envelopes. Cross-check it against the sibling built toc.json (the
  // independent source of truth the endpoint renders) so they can't disagree.
  assert.ok(
    Number.isInteger(row.sectionCount) && row.sectionCount >= 0,
    `row ${i} sectionCount must be a non-negative integer (got ${JSON.stringify(row.sectionCount)})`,
  );
  const snTocJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'toc.json');
  if (fs.existsSync(snTocJsonFile)) {
    const tocDoc = JSON.parse(fs.readFileSync(snTocJsonFile, 'utf8'));
    assert.equal(
      row.sectionCount,
      tocDoc.count,
      `row ${i} sectionCount must agree with the sibling toc.json count for ${row.slug}`,
    );
  }
  // wordCount is the subnet article body's word count — the same figure info.json
  // exposes on its envelope. Validate its shape and cross-check it against the
  // sibling built info.json (the independent source) so the registry and the
  // per-article metadata surface can't disagree on article length.
  assert.ok(
    Number.isInteger(row.wordCount) && row.wordCount >= 0,
    `row ${i} wordCount must be a non-negative integer (got ${JSON.stringify(row.wordCount)})`,
  );
  const snWordInfoJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'info.json');
  if (fs.existsSync(snWordInfoJsonFile)) {
    const wordInfoDoc = JSON.parse(fs.readFileSync(snWordInfoJsonFile, 'utf8'));
    assert.equal(
      row.wordCount,
      wordInfoDoc.wordCount,
      `row ${i} wordCount must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // readingMinutes is the ~200 wpm ceil reading-time estimate info.json exposes
  // and the article footer renders. Validate its shape, its derivation from the
  // row's own wordCount, and its agreement with the sibling info.json envelope.
  assert.equal(
    row.readingMinutes,
    Math.max(1, Math.ceil((Number.isFinite(row.wordCount) ? row.wordCount : 0) / 200)),
    `row ${i} readingMinutes must be the ~200 wpm ceil estimate of its own wordCount for ${row.slug}`,
  );
  const snReadInfoJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'info.json');
  if (fs.existsSync(snReadInfoJsonFile)) {
    const readInfoDoc = JSON.parse(fs.readFileSync(snReadInfoJsonFile, 'utf8'));
    assert.equal(
      row.readingMinutes,
      readInfoDoc.readingMinutes,
      `row ${i} readingMinutes must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // lastEdited is the subnet article's last-revision date — the same figure
  // info.json / history.json expose per article and allpages.json /
  // mostlinkedpages.json expose per directory entry. Cross-check it against the
  // sibling built info.json (independent source) so the surfaces can't disagree.
  assert.ok(
    row.lastEdited === null || typeof row.lastEdited === 'string',
    `row ${i} lastEdited must be a string date or null (got ${JSON.stringify(row.lastEdited)})`,
  );
  // revisionCount (commit-history length) and firstEdited (oldest revision) are
  // the rest of the revision-stats trio info.json / history.json expose. Validate
  // their shape and cross-check both against the sibling info.json envelope.
  assert.ok(
    Number.isInteger(row.revisionCount) && row.revisionCount >= 0,
    `row ${i} revisionCount must be a non-negative integer (got ${JSON.stringify(row.revisionCount)})`,
  );
  assert.ok(
    row.firstEdited === null || typeof row.firstEdited === 'string',
    `row ${i} firstEdited must be a string date or null (got ${JSON.stringify(row.firstEdited)})`,
  );
  const snInfoJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'info.json');
  if (fs.existsSync(snInfoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(snInfoJsonFile, 'utf8'));
    assert.equal(
      row.lastEdited,
      infoDoc.lastEdited,
      `row ${i} lastEdited must agree with the sibling info.json envelope for ${row.slug}`,
    );
    assert.equal(
      row.revisionCount,
      infoDoc.revisionCount,
      `row ${i} revisionCount must agree with the sibling info.json envelope for ${row.slug}`,
    );
    assert.equal(
      row.firstEdited,
      infoDoc.firstEdited,
      `row ${i} firstEdited must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // citeUrl / referencesUrl / relatedUrl complete the per-article API surface:
  // the citation page (/cite/), the outbound-reference index (references.json),
  // and the related-pages set (related.json) all exist per subnet article, so a
  // registry consumer can reach them without reconstructing the routes.
  assert.equal(
    row.citeUrl,
    `${data.site}/wiki/${expected[i].slug}/cite/`,
    `row ${i} citeUrl must equal ${data.site}/wiki/${expected[i].slug}/cite/`,
  );
  // citeJsonUrl / bibtexUrl are the machine-readable citation companions of
  // citeUrl: structured citation metadata (cite.json) and a BibTeX record
  // (cite.bib), both of which exist per article — the trio info.json exposes —
  // so a registry consumer can fetch a subnet's citation directly.
  assert.equal(
    row.citeJsonUrl,
    `${data.site}/wiki/${expected[i].slug}/cite.json`,
    `row ${i} citeJsonUrl must equal ${data.site}/wiki/${expected[i].slug}/cite.json`,
  );
  assert.equal(
    row.bibtexUrl,
    `${data.site}/wiki/${expected[i].slug}/cite.bib`,
    `row ${i} bibtexUrl must equal ${data.site}/wiki/${expected[i].slug}/cite.bib`,
  );
  assert.equal(
    row.referencesUrl,
    `${data.site}/wiki/${expected[i].slug}/references.json`,
    `row ${i} referencesUrl must equal ${data.site}/wiki/${expected[i].slug}/references.json`,
  );
  assert.equal(
    row.relatedUrl,
    `${data.site}/wiki/${expected[i].slug}/related.json`,
    `row ${i} relatedUrl must equal ${data.site}/wiki/${expected[i].slug}/related.json`,
  );
  // referencesJsonUrl / relatedJsonUrl are the same companion links under the
  // consistent <name>JsonUrl key the rest of the API uses; each equals its
  // back-compat un-suffixed twin.
  assert.equal(
    row.referencesJsonUrl,
    `${data.site}/wiki/${expected[i].slug}/references.json`,
    `row ${i} referencesJsonUrl must equal ${data.site}/wiki/${expected[i].slug}/references.json`,
  );
  assert.equal(row.referencesJsonUrl, row.referencesUrl, `row ${i} referencesJsonUrl must equal the back-compat referencesUrl`);
  assert.equal(
    row.relatedJsonUrl,
    `${data.site}/wiki/${expected[i].slug}/related.json`,
    `row ${i} relatedJsonUrl must equal ${data.site}/wiki/${expected[i].slug}/related.json`,
  );
  assert.equal(row.relatedJsonUrl, row.relatedUrl, `row ${i} relatedJsonUrl must equal the back-compat relatedUrl`);
  // tocJsonUrl is the machine-readable table-of-contents companion:
  // /wiki/<slug>/toc.json already exists per article, and other article-list
  // JSON surfaces expose it, so the subnet registry should expose the same
  // route-discovery link without requiring clients to reconstruct it.
  assert.equal(
    row.tocJsonUrl,
    `${data.site}/wiki/${expected[i].slug}/toc.json`,
    `row ${i} tocJsonUrl must equal ${data.site}/wiki/${expected[i].slug}/toc.json`,
  );
  assert.equal(
    row.tocUrl,
    `${data.site}/wiki/${expected[i].slug}/toc.json`,
    `row ${i} tocUrl must equal ${data.site}/wiki/${expected[i].slug}/toc.json`,
  );
  assert.equal(row.tocUrl, row.tocJsonUrl, `row ${i} tocUrl must equal tocJsonUrl for ${row.slug}`);
  // imageUrl is the subnet article's OG share-card (/og/<slug>.png) — each
  // article binds its own card, the same per-entry field mostlinkedpages.json /
  // allpages.json / recentchanges.json expose — so a dashboard of subnets can
  // render a per-subnet thumbnail without parsing the rendered HTML head.
  assert.equal(
    row.imageUrl,
    `${data.site}/og/${expected[i].slug}.png`,
    `row ${i} imageUrl must equal ${data.site}/og/${expected[i].slug}.png`,
  );
  assert.equal(
    row.summary,
    expected[i].summary || null,
    `row ${i} summary must be the slug-map summary (null when blank)`,
  );
  // categories — the subnet article's topic list from its frontmatter, the same
  // per-entry field allpages.json exposes, so a consumer of subnets.json can
  // filter or group by topic without a separate lookup.
  const expectedCategories = uniqueFeedCategories(slugmap[row.slug]?.categories);
  assert.deepEqual(
    row.categories,
    expectedCategories,
    `row ${i} categories must match the deduped slug-map categories`,
  );
  // Every slug must point to a built article. The article's TITLE in the slug
  // map is the full "Subnet <n>: <name>" string — row.name is just the split
  // name (e.g. "Apex"), not the full title, so check that the slug map title
  // *contains* the row.name (the same relationship the HTML page renders).
  assert.ok(slugmap[row.slug], `row ${i} slug ${row.slug} is not in the slug map`);
  assert.ok(
    slugmap[row.slug].title.includes(row.name) || row.name === `Subnet ${row.netuid}`,
    `row ${i} name "${row.name}" must appear in the slug map title "${slugmap[row.slug].title}" (or fall back to "Subnet <netuid>")`,
  );
  assert.ok(
    fs.existsSync(path.join(projectRoot, 'dist', 'wiki', row.slug, 'index.html')),
    `row ${i} links to an unbuilt article /wiki/${row.slug}/`,
  );
});

// Numeric ascending order (the bug if anyone reintroduces lexicographic sort).
for (let i = 1; i < data.subnets.length; i++) {
  assert.ok(
    data.subnets[i - 1].netuid < data.subnets[i].netuid,
    `subnets must be sorted by netuid ascending (row ${i - 1}=${data.subnets[i - 1].netuid} >= row ${i}=${data.subnets[i].netuid})`,
  );
}

console.log(`Subnets JSON check passed (${data.count} subnets, first=${data.subnets[0]?.slug}@netuid ${data.subnets[0]?.netuid}, last=${data.subnets[data.subnets.length - 1]?.slug}@netuid ${data.subnets[data.subnets.length - 1]?.netuid})`);
