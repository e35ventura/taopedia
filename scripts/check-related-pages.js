import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugFromWikiHref } from '../src/lib/wiki-article-path.js';

// Load-bearing check for the article "Related pages" section. It guards the
// contract the feature depends on: (1) the block renders on real article pages
// and is never an empty heading, (2) it stays short — at most 4 entries, (3) each
// entry is a single clickable card (the whole card is the link, not just the
// title), (4) every related link points to a built article and surfaces only NEW
// reading — none of its links duplicate a link the article already makes in its
// body/infobox (cross-checked against the generated link graph), and (5) the
// styling is token-driven (themes in light/dark) and actually ships in a bundled
// stylesheet.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const wikiDir = path.join(distDir, 'wiki');
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

const MAX_ITEMS = 4;

// The link graph the block dedupes against (same source the page uses).
const linkgraphFile = path.join(distDir, 'data', 'linkgraph.json');
assert.ok(fs.existsSync(linkgraphFile), 'dist/data/linkgraph.json must be served (dedup data source)');
const linkgraph = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));

// Discover built article pages: dist/wiki/<slug>/index.html, excluding the
// special/ and category/ trees and the per-article sub-pages.
const SUBPAGES = new Set(['history', 'backlinks', 'cite', 'info']);
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
    if (segs.length < 2) continue;
    if (segs[0] === 'special' || segs[0] === 'category') continue;
    if (SUBPAGES.has(segs[segs.length - 2])) continue;
    articleSlugs.push(segs.slice(0, -1).join('/'));
  }
};
walk(wikiDir);
assert.ok(articleSlugs.length > 0, 'no built article pages found to verify');

const sectionRe = /<section class="related-pages"[\s\S]*?<\/section>/;
const itemRe = /class="related-pages-item"/g;
const cardRe = /<a class="related-pages-card"/g;
const linkRe = /href="(\/wiki\/[^"]+\/)"/g;

let pagesWithBlock = 0;
let totalRelatedLinks = 0;
let dedupVerified = 0;

for (const slug of articleSlugs) {
  const html = fs.readFileSync(path.join(wikiDir, slug, 'index.html'), 'utf8');
  const match = html.match(sectionRe);
  if (!match) continue; // articles with no candidates correctly render nothing
  pagesWithBlock++;
  const block = match[0];

  // (1) + (2) A rendered section must carry between 1 and MAX_ITEMS items.
  const itemCount = (block.match(itemRe) || []).length;
  assert.ok(itemCount > 0, `${slug}: related-pages section rendered with no items (should be hidden when empty)`);
  assert.ok(itemCount <= MAX_ITEMS, `${slug}: related-pages shows ${itemCount} items, exceeds the ${MAX_ITEMS} cap`);

  // (3) Each item is a single clickable card (whole card is the link).
  const cardCount = (block.match(cardRe) || []).length;
  assert.equal(cardCount, itemCount, `${slug}: every related item must be one clickable .related-pages-card`);

  // (4) Every related link resolves to a built article AND is not already linked
  //     from this article's body/infobox.
  const ownTargets = new Set((linkgraph[slug] ?? []).map((l) => l.target));
  const relatedSlugs = [...block.matchAll(linkRe)].map((m) => slugFromWikiHref(m[1]));
  assert.equal(relatedSlugs.length, itemCount, `${slug}: each related card must have exactly one article link`);
  for (const rel of relatedSlugs) {
    totalRelatedLinks++;
    assert.ok(
      fs.existsSync(path.join(wikiDir, rel, 'index.html')),
      `${slug}: related link /wiki/${rel}/ points to an unbuilt article`,
    );
    assert.ok(
      !ownTargets.has(rel),
      `${slug}: related link "${rel}" duplicates a link the article body already makes`,
    );
    dedupVerified++;
  }
}

assert.ok(pagesWithBlock > 0, 'expected at least one article to render a related-pages block');

// (5) Styling must be token-driven (no hardcoded colors) so it themes, and must
//     actually ship in a bundled stylesheet (else the cards would be unstyled).
const css = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'wikipedia.css'), 'utf8');
const blockStart = css.indexOf('.related-pages {');
assert.ok(blockStart !== -1, 'wikipedia.css must define a .related-pages block');
const relatedCss = css.slice(blockStart);
assert.ok(/background:\s*var\(/.test(relatedCss), '.related-pages styles must use a color token for background');
assert.ok(/border:\s*[^;]*var\(/.test(relatedCss), '.related-pages styles must use a color token for borders');
const strayColors = relatedCss
  .split('\n')
  .filter((line) => !/rgba?\(/.test(line))
  .filter((line) => /#[0-9a-fA-F]{3,8}\b|:\s*(?:white|black)\b/.test(line));
assert.deepEqual(strayColors, [], `related-pages CSS has hardcoded colors that won't theme:\n${strayColors.join('\n')}`);

const astroDir = path.join(distDir, '_astro');
const bundledCss = fs.existsSync(astroDir)
  ? fs.readdirSync(astroDir).filter((f) => f.endsWith('.css'))
  : [];
const styleShipped = bundledCss.some((f) => fs.readFileSync(path.join(astroDir, f), 'utf8').includes('.related-pages'));
assert.ok(styleShipped, 'the .related-pages styles must be bundled into a shipped stylesheet');

console.log(
  `Related pages check passed (${pagesWithBlock}/${articleSlugs.length} articles show a block, ≤${MAX_ITEMS} clickable cards each, ${totalRelatedLinks} related links all built, ${dedupVerified} verified disjoint from in-body links, styles token-themed + shipped)`,
);
