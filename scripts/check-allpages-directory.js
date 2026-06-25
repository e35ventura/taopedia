import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run after `npm run build`: the Articles directory must list every synced
// article, including articles whose categories are outside the featured
// topic groups — otherwise the page's title filter can never find them.

const allpagesSource = fs.readFileSync(
  path.join(process.cwd(), 'src', 'pages', 'wiki', 'special', 'allpages.astro'),
  'utf8',
);
assert.match(
  allpagesSource,
  /\.trim\(\)\.toLowerCase\(\)/,
  'the Articles directory filter must trim input so whitespace-only queries show all articles',
);
assert.match(
  allpagesSource,
  /new Set\(page\.data\.categories/,
  'the Articles directory must dedupe repeated frontmatter categories per article',
);
assert.match(
  allpagesSource,
  /pageCategories\(page\)\.join\('\|'\)/,
  'the Articles directory filter must use deduped topic tags on each card',
);

const contentDir = path.join(process.cwd(), 'src', 'content', 'pages');
const directoryHtml = path.join(
  process.cwd(),
  'dist',
  'wiki',
  'special',
  'allpages',
  'index.html',
);

assert.ok(
  fs.existsSync(contentDir),
  'src/content/pages not found; run the build (or scripts/sync-articles.js) first',
);
assert.ok(
  fs.existsSync(directoryHtml),
  'dist/wiki/special/allpages/index.html not found; run the build first',
);

const slugs = [];
const collectSlugs = (dir, prefix) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = prefix ? `${prefix}/${entry.name}` : entry.name;
    const articleDir = path.join(dir, entry.name);
    if (
      fs.existsSync(path.join(articleDir, 'index.mdx')) ||
      fs.existsSync(path.join(articleDir, 'index.md'))
    ) {
      slugs.push(slug);
    }
    collectSlugs(articleDir, slug);
  }
};
collectSlugs(contentDir, '');

assert.ok(slugs.length > 0, 'no synced articles found; run the build first');

const html = fs.readFileSync(directoryHtml, 'utf8');

const missing = slugs.filter((slug) => !html.includes(`href="/wiki/${slug}/"`));
assert.deepEqual(
  missing,
  [],
  `the Articles directory must link every article; missing: ${missing.join(', ')}`,
);

// The article count the page advertises must match what it actually lists.
const countMatch = html.match(/<strong[^>]*>(\d+)<\/strong> articles/);
assert.ok(countMatch, 'the Articles directory must advertise its article count');
assert.equal(
  Number(countMatch[1]),
  slugs.length,
  'the advertised article count must match the number of synced articles',
);

console.log(`Articles directory check passed (${slugs.length} articles all listed)`);
