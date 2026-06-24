import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleBreadcrumb, categoryUrlSegment, getArticleBreadcrumbTrail } from '../src/lib/article-breadcrumb.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { publishedInboundLinkCount } from './most-linked.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: helper + builder behavior -----------------------------------
{
  const { primaryTopic, items } = getArticleBreadcrumbTrail({
    title: 'Source',
    categories: ['Consensus', 'Security'],
  });
  assert.equal(primaryTopic, 'Consensus', 'helper: primary topic is the first category');
  assert.deepEqual(
    items.map((item) => item.name),
    ['Home', 'Consensus', 'Source'],
    'helper: trail names must match Home > topic > article',
  );
  assert.equal(items[1].href, '/wiki/category/Consensus/', 'helper: topic href must use underscore category URLs');

  const noTopic = getArticleBreadcrumbTrail({ title: 'Orphan', categories: [] });
  assert.equal(noTopic.primaryTopic, null, 'helper: no category means no primary topic');
  assert.deepEqual(
    noTopic.items.map((item) => item.name),
    ['Home', 'Orphan'],
    'helper: uncategorized articles degrade to Home > article',
  );

  const doc = buildArticleBreadcrumb({
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
    primaryTopic: 'Consensus',
    items: items,
  });
  assert.equal(doc.slug, 'source', 'builder: slug field');
  assert.equal(doc.breadcrumbJsonUrl, `${ORIGIN}/wiki/source/breadcrumb.json`, 'builder: breadcrumbJsonUrl self field');
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/source/toc.json`, 'builder: tocJsonUrl cross-link');
  assert.equal(doc.primaryTopic, 'Consensus', 'builder: primaryTopic field');
  assert.equal(doc.count, 3, 'builder: count field');
  assert.deepEqual(
    doc.items.map((item) => item.name),
    ['Home', 'Consensus', 'Source'],
    'builder: item names',
  );
  assert.equal(doc.items[0].url, `${ORIGIN}/`, 'builder: Home item URL');
  assert.equal(doc.items[1].url, `${ORIGIN}/wiki/category/Consensus/`, 'builder: topic item URL');
  assert.equal(doc.items[2].url, `${ORIGIN}/wiki/source/`, 'builder: current article item URL');
  assert.equal(doc.items[2].current, true, 'builder: leaf item is current');
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

const revisionCountOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return 0;
  const history = JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
  return Array.isArray(history) ? history.length : 0;
};

let withTopic = 0;

for (const slug of articleSlugs) {
  const jsonFile = path.join(wikiDir, slug, 'breadcrumb.json');
  const htmlFile = path.join(wikiDir, slug, 'index.html');
  assert.ok(fs.existsSync(jsonFile), `every article must have a breadcrumb.json, but /wiki/${slug}/breadcrumb.json was not built`);
  assert.ok(fs.existsSync(htmlFile), `missing built article page: /wiki/${slug}/`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const html = fs.readFileSync(htmlFile, 'utf8');
  const title = slugmap[slug]?.title;
  const categories = slugmap[slug]?.categories ?? [];
  const primaryTopic = categories[0] ?? null;

  assert.equal(doc.slug, slug, `${slug}: breadcrumb.json slug must equal the article slug`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: breadcrumb.json url must be canonical`);
  assert.equal(doc.breadcrumbJsonUrl, `${ORIGIN}/wiki/${slug}/breadcrumb.json`, `${slug}: breadcrumb.json must expose its own canonical breadcrumbJsonUrl`);
  assert.equal(doc.primaryTopic, primaryTopic ?? null, `${slug}: breadcrumb.json primaryTopic must match the article's first category`);

  const navMatch = html.match(/<nav[^>]*class="mw-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(navMatch, `/wiki/${slug}/ must render a breadcrumb nav`);
  const nav = navMatch[1];
  const visibleNames = [...nav.matchAll(/<(?:a|span)[^>]*>([^<]*)<\/(?:a|span)>/g)].map((m) => decodeHtml(m[1].trim()));
  assert.deepEqual(
    doc.items.map((item) => item.name),
    visibleNames,
    `${slug}: breadcrumb.json items must match the visible breadcrumb trail`,
  );

  if (primaryTopic) {
    withTopic++;
    assert.equal(doc.items[1].path, `/wiki/category/${categoryUrlSegment(primaryTopic)}/`, `${slug}: topic path must match the category URL`);
    assert.ok(
      fs.existsSync(path.join(wikiDir, 'category', categoryUrlSegment(primaryTopic), 'index.html')),
      `${slug}: breadcrumb topic must link to a built category page`,
    );
  } else {
    assert.equal(doc.count, 2, `${slug}: uncategorized articles must have a two-item trail`);
  }

  assert.equal(doc.items[doc.items.length - 1].current, true, `${slug}: leaf breadcrumb item must be current`);
  assert.deepEqual(doc.categories, categories, `${slug}: breadcrumb.json categories must match the slug map`);
  assert.equal(
    doc.incomingLinks,
    publishedInboundLinkCount(backlinksData, slug, titleBySlug),
    `${slug}: breadcrumb.json incomingLinks must match the published inbound-link count`,
  );
  assert.equal(
    doc.revisionCount,
    revisionCountOf(slug),
    `${slug}: breadcrumb.json revisionCount must equal the article's commit-history length`,
  );
  assert.equal(
    doc.referencesCount,
    getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
    `${slug}: breadcrumb.json referencesCount must match the published outbound-reference count`,
  );

  const infoJsonFile = path.join(wikiDir, slug, 'info.json');
  if (fs.existsSync(infoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
    assert.equal(doc.incomingLinks, infoDoc.incomingLinks, `${slug}: breadcrumb.json incomingLinks must agree with info.json`);
    assert.equal(doc.revisionCount, infoDoc.revisionCount, `${slug}: breadcrumb.json revisionCount must agree with info.json`);
    assert.equal(doc.wordCount, infoDoc.wordCount, `${slug}: breadcrumb.json wordCount must agree with info.json`);
  }
}

assert.ok(withTopic > 0, 'expected at least one article with a topic-level breadcrumb to verify');

console.log(
  `Breadcrumb JSON check passed (${articleSlugs.length} articles; ${withTopic} with a topic level; breadcrumb.json matches visible trail and sibling envelopes)`,
);
