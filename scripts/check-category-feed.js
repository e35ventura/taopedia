import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Built-output check for the per-category RSS endpoint
// (src/pages/wiki/category/[category]/rss.xml.ts). The shared RSS builder covers
// XML escaping, feed ordering, and custom feed paths. This route-level check
// proves each generated category RSS feed is scoped to that category, points at
// the matching category hub, and includes every member article exactly once.

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

function textFor(xml, tagName, label) {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`));
  assert.ok(match, `${label}: missing <${tagName}>`);
  return match[1];
}

const itemsFor = (feed) => [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
const isValidRssDate = (value) => {
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

  assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), `${category}: RSS feed must declare XML`);
  assert.match(
    feed,
    /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/,
    `${category}: RSS feed must declare RSS 2.0 with the Atom namespace`,
  );

  const channel = textFor(feed, 'channel', category);
  assert.equal(
    textFor(channel, 'title', category),
    `Taopedia - ${escapeXml(originalName)} articles`,
    `${category}: feed title must name the category`,
  );
  assert.equal(
    textFor(channel, 'link', category),
    `${ORIGIN}/wiki/category/${category}/`,
    `${category}: channel link must point at the category hub`,
  );
  assert.ok(
    channel.includes(
      `<atom:link href="${ORIGIN}/wiki/category/${category}/rss.xml" rel="self" type="application/rss+xml" />`,
    ),
    `${category}: feed self link must point at the category RSS endpoint`,
  );
  assert.equal(textFor(channel, 'language', category), 'en', `${category}: RSS feed must declare language`);

  const lastBuildDate = channel.match(/<lastBuildDate>([\s\S]*?)<\/lastBuildDate>/)?.[1];
  assert.ok(isValidRssDate(lastBuildDate), `${category}: feed lastBuildDate must be a valid RSS date`);

  const members = new Set(categoriesIndex[originalName]);
  const items = itemsFor(feed);
  assert.ok(items.length > 0, `${category}: category RSS feed must contain at least one article`);

  const feedSlugs = new Set();
  for (const item of items) {
    const link = textFor(item, 'link', category);
    assert.match(
      link,
      /^https:\/\/taopedia\.org\/wiki\/[^/]+\/$/,
      `${category}: RSS item link must be a canonical trailing-slash article URL, got ${link}`,
    );
    assert.equal(textFor(item, 'guid', category), link, `${category}: item guid must match its canonical link`);

    const slug = new URL(link).pathname.slice('/wiki/'.length, -1);
    assert.ok(members.has(slug), `${category}: item ${slug} appears in the RSS feed but is not a member`);
    assert.ok(!feedSlugs.has(slug), `${category}: item ${slug} appears more than once in the RSS feed`);
    feedSlugs.add(slug);

    assert.ok(
      isValidRssDate(textFor(item, 'pubDate', `${category}/${slug}`)),
      `${category}: item ${slug} must carry a valid RSS pubDate`,
    );
    checkedItems += 1;
  }

  const missing = [...members].filter((slug) => !feedSlugs.has(slug));
  assert.deepEqual(
    missing,
    [],
    `${category}: RSS feed is missing ${missing.length} member article(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' ...' : ''}`,
  );

  checkedCategories += 1;
}

console.log(`Category RSS Feed check passed (${checkedCategories} categories, ${checkedItems} items)`);
