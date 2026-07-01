import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every article URL in the sitemap carries an <image:image> pointing at
// /og/<slug>.png (asserted by check-sitemap.js), and <meta property="og:image">
// on article/category/special pages points at the matching card route
// (asserted by check-share-metadata.js). Those are STRING assertions about URLs
// inside the built XML/HTML — they do not verify that the PNG files actually
// exist on disk. A regression that silently broke an OG image renderer would
// leave the sitemap and metadata green while the referenced image 404ed.
//
// This closes that gap with build-output bijections for all dedicated OG card
// families: articles under dist/og/, category hubs under dist/og/category/, and
// special pages under dist/og/special/. Each direction catches a different
// regression — a missing image 404s the page metadata, and a stale image wastes
// crawl budget and confuses share-preview crawlers.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distOgDir = path.join(projectRoot, 'dist', 'og');
const distCategoryOgDir = path.join(distOgDir, 'category');
const distSpecialOgDir = path.join(distOgDir, 'special');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const categoryWikiDir = path.join(wikiDir, 'category');
const specialWikiDir = path.join(wikiDir, 'special');

assert.ok(fs.existsSync(distOgDir), 'dist/og/ not found; run the build first');
assert.ok(fs.existsSync(distCategoryOgDir), 'dist/og/category/ not found; run the build first');
assert.ok(fs.existsSync(distSpecialOgDir), 'dist/og/special/ not found; run the build first');
assert.ok(fs.existsSync(wikiDir), 'dist/wiki/ not found; run the build first');
assert.ok(fs.existsSync(categoryWikiDir), 'dist/wiki/category/ not found; run the build first');
assert.ok(fs.existsSync(specialWikiDir), 'dist/wiki/special/ not found; run the build first');

function builtPageSlugs(dir) {
  const slugs = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(dir, entry.name, 'index.html');
    if (fs.existsSync(indexPath)) slugs.add(entry.name);
  }
  return slugs;
}

function builtOgSlugs(dir) {
  return new Set(
    fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.png'))
      .map((name) => name.slice(0, -'.png'.length)),
  );
}

// Built article slugs: every directory under dist/wiki/ that contains an
// index.html, excluding the special/ and category/ trees (which are listing
// pages, not article content — they have no dedicated OG image).
const articleSlugs = new Set();
for (const entry of fs.readdirSync(wikiDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (entry.name === 'special' || entry.name === 'category') continue;
  const indexPath = path.join(wikiDir, entry.name, 'index.html');
  if (fs.existsSync(indexPath)) articleSlugs.add(entry.name);
}
assert.ok(articleSlugs.size > 0, 'no built article pages found in dist/wiki/');
const categorySlugs = builtPageSlugs(categoryWikiDir);
assert.ok(categorySlugs.size > 0, 'no built category pages found in dist/wiki/category/');
const specialSlugs = builtPageSlugs(specialWikiDir);
assert.ok(specialSlugs.size > 0, 'no built special pages found in dist/wiki/special/');

// Built OG images: every <slug>.png under dist/og/. The slug set is the
// filename minus the .png extension (matches og/[slug].png.ts getStaticPaths).
const ogSlugs = builtOgSlugs(distOgDir);
assert.ok(ogSlugs.size > 0, 'no OG images found in dist/og/');
const categoryOgSlugs = builtOgSlugs(distCategoryOgDir);
assert.ok(categoryOgSlugs.size > 0, 'no category OG images found in dist/og/category/');
const specialOgSlugs = builtOgSlugs(distSpecialOgDir);
assert.ok(specialOgSlugs.size > 0, 'no special-page OG images found in dist/og/special/');

// The homepage card is the root-level non-article default card. It must exist
// because the homepage and any utility page without a dedicated override still
// reference /og/home.png.
assert.ok(ogSlugs.has('home'), 'dist/og/home.png must exist (referenced by Seo.astro default image and by the homepage <meta property="og:image">)');
assert.ok(ogSlugs.has('search'), 'dist/og/search.png must exist (referenced by the search page <meta property="og:image">)');

// Direction 1 — every article has a corresponding OG image. A regression that
// silently dropped an article's PNG would 404 the sitemap image entry and the
// page's og:image metadata.
const missingImages = [...articleSlugs]
  .filter((slug) => !ogSlugs.has(slug))
  .sort();
assert.deepEqual(
  missingImages,
  [],
  `every built article must have a corresponding dist/og/<slug>.png; missing for: ${missingImages.join(', ') || '(none)'}`,
);

const missingCategoryImages = [...categorySlugs]
  .filter((slug) => !categoryOgSlugs.has(slug))
  .sort();
assert.deepEqual(
  missingCategoryImages,
  [],
  `every built category page must have a corresponding dist/og/category/<slug>.png; missing for: ${missingCategoryImages.join(', ') || '(none)'}`,
);

const missingSpecialImages = [...specialSlugs]
  .filter((slug) => !specialOgSlugs.has(slug))
  .sort();
assert.deepEqual(
  missingSpecialImages,
  [],
  `every built special page must have a corresponding dist/og/special/<name>.png; missing for: ${missingSpecialImages.join(', ') || '(none)'}`,
);

// Direction 2 — every OG image (other than 'home') corresponds to a built
// article. A stale PNG left behind by a deleted article would waste crawl
// budget and confuse image search.
const staleImages = [...ogSlugs]
  .filter((slug) => slug !== 'home' && slug !== 'search' && !articleSlugs.has(slug))
  .sort();
assert.deepEqual(
  staleImages,
  [],
  `every dist/og/<slug>.png (other than home.png and search.png) must correspond to a built article; stale: ${staleImages.join(', ') || '(none)'}`,
);

const staleCategoryImages = [...categoryOgSlugs]
  .filter((slug) => !categorySlugs.has(slug))
  .sort();
assert.deepEqual(
  staleCategoryImages,
  [],
  `every dist/og/category/<slug>.png must correspond to a built category page; stale: ${staleCategoryImages.join(', ') || '(none)'}`,
);

const staleSpecialImages = [...specialOgSlugs]
  .filter((slug) => !specialSlugs.has(slug))
  .sort();
assert.deepEqual(
  staleSpecialImages,
  [],
  `every dist/og/special/<name>.png must correspond to a built special page; stale: ${staleSpecialImages.join(', ') || '(none)'}`,
);

console.log(
  `OG images check passed (${articleSlugs.size} articles, ${categorySlugs.size} categories, ${specialSlugs.size} special pages)`,
);
