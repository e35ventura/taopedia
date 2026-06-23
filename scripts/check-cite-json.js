import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCitations, CITATION_FORMATS, CITATION_META } from './citations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
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

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

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
  const url = `${ORIGIN}/wiki/${slug}/`;
  const expected = buildCitations({ title, url, slug, date });

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  assert.equal(doc.title, title, `cite.json title must equal the article title for ${slug}`);
  assert.equal(doc.slug, slug, `cite.json slug must equal ${slug}`);
  assert.equal(doc.url, url, `cite.json url must be the canonical trailing-slash article URL for ${slug}`);
  assert.equal(
    doc.citeJsonUrl,
    `${ORIGIN}/wiki/${slug}/cite.json`,
    `cite.json citeJsonUrl must point at the canonical JSON citation endpoint for ${slug}`,
  );
  assert.equal(
    doc.citeUrl,
    `${ORIGIN}/wiki/${slug}/cite/`,
    `cite.json citeUrl must point at the sibling HTML cite page for ${slug}`,
  );
  assert.equal(
    doc.bibtexUrl,
    `${ORIGIN}/wiki/${slug}/cite.bib`,
    `cite.json bibtexUrl must point at the sibling cite.bib export for ${slug}`,
  );
  assert.equal(
    doc.historyUrl,
    `${ORIGIN}/wiki/${slug}/history/`,
    `cite.json historyUrl must point at the sibling HTML history page for ${slug}`,
  );
  // historyJsonUrl is the JSON companion of historyUrl — cite.json already
  // pairs citeUrl with citeJsonUrl, and /wiki/<slug>/history.json exists and is
  // exposed by recentchanges.json / subnets.json, so expose it here too.
  assert.equal(
    doc.historyJsonUrl,
    `${ORIGIN}/wiki/${slug}/history.json`,
    `cite.json historyJsonUrl must point at the sibling machine-readable history endpoint for ${slug}`,
  );
  assert.equal(
    doc.backlinksUrl,
    `${ORIGIN}/wiki/${slug}/backlinks/`,
    `cite.json backlinksUrl must point at the sibling HTML backlinks page for ${slug}`,
  );
  // backlinksJsonUrl is the JSON companion of backlinksUrl — cite.json already
  // pairs citeUrl/citeJsonUrl and historyUrl/historyJsonUrl, and
  // /wiki/<slug>/backlinks.json exists and is exposed by recentchanges.json /
  // subnets.json, so pair backlinksUrl with its machine-readable companion too.
  assert.equal(
    doc.backlinksJsonUrl,
    `${ORIGIN}/wiki/${slug}/backlinks.json`,
    `cite.json backlinksJsonUrl must point at the sibling machine-readable backlinks endpoint for ${slug}`,
  );
  // infoUrl / infoJsonUrl link back to the canonical Page-information hub, which
  // info.json already links out to every sibling endpoint from; closing the loop
  // lets a consumer of cite.json reach the article's metadata hub.
  assert.equal(
    doc.infoUrl,
    `${ORIGIN}/wiki/${slug}/info/`,
    `cite.json infoUrl must point at the sibling HTML info page for ${slug}`,
  );
  assert.equal(
    doc.infoJsonUrl,
    `${ORIGIN}/wiki/${slug}/info.json`,
    `cite.json infoJsonUrl must point at the sibling machine-readable info endpoint for ${slug}`,
  );
  // tocJsonUrl links to the article's table-of-contents endpoint — every sibling
  // JSON endpoint already exposes this companion, and /wiki/<slug>/toc.json is
  // a shipped route, so cite.json should surface it too.
  assert.equal(
    doc.tocJsonUrl,
    `${ORIGIN}/wiki/${slug}/toc.json`,
    `cite.json tocJsonUrl must point at the article's machine-readable table-of-contents endpoint for ${slug}`,
  );
  // referencesUrl / relatedUrl complete the envelope's cross-links to the
  // article's other machine-readable endpoints (the outbound-reference index and
  // the related-pages set), the same siblings info.json aggregates, so a consumer
  // of cite.json can reach them without reconstructing the routes.
  assert.equal(
    doc.referencesUrl,
    `${ORIGIN}/wiki/${slug}/references.json`,
    `cite.json referencesUrl must point at the sibling references.json endpoint for ${slug}`,
  );
  assert.equal(
    doc.relatedUrl,
    `${ORIGIN}/wiki/${slug}/related.json`,
    `cite.json relatedUrl must point at the sibling related.json endpoint for ${slug}`,
  );
  // imageUrl is the article's own OG share-card (/og/<slug>.png), the same
  // companion the info/history/toc/references/backlinks/related envelopes expose.
  assert.equal(
    doc.imageUrl,
    `${ORIGIN}/og/${slug}.png`,
    `cite.json imageUrl must be the article's OG share-card URL for ${slug}`,
  );
  assert.deepEqual(
    doc.categories,
    slugmap[slug]?.categories ?? [],
    `cite.json categories must match the article's topic categories for ${slug}`,
  );
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
