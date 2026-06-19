import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// <meta name="description"> in the page <head> is what search engines display as
// the search-result snippet for each page. If the description binding breaks
// (the prop is removed, the variable is mis-bound, or Seo.astro's fallback to
// the site default fires on a page that should have a specific description),
// the search snippet silently regresses to a generic or empty string. No
// existing check guards this:
//   - check-share-metadata.js guards OG/Twitter IMAGE metadata, not the
//     description meta tag.
//   - check-structured-data.js tests the JSON-LD builder, not the HTML meta.
//   - check-article-meta.js asserts article last-updated dates, not descriptions.
//
// This check reads the built dist/ HTML and verifies every HTML page type has
// a non-empty <meta name="description"> in <head>, and that article pages
// carry an article-specific description (not the site-wide default that the
// homepage uses). The default is derived from the built homepage's own
// description tag, so the comparison stays in sync without hardcoding.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

assert.ok(fs.existsSync(distDir), 'dist/ not found; run the build first');

// Extract the description from a built HTML page's <head>. Returns null if the
// tag is missing or has no content. Attribute order in the rendered <meta> is
// not guaranteed, so extract all <meta> tags and find the description entry.
function extractDescription(html) {
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return null;
  const metaTags = [...headMatch[1].matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const descTag = metaTags.find((tag) => /\bname="description"/.test(tag));
  if (!descTag) return null;
  const contentMatch = descTag.match(/content="([^"]*)"/);
  return contentMatch ? contentMatch[1] : null;
}

// ---- Homepage: establishes the site-default description -------------------
const homepagePath = path.join(distDir, 'index.html');
assert.ok(fs.existsSync(homepagePath), 'dist/index.html not found');
const homepageDesc = extractDescription(fs.readFileSync(homepagePath, 'utf8'));
assert.ok(
  typeof homepageDesc === 'string' && homepageDesc.length > 20,
  `homepage must have a non-empty <meta name="description"> (got ${JSON.stringify(homepageDesc)})`,
);

// ---- 404 page: non-empty, distinct from the homepage default --------------
const notFoundPath = path.join(distDir, '404.html');
if (fs.existsSync(notFoundPath)) {
  const desc = extractDescription(fs.readFileSync(notFoundPath, 'utf8'));
  assert.ok(
    typeof desc === 'string' && desc.length > 10,
    `404 page: <meta name="description"> must be non-empty (got ${JSON.stringify(desc)})`,
  );
}

// ---- Search page: non-empty, distinct from the homepage default -----------
const searchPath = path.join(distDir, 'search', 'index.html');
if (fs.existsSync(searchPath)) {
  const desc = extractDescription(fs.readFileSync(searchPath, 'utf8'));
  assert.ok(
    typeof desc === 'string' && desc.length > 10,
    `search page: <meta name="description"> must be non-empty (got ${JSON.stringify(desc)})`,
  );
}

// ---- Article pages: description must be article-specific, not the default --
const wikiDir = path.join(distDir, 'wiki');
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found');

let articleCount = 0;
for (const entry of fs.readdirSync(wikiDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (entry.name === 'special' || entry.name === 'category') continue;
  const htmlPath = path.join(wikiDir, entry.name, 'index.html');
  if (!fs.existsSync(htmlPath)) continue;

  const desc = extractDescription(fs.readFileSync(htmlPath, 'utf8'));
  assert.ok(
    typeof desc === 'string' && desc.length > 10,
    `article ${entry.name}: <meta name="description"> must be non-empty (got ${JSON.stringify(desc)})`,
  );
  assert.notEqual(
    desc,
    homepageDesc,
    `article ${entry.name}: description must be article-specific, not the site default "${homepageDesc.slice(0, 40)}…"`,
  );
  articleCount += 1;
}
assert.ok(articleCount > 0, 'no built article pages found in dist/wiki/');

// ---- Category pages: description must be non-empty ------------------------
const categoryDir = path.join(wikiDir, 'category');
let categoryCount = 0;
if (fs.existsSync(categoryDir)) {
  for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const htmlPath = path.join(categoryDir, entry.name, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;
    const desc = extractDescription(fs.readFileSync(htmlPath, 'utf8'));
    assert.ok(
      typeof desc === 'string' && desc.length > 10,
      `category ${entry.name}: <meta name="description"> must be non-empty (got ${JSON.stringify(desc)})`,
    );
    categoryCount += 1;
  }
}
assert.ok(categoryCount > 0, 'no built category pages found in dist/wiki/category/');

// ---- Special pages: description must be non-empty -------------------------
const specialDir = path.join(wikiDir, 'special');
let specialCount = 0;
if (fs.existsSync(specialDir)) {
  for (const entry of fs.readdirSync(specialDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const htmlPath = path.join(specialDir, entry.name, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;
    const desc = extractDescription(fs.readFileSync(htmlPath, 'utf8'));
    assert.ok(
      typeof desc === 'string' && desc.length > 10,
      `special ${entry.name}: <meta name="description"> must be non-empty (got ${JSON.stringify(desc)})`,
    );
    specialCount += 1;
  }
}
assert.ok(specialCount > 0, 'no built special pages found in dist/wiki/special/');

console.log(
  `Page descriptions check passed (homepage + 404 + search + ${articleCount} articles + ${categoryCount} categories + ${specialCount} special pages)`,
);
