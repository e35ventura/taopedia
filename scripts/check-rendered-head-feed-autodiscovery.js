import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every built page's rendered <head> must advertise the three site-wide
// syndication feeds via <link rel="alternate"> so feed readers and browsers
// can auto-discover /rss.xml, /atom.xml, and /feed.json without guessing the
// URL. The shared <head> lives in src/components/Seo.astro and the existing
// check-{rss,atom,json-feed}-discovery.js scripts read Seo.astro's SOURCE
// to assert the link tags are present in the component. That guards against
// the tags being deleted from the component, but it does NOT catch a
// regression in the rendering pipeline: a refactor of WikiLayout.astro, the
// homepage (src/pages/index.astro renders its own <head>), or an Astro
// component-prop change could drop the tags from the RENDERED output of
// every page even though Seo.astro still contains them. Crawlers and feed
// readers see the rendered HTML, not the source.
//
// This guard parses the rendered HTML of every built page and asserts each
// one carries the three site-wide feed autodiscovery links, with the right
// MIME types. A refactor that drops a link from any page fails the build
// with the offending page listed, so a regression in the rendering
// pipeline is caught the same way a deletion from Seo.astro is.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

assert.ok(fs.existsSync(distDir), 'dist/ not found; run the build first');

const REQUIRED_LINKS = [
  { href: '/rss.xml', type: 'application/rss+xml', label: 'RSS' },
  { href: '/atom.xml', type: 'application/atom+xml', label: 'Atom' },
  { href: '/feed.json', type: 'application/feed+json', label: 'JSON Feed' },
];

// Match a <link ...> tag carrying rel="alternate", the given type, and the
// given href. The attribute order in the rendered HTML is fixed by Seo.astro
// (rel, type, title, href) but a future re-ordering should not trip this
// check, so each attribute is asserted independently on the same tag.
const linkTagRegex = /<link\b[^>]*\bhref="([^"]+)"[^>]*>/g;
function renderedHeadLinks(html) {
  // Restrict the search to the <head>...</head> region so a body that happens
  // to mention the feed URL in prose cannot satisfy the check.
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return [];
  const tags = [];
  for (const tag of headMatch[1].match(/<link\b[^>]*>/g) ?? []) {
    const rel = /<link\b[^>]*\brel="([^"]+)"/.exec(tag)?.[1];
    const type = /<link\b[^>]*\btype="([^"]+)"/.exec(tag)?.[1];
    const href = /<link\b[^>]*\bhref="([^"]+)"/.exec(tag)?.[1];
    if (rel && type && href) tags.push({ rel, type, href });
  }
  return tags;
}

// Every HTML page under dist/ (the built site) is checked. The dist tree
// includes index.html at every route, plus the homepage; every one renders
// a <head> via Seo.astro (article/special/category) or the homepage
// <head> block, and must therefore carry the three feed links.
const htmlPages = [];
function collectHtmlPages(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlPages(full);
    } else if (entry.isFile() && entry.name === 'index.html') {
      htmlPages.push(full);
    }
  }
}
collectHtmlPages(distDir);
assert.ok(htmlPages.length > 0, 'no built HTML pages found in dist/');

const missing = [];
for (const page of htmlPages) {
  const html = fs.readFileSync(page, 'utf8');
  const links = renderedHeadLinks(html);
  for (const required of REQUIRED_LINKS) {
    const present = links.some(
      (l) => l.rel === 'alternate' && l.type === required.type && l.href === required.href,
    );
    if (!present) {
      missing.push(`${path.relative(distDir, page)} (missing ${required.label} link to ${required.href})`);
    }
  }
}

assert.deepEqual(
  missing,
  [],
  `every built page's <head> must advertise the three site-wide feed autodiscovery links. Offenders: ${missing.join('; ')}`,
);

console.log(`Rendered-head feed autodiscovery check passed (${htmlPages.length} pages advertise /rss.xml, /atom.xml, and /feed.json)`);
