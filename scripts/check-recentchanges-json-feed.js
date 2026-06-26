import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildRecentChangesJsonFeedItems } from '../src/lib/recent-changes-feed.js';
import { buildJsonFeed } from './json-feed.js';
import { RECENT_LIMIT } from '../src/lib/recent-changes.js';
import { slugFromWikiHref } from '../src/lib/wiki-article-path.js';

const ORIGIN = 'https://taopedia.org';
const JSON_FEED_VERSION = 'https://jsonfeed.org/version/1.1';

// ---- Regression: same-timestamp tiebreak must match Special:RecentChanges ----
//
// collectRecentChanges (the HTML page + recentchanges.json source of truth)
// breaks equal-date ties with compareTitles(slug). The JSON Feed must agree.
// Comparing the full canonical URL instead diverges when one slug is a prefix of
// another: for "alpha" and "alpha_beta" sharing a commit timestamp, slug order
// is [alpha, alpha_beta] but URL order is [alpha_beta, alpha]. Feed two such
// same-date changes through the item builder + feed and assert the slug order.
{
  const sameDate = '2026-06-01T00:00:00.000Z';
  const changes = [
    { slug: 'alpha_beta', title: 'Alpha Beta', date: sameDate, sha: 'b', authorName: 'x', message: 'm' },
    { slug: 'alpha', title: 'Alpha', date: sameDate, sha: 'a', authorName: 'x', message: 'm' },
  ];
  const items = buildRecentChangesJsonFeedItems({ changes, origin: ORIGIN, categoriesBySlug: {} });
  const feed = JSON.parse(buildJsonFeed({ siteUrl: `${ORIGIN}/`, feedPath: '/wiki/special/recentchanges/feed.json', items }));
  assert.equal(feed.items.length, 2, 'both same-date items must appear in the JSON Feed');
  assert.deepEqual(
    feed.items.map((item) => item.url),
    [`${ORIGIN}/wiki/alpha/`, `${ORIGIN}/wiki/alpha_beta/`],
    'same-timestamp tiebreak must order by slug (alpha before alpha_beta), matching Special:RecentChanges, NOT by full URL',
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const feedFile = path.join(wikiDir, 'special', 'recentchanges', 'feed.json');
const htmlFile = path.join(wikiDir, 'special', 'recentchanges', 'index.html');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

const recentChangeSummary = (change) => {
  const authorName = typeof change?.authorName === 'string' ? change.authorName.trim() : '';
  const message = typeof change?.message === 'string' ? change.message.trim() : '';
  if (authorName && message) return `Edited by ${authorName}: ${message}`;
  if (authorName) return `Edited by ${authorName}`;
  return message;
};

const hasAlternateLink = (linkTags, type, href) =>
  linkTags.some(
    (tag) =>
      tag.includes('rel="alternate"') && tag.includes(`type="${type}"`) && tag.includes(`href="${href}"`),
  );

// ---- 1) Unit: recent-changes item mapping ---------------------------------
{
  const items = buildRecentChangesJsonFeedItems({
    origin: ORIGIN,
    categoriesBySlug: {
      subnet_9: ['Subnets', 'Validation'],
      subnet_10: [],
    },
    changes: [
      {
        slug: 'subnet_9',
        title: 'Subnet 9',
        sha: 'sharedsha',
        date: '2026-06-21T10:53:45.000Z',
        authorName: 'Alice',
        message: 'Fix title & improve <summary>',
      },
      {
        slug: 'subnet_10',
        title: 'Subnet 10',
        sha: 'sharedsha',
        date: '2026-06-21T09:28:57.000Z',
        authorName: 'Bob',
        message: '',
      },
    ],
  });

  assert.deepEqual(
    items,
    [
      {
        id: 'urn:taopedia:recentchanges:subnet_9:sharedsha',
        title: 'Subnet 9',
        url: `${ORIGIN}/wiki/subnet_9/`,
        sortKey: 'subnet_9',
        image: `${ORIGIN}/og/subnet_9.png`,
        description: 'Edited by Alice: Fix title & improve <summary>',
        categories: ['Subnets', 'Validation'],
        datePublished: '2026-06-21T10:53:45.000Z',
        dateModified: '2026-06-21T10:53:45.000Z',
      },
      {
        id: 'urn:taopedia:recentchanges:subnet_10:sharedsha',
        title: 'Subnet 10',
        url: `${ORIGIN}/wiki/subnet_10/`,
        sortKey: 'subnet_10',
        image: `${ORIGIN}/og/subnet_10.png`,
        description: 'Edited by Bob',
        categories: [],
        datePublished: '2026-06-21T09:28:57.000Z',
        dateModified: '2026-06-21T09:28:57.000Z',
      },
    ],
    'helper must build stable JSON Feed items with per-revision ids, canonical URLs, OG images, summaries, and categories',
  );
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(feedFile), 'dist/wiki/special/recentchanges/feed.json not found; run the build first');
assert.ok(fs.existsSync(htmlFile), 'dist/wiki/special/recentchanges/index.html not found; run the build first');
assert.ok(fs.existsSync(historyDir), 'public/history not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const feed = JSON.parse(fs.readFileSync(feedFile, 'utf8'));
const html = fs.readFileSync(htmlFile, 'utf8');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);

assert.ok(headMatch, 'Recent changes page must render a <head> block');

const linkTags = [...headMatch[1].matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);

assert.equal(feed.version, JSON_FEED_VERSION, 'recentchanges JSON Feed must declare JSON Feed 1.1');
assert.equal(
  feed.feed_url,
  `${ORIGIN}/wiki/special/recentchanges/feed.json`,
  'recentchanges JSON Feed feed_url must be the canonical scoped feed URL',
);
assert.equal(
  feed.home_page_url,
  `${ORIGIN}/wiki/special/recentchanges/`,
  'recentchanges JSON Feed home_page_url must point at the Recent changes page',
);
assert.equal(feed.title, 'Taopedia - Recent changes', 'recentchanges JSON Feed title must name the surface');
assert.equal(
  feed.description,
  'Most recent revision events across published Taopedia articles.',
  'recentchanges JSON Feed description must describe the revision-level scope',
);
assert.equal(feed.language, 'en', 'recentchanges JSON Feed must declare the language');
assert.equal(
  feed.icon,
  `${ORIGIN}/apple-touch-icon.png`,
  'recentchanges JSON Feed must advertise the large site icon',
);
assert.equal(
  feed.favicon,
  `${ORIGIN}/favicon-32x32.png`,
  'recentchanges JSON Feed must advertise the small site favicon',
);
assert.ok(
  hasAlternateLink(linkTags, 'application/feed+json', '/wiki/special/recentchanges/feed.json'),
  'Recent changes page <head> must advertise rel="alternate" type="application/feed+json" href="/wiki/special/recentchanges/feed.json"',
);

const expectedChanges = [];
for (const file of fs.readdirSync(historyDir)) {
  if (!file.endsWith('.json')) continue;
  const slug = file.replace(/\.json$/, '');
  const title = slugmap[slug]?.title;
  if (!title) continue;
  if (!fs.existsSync(path.join(wikiDir, slug, 'index.html'))) continue;

  const history = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8')).history ?? [];
  for (const entry of history) {
    if (typeof entry?.date !== 'string' || !entry.date) continue;
    if (typeof entry?.sha !== 'string' || !entry.sha) continue;
    expectedChanges.push({
      slug,
      title,
      date: entry.date,
      sha: entry.sha,
      authorName: typeof entry?.authorName === 'string' ? entry.authorName : '',
      message: typeof entry?.message === 'string' ? entry.message : '',
      categories: Array.isArray(slugmap[slug]?.categories) ? slugmap[slug].categories : [],
    });
  }
}

expectedChanges.sort((a, b) => {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return compareTitles(a.slug, b.slug);
});

const limitedChanges = expectedChanges.slice(0, RECENT_LIMIT);
assert.ok(limitedChanges.length > 0, 'recentchanges JSON Feed must contain at least one revision event');

assert.ok(Array.isArray(feed.items), 'recentchanges JSON Feed items must be an array');
assert.equal(
  feed.items.length,
  limitedChanges.length,
  `recentchanges JSON Feed must contain ${limitedChanges.length} items (got ${feed.items.length})`,
);

const seenIds = new Set();

for (let i = 0; i < limitedChanges.length; i++) {
  const expected = limitedChanges[i];
  const item = feed.items[i];
  const expectedId = `urn:taopedia:recentchanges:${expected.slug}:${expected.sha}`;

  assert.equal(item.id, expectedId, `item ${i}: id must use the per-article revision-event identifier`);
  assert.ok(!seenIds.has(item.id), `item ${i}: id ${item.id} must be unique`);
  seenIds.add(item.id);

  assert.equal(item.url, `${ORIGIN}/wiki/${expected.slug}/`, `item ${i}: url must be the canonical article URL`);
  assert.equal(item.title, expected.title, `item ${i}: title must match the article title`);
  assert.equal(item.content_text, recentChangeSummary(expected), `item ${i}: content_text must match the author/message summary`);
  assert.equal(item.summary, recentChangeSummary(expected), `item ${i}: summary must match the author/message summary`);
  assert.equal(item.image, `${ORIGIN}/og/${expected.slug}.png`, `item ${i}: image must point at the article OG image`);
  assert.equal(item.date_published, new Date(expected.date).toISOString(), `item ${i}: date_published must equal the revision date in RFC 3339 form`);
  assert.equal(item.date_modified, new Date(expected.date).toISOString(), `item ${i}: date_modified must equal the revision date in RFC 3339 form`);
  assert.deepEqual(item.tags ?? [], expected.categories, `item ${i}: tags must match the article topic list`);
}

const htmlRows = [...html.matchAll(/<li[^>]*class="mw-rc-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  date: (block.match(/datetime="([^"]+)"/) || [])[1],
  slug: slugFromWikiHref((block.match(/mw-rc-title[^>]*href="([^"]+)"/) || [])[1] || ''),
}));

assert.equal(
  htmlRows.length,
  limitedChanges.length,
  `recentchanges JSON Feed (${limitedChanges.length}) and Recent changes HTML (${htmlRows.length}) must list the same number of entries`,
);

htmlRows.forEach((row, index) => {
  assert.equal(limitedChanges[index].slug, row.slug, `item ${index}: JSON Feed slug must match the Recent changes HTML row slug`);
  assert.equal(limitedChanges[index].date, row.date, `item ${index}: JSON Feed date must match the Recent changes HTML row date`);
});

console.log(
  `Recent changes JSON Feed check passed (${limitedChanges.length} items, newest ${limitedChanges[0].date}; history-ground-truth + HTML parity verified)`,
);
