import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleInfo } from './article-info.js';
import { getArticleReferences } from '../src/lib/article-references.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(path.resolve(__dirname, '..'), 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const ORIGIN = 'https://taopedia.org';

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');

const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
// referencesCount = the article's published outbound-reference count, re-derived
// with the same getArticleReferences helper info.json uses (published-only join).
const titleBySlug = Object.fromEntries(Object.entries(slugmap).map(([slug, entry]) => [slug, entry?.title ?? slug]));
const outboundCountFor = (slug) => getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;
const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
const historyOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
};
const inboundCountFor = (slug) => (backlinksData[slug] ?? []).filter((entry) => slugmap[entry.from]).length;
const infoField = (html, key) => {
  const m = html.match(new RegExp(`<dd[^>]*data-info="${key}"[^>]*>([\\s\\S]*?)</dd>`));
  return m ? m[1] : null;
};
const toNumber = (block) => Number((block || '').replace(/<[^>]*>/g, '').replace(/[^0-9]/g, ''));

// The article route is a catch-all ([...slug]); walk recursively so nested
// slugs are covered. Article pages are <slug>/index.html — exclude the
// category/special hubs and each article's own /history/, /backlinks/, and
// /cite/ subpages, none of which carries (or needs) the metadata footer.
const articlePages = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'index.html') {
      const segs = path.relative(wikiDir, full).split(path.sep);
      if (segs.length < 2) continue;
      if (segs[0] === 'category' || segs[0] === 'special') continue;
      const parent = segs[segs.length - 2];
      if (parent === 'history' || parent === 'backlinks' || parent === 'cite' || parent === 'info') continue;
      articlePages.push({
        file: full,
        slug: segs.slice(0, -1).join('/'),
      });
    }
  }
};
walk(wikiDir);
assert.ok(articlePages.length > 0, 'no built article pages found');

