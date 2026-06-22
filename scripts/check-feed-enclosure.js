import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRssFeed } from './rss-feed.js';
import { buildAtomFeed } from './atom-feed.js';
import { buildJsonFeed } from './json-feed.js';

// Per-item article images in the syndication feeds: each RSS <item> carries a
// Media RSS <media:content> and each Atom <entry> a <link rel="enclosure">
// pointing at the article's Open Graph card (/og/<slug>.png), so feed readers can
// show a thumbnail for every entry. Load-bearing: a dropped element, a wrong
// media URL, or an entry whose image 404s would silently leave entries imageless.
// This check (1) unit-tests the builders — image present => element emitted with
// the right attributes + namespace, image absent => no empty element; and (2)
// validates the BUILT rss.xml / atom.xml (+ a category feed): every entry's media
// URL is its own article's OG card AND that /og/<slug>.png was actually built.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

// ---- 1) Unit: builders emit the image element only when an image is given ---
{
  const rss = buildRssFeed({
    siteUrl: 'https://taopedia.org/',
    items: [{ title: 'A', url: 'https://taopedia.org/wiki/a/', image: 'https://taopedia.org/og/a.png', date: '2026-06-01T00:00:00Z' }],
  });
  assert.match(rss, /<rss [^>]*xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/, 'RSS root must declare the media namespace');
  assert.match(
    rss,
    /<media:content url="https:\/\/taopedia\.org\/og\/a\.png" type="image\/png" medium="image" width="1200" height="630" \/>/,
    'RSS items must carry a Media RSS <media:content> pointing at the article OG card',
  );
  const rssNoImage = buildRssFeed({ siteUrl: 'https://taopedia.org/', items: [{ title: 'B', url: 'https://taopedia.org/wiki/b/', date: '2026-06-01T00:00:00Z' }] });
  assert.ok(!rssNoImage.includes('<media:content'), 'RSS items without an image must not emit an empty media:content');

  const atom = buildAtomFeed({
    siteUrl: 'https://taopedia.org/',
    items: [{ title: 'A', url: 'https://taopedia.org/wiki/a/', image: 'https://taopedia.org/og/a.png', dateModified: '2026-06-01T00:00:00Z' }],
  });
  assert.match(
    atom,
    /<link rel="enclosure" type="image\/png" href="https:\/\/taopedia\.org\/og\/a\.png" \/>/,
    'Atom entries must carry a <link rel="enclosure"> pointing at the article OG card',
  );
  const atomNoImage = buildAtomFeed({ siteUrl: 'https://taopedia.org/', items: [{ title: 'B', url: 'https://taopedia.org/wiki/b/', dateModified: '2026-06-01T00:00:00Z' }] });
  assert.ok(!atomNoImage.includes('rel="enclosure"'), 'Atom entries without an image must not emit an enclosure link');

  const json = JSON.parse(buildJsonFeed({
    siteUrl: 'https://taopedia.org/',
    items: [{ title: 'A', url: 'https://taopedia.org/wiki/a/', image: 'https://taopedia.org/og/a.png', dateModified: '2026-06-01T00:00:00Z' }],
  }));
  assert.equal(json.items[0].image, 'https://taopedia.org/og/a.png', 'JSON Feed items must carry the article OG card as item.image');
  const jsonNoImage = JSON.parse(buildJsonFeed({ siteUrl: 'https://taopedia.org/', items: [{ title: 'B', url: 'https://taopedia.org/wiki/b/', dateModified: '2026-06-01T00:00:00Z' }] }));
  assert.ok(!('image' in jsonNoImage.items[0]), 'JSON Feed items without an image must omit the image field');
}

// ---- 2) Built output: every feed entry has an image, and the image exists ----
const ogBuilt = (slug) => fs.existsSync(path.join(distDir, 'og', `${slug}.png`));

