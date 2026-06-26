import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildRecentChangesRssItems } from '../src/lib/recent-changes-feed.js';
import { buildRssFeed } from './rss-feed.js';
import { RECENT_LIMIT } from '../src/lib/recent-changes.js';
import { slugFromWikiHref } from '../src/lib/wiki-article-path.js';

const ORIGIN = 'https://taopedia.org';

// ---- Regression: same-timestamp tiebreak must match Special:RecentChanges ----
//
// collectRecentChanges (the HTML page + recentchanges.json source of truth)
// breaks equal-date ties with compareTitles(slug). The feed must agree. Comparing
// the full canonical URL instead diverges when one slug is a prefix of another:
// for "alpha" and "alpha_beta" sharing a commit timestamp, slug order is
// [alpha, alpha_beta] but URL order is [alpha_beta, alpha] (the "/" after the
// shared prefix sorts before "_"). Feed two such same-date changes through the
// item builder + feed and assert the slug order, which the URL tiebreak failed.
{
  const sameDate = '2026-06-01T00:00:00.000Z';
  const changes = [
    { slug: 'alpha_beta', title: 'Alpha Beta', date: sameDate, sha: 'b', authorName: 'x', message: 'm' },
    { slug: 'alpha', title: 'Alpha', date: sameDate, sha: 'a', authorName: 'x', message: 'm' },
  ];
  const items = buildRecentChangesRssItems({ changes, origin: ORIGIN, categoriesBySlug: {} });
  const xml = buildRssFeed({ siteUrl: `${ORIGIN}/`, feedPath: '/wiki/special/recentchanges/rss.xml', items });
  const posAlpha = xml.indexOf(`<link>${ORIGIN}/wiki/alpha/</link>`);
  const posAlphaBeta = xml.indexOf(`<link>${ORIGIN}/wiki/alpha_beta/</link>`);
  assert.ok(posAlpha > -1 && posAlphaBeta > -1, 'both same-date items must appear in the RSS feed');
  assert.ok(
    posAlpha < posAlphaBeta,
    'same-timestamp tiebreak must order by slug (alpha before alpha_beta), matching Special:RecentChanges, NOT by full URL',
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const rssFile = path.join(wikiDir, 'special', 'recentchanges', 'rss.xml');
const htmlFile = path.join(wikiDir, 'special', 'recentchanges', 'index.html');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

const decodeXml = (value) =>
  String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const toRfc822 = (value) => {
  const date = new Date(value);
  assert.ok(!Number.isNaN(date.getTime()), `invalid date: ${value}`);
  return date.toUTCString();
};

const recentChangeSummary = (change) => {
  const authorName = typeof change?.authorName === 'string' ? change.authorName.trim() : '';
  const message = typeof change?.message === 'string' ? change.message.trim() : '';
  if (authorName && message) return `Edited by ${authorName}: ${message}`;
  if (authorName) return `Edited by ${authorName}`;
  return message;
};

const textFor = (xml, tagName, label) => {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  assert.ok(match, `${label}: missing <${tagName}>`);
  return decodeXml(match[1]);
};

const hasAlternateLink = (linkTags, type, href) =>
  linkTags.some(
    (tag) =>
      tag.includes('rel="alternate"') && tag.includes(`type="${type}"`) && tag.includes(`href="${href}"`),
  );

// ---- 1) Unit: recent-changes item mapping ---------------------------------
{
  const items = buildRecentChangesRssItems({
    origin: ORIGIN,
    categoriesBySlug: {
      subnet_9: ['Subnets', 'Validation'],
      subnet_10: [],
    },
    changes: [
      {
        slug: 'subnet_9',
        title: 'Subnet 9',
        sha: 'abc123',
        date: '2026-06-21T10:53:45.000Z',
        authorName: 'Alice',
        message: 'Fix title & improve <summary>',
      },
      {
        slug: 'subnet_10',
        title: 'Subnet 10',
        sha: 'abc123',
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
        guid: 'urn:taopedia:recentchanges:subnet_9:abc123',
        title: 'Subnet 9',
        url: `${ORIGIN}/wiki/subnet_9/`,
        sortKey: 'subnet_9',
        image: `${ORIGIN}/og/subnet_9.png`,
        description: 'Edited by Alice: Fix title & improve <summary>',
        categories: ['Subnets', 'Validation'],
        date: '2026-06-21T10:53:45.000Z',
      },
      {
        guid: 'urn:taopedia:recentchanges:subnet_10:abc123',
        title: 'Subnet 10',
        url: `${ORIGIN}/wiki/subnet_10/`,
        sortKey: 'subnet_10',
        image: `${ORIGIN}/og/subnet_10.png`,
        description: 'Edited by Bob',
        categories: [],
        date: '2026-06-21T09:28:57.000Z',
      },
    ],
    'helper must build stable RSS items with per-event guids, canonical URLs, OG images, summaries, and categories even when multiple articles share one revision sha',
  );
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(rssFile), 'dist/wiki/special/recentchanges/rss.xml not found; run the build first');
assert.ok(fs.existsSync(htmlFile), 'dist/wiki/special/recentchanges/index.html not found; run the build first');
assert.ok(fs.existsSync(historyDir), 'public/history not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const feed = fs.readFileSync(rssFile, 'utf8');
const html = fs.readFileSync(htmlFile, 'utf8');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);

assert.ok(headMatch, 'Recent changes page must render a <head> block');

const linkTags = [...headMatch[1].matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);

assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'recentchanges RSS feed must declare the XML prolog');
assert.match(
  feed,
  /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom" xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/">/,
  'recentchanges RSS feed must declare RSS 2.0 with atom and media namespaces',
);

const channelMatch = feed.match(/<channel>([\s\S]*?)<\/channel>/);
assert.ok(channelMatch, 'recentchanges RSS feed must render a <channel>');
const channel = channelMatch[1];

assert.equal(
  textFor(channel, 'title', 'recentchanges rss'),
  'Taopedia - Recent changes',
  'recentchanges RSS feed title must name the surface',
);
assert.equal(
  textFor(channel, 'link', 'recentchanges rss'),
  `${ORIGIN}/wiki/special/recentchanges/`,
  'recentchanges RSS channel link must point at the Recent changes page',
);
assert.equal(
  textFor(channel, 'description', 'recentchanges rss'),
  'Most recent revision events across published Taopedia articles.',
  'recentchanges RSS description must describe the revision-level scope',
);
assert.equal(textFor(channel, 'language', 'recentchanges rss'), 'en', 'recentchanges RSS feed must declare the language');
assert.match(
  channel,
  /<image>\s*<url>https:\/\/taopedia\.org\/favicon-32x32\.png<\/url>\s*<title>Taopedia - Recent changes<\/title>\s*<link>https:\/\/taopedia\.org\/wiki\/special\/recentchanges\/<\/link>\s*<\/image>/,
  'recentchanges RSS feed must carry the branded channel image',
);
assert.match(
  channel,
  /<atom:link href="https:\/\/taopedia\.org\/wiki\/special\/recentchanges\/rss\.xml" rel="self" type="application\/rss\+xml" \/>/,
  'recentchanges RSS feed must advertise its self atom:link',
);
assert.ok(
  hasAlternateLink(linkTags, 'application/rss+xml', '/wiki/special/recentchanges/rss.xml'),
  'Recent changes page <head> must advertise rel="alternate" type="application/rss+xml" href="/wiki/special/recentchanges/rss.xml"',
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
assert.ok(limitedChanges.length > 0, 'recentchanges RSS feed must contain at least one revision event');

assert.equal(
  textFor(channel, 'lastBuildDate', 'recentchanges rss'),
  toRfc822(limitedChanges[0].date),
  'recentchanges RSS lastBuildDate must equal the newest revision date',
);

const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
assert.equal(
  items.length,
  limitedChanges.length,
  `recentchanges RSS feed must contain ${limitedChanges.length} items (got ${items.length})`,
);

const seenGuids = new Set();

for (let i = 0; i < limitedChanges.length; i++) {
  const expected = limitedChanges[i];
  const item = items[i];
  const title = textFor(item, 'title', `item ${i}`);
  const link = textFor(item, 'link', `item ${i}`);
  const guidMatch = item.match(/<guid isPermaLink="([^"]+)">([\s\S]*?)<\/guid>/);
  const description = item.includes('<description>') ? textFor(item, 'description', `item ${i}`) : '';
  const pubDate = textFor(item, 'pubDate', `item ${i}`);
  const mediaMatch = item.match(
    /<media:content url="([^"]+)" type="image\/png" medium="image" width="1200" height="630" \/>/,
  );
  const categories = [...item.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((match) => decodeXml(match[1]));

  assert.ok(guidMatch, `item ${i}: missing guid`);
  assert.ok(mediaMatch, `item ${i}: missing media:content OG image`);

  const guid = decodeXml(guidMatch[2]);
  assert.equal(title, expected.title, `item ${i}: title must match the article title`);
  assert.equal(link, `${ORIGIN}/wiki/${expected.slug}/`, `item ${i}: link must be the canonical article URL`);
  assert.equal(guidMatch[1], 'false', `item ${i}: guid must be marked as a non-permalink revision id`);
  assert.equal(
    guid,
    `urn:taopedia:recentchanges:${expected.slug}:${expected.sha}`,
    `item ${i}: guid must use a stable per-event identifier`,
  );
  assert.ok(!seenGuids.has(guid), `item ${i}: guid ${guid} must be unique`);
  seenGuids.add(guid);
  assert.equal(description, recentChangeSummary(expected), `item ${i}: description must match the author/message summary`);
  assert.equal(pubDate, toRfc822(expected.date), `item ${i}: pubDate must equal the revision date in RFC 822 form`);
  assert.equal(mediaMatch[1], `${ORIGIN}/og/${expected.slug}.png`, `item ${i}: media:content must point at the article OG image`);
  assert.deepEqual(categories, expected.categories, `item ${i}: categories must match the article topic list`);
}

const htmlRows = [...html.matchAll(/<li[^>]*class="mw-rc-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  date: (block.match(/datetime="([^"]+)"/) || [])[1],
  slug: slugFromWikiHref((block.match(/mw-rc-title[^>]*href="([^"]+)"/) || [])[1] || ''),
}));

assert.equal(
  htmlRows.length,
  limitedChanges.length,
  `recentchanges RSS feed (${limitedChanges.length}) and Recent changes HTML (${htmlRows.length}) must list the same number of entries`,
);

htmlRows.forEach((row, index) => {
  assert.equal(limitedChanges[index].slug, row.slug, `item ${index}: RSS slug must match the Recent changes HTML row slug`);
  assert.equal(limitedChanges[index].date, row.date, `item ${index}: RSS date must match the Recent changes HTML row date`);
});

console.log(
  `Recent changes RSS feed check passed (${limitedChanges.length} items, newest ${limitedChanges[0].date}; history-ground-truth + HTML parity verified)`,
);
