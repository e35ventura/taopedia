import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Built-output check for the per-category RSS endpoint
// (src/pages/wiki/category/[category]/rss.xml.ts). The source-level check
// (check-category-feed.js) verifies the endpoint imports the shared builder and
// filters by category, but it cannot tell whether the generated feed is actually
// well-formed, scoped to the correct category, or contains every member. This
// check walks each built dist/wiki/category/<_>/rss.xml, parses the channel
// envelope and items, and verifies RSS 2.0 structure, category scoping,
// membership completeness, canonical URLs, dates, and channel identity — so a
// regression that broke routing, filtering, URL derivation, or date wiring fails
// the build. Mirrors the approach of check-category-atom-feed.js and
// check-category-json-feed.js for the other two syndication formats.

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

const decodeXml = (value) =>
  String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

function textFor(xml, tagName, label) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  assert.ok(match, `${label}: missing <${tagName}>`);
  return decodeXml(match[1]);
}

const itemsFor = (channel) => [...channel.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);

const isValidRfc822Date = (value) => {
  if (typeof value !== 'string' || !value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

let checkedCategories = 0;
let checkedItems = 0;

for (const category of categories) {
  const feedPath = path.join(categoryDir, category, 'rss.xml');
  assert.ok(fs.existsSync(feedPath), `missing built category RSS feed: ${category}/rss.xml`);

  const feed = fs.readFileSync(feedPath, 'utf8');
  const originalName = dirToOriginal.get(category);
  assert.ok(originalName, `${category}: built category directory must correspond to a known category label`);

  // RSS 2.0 envelope
  assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), `${category}: RSS feed must declare XML`);
  assert.match(
    feed,
    /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom" xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/">/,
    `${category}: RSS feed must declare RSS 2.0 with atom and media namespaces`,
  );

  const channelMatch = feed.match(/<channel>([\s\S]*?)<\/channel>/);
  assert.ok(channelMatch, `${category}: RSS feed must render a <channel>`);
  const channel = channelMatch[1];

  assert.equal(
    textFor(channel, 'title', category),
    `Taopedia - ${originalName} articles`,
    `${category}: channel title must name the category`,
  );
  assert.equal(
    textFor(channel, 'link', category),
    `${ORIGIN}/wiki/category/${category}/`,
    `${category}: channel link must point at the category hub`,
  );
  assert.equal(
    textFor(channel, 'description', category),
    `Recently updated Taopedia articles in the ${originalName} topic.`,
    `${category}: channel description must describe the category scope`,
  );
  assert.equal(textFor(channel, 'language', category), 'en', `${category}: RSS feed must declare the language`);
  assert.match(
    channel,
    /<image>\s*<url>https:\/\/taopedia\.org\/favicon-32x32\.png<\/url>\s*<title>Taopedia - [^<]+ articles<\/title>\s*<link>https:\/\/taopedia\.org\/wiki\/category\/[^<]+\/<\/link>\s*<\/image>/,
    `${category}: RSS feed must carry the branded channel image`,
  );
  assert.match(
    channel,
    new RegExp(
      `<atom:link href="${escapeXml(`${ORIGIN}/wiki/category/${category}/rss.xml`)}" rel="self" type="application/rss\\+xml" />`,
    ),
    `${category}: RSS feed must advertise its self atom:link`,
  );

  const members = new Set(categoriesIndex[originalName]);
  const items = itemsFor(channel);
  assert.ok(items.length > 0, `${category}: category RSS feed must contain at least one article`);

  const feedSlugs = new Set();
  for (const item of items) {
    const link = textFor(item, 'link', `${category}/item`);
    assert.match(
      link,
      /^https:\/\/taopedia\.org\/wiki\/[^/]+\/$/,
      `${category}: item link must be a canonical trailing-slash article URL, got ${link}`,
    );

    const slug = new URL(link).pathname.slice('/wiki/'.length, -1);
    assert.ok(
      members.has(slug),
      `${category}: item ${slug} appears in the RSS feed but is not a member of this category`,
    );
    assert.ok(!feedSlugs.has(slug), `${category}: item ${slug} appears more than once in the RSS feed`);
    feedSlugs.add(slug);

    // Every published article carries revision history, so each item must expose
    // a valid RFC 822 date (the signal a feed reader sorts on).
    assert.ok(
      isValidRfc822Date(textFor(item, 'pubDate', `${category}/${slug}`)),
      `${category}: item ${slug} must carry a valid pubDate (RFC 822)`,
    );
    checkedItems += 1;
  }

  // Completeness: no member is silently dropped from its category feed.
  const missing = [...members].filter((slug) => !feedSlugs.has(slug));
  assert.deepEqual(
    missing,
    [],
    `${category}: RSS feed is missing ${missing.length} member article(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}`,
  );

  checkedCategories += 1;
}

console.log(`Category RSS feed check passed (${checkedCategories} categories, ${checkedItems} items)`);
