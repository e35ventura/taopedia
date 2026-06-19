import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSubnetsIndex } from './subnets-index.js';

// /wiki/special/subnets.json exposes the subnet registry as structured JSON for
// programmatic consumers. The contract is load-bearing: a wrong count, a
// missing entry, a non-numeric sort, or a malformed field would silently break
// every downstream consumer. This check guards all of those:
//   1) Unit-tests buildSubnetsIndex with constructed inputs (catches builder
//      regressions before the site is rendered).
//   2) Parses the built dist/wiki/special/subnets.json and validates ALL emitted
//      fields so a regression in any field fails the postbuild gate.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const getPageSlug = (page) => page.id.replace(/\/index\.(md|mdx)$/, '');

// ---- 1) Unit: buildSubnetsIndex with constructed inputs -------------------
{
  const pages = [
    { id: 'subnet_10/index.mdx', data: { title: 'Subnet 10: Compute Horde', summary: 'A compute subnet.' } },
    { id: 'subnet_2/index.mdx', data: { title: 'Subnet 2: Apex', summary: 'An early subnet.' } },
    { id: 'subnet_0/index.mdx', data: { title: 'Subnet 0: Root', summary: 'The root subnet.' } },
    { id: 'consensus/index.mdx', data: { title: 'Yuma Consensus', summary: 'Not a subnet.' } },
    { id: 'subnet_no_name/index.mdx', data: { title: 'Subnet 99', summary: 'A subnet without a name.' } },
  ];

  const result = buildSubnetsIndex({ pages, getPageSlug });

  // count must reflect only pages matching the subnet title pattern.
  assert.equal(result.count, 4, 'count must be 4 (excludes "Yuma Consensus")');
  assert.equal(result.subnets.length, 4, 'subnets array length must match count');

  // Numeric sort: 0, 2, 10, 99 (NOT lexicographic string order which would be
  // 0, 10, 2, 99 — this proves the sort is numeric, not string).
  assert.equal(result.subnets[0].netuid, 0, 'first subnet must be netuid 0');
  assert.equal(result.subnets[1].netuid, 2, 'second subnet must be netuid 2');
  assert.equal(result.subnets[2].netuid, 10, 'third subnet must be netuid 10');
  assert.equal(result.subnets[3].netuid, 99, 'fourth subnet must be netuid 99');

  // Name extraction: "Subnet N: Name" → name = "Name"; "Subnet N" → fallback.
  assert.equal(result.subnets[0].name, 'Root', 'must extract name after colon');
  assert.equal(result.subnets[1].name, 'Apex', 'must extract name after colon');
  assert.equal(result.subnets[2].name, 'Compute Horde', 'must extract name after colon');
  assert.equal(result.subnets[3].name, 'Subnet 99', 'must use fallback when no name after colon');

  // Slug and summary must be present on every entry.
  for (const entry of result.subnets) {
    assert.ok(typeof entry.slug === 'string' && entry.slug.length > 0, `slug must be non-empty (got ${JSON.stringify(entry.slug)})`);
    assert.ok(typeof entry.summary === 'string', `summary must be a string (got ${typeof entry.summary})`);
  }
  assert.equal(result.subnets[0].slug, 'subnet_0', 'slug must be derived from page id');
  assert.equal(result.subnets[0].summary, 'The root subnet.', 'summary must come from page data');
}

// ---- 2) Empty-pages edge case ---------------------------------------------
{
  const empty = buildSubnetsIndex({ pages: [], getPageSlug: () => '' });
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.subnets, []);
}

// ---- 3) Non-subnet pages are filtered out ---------------------------------
{
  const mixed = buildSubnetsIndex({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Subnet 1: Alpha', summary: '' } },
      { id: 'b/index.mdx', data: { title: 'Dynamic TAO', summary: '' } },
      { id: 'c/index.mdx', data: { title: 'Subnet 100: Beta', summary: '' } },
      { id: 'd/index.mdx', data: { title: 'Subnetting Basics', summary: '' } },
    ],
    getPageSlug,
  });
  // "Dynamic TAO" and "Subnetting Basics" must NOT match — the regex requires
  // "Subnet <digits>" optionally followed by ": <name>".
  assert.equal(mixed.count, 2, 'only exact "Subnet N" / "Subnet N: Name" titles must match');
  assert.equal(mixed.subnets[0].netuid, 1);
  assert.equal(mixed.subnets[1].netuid, 100);
}

// ---- 4) Built output: validate ALL fields in dist/wiki/special/subnets.json
const distSubnets = path.join(projectRoot, 'dist', 'wiki', 'special', 'subnets.json');
assert.ok(fs.existsSync(distSubnets), 'dist/wiki/special/subnets.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distSubnets, 'utf8'));

// site — non-empty URL/origin string.
assert.ok(
  typeof data.site === 'string' && /^https?:\/\//.test(data.site),
  `site must be a non-empty URL string (got ${JSON.stringify(data.site)})`,
);

// count — positive number matching the subnets array length.
assert.ok(typeof data.count === 'number' && data.count > 0, `count must be a positive number (got ${data.count})`);
assert.ok(Array.isArray(data.subnets), 'subnets must be an array');
assert.equal(data.subnets.length, data.count, 'subnets array length must match count');

// Each subnet entry: validate ALL fields.
for (let i = 0; i < data.subnets.length; i++) {
  const entry = data.subnets[i];
  assert.ok(
    typeof entry.netuid === 'number' && Number.isInteger(entry.netuid) && entry.netuid >= 0,
    `subnets[${i}].netuid must be a non-negative integer (got ${entry.netuid})`,
  );
  assert.ok(
    typeof entry.name === 'string' && entry.name.length > 0,
    `subnets[${i}].name must be a non-empty string (got ${JSON.stringify(entry.name)})`,
  );
  assert.ok(
    typeof entry.slug === 'string' && entry.slug.length > 0,
    `subnets[${i}].slug must be a non-empty string (got ${JSON.stringify(entry.slug)})`,
  );
  assert.ok(
    typeof entry.summary === 'string',
    `subnets[${i}].summary must be a string (got ${typeof entry.summary})`,
  );
}

// Numeric ascending order: netuid[i] < netuid[i+1] for all i.
for (let i = 1; i < data.subnets.length; i++) {
  assert.ok(
    data.subnets[i - 1].netuid < data.subnets[i].netuid,
    `subnets must be sorted by netuid ascending: ${data.subnets[i - 1].netuid} before ${data.subnets[i].netuid}`,
  );
}

console.log(`Subnets JSON check passed (${data.count} subnets)`);