function checkRss(relPath) {
  const file = path.join(distDir, relPath);
  assert.ok(fs.existsSync(file), `${relPath} not found; run the build first`);
  const xml = fs.readFileSync(file, 'utf8');
  assert.match(xml, /xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/, `${relPath} must declare the media namespace`);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => body);
  assert.ok(items.length > 0, `${relPath} must contain at least one item`);
  for (const item of items) {
    const slug = (item.match(/<link>https?:\/\/[^/]+\/wiki\/([^/]+)\/<\/link>/) || [])[1];
    assert.ok(slug, `${relPath}: every item must link to a /wiki/<slug>/ article`);
    const mediaUrl = (item.match(/<media:content url="([^"]+)"/) || [])[1];
    assert.ok(mediaUrl, `${relPath}: item ${slug} must carry a <media:content> image`);
    assert.ok(mediaUrl.endsWith(`/og/${slug}.png`), `${relPath}: item ${slug} image (${mediaUrl}) must be its own OG card`);
    assert.ok(ogBuilt(slug), `${relPath}: item ${slug} references /og/${slug}.png but no such card was built`);
  }
  return items.length;
}

function checkAtom(relPath) {
  const file = path.join(distDir, relPath);
  assert.ok(fs.existsSync(file), `${relPath} not found; run the build first`);
  const xml = fs.readFileSync(file, 'utf8');
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, body]) => body);
  assert.ok(entries.length > 0, `${relPath} must contain at least one entry`);
  for (const entry of entries) {
    const slug = (entry.match(/<link rel="alternate" href="https?:\/\/[^/]+\/wiki\/([^/]+)\/" \/>/) || [])[1];
    assert.ok(slug, `${relPath}: every entry must link to a /wiki/<slug>/ article`);
    const encUrl = (entry.match(/<link rel="enclosure" type="image\/png" href="([^"]+)" \/>/) || [])[1];
    assert.ok(encUrl, `${relPath}: entry ${slug} must carry an enclosure image`);
    assert.ok(encUrl.endsWith(`/og/${slug}.png`), `${relPath}: entry ${slug} enclosure (${encUrl}) must be its own OG card`);
    assert.ok(ogBuilt(slug), `${relPath}: entry ${slug} references /og/${slug}.png but no such card was built`);
  }
  return entries.length;
}

function checkJson(relPath) {
  const file = path.join(distDir, relPath);
  assert.ok(fs.existsSync(file), `${relPath} not found; run the build first`);
  const feed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(feed.items) && feed.items.length > 0, `${relPath} must contain at least one item`);
  for (const item of feed.items) {
    const slug = (String(item.url || '').match(/\/wiki\/([^/]+)\/$/) || [])[1];
    assert.ok(slug, `${relPath}: every item must have a /wiki/<slug>/ url`);
    assert.ok(typeof item.image === 'string' && item.image, `${relPath}: item ${slug} must carry an image`);
    assert.ok(item.image.endsWith(`/og/${slug}.png`), `${relPath}: item ${slug} image (${item.image}) must be its own OG card`);
    assert.ok(ogBuilt(slug), `${relPath}: item ${slug} references /og/${slug}.png but no such card was built`);
  }
  return feed.items.length;
}

const rssItems = checkRss('rss.xml');
const atomEntries = checkAtom('atom.xml');
const jsonItems = checkJson('feed.json');

// A category feed too, so the shared builders are exercised on the nested routes.
const categoryDir = path.join(distDir, 'wiki', 'category');
const sampleCategory = fs.existsSync(categoryDir)
  ? fs.readdirSync(categoryDir).find((c) => fs.existsSync(path.join(categoryDir, c, 'rss.xml')))
  : undefined;
if (sampleCategory) {
  checkRss(path.join('wiki', 'category', sampleCategory, 'rss.xml'));
  checkAtom(path.join('wiki', 'category', sampleCategory, 'atom.xml'));
  checkJson(path.join('wiki', 'category', sampleCategory, 'feed.json'));
}

console.log(
  `Feed enclosure check passed (rss.xml ${rssItems} items, atom.xml ${atomEntries} entries, feed.json ${jsonItems} items${sampleCategory ? `, +category ${sampleCategory}` : ''}; every entry carries its built OG card)`,
);
