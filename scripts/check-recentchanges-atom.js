import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildRecentChangesAtomItems } from '../src/lib/recent-changes-feed.js';
import { buildAtomFeed } from './atom-feed.js';
import { RECENT_LIMIT } from '../src/lib/recent-changes.js';
import { slugFromWikiHref } from '../src/lib/wiki-article-path.js';

const ORIGIN = 'https://taopedia.org';

// ---- Regression: same-timestamp tiebreak must match Special:RecentChanges ----
//
// collectRecentChanges (the HTML page + recentchanges.json source of truth)
// breaks equal-date ties with compareTitles(slug). The Atom feed must agree.
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
  const items = buildRecentChangesAtomItems({ changes, origin: ORIGIN, categoriesBySlug: {} });
  const xml = buildAtomFeed({ siteUrl: `${ORIGIN}/`, feedPath: '/wiki/special/recentchanges/atom.xml', items });
  const posAlpha = xml.indexOf(`href="${ORIGIN}/wiki/alpha/"`);
  const posAlphaBeta = xml.indexOf(`href="${ORIGIN}/wiki/alpha_beta/"`);
  assert.ok(posAlpha > -1 && posAlphaBeta > -1, 'both same-date items must appear in the Atom feed');
  assert.ok(
    posAlpha < posAlphaBeta,
    'same-timestamp tiebreak must order by slug (alpha before alpha_beta), matching Special:RecentChanges, NOT by full URL',
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const atomFile = path.join(wikiDir, 'special', 'recentchanges', 'atom.xml');
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
  const items = buildRecentChangesAtomItems({
    origin: ORIGIN,
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
        id: 'urn:taopedia:recentchanges:subnet_9:abc123',
        title: 'Subnet 9',
        url: `${ORIGIN}/wiki/subnet_9/`,
        sortKey: 'subnet_9',
        image: `${ORIGIN}/og/subnet_9.png`,
        description: 'Edited by Alice: Fix title & improve <summary>',
        categories: [],
        datePublished: '2026-06-21T10:53:45.000Z',
        dateModified: '2026-06-21T10:53:45.000Z',
      },
      {
        id: 'urn:taopedia:recentchanges:subnet_10:abc123',
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
    'helper must build stable Atom items with per-event ids, canonical URLs, OG images, and summaries even when multiple articles share one revision sha',
  );

  // categories come from categoriesBySlug (the article's topics), matching the
  // RSS and JSON Feed recentchanges items so all three feed formats expose the
  // same per-change topic categories.
  const withCategories = buildRecentChangesAtomItems({
    origin: ORIGIN,
    changes: [{ slug: 'subnet_9', title: 'Subnet 9', sha: 'abc123', date: '2026-06-21T10:53:45.000Z', authorName: 'Alice', message: 'x' }],
    categoriesBySlug: { subnet_9: ['Subnets', 'Consensus'] },
  });
  assert.deepEqual(
    withCategories[0].categories,
    ['Subnets', 'Consensus'],
    'Atom recentchanges items must carry the article topic categories from categoriesBySlug (parity with RSS/JSON Feed)',
  );
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(atomFile), 'dist/wiki/special/recentchanges/atom.xml not found; run the build first');
assert.ok(fs.existsSync(htmlFile), 'dist/wiki/special/recentchanges/index.html not found; run the build first');
assert.ok(fs.existsSync(historyDir), 'public/history not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const feed = fs.readFileSync(atomFile, 'utf8');
const html = fs.readFileSync(htmlFile, 'utf8');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);

assert.ok(headMatch, 'Recent changes page must render a <head> block');

const linkTags = [...headMatch[1].matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);

assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'recentchanges Atom feed must declare the XML prolog');
assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom" xml:lang="en">/, 'recentchanges Atom feed must declare Atom 1.0');
assert.equal(
  textFor(feed, 'id', 'recentchanges atom'),
  `${ORIGIN}/wiki/special/recentchanges/atom.xml`,
  'recentchanges Atom feed id must be the canonical feed URL',
);
assert.equal(
  textFor(feed, 'title', 'recentchanges atom'),
  'Taopedia - Recent changes',
  'recentchanges Atom feed title must name the surface',
);
assert.equal(
  textFor(feed, 'subtitle', 'recentchanges atom'),
  'Most recent revision events across published Taopedia articles.',
  'recentchanges Atom feed subtitle must describe the revision-level scope',
);
assert.ok(
  feed.includes(`<link rel="alternate" href="${ORIGIN}/wiki/special/recentchanges/" />`),
  'recentchanges Atom feed alternate link must point at the Recent changes page',
);
assert.ok(
  feed.includes(`<link rel="self" type="application/atom+xml" href="${ORIGIN}/wiki/special/recentchanges/atom.xml" />`),
  'recentchanges Atom feed self link must point at the recentchanges Atom endpoint',
);
assert.match(feed, /<author><name>Taopedia<\/name><\/author>/, 'recentchanges Atom feed must declare the required Atom author');
assert.ok(
  hasAlternateLink(linkTags, 'application/atom+xml', '/wiki/special/recentchanges/atom.xml'),
  'Recent changes page <head> must advertise rel="alternate" type="application/atom+xml" href="/wiki/special/recentchanges/atom.xml"',
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
    });
  }
}

