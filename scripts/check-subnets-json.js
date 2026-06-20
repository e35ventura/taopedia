import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { buildSubnets } from './subnets.js';

// /wiki/special/subnets.json exposes the netuid-ordered subnet registry as
// structured JSON for programmatic consumers. The contract is load-bearing: a
// malformed response, a non-numeric/duplicate netuid order, a dropped subnet, or
// a registry that disagrees with the HTML Special:Subnets page would silently
// break downstream Bittensor tooling. This check guards all of those:
//   1) Unit-tests buildSubnets (parsing, name fallback, non-subnet filtering,
//      netuid ordering).
//   2) Validates the built dist file: shape, ascending netuid, canonical URLs,
//      and that every "Subnet N:" article in the sources is present.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const slugOf = (page) => page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\.(md|mdx)$/, '');

// ---- 1) Unit: buildSubnets with constructed inputs ------------------------
{
  const subnets = buildSubnets({
    pages: [
      { id: 'subnet_10/index.mdx', data: { title: 'Subnet 10: Swap', summary: 'Liquidity.' } },
      { id: 'subnet_2/index.mdx', data: { title: 'Subnet 2: DSperse', summary: 'A\n  B' } },
      { id: 'subnet_9/index.mdx', data: { title: 'Subnet 9' } }, // no name -> fallback
      { id: 'staking/index.mdx', data: { title: 'Staking' } }, // not a subnet -> dropped
    ],
    getPageSlug: slugOf,
  });
  assert.deepEqual(
    subnets,
    [
      { netuid: 2, name: 'DSperse', slug: 'subnet_2', summary: 'A B' },
      { netuid: 9, name: 'Subnet 9', slug: 'subnet_9', summary: '' },
      { netuid: 10, name: 'Swap', slug: 'subnet_10', summary: 'Liquidity.' },
    ],
    'registry must parse Subnet N: Name titles, fall back to "Subnet N" when unnamed, drop non-subnet articles, collapse summary whitespace, and order by ascending netuid',
  );
}

// ---- 2) Empty input edge case ---------------------------------------------
assert.deepEqual(buildSubnets({ pages: [], getPageSlug: slugOf }), [], 'no pages must yield an empty registry');
assert.deepEqual(buildSubnets({}), [], 'missing pages must not crash');

// ---- 3) Built output ------------------------------------------------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'subnets.json');
const contentDir = path.join(projectRoot, 'src', 'content', 'pages');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/subnets.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.ok(Array.isArray(data.subnets), 'subnets must be an array');
assert.equal(data.count, data.subnets.length, 'count must equal subnets.length');
assert.ok(data.subnets.length > 0, 'subnets.json must list at least one subnet');

data.subnets.forEach((row, i) => {
  assert.ok(Number.isInteger(row.netuid) && row.netuid >= 0, `row ${i} netuid must be a non-negative integer`);
  assert.ok(typeof row.name === 'string' && row.name.length > 0, `row ${i} name must be a non-empty string`);
  assert.equal(row.url, `/wiki/${row.slug}/`, `row ${i} url must be the canonical article URL`);
  assert.ok(fs.existsSync(path.join(projectRoot, 'dist', 'wiki', row.slug, 'index.html')), `row ${i} links to unbuilt /wiki/${row.slug}/`);
});
for (let i = 1; i < data.subnets.length; i++) {
  assert.ok(data.subnets[i - 1].netuid < data.subnets[i].netuid, `subnets must be ordered by ascending, unique netuid (row ${i - 1}=${data.subnets[i - 1].netuid}, row ${i}=${data.subnets[i].netuid})`);
}

// ---- Parity: the JSON must match an INDEPENDENT re-derivation from sources ---
//
// The HTML Special:Subnets page parses the same `Subnet <n>: <name>` titles with
// its own inline logic. To guard against the JSON and HTML drifting, re-derive
// the expected registry here directly from the article frontmatter (NOT via
// buildSubnets) using the same documented rule, and assert the built JSON matches
// it field-for-field. A divergence in netuid, name, slug, or order fails the build.
const expected = [];
for (const dirent of fs.readdirSync(contentDir, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const slug = dirent.name;
  const source = ['index.mdx', 'index.md']
    .map((n) => path.join(contentDir, slug, n))
    .find((f) => fs.existsSync(f));
  if (!source) continue;
  const { data: fm } = matter(fs.readFileSync(source, 'utf8'));
  const m = typeof fm?.title === 'string' ? fm.title.match(/^Subnet (\d+)(?::\s*(.*))?$/) : null;
  if (!m) continue;
  const name = (m[2] ?? '').trim();
  expected.push({ netuid: Number(m[1]), name: name || `Subnet ${m[1]}`, slug });
}
expected.sort((a, b) => a.netuid - b.netuid);

assert.equal(
  data.count,
  expected.length,
  `subnets.json must list every "Subnet N" article (${expected.length}); got ${data.count}`,
);
data.subnets.forEach((row, i) => {
  assert.equal(row.netuid, expected[i].netuid, `parity: row ${i} netuid must match the source registry`);
  assert.equal(row.name, expected[i].name, `parity: row ${i} name must match the source registry for netuid ${expected[i].netuid}`);
  assert.equal(row.slug, expected[i].slug, `parity: row ${i} slug must match the source article directory`);
});

console.log(`Subnets JSON check passed (${data.count} subnets, netuid ${data.subnets[0].netuid}..${data.subnets[data.subnets.length - 1].netuid})`);
