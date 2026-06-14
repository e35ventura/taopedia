import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing regression check for Special:Subnets. It pins the rendered table
// to the content collection: the page must list exactly the published articles
// whose title is "Subnet <n>: <name>", ordered by netuid, each row showing the
// netuid + subnet name and linking to the built article — with no non-subnet
// (topic) article leaking in — and it must be reachable from the footer and
// homepage nav. It fails if the membership, order, netuid/name, or discovery
// regress.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const subnetsFile = path.join(wikiDir, 'special', 'subnets', 'index.html');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(subnetsFile), 'dist/wiki/special/subnets/index.html not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const html = fs.readFileSync(subnetsFile, 'utf8');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const SUBNET_RE = /^Subnet (\d+)(?::\s*(.*))?$/;

// Re-derive the expected registry independently from the slug map: every article
// whose title is "Subnet <n>[: <name>]", parsed and ordered by netuid.
const expected = Object.entries(slugmap)
  .map(([slug, meta]) => {
    const match = (meta.title || '').match(SUBNET_RE);
    if (!match) return null;
    const name = (match[2] ?? '').trim();
    return { netuid: Number(match[1]), name: name || `Subnet ${match[1]}`, slug };
  })
  .filter((entry) => entry !== null)
  .sort((a, b) => a.netuid - b.netuid);

assert.ok(expected.length > 0, 'expected at least one numbered subnet article in the slug map');

// Parse the rendered table rows (header row has no name link, so it drops out).
// Astro adds data-astro-cid-* attributes to scoped-style elements, so match <tr>
// and the cells with optional attributes rather than a bare tag.
const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(([, block]) => {
    const netuidMatch = block.match(/class="mw-subnet-netuid"[^>]*>(\d+)</);
    const nameMatch = block.match(/mw-subnet-name"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/);
    if (!netuidMatch || !nameMatch) return null;
    return { netuid: Number(netuidMatch[1]), href: nameMatch[1], name: decode(nameMatch[2]) };
  })
  .filter((row) => row !== null);

assert.equal(
  rows.length,
  expected.length,
  `the subnets table must list all ${expected.length} numbered subnets (rendered ${rows.length})`,
);

const renderedSlugs = rows.map((row, i) => {
  const m = (row.href || '').match(/^\/wiki\/(.+)\/$/);
  assert.ok(m, `row ${i} has a malformed article link: ${row.href}`);
  const slug = m[1];
  assert.ok(fs.existsSync(path.join(wikiDir, slug, 'index.html')), `row ${i} links to unbuilt /wiki/${slug}/`);
  assert.ok(slugmap[slug], `row ${i} links to /wiki/${slug}/ which is not a known article`);
  // No non-subnet (topic) article may leak in.
  assert.ok(
    SUBNET_RE.test(slugmap[slug].title),
    `row ${i} (/wiki/${slug}/ "${slugmap[slug].title}") is not a numbered subnet and must not appear`,
  );
  return slug;
});

// Membership + netuid order + names must match the independent derivation.
assert.deepEqual(renderedSlugs, expected.map((e) => e.slug), 'rendered subnet rows (membership + netuid order) must match the slug map');
assert.deepEqual(rows.map((r) => r.netuid), expected.map((e) => e.netuid), 'rendered netuids must match and be in ascending order');
assert.deepEqual(rows.map((r) => r.name), expected.map((e) => e.name), 'rendered subnet names must match the parsed article titles');

// Strictly ascending netuid (no duplicates / out of order).
for (let i = 1; i < rows.length; i++) {
  assert.ok(
    rows[i - 1].netuid < rows[i].netuid,
    `netuids must be strictly ascending (row ${i - 1}=${rows[i - 1].netuid} not < row ${i}=${rows[i].netuid})`,
  );
}

// On-site discovery: the shared footer (every article page) and the homepage nav
// must link to the page, so it is reachable without the sitemap.
assert.ok(
  fs.readFileSync(path.join(wikiDir, renderedSlugs[0], 'index.html'), 'utf8').includes('href="/wiki/special/subnets"'),
  'the shared page footer must link to /wiki/special/subnets (article-page discovery path)',
);
assert.ok(
  fs.readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8').includes('href="/wiki/special/subnets"'),
  'the homepage primary nav must link to /wiki/special/subnets (homepage discovery path)',
);

console.log(
  `Subnets registry check passed (${rows.length} subnets, netuid ${rows[0].netuid}-${rows[rows.length - 1].netuid}, every row a numbered subnet linking to a built article; footer + homepage discovery present)`,
);
