import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run after `npm run build`: every article link on the home page must use the
// canonical trailing-slash URL (/wiki/<slug>/), matching the article canonical
// (#61), the sitemap (#127), search data (#92) and the rest of the internal
// article links (#142). A bare /wiki/<slug> 301-redirects on every click.
// Category (/wiki/category/...) and special (/wiki/special/...) links are out
// of scope here, matching #142, so this only checks single-segment article
// links.

const contentDir = path.join(process.cwd(), 'src', 'content', 'pages');
const homeHtml = path.join(process.cwd(), 'dist', 'index.html');

assert.ok(fs.existsSync(homeHtml), 'dist/index.html not found; run the build first');

const articleSlugs = new Set(
  fs.readdirSync(contentDir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const dir = path.join(contentDir, entry.name);
    const hasIndex =
      fs.existsSync(path.join(dir, 'index.mdx')) || fs.existsSync(path.join(dir, 'index.md'));
    return hasIndex ? [entry.name] : [];
  }),
);
assert.ok(articleSlugs.size > 0, 'no synced articles found; run the build first');

const html = fs.readFileSync(homeHtml, 'utf8');

// Single-segment /wiki/<X> links with no trailing slash. Category and special
// links have a second path segment, so they never match this pattern.
const bareArticleLinks = [...html.matchAll(/href="\/wiki\/([^"/]+)"/g)]
  .map((match) => match[1])
  .filter((slug) => articleSlugs.has(slug));

assert.deepEqual(
  [...new Set(bareArticleLinks)],
  [],
  'home page article links must use the canonical trailing-slash URL (/wiki/<slug>/)',
);

// Sanity: the home page must actually link articles in the canonical form.
const canonicalArticleLinks = [...html.matchAll(/href="\/wiki\/([^"/]+)\/"/g)]
  .map((match) => match[1])
  .filter((slug) => articleSlugs.has(slug));
assert.ok(
  canonicalArticleLinks.length > 0,
  'home page must link articles with canonical trailing-slash URLs',
);

console.log(`Home links check passed (${canonicalArticleLinks.length} canonical article links)`);
