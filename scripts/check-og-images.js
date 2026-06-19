import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every article URL in the sitemap carries an <image:image> pointing at
// /og/<slug>.png (asserted by check-sitemap.js), and <meta property="og:image">
// on every page points at the same route (asserted by check-share-metadata.js).
// Both of those are STRING assertions about URLs inside the built XML/HTML —
// neither verifies that the PNG files actually exist on disk. A regression that
// silently broke the OG image renderer (renderOgImage in src/lib/og-image.ts,
// wired from src/pages/og/[slug].png.ts) would leave both checks green while
// the sitemap and OG metadata pointed at 404s, silently regressing image
// search and social share cards for every article.
//
// This closes that gap with a build-output bijection: every built article must
// have a matching PNG in dist/og/, and every PNG in dist/og/ (other than the
// homepage card) must correspond to a built article. Both directions catch a
// different regression — a missing image 404s the sitemap/OG metadata, and a
// stale image (article deleted but PNG left behind) wastes crawl budget and
// confuses image search.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distOgDir = path.join(projectRoot, 'dist', 'og');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');

assert.ok(fs.existsSync(distOgDir), 'dist/og/ not found; run the build first');
assert.ok(fs.existsSync(wikiDir), 'dist/wiki/ not found; run the build first');

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

// Built OG images: every <slug>.png under dist/og/. The slug set is the
// filename minus the .png extension (matches og/[slug].png.ts getStaticPaths).
const ogSlugs = new Set(
  fs
    .readdirSync(distOgDir)
    .filter((name) => name.endsWith('.png'))
    .map((name) => name.slice(0, -'.png'.length)),
);
assert.ok(ogSlugs.size > 0, 'no OG images found in dist/og/');

// The homepage card is the only non-article OG image (Seo.astro's default
// image= '/og/home.png' plus the explicit route in og/[slug].png.ts). It must
// exist because every non-article page (homepage, special pages, category hubs)
// references it via the default.
assert.ok(ogSlugs.has('home'), 'dist/og/home.png must exist (referenced by Seo.astro default image and by the homepage <meta property="og:image">)');

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

// Direction 2 — every OG image (other than 'home') corresponds to a built
// article. A stale PNG left behind by a deleted article would waste crawl
// budget and confuse image search.
const staleImages = [...ogSlugs]
  .filter((slug) => slug !== 'home' && !articleSlugs.has(slug))
  .sort();
assert.deepEqual(
  staleImages,
  [],
  `every dist/og/<slug>.png (other than home.png) must correspond to a built article; stale: ${staleImages.join(', ') || '(none)'}`,
);

console.log(`OG images check passed (${articleSlugs.size} articles, ${ogSlugs.size} OG images including home)`);
