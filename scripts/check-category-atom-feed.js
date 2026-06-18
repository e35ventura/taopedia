import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Built-output check for the per-category Atom endpoint
// (src/pages/wiki/category/[category]/atom.xml.ts). The shared Atom builder
// covers XML escaping, feed ordering, custom feed paths, and the required
// feed-level author. This route-level check proves every generated category
// feed is actually scoped to that category, points at the matching category hub,
// and keeps the Atom author/date invariants that strict feed validators require.

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
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  assert.ok(match, `${label}: missing <${tagName}>`);
  return match[1];
}

const entriesFor = (feed) => [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
const isValidIsoDate = (value) => {
  if (typeof value !== 'string' || !value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

let checkedCategories = 0;
let checkedItems = 0;

for (const category of categories) {
  const feedPath = path.join(categoryDir, category, 'atom.xml');
  assert.ok(fs.existsSync(feedPath), `missing built category Atom feed: ${category}/atom.xml`);

  const feed = fs.readFileSync(feedPath, 'utf8');
  const originalName = dirToOriginal.get(category);
  assert.ok(originalName, `${category}: built category directory must correspond to a known category label`);

  assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), `${category}: Atom feed must declare XML`);
  assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom" xml:lang="en">/, `${category}: Atom feed must declare Atom 1.0`);
  assert.equal(
    textFor(feed, 'id', category),
    `${ORIGIN}/wiki/category/${category}/atom.xml`,
    `${category}: feed id must be the canonical category Atom URL`,
  );
  assert.equal(
    textFor(feed, 'title', category),
    `Taopedia - ${escapeXml(originalName)} articles`,
    `${category}: feed title must name the category`,
  );
  assert.ok(
    feed.includes(`<link rel="alternate" href="${ORIGIN}/wiki/category/${category}/" />`),
    `${category}: feed alternate link must point at the category hub`,
  );
  assert.ok(
    feed.includes(`<link rel="self" type="application/atom+xml" href="${ORIGIN}/wiki/category/${category}/atom.xml" />`),
    `${category}: feed self link must point at the category Atom endpoint`,
  );
  assert.match(
    feed,
    /<author><name>Taopedia<\/name><\/author>/,
    `${category}: feed must declare the required Atom author`,
  );
  assert.ok(isValidIsoDate(textFor(feed, 'updated', category)), `${category}: feed updated must be a valid ISO date`);

  const members = new Set(categoriesIndex[originalName]);
  const entries = entriesFor(feed);
  assert.ok(entries.length > 0, `${category}: category Atom feed must contain at least one article`);

  const feedSlugs = new Set();
  for (const entry of entries) {
    const link = entry.match(/<link rel="alternate" href="([^"]+)" \/>/);
    assert.ok(link, `${category}: every Atom entry must link to its canonical article URL`);
    assert.match(
      link[1],
      /^https:\/\/taopedia\.org\/wiki\/[^/]+\/$/,
      `${category}: Atom entry link must be a canonical trailing-slash article URL, got ${link[1]}`,
    );

    const slug = new URL(link[1]).pathname.slice('/wiki/'.length, -1);
    assert.ok(
      members.has(slug),
      `${category}: item ${slug} appears in the Atom feed but is not a member of this category`,
    );
    assert.ok(!feedSlugs.has(slug), `${category}: item ${slug} appears more than once in the Atom feed`);
    feedSlugs.add(slug);

    assert.ok(
      isValidIsoDate(textFor(entry, 'updated', `${category}/${slug}`)),
      `${category}: item ${slug} must carry a valid Atom updated date`,
    );
    checkedItems += 1;
  }

  const missing = [...members].filter((slug) => !feedSlugs.has(slug));
  assert.deepEqual(
    missing,
    [],
    `${category}: Atom feed is missing ${missing.length} member article(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' ...' : ''}`,
  );

  checkedCategories += 1;
}

console.log(`Category Atom Feed check passed (${checkedCategories} categories, ${checkedItems} items)`);
