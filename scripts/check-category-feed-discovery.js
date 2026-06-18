import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Each category hub page (/wiki/category/<topic>/) must advertise its own RSS,
// Atom, and JSON feeds from the page <head> with rel="alternate", so a feed
// reader landing on the category page can auto-discover the scoped per-category
// feeds — not just the site-wide feeds that every page carries.
//
// This is the category-level parallel of check-json-feed-discovery.js /
// check-rss-discovery.js: those assert the site-wide discovery links exist in
// Seo.astro; this asserts the per-category links actually render on the built
// category pages, so a regression that drops them (e.g. a WikiLayout/Seo refactor
// that stops forwarding the `feeds` prop) fails the build.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const categoryDir = path.join(projectRoot, 'dist', 'wiki', 'category');

assert.ok(fs.existsSync(categoryDir), 'dist/wiki/category not found; run the build first');

const categories = fs
  .readdirSync(categoryDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

assert.ok(categories.length > 0, 'no built category pages found');

const hasAlternateLink = (linkTags, type, href) =>
  linkTags.some(
    (tag) =>
      tag.includes('rel="alternate"') && tag.includes(`type="${type}"`) && tag.includes(`href="${href}"`),
  );

let checked = 0;
for (const category of categories) {
  const htmlPath = path.join(categoryDir, category, 'index.html');
  assert.ok(fs.existsSync(htmlPath), `missing built category page: ${category}/index.html`);

  const html = fs.readFileSync(htmlPath, 'utf8');
  // Restrict to the rendered <head> block: feed autodiscovery <link> tags only
  // count when they live in <head>, so a body-level link (e.g. inside article
  // HTML) can never satisfy this check by accident.
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  assert.ok(headMatch, `${category}: category page must render a <head> block`);
  const linkTags = [...headMatch[1].matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);

  const rssHref = `/wiki/category/${category}/rss.xml`;
  const atomHref = `/wiki/category/${category}/atom.xml`;
  const jsonHref = `/wiki/category/${category}/feed.json`;

  assert.ok(
    hasAlternateLink(linkTags, 'application/rss+xml', rssHref),
    `${category}: category page <head> must advertise its RSS feed via rel="alternate" type="application/rss+xml" href="${rssHref}"`,
  );
  assert.ok(
    hasAlternateLink(linkTags, 'application/atom+xml', atomHref),
    `${category}: category page <head> must advertise its Atom feed via rel="alternate" type="application/atom+xml" href="${atomHref}"`,
  );
  assert.ok(
    hasAlternateLink(linkTags, 'application/feed+json', jsonHref),
    `${category}: category page <head> must advertise its JSON feed via rel="alternate" type="application/feed+json" href="${jsonHref}"`,
  );
  checked += 1;
}

console.log(`Category feed discovery check passed (${checked} categories)`);
