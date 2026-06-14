import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';

// Load-bearing regression check for the per-article "What links here"
// (Special:WhatLinksHere) pages at /wiki/<slug>/backlinks/. It pins the
// rendered pages to the build-time link graph (public/data/backlinks.json) so
// the feature cannot silently rot: if the page stopped rendering inbound links,
// listed the wrong ones, lost its sort, faked the empty state, or the toolbar
// stopped linking to it, this fails the build's test suite.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');

const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));

// An article page is the catch-all /wiki/<slug>/ route's index.html.
const articleBuilt = (slug) => fs.existsSync(path.join(wikiDir, slug, 'index.html'));

// Recursively discover every built article page, excluding the special/ and
// category/ hubs and the per-article history/, backlinks/, and cite/ sub-pages.
// The walk is recursive (not a single readdir level) so a future nested slug is
// covered rather than silently skipped — the gap that closed PR #155.
const articleSlugs = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.name !== 'index.html') continue;
    const segs = path.relative(wikiDir, full).split(path.sep);
    if (segs.length < 2) continue; // /wiki/index.html, if any — not an article
    if (segs[0] === 'special' || segs[0] === 'category') continue;
    const parent = segs[segs.length - 2];
    if (parent === 'history' || parent === 'backlinks' || parent === 'cite' || parent === 'info') continue;
    articleSlugs.push(segs.slice(0, -1).join('/'));
  }
};
walk(wikiDir);
assert.ok(articleSlugs.length > 0, 'no built article pages found to verify');

// Decode the handful of entities Astro escapes in text so a title containing
// one (e.g. "Coldkeys & Hotkeys") compares the same way the page sorted it.
const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Pull the inbound-link rows from a rendered backlinks page. Each row is a
// <li class="mw-wlh-row"> wrapping a single <a href="/wiki/<from>/">Title</a>.
const parseRows = (html) =>
  [...html.matchAll(/<li[^>]*class="mw-wlh-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
    href: (block.match(/href="([^"]+)"/) || [])[1],
    title: decode((block.match(/>([^<]*)<\/a>/) || [])[1] || ''),
  }));

// 1) COVERAGE: every built article must have a backlinks sub-page, so the
// toolbar link never 404s and the catch-all route generated for the whole
// collection.
for (const slug of articleSlugs) {
  assert.ok(
    fs.existsSync(path.join(wikiDir, slug, 'backlinks', 'index.html')),
    `every article must have a What-links-here page, but /wiki/${slug}/backlinks/ was not built`,
  );
}

// 2) CORRECTNESS: for each target with inbound links in the ground-truth graph,
// the rendered page must list exactly the links whose source article was built,
// each resolving to a built article, sorted by the site's numeric title
// collation (compareTitles) so "Subnet 9" precedes "Subnet 10".
let verifiedWithLinks = 0;
for (const [target, entries] of Object.entries(backlinksData)) {
  if (!articleBuilt(target)) continue; // target not a published article; no page expected
  const expected = new Set(entries.map((e) => e.from).filter(articleBuilt));
  const rows = parseRows(fs.readFileSync(path.join(wikiDir, target, 'backlinks', 'index.html'), 'utf8'));

  const rendered = rows.map((row) => {
    const m = (row.href || '').match(/^\/wiki\/(.+)\/$/);
    assert.ok(m, `backlink on /wiki/${target}/backlinks/ has a malformed href: ${row.href}`);
    assert.ok(articleBuilt(m[1]), `backlink on /wiki/${target}/backlinks/ points to unbuilt /wiki/${m[1]}/`);
    return m[1];
  });

  assert.deepEqual(
    new Set(rendered),
    expected,
    `/wiki/${target}/backlinks/ must list exactly the linking articles from the link graph`,
  );
  assert.equal(rendered.length, expected.size, `/wiki/${target}/backlinks/ must not render duplicate rows`);

  for (let i = 1; i < rows.length; i++) {
    assert.ok(
      compareTitles(rows[i - 1].title, rows[i].title) <= 0,
      `/wiki/${target}/backlinks/ rows must be sorted by numeric title collation ("${rows[i - 1].title}" before "${rows[i].title}")`,
    );
  }

  if (expected.size > 0) verifiedWithLinks++;
}
assert.ok(verifiedWithLinks > 0, 'expected at least one article with inbound links to verify against the link graph');

// 3) EMPTY STATE: an article with no inbound links must render the empty-state
// copy and zero rows, not a fabricated or stale list.
const orphan = articleSlugs.find((slug) => {
  const entries = backlinksData[slug];
  return !entries || entries.filter((e) => articleBuilt(e.from)).length === 0;
});
assert.ok(orphan, 'expected at least one article with no inbound links for the empty-state check');
const orphanHtml = fs.readFileSync(path.join(wikiDir, orphan, 'backlinks', 'index.html'), 'utf8');
assert.equal(parseRows(orphanHtml).length, 0, `empty backlinks page /wiki/${orphan}/backlinks/ must render no rows`);
assert.ok(
  orphanHtml.includes('No pages link to this article yet.'),
  `empty backlinks page /wiki/${orphan}/backlinks/ must show the empty-state message`,
);

// 4) DISCOVERY: the article toolbar must link to the page's own What-links-here
// page so it is reachable on-site, not only by guessing the URL — the discovery
// gap that closed PR #182.
const sample = articleSlugs[0];
const sampleHtml = fs.readFileSync(path.join(wikiDir, sample, 'index.html'), 'utf8');
assert.ok(
  sampleHtml.includes(`href="/wiki/${sample}/backlinks/"`),
  'the article toolbar must link to /wiki/<slug>/backlinks/ (What links here discovery path)',
);

console.log(
  `What-links-here check passed (${articleSlugs.length} pages, ${verifiedWithLinks} with inbound links verified against the link graph, empty state + toolbar discovery present)`,
);
