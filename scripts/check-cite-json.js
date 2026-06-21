import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCitations, CITATION_FORMATS, CITATION_META } from './citations.js';

// Load-bearing regression check for the machine-readable citation export:
//   /wiki/<slug>/cite.json  — structured citations + bibliographic fields
//   /wiki/<slug>/cite.bib   — the BibTeX entry as a downloadable file
// Both reuse the same buildCitations() pure function the HTML "Cite this page"
// (cite.astro) renders. The contract is load-bearing: a malformed JSON response,
// a wrong field, an un-built endpoint, or a citation that disagrees with the HTML
// page would silently break every downstream consumer. This check:
//   1) pins buildCitations() with fixed inputs (catches builder regressions);
//   2) for EVERY built article, parses dist/.../cite.json and validates each
//      bibliographic field against ground truth (slugmap title, history date,
//      canonical URL);
//   3) asserts every citation equals both buildCitations() AND the rendered HTML
//      cite page <pre> (an independent render path — proves JSON/HTML never
//      drift, rather than re-deriving with the same builder and comparing);
//   4) asserts cite.bib equals the JSON's BibTeX entry.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const ORIGIN = 'https://taopedia.org';
const CITE_KEYS = CITATION_FORMATS.map((format) => format.key); // apa, mla, chicago, bibtex

// ---- 1) Unit: pin the builder with fixed inputs ---------------------------
// Independent of the rendered output, so a formatting/escaping regression fails
// here even before the site is built.
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

  // No recorded history → no invalid date: APA "n.d.", BibTeX omits year/note.
  const undated = buildCitations({ title: 'Yuma Consensus', url: 'https://taopedia.org/wiki/yuma_consensus/', slug: 'yuma_consensus', date: '' });
  assert.ok(undated.apa.includes('(n.d.)'), 'APA must use (n.d.) when there is no date');
  assert.ok(!/year\s*=/.test(undated.bibtex), 'BibTeX must omit the year field when there is no date');

  // Hostile title must not break the brace-delimited BibTeX field.
  const tricky = buildCitations({ title: 'A "Quoted" \\ Title {x}', url: 'https://taopedia.org/wiki/x/', slug: 'x', date: '' });
  assert.ok(
    tricky.bibtex.includes('  title        = {A "Quoted" \\textbackslash{} Title \\{x\\} --- Taopedia},'),
    'BibTeX title must brace-delimit and escape \\, { and } while leaving a literal quote intact',
  );
}

// ---- 2) Discover every built article (same scope as the HTML cite check) ---
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

// ---- 3) Per-article: validate cite.json fields + JSON/HTML/.bib parity -----
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

  // cite.json — exact bibliographic contract.
  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  assert.equal(doc.title, title, `cite.json title must equal the article title for ${slug}`);
  assert.equal(doc.slug, slug, `cite.json slug must equal ${slug}`);
  assert.equal(doc.url, url, `cite.json url must be the canonical trailing-slash article URL for ${slug}`);
  // date is present and correct when the article has history, omitted otherwise
  // (matching cite.astro and the JSON feed, which both drop an empty date).
  if (date) {
    assert.equal(doc.date, date, `cite.json date must equal the article's last-revision date for ${slug}`);
  } else {
    assert.ok(!('date' in doc), `cite.json must omit date when ${slug} has no recorded history`);
  }
  assert.equal(doc.author, CITATION_META.author, `cite.json author must be "${CITATION_META.author}" for ${slug}`);
  assert.equal(doc.publisher, CITATION_META.publisher, `cite.json publisher must be "${CITATION_META.publisher}" for ${slug}`);
  assert.ok(doc.citations && typeof doc.citations === 'object', `cite.json must carry a citations object for ${slug}`);
  assert.deepEqual(Object.keys(doc.citations), CITE_KEYS, `cite.json citations must carry exactly [${CITE_KEYS.join(', ')}] for ${slug}`);

  // Every format must agree across all three surfaces: cite.json === the builder,
  // AND the independently-rendered HTML cite page === the builder. That proves
  // the JSON and HTML can never disagree (the source-of-truth-drift gate).
  const html = fs.readFileSync(path.join(wikiDir, slug, 'cite', 'index.html'), 'utf8');
  for (const key of CITE_KEYS) {
    assert.equal(doc.citations[key], expected[key], `cite.json ${key.toUpperCase()} must equal buildCitations() for ${slug}`);
    assert.equal(
      htmlCiteText(html, key),
      expected[key],
      `the HTML cite page ${key.toUpperCase()} must equal buildCitations() for ${slug} (JSON/HTML parity)`,
    );
  }

  // cite.bib — the BibTeX entry as a file (trailing newline), matching the JSON.
  const bib = fs.readFileSync(bibFile, 'utf8');
  assert.equal(bib, `${expected.bibtex}\n`, `cite.bib must be the BibTeX entry with a trailing newline for ${slug}`);

  if (date) datedVerified++;
  else undatedVerified++;
}
assert.ok(datedVerified > 0, 'expected at least one article with a revision date to verify a dated citation');

console.log(
  `Cite export check passed (${articleSlugs.length} articles: ${datedVerified} dated, ${undatedVerified} undated; cite.json + cite.bib verified against buildCitations() and the HTML cite page)`,
);