expectedChanges.sort((a, b) => {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return compareTitles(a.slug, b.slug);
});

const limitedChanges = expectedChanges.slice(0, RECENT_LIMIT);
assert.ok(limitedChanges.length > 0, 'recentchanges Atom feed must contain at least one revision event');

const entries = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
assert.equal(
  entries.length,
  limitedChanges.length,
  `recentchanges Atom feed must contain ${limitedChanges.length} entries (got ${entries.length})`,
);

const feedUpdated = textFor(feed, 'updated', 'recentchanges atom');
assert.equal(feedUpdated, limitedChanges[0].date, 'recentchanges Atom feed updated must equal the newest revision date');

const seenIds = new Set();

for (let i = 0; i < limitedChanges.length; i++) {
  const expected = limitedChanges[i];
  const entry = entries[i];
  const entryId = textFor(entry, 'id', `entry ${i}`);
  const entryTitle = textFor(entry, 'title', `entry ${i}`);
  const entryUpdated = textFor(entry, 'updated', `entry ${i}`);
  const entryPublished = textFor(entry, 'published', `entry ${i}`);
  const entrySummaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
  const entrySummary = entrySummaryMatch ? decodeXml(entrySummaryMatch[1]) : '';
  const link = entry.match(/<link rel="alternate" href="([^"]+)" \/>/);
  const image = entry.match(/<link rel="enclosure" type="image\/png" href="([^"]+)" \/>/);

  assert.ok(link, `entry ${i}: missing alternate article link`);
  assert.ok(image, `entry ${i}: missing OG image enclosure`);
  assert.equal(
    entryId,
    `urn:taopedia:recentchanges:${expected.slug}:${expected.sha}`,
    `entry ${i}: id must use a stable per-event identifier`,
  );
  assert.ok(!seenIds.has(entryId), `entry ${i}: feed id ${entryId} must be unique`);
  seenIds.add(entryId);

  assert.equal(entryTitle, expected.title, `entry ${i}: title must match the article title`);
  assert.equal(link[1], `${ORIGIN}/wiki/${expected.slug}/`, `entry ${i}: alternate link must be the canonical article URL`);
  assert.equal(image[1], `${ORIGIN}/og/${expected.slug}.png`, `entry ${i}: enclosure must point at the article OG image`);
  assert.equal(entryUpdated, expected.date, `entry ${i}: updated must equal the revision date`);
  assert.equal(entryPublished, expected.date, `entry ${i}: published must equal the revision date`);

  const expectedSummary = recentChangeSummary(expected);
  assert.equal(entrySummary, expectedSummary, `entry ${i}: summary must match the author/message summary`);

  // Per-change topic categories must appear as <category term="..."> — parity
  // with the recentchanges RSS (<category>) and JSON Feed (tags) siblings, which
  // already expose the article's topics for the same change event.
  const expectedCategories = Array.isArray(slugmap[expected.slug]?.categories) ? slugmap[expected.slug].categories : [];
  const entryCategoryTerms = [...entry.matchAll(/<category term="([^"]*)" \/>/g)].map(([, term]) => decodeXml(term));
  assert.deepEqual(
    entryCategoryTerms,
    expectedCategories,
    `entry ${i}: <category term> list must equal the article's topics for ${expected.slug} (parity with the RSS/JSON-Feed recentchanges siblings)`,
  );
}

const htmlRows = [...html.matchAll(/<li[^>]*class="mw-rc-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  date: (block.match(/datetime="([^"]+)"/) || [])[1],
  slug: slugFromWikiHref((block.match(/mw-rc-title[^>]*href="([^"]+)"/) || [])[1] || ''),
}));

assert.equal(
  htmlRows.length,
  limitedChanges.length,
  `recentchanges Atom feed (${limitedChanges.length}) and Recent changes HTML (${htmlRows.length}) must list the same number of entries`,
);

htmlRows.forEach((row, index) => {
  assert.equal(limitedChanges[index].slug, row.slug, `entry ${index}: Atom slug must match the Recent changes HTML row slug`);
  assert.equal(limitedChanges[index].date, row.date, `entry ${index}: Atom date must match the Recent changes HTML row date`);
});

console.log(
  `Recent changes Atom feed check passed (${limitedChanges.length} entries, newest ${limitedChanges[0].date}; history-ground-truth + HTML parity verified)`,
);
