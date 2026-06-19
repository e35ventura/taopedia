import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Built-output check for the per-category RSS endpoint
// (src/pages/wiki/category/[category]/rss.xml.ts). The shared RSS builder
// (scripts/rss-feed.js) is covered for XML escaping, feed ordering, and the
// lastBuildDate default by check-rss-feed.js, and the route's SOURCE shape
// is guarded by check-category-feed.js (the per-category filter and
// slugifier). Neither can tell whether the generated per-category feed is
// actually scoped to the category, so a regression that dropped the filter
// would silently publish every article in every category feed — a noisy
// feed reader experience and a broken subscription index. This route-level
// check proves every generated category feed is well-formed RSS 2.0, is
// scoped to the category, points at the matching category hub via its
// channel <link> and atom:self, and keeps the RFC 822 pubDate invariant
// strict feed validators require.

const ORIGIN = 'https://taopedia.org';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const categoryDir = path.join(projectRoot, 'dist', 'wiki', 'category');

assert.ok(fs.existsSync(categoryDir), 'dist/wiki/category not found; run the build first');

// Category membership source of truth: public/data/categories.json maps each
// original category label to its member article slugs (built by
// build-linkgraph.js from the same content collection the feed reads).
const categoriesJsonPath = path.join(projectRoot, 'public', 'data', 'categories.json');
assert.ok(fs.existsSync(categoriesJsonPath), 'public/data/categories.json not found; run the build first');
const categoriesIndex = JSON.parse(fs.readFileSync(categoriesJsonPath, 'utf8'));

const dirToOriginal = new Map();
for (const name of Object.keys(categoriesIndex)) {
  dirToOriginal.set(name.replace(/ /g, '_'), name);
}

const categories = fs
  .readdirSync(categoryDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

assert.ok(categories.length > 0, 'no built category pages found');

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

const itemsFor = (feed) => [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);

// RSS 2.0 <lastBuildDate> and <pubDate> use RFC 822 (e.g. "Fri, 19 Jun 2026
// 17:08:48 GMT"). Date.parse handles RFC 822 in Node, so accept any string
// that parses to a real instant and rejects "Invalid Date".
const isValidRfc822Date = (value) => {
  if (typeof value !== 'string' || !value) return false;
  const t = Date.parse(value);
  return !Number.isNaN(t);
};

let checkedCategories = 0;
let checkedItems = 0;

for (const category of categories) {
  const feedPath = path.join(categoryDir, category, 'rss.xml');
  assert.ok(fs.existsSync(feedPath), `missing built category RSS feed: ${category}/rss.xml`);

  const feed = fs.readFileSync(feedPath, 'utf8');
  const originalName = dirToOriginal.get(category);
  assert.ok(originalName, `${category}: built category directory must correspond to a known category label`);

  // Well-formed RSS 2.0 envelope with the atom namespace so <atom:link> is valid.
  assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), `${category}: RSS feed must declare XML`);
  assert.match(
    feed,
    /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/,
    `${category}: RSS feed must declare RSS 2.0 with the atom namespace`,
  );
  assert.match(feed, /<channel>[\s\S]*<\/channel>/, `${category}: RSS feed must wrap items in a channel`);

  // Channel: title names the category, link points at the hub, atom:self points
  // at this RSS endpoint, language is English, lastBuildDate is a valid RFC 822
  // date. The channel <link> and atom:self must use the same slugifier as the
  // hub (space-to-underscore), which is guaranteed by the dir name already.
  assert.match(
    feed,
    new RegExp(`<title>Taopedia - ${escapeXml(originalName)} articles</title>`),
    `${category}: feed title must name the category`,
  );
  assert.ok(
    feed.includes(`<link>${ORIGIN}/wiki/category/${category}/</link>`),
    `${category}: channel link must point at the category hub`,
  );
  assert.ok(
    feed.includes(
      `<atom:link href="${ORIGIN}/wiki/category/${category}/rss.xml" rel="self" type="application/rss+xml" />`,
    ),
    `${category}: atom:self link must point at the category RSS endpoint`,
  );
  assert.match(feed, /<language>en<\/language>/, `${category}: feed must declare its language`);

  const lastBuildMatch = feed.match(/<lastBuildDate>([^<]*)<\/lastBuildDate>/);
  assert.ok(lastBuildMatch, `${category}: feed must declare a <lastBuildDate>`);
  assert.ok(
    isValidRfc822Date(lastBuildMatch[1]),
    `${category}: <lastBuildDate> must be a valid RFC 822 date, got ${lastBuildMatch[1]}`,
  );

  const members = new Set(categoriesIndex[originalName]);
  const items = itemsFor(feed);
  assert.ok(items.length > 0, `${category}: category RSS feed must contain at least one article`);

  const feedSlugs = new Set();
  for (const item of items) {
    const linkMatch = item.match(/<link>([^<]+)<\/link>/);
    assert.ok(linkMatch, `${category}: every RSS item must declare a <link> to its canonical article URL`);
    assert.match(
      linkMatch[1],
      /^https:\/\/taopedia\.org\/wiki\/[^/]+\/$/,
      `${category}: RSS item link must be a canonical trailing-slash article URL, got ${linkMatch[1]}`,
    );

    const slug = new URL(linkMatch[1]).pathname.slice('/wiki/'.length, -1);
    assert.ok(
      members.has(slug),
      `${category}: item ${slug} appears in the RSS feed but is not a member of this category`,
    );
    assert.ok(!feedSlugs.has(slug), `${category}: item ${slug} appears more than once in the RSS feed`);
    feedSlugs.add(slug);

    const guidMatch = item.match(/<guid[^>]*>([^<]+)<\/guid>/);
    assert.ok(guidMatch, `${category}: item ${slug} must carry a <guid>`);
    assert.equal(
      guidMatch[1],
      linkMatch[1],
      `${category}: item ${slug} <guid> must match its <link>`,
    );

    const pubDateMatch = item.match(/<pubDate>([^<]*)<\/pubDate>/);
    assert.ok(pubDateMatch, `${category}: item ${slug} must carry a <pubDate>`);
    assert.ok(
      isValidRfc822Date(pubDateMatch[1]),
      `${category}: item ${slug} <pubDate> must be a valid RFC 822 date, got ${pubDateMatch[1]}`,
    );
    checkedItems += 1;
  }

  // Completeness: every member slug of the category must appear in the feed.
  const missing = [...members].filter((slug) => !feedSlugs.has(slug));
  assert.deepEqual(
    missing,
    [],
    `${category}: RSS feed is missing ${missing.length} member article(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' ...' : ''}`,
  );

  checkedCategories += 1;
}

console.log(`Category RSS Feed check passed (${checkedCategories} categories, ${checkedItems} items)`);
