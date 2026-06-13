import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCitations, CITATION_FORMATS } from './citations.js';

// Load-bearing regression check for the per-article "Cite this page"
// (Special:CiteThisPage) pages at /wiki/<slug>/cite/. It pins the citation
// formats with fixed inputs, then verifies every rendered page reproduces
// buildCitations() for that article's real title, URL, and last-revision date,
// plus coverage and the toolbar discovery link.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

// ---- 1) Unit-test the citation formats with fixed inputs ------------------
// Pins the exact format strings so a formatting regression fails here even
// before the site is rendered.
{
  const dated = buildCitations({
    title: 'Yuma Consensus',
    url: 'https://taopedia.org/wiki/yuma_consensus/',
    slug: 'yuma_consensus',
    date: '2024-06-01T12:00:00.000Z',
  });
  assert.equal(dated.apa, 'Taopedia contributors. (2024, June 1). Yuma Consensus. Taopedia. https://taopedia.org/wiki/yuma_consensus/');
  assert.equal(dated.mla, '"Yuma Consensus." Taopedia, 1 June 2024, https://taopedia.org/wiki/yuma_consensus/.');
  assert.equal(dated.chicago, 'Taopedia contributors. "Yuma Consensus." Taopedia. Last modified June 1, 2024. https://taopedia.org/wiki/yuma_consensus/.');
  assert.equal(
    dated.bibtex,
    [
      '@misc{taopedia:yuma_consensus,',
      '  author       = "Taopedia contributors",',
      '  title        = "Yuma Consensus --- Taopedia",',
      '  year         = "2024",',
      '  howpublished = "\\url{https://taopedia.org/wiki/yuma_consensus/}",',
      '  note         = "[Online; last modified June 1, 2024]"',
      '}',
    ].join('\n'),
  );

  // No recorded history → cite without an invalid date: APA "n.d.", and the
  // date-bearing clauses elsewhere are omitted (no "year"/"note" in BibTeX).
  const undatedCite = buildCitations({
    title: 'Yuma Consensus',
    url: 'https://taopedia.org/wiki/yuma_consensus/',
    slug: 'yuma_consensus',
    date: '',
  });
  assert.ok(undatedCite.apa.includes('(n.d.)'), 'APA must use (n.d.) when there is no date');
  assert.ok(!/last modified/i.test(undatedCite.chicago), 'Chicago must omit the last-modified clause when there is no date');
  assert.ok(!/year\s*=/.test(undatedCite.bibtex), 'BibTeX must omit the year field when there is no date');
  assert.ok(!/note\s*=/.test(undatedCite.bibtex), 'BibTeX must omit the note field when there is no date');
}

// ---- 2) Verify the rendered pages against real article data ---------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

// Recursively discover every built article page, excluding special/category
// hubs and the per-article history/backlinks/cite sub-pages.
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
    if (parent === 'history' || parent === 'backlinks' || parent === 'cite') continue;
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

const lastRevisionOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return '';
  const history = JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
  return typeof history[0]?.date === 'string' ? history[0].date : '';
};

const citeText = (html, key) => {
  const m = html.match(new RegExp(`<pre[^>]*data-cite="${key}"[^>]*>([\\s\\S]*?)</pre>`));
  return m ? decode(m[1]) : null;
};

let datedVerified = 0;
let undatedVerified = 0;
for (const slug of articleSlugs) {
  const citeFile = path.join(wikiDir, slug, 'cite', 'index.html');
  assert.ok(fs.existsSync(citeFile), `every article must have a Cite-this-page page, but /wiki/${slug}/cite/ was not built`);

  const title = slugmap[slug]?.title;
  assert.ok(title, `slugmap is missing a title for ${slug}`);
  const date = lastRevisionOf(slug);
  const expected = buildCitations({ title, url: `https://taopedia.org/wiki/${slug}/`, slug, date });

  const html = fs.readFileSync(citeFile, 'utf8');
  for (const { key } of CITATION_FORMATS) {
    assert.equal(
      citeText(html, key),
      expected[key],
      `/wiki/${slug}/cite/ ${key.toUpperCase()} citation must equal buildCitations() for the article's real title and date`,
    );
  }
  if (date) datedVerified++;
  else undatedVerified++;
}
assert.ok(datedVerified > 0, 'expected at least one article with a revision date to verify a dated citation');

// ---- 3) Discovery: the article toolbar must link to its own cite page ------
const sample = articleSlugs[0];
const sampleHtml = fs.readFileSync(path.join(wikiDir, sample, 'index.html'), 'utf8');
assert.ok(
  sampleHtml.includes(`href="/wiki/${sample}/cite/"`),
  'the article toolbar must link to /wiki/<slug>/cite/ (Cite this page discovery path)',
);

console.log(
  `Cite-this-page check passed (${articleSlugs.length} pages: ${datedVerified} dated, ${undatedVerified} undated; formats pinned; toolbar discovery present)`,
);