let withDate = 0;
let withInfoHistory = 0;
let withInfoInbound = 0;
for (const { file, slug } of articlePages) {
  const html = fs.readFileSync(file, 'utf8');
  const where = path.relative(wikiDir, file);

  const meta = html.match(/<div class="mw-article-meta"[^>]*data-word-count="(\d+)"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(meta, `${where}: missing the mw-article-meta footer (with data-word-count)`);
  const wordCount = Number(meta[1]);
  const block = meta[2];

  // Reading time must be present AND exactly the rounded-up ~200 wpm estimate of
  // the embedded word count — this pins the formula so a round-vs-ceil rounding
  // regression (e.g. a 201-399 word article) fails the build.
  const reading = block.match(/(\d+) min read/);
  assert.ok(reading, `${where}: footer must show a reading time`);
  const expectedReadingTime = Math.max(1, Math.ceil(wordCount / 200));
  assert.equal(
    Number(reading[1]),
    expectedReadingTime,
    `${where}: reading time ${reading[1]} must equal ceil(${wordCount}/200)=${expectedReadingTime}`,
  );

  // When a last-updated date is shown it must be machine-readable and valid.
  if (block.includes('Last updated')) {
    const time = block.match(/<time datetime="([^"]+)">([^<]+)<\/time>/);
    assert.ok(time, `${where}: "Last updated" must wrap a <time datetime> element`);
    assert.ok(!Number.isNaN(Date.parse(time[1])), `${where}: <time datetime> must be a valid date (${time[1]})`);
    withDate += 1;
  }

  const title = slugmap[slug]?.title;
  assert.ok(title, `${where}: slugmap is missing title metadata for ${slug}`);

  const topicsBlock = html.match(/<div class="article-topics"[^>]*>([\s\S]*?)<\/div>/);
  const expectedTopics = [...new Set(slugmap[slug]?.categories ?? [])];
  if (expectedTopics.length > 0) {
    assert.ok(topicsBlock, `${where}: article with categories must render the Topics footer`);
    const renderedTopics = [...topicsBlock[1].matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map((m) => decode(m[1]));
    assert.deepEqual(
      renderedTopics,
      expectedTopics,
      `${where}: Topics footer must list each frontmatter category once (deduped, first-seen order)`,
    );
  } else {
    assert.ok(!topicsBlock, `${where}: article without categories must not render the Topics footer`);
  }

  const history = historyOf(slug);
  const infoJsonFile = path.join(wikiDir, slug, 'info.json');
  assert.ok(fs.existsSync(infoJsonFile), `${where}: missing companion /wiki/${slug}/info.json endpoint`);
  const infoDoc = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
  const tocJsonFile = path.join(wikiDir, slug, 'toc.json');
  const sectionCount = fs.existsSync(tocJsonFile) ? JSON.parse(fs.readFileSync(tocJsonFile, 'utf8')).count : 0;
  const expectedInfo = buildArticleInfo({
    title,
    slug,
    origin: ORIGIN,
    summary: slugmap[slug]?.summary ?? '',
    categories: slugmap[slug]?.categories ?? [],
    incomingLinks: inboundCountFor(slug),
    referencesCount: outboundCountFor(slug),
    sectionCount,
    wordCount,
    revisionCount: history.length,
    firstEdited: history[history.length - 1]?.date ?? null,
    lastEdited: history[0]?.date ?? null,
  });
  assert.deepEqual(infoDoc, expectedInfo, `${where}: info.json must match the page-information build data exactly`);
  assert.equal(
    infoDoc.readingMinutes,
    expectedReadingTime,
    `${where}: info.json readingMinutes must match the article footer's rendered reading time`,
  );
  assert.ok(!('authorEmail' in infoDoc), `${where}: info.json must not expose authorEmail`);

  const infoHtmlFile = path.join(wikiDir, slug, 'info', 'index.html');
  assert.ok(fs.existsSync(infoHtmlFile), `${where}: missing /wiki/${slug}/info/ page`);
  const infoHtml = fs.readFileSync(infoHtmlFile, 'utf8');

  const categoriesField = infoField(infoHtml, 'categories');
  assert.ok(categoriesField !== null, `/wiki/${slug}/info/: missing topics field`);
  const renderedCategories = [...categoriesField.matchAll(/<a[^>]*href="\/wiki\/category\/[^"]*"[^>]*>([^<]*)<\/a>/g)].map(
    (m) => decode(m[1]),
  );
  assert.deepEqual(
    renderedCategories,
    infoDoc.categories,
    `/wiki/${slug}/info/: rendered topics must match info.json categories`,
  );

  const inboundField = infoField(infoHtml, 'inbound');
  assert.ok(inboundField !== null, `/wiki/${slug}/info/: missing incoming-links field`);
  assert.equal(
    toNumber(inboundField),
    infoDoc.incomingLinks,
    `/wiki/${slug}/info/: rendered incoming-link count must match info.json`,
  );
  assert.ok(
    inboundField.includes(`href="/wiki/${slug}/backlinks/"`),
    `/wiki/${slug}/info/: incoming-links field must link to /wiki/${slug}/backlinks/`,
  );
  assert.equal(infoDoc.backlinksUrl, `${ORIGIN}/wiki/${slug}/backlinks/`, `${where}: backlinksUrl must be canonical`);

  const revisionsField = infoField(infoHtml, 'revisions');
  assert.ok(revisionsField !== null, `/wiki/${slug}/info/: missing revisions field`);
  assert.equal(
    toNumber(revisionsField),
    infoDoc.revisionCount,
    `/wiki/${slug}/info/: rendered revision count must match info.json`,
  );
  assert.ok(
    revisionsField.includes(`href="/wiki/${slug}/history/"`),
    `/wiki/${slug}/info/: revisions field must link to /wiki/${slug}/history/`,
  );
  assert.equal(infoDoc.historyUrl, `${ORIGIN}/wiki/${slug}/history/`, `${where}: historyUrl must be canonical`);

  const renderedTimes = [...infoHtml.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
  if (infoDoc.firstEdited !== null || infoDoc.lastEdited !== null) {
    assert.ok(infoDoc.firstEdited !== null, `${where}: firstEdited must be null only when there is no history`);
    assert.ok(infoDoc.lastEdited !== null, `${where}: lastEdited must be null only when there is no history`);
    assert.ok(renderedTimes.includes(infoDoc.firstEdited), `/wiki/${slug}/info/: creation date must match info.json`);
    assert.ok(renderedTimes.includes(infoDoc.lastEdited), `/wiki/${slug}/info/: latest-revision date must match info.json`);
    withInfoHistory += 1;
  }
  if (infoDoc.incomingLinks > 0) withInfoInbound += 1;
}

// The history wiring must actually populate dates for real articles, not be uniformly absent.
assert.ok(withDate > 0, 'no article showed a last-updated date; history wiring is broken');
assert.ok(withInfoHistory > 0, 'no info.json endpoint reported revision history; history wiring is broken');
assert.ok(withInfoInbound > 0, 'no info.json endpoint reported inbound links; backlink wiring is broken');

console.log(
  `Article-meta check passed (${articlePages.length} articles; ${withDate} with a last-updated date; ${withInfoHistory} info.json endpoints with history and ${withInfoInbound} with inbound links)`,
);
