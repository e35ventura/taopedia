import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for RSS feed discovery. The site builds /rss.xml (the
// newest-first feed of article changes), but a feed is useless if nothing points
// to it. This pins the two discovery surfaces:
//   1) <link rel="alternate" type="application/rss+xml"> autodiscovery in the
//      shared <head> (so browsers / feed readers find it on every page), and
//   2) a visible "Subscribe to the RSS feed" link on Special:RecentChanges
//      (the human-facing page the feed syndicates).
// It fails if the feed stops building or either discovery path regresses.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const wikiDir = path.join(distDir, 'wiki');

// The feed itself must build and be a real RSS channel.
const rssPath = path.join(distDir, 'rss.xml');
assert.ok(fs.existsSync(rssPath), 'dist/rss.xml not found; run the build first');
const rss = fs.readFileSync(rssPath, 'utf8');
assert.match(rss, /<rss\b[^>]*version="2\.0"/, 'rss.xml must be an RSS 2.0 document');
assert.match(rss, /<channel>[\s\S]*<title>[\s\S]*<\/channel>/, 'rss.xml must have a channel with a title');

// The autodiscovery <link> must ship in the <head> of every page. The exact
// attribute order can vary, so assert each required attribute is present on a
// single <link ...> tag pointing at /rss.xml.
const RSS_LINK = /<link\b[^>]*rel="alternate"[^>]*>/g;
const hasAutodiscovery = (html) =>
  (html.match(RSS_LINK) || []).some(
    (tag) =>
      /type="application\/rss\+xml"/.test(tag) && /href="\/rss\.xml"/.test(tag) && /title="[^"]+"/.test(tag),
  );

// Check the autodiscovery link on representative pages from each layout path:
// the standalone homepage and a WikiLayout page (Special:RecentChanges).
const homeHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
assert.ok(hasAutodiscovery(homeHtml), 'the homepage <head> must include the RSS autodiscovery <link> to /rss.xml');

const rcFile = path.join(wikiDir, 'special', 'recentchanges', 'index.html');
assert.ok(fs.existsSync(rcFile), 'dist/wiki/special/recentchanges/index.html not found; run the build first');
const rcHtml = fs.readFileSync(rcFile, 'utf8');
assert.ok(hasAutodiscovery(rcHtml), 'every WikiLayout page <head> must include the RSS autodiscovery <link> to /rss.xml');

// Spot-check an article page too (autodiscovery comes from the shared Seo
// component, so it must be on article pages as well).
const anArticle = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .find((e) => e.isDirectory() && e.name !== 'special' && e.name !== 'category' && fs.existsSync(path.join(wikiDir, e.name, 'index.html')));
assert.ok(anArticle, 'no built article page found to spot-check');
const articleHtml = fs.readFileSync(path.join(wikiDir, anArticle.name, 'index.html'), 'utf8');
assert.ok(hasAutodiscovery(articleHtml), 'article page <head> must include the RSS autodiscovery <link> to /rss.xml');

// The visible, human-facing feed link must be on Special:RecentChanges.
assert.match(
  rcHtml,
  /<a\b[^>]*href="\/rss\.xml"[^>]*>[\s\S]*?<\/a>/,
  'Special:RecentChanges must show a visible link to /rss.xml so readers can subscribe',
);

console.log('Feed discovery check passed (rss.xml builds; autodiscovery <link> on home/article/recentchanges; visible RSS link on Recent changes)');
