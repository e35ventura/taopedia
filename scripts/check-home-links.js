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

// The homepage's Browse By Need panel gives readers task-oriented starting
// points before they commit to the full directory. Keep this as a visible
// navigation contract, not just a style flourish: each card must render its
// task label, primary destination, and canonical article shortcuts.
const browseSectionMatch = html.match(
  /<section[^>]*class="home-section"[^>]*aria-labelledby="browse-by-need-heading"[^>]*>[\s\S]*?<\/section>/,
);
assert.ok(browseSectionMatch, 'home page must render the Browse By Need section');

const browseSection = browseSectionMatch[0];
const expectedBrowsePaths = [
  {
    label: 'Understand staking',
    href: '/wiki/category/Staking/',
    articleHrefs: ['/wiki/staking/', '/wiki/delegation/'],
  },
  {
    label: 'Operate a wallet',
    href: '/wiki/category/Wallets/',
    articleHrefs: ['/wiki/wallets/', '/wiki/wallets_coldkey_hotkey/'],
  },
  {
    label: 'Explore subnet mechanics',
    href: '/wiki/special/subnets/',
    articleHrefs: ['/wiki/subnet_protocol/'],
  },
  {
    label: 'Trace consensus signals',
    href: '/wiki/category/Consensus/',
    articleHrefs: ['/wiki/yuma_consensus/', '/wiki/validator_weights/'],
  },
];

for (const path of expectedBrowsePaths) {
  assert.ok(
    browseSection.includes(path.label),
    `Browse By Need section must include "${path.label}"`,
  );
  assert.ok(
    browseSection.includes(`href="${path.href}"`),
    `Browse By Need section must link "${path.label}" to ${path.href}`,
  );

  for (const href of path.articleHrefs) {
    const slug = href.match(/^\/wiki\/([^/]+)\/$/)?.[1];
    assert.ok(slug && articleSlugs.has(slug), `expected article shortcut ${href} to exist`);
    assert.ok(
      browseSection.includes(`href="${href}"`),
      `Browse By Need section must include canonical shortcut ${href}`,
    );
  }
}

console.log(
  `Home links check passed (${canonicalArticleLinks.length} canonical article links, ${expectedBrowsePaths.length} browse paths)`,
);
