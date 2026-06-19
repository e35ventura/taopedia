import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The article route (src/pages/wiki/[...slug].astro) passes
// `image={`/og/${slug}.png`}` to WikiLayout → Seo, which renders
// `<meta property="og:image" content=".../og/<slug>.png">` in the page <head>.
// This binding is what makes each article's social share card unique — without
// it, Seo falls back to `/og/home.png` and every article shows the homepage card
// in social previews.
//
// No existing check guards this end-to-end binding:
//   - check-share-metadata.js guards Seo.astro's OG meta TAGS (dimensions, alt,
//     locale) but not the article route's image prop binding.
//   - check-og-images.js guards the PNG FILES in dist/og/ but not the HTML
//     meta tag that references them on each article page.
//   - check-sitemap.js guards the sitemap's <image:loc> entries but not the
//     article page's og:image meta.
//
// This check fills that gap with two tiers:
//   1) Source-text: the article route must reference the per-article OG image
//      URL pattern `/og/${slug}.png`.
//   2) Built-output: every built article page's <meta property="og:image">
//      content must end with `/og/<slug>.png`, proving the binding flows
//      correctly through WikiLayout → Seo → rendered HTML.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Source-text: article route references /og/${slug}.png -------------
const articleRoute = path.join(projectRoot, 'src', 'pages', 'wiki', '[...slug].astro');
assert.ok(fs.existsSync(articleRoute), 'src/pages/wiki/[...slug].astro not found');
const source = fs.readFileSync(articleRoute, 'utf8');

// Match the URL pattern (`/og/${slug}.png`) rather than the exact JSX syntax,
// so a refactor that extracts the binding into a variable still passes. What
// matters is that the per-article image URL is derived from the article's slug.
assert.match(
  source,
  /\/og\/\$\{slug\}\.png/,
  'article route must reference /og/${slug}.png so each article binds its own share-card image (not the homepage default)',
);

// ---- 2) Built-output: every article page's og:image points at /og/<slug>.png
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

let checked = 0;
for (const entry of fs.readdirSync(wikiDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (entry.name === 'special' || entry.name === 'category') continue;

  const htmlPath = path.join(wikiDir, entry.name, 'index.html');
  if (!fs.existsSync(htmlPath)) continue;

  const html = fs.readFileSync(htmlPath, 'utf8');

  // Restrict to the rendered <head> block so a body-level meta tag (e.g. inside
  // article HTML copied from a source) can never satisfy this check by accident.
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  assert.ok(headMatch, `${entry.name}: article page must render a <head> block`);

  // Extract all <meta> tags and find the og:image entry. Attribute order in the
  // rendered <meta> is not guaranteed, so match each tag independently.
  const metaTags = [...headMatch[1].matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const ogImageTag = metaTags.find((tag) => /property="og:image"/.test(tag) && !/og:image:/.test(tag));
  assert.ok(
    ogImageTag,
    `${entry.name}: article page <head> must include <meta property="og:image"> (the share-card image)`,
  );

  // The og:image content must point at THIS article's OG card, not a default.
  const contentMatch = ogImageTag.match(/content="([^"]+)"/);
  assert.ok(contentMatch, `${entry.name}: og:image meta must carry a content attribute`);
  const ogImageUrl = contentMatch[1];
  assert.ok(
    ogImageUrl.endsWith(`/og/${entry.name}.png`),
    `${entry.name}: og:image must point at /og/${entry.name}.png (got ${ogImageUrl})`,
  );

  checked += 1;
}

assert.ok(checked > 0, 'no built article pages found in dist/wiki/');

console.log(`Article OG image binding check passed (${checked} articles)`);
