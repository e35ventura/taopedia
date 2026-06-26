import assert from 'node:assert/strict';
import matter from './frontmatter.js';
import { quoteColonPlainScalars } from './frontmatter-colon-repair.js';

// ---- Flow sequence colon-space scalars ------------------------------------
{
  const parsed = matter('---\ncategories: [Subnet 4: Targon, TAO]\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    { categories: ['Subnet 4: Targon', 'TAO'] },
    'flow sequence categories with colon-space parse as plain strings',
  );
}

{
  const parsed = matter('---\nseeAlso: [Yuma Consensus: overview, TAO Reserve]\naliases: [Subnet 4: Targon]\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    {
      seeAlso: ['Yuma Consensus: overview', 'TAO Reserve'],
      aliases: ['Subnet 4: Targon'],
    },
    'multiple flow sequence list fields with colon-space parse as string arrays',
  );
}

{
  const parsed = matter('---\ncategories: [Subnet 4: Targon, TAO] # inline comment\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    { categories: ['Subnet 4: Targon', 'TAO'] },
    'flow sequence repair preserves trailing inline YAML comments on the line',
  );
}

// ---- Flow mapping colon-space values --------------------------------------
{
  const parsed = matter('---\nseo: { title: Subnet 4: Targon }\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    { seo: { title: 'Subnet 4: Targon' } },
    'flow mapping values with colon-space parse as quoted string scalars',
  );
}

{
  const parsed = matter('---\ninfoboxRows: [{ label: Subnet 4: Targon, value: \"42\" }]\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    { infoboxRows: [{ label: 'Subnet 4: Targon', value: '42' }] },
    'flow sequence of flow mappings quotes colon-space label values',
  );
}

// ---- Block shapes from prior merges must still pass -----------------------
{
  const parsed = matter('---\nseeAlso:\n  - Subnet 4: Targon\naliases:\n  - Yuma Consensus: overview\ninfoboxRows:\n  - label: Netuid\n    value: \"42\"\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    {
      seeAlso: ['Subnet 4: Targon'],
      aliases: ['Yuma Consensus: overview'],
      infoboxRows: [{ label: 'Netuid', value: '42' }],
    },
    'block-list colon scalars and mapping-style list entries remain correct (#1503 / #1486 guard)',
  );
}

{
  const parsed = matter('---\ntitle: Subnet 4: Targon\ninfoboxTitle: Subnet 4: Targon\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    { title: 'Subnet 4: Targon', infoboxTitle: 'Subnet 4: Targon' },
    'top-level colon-space scalars still parse correctly',
  );
}

// ---- Repair must not alter benign prose-shaped tokens ---------------------
assert.equal(
  quoteColonPlainScalars('categories: [TAO, Subnets, Consensus]\n'),
  'categories: [TAO, Subnets, Consensus]\n',
  'flow sequences without colon-space tokens are unchanged',
);

assert.equal(
  quoteColonPlainScalars('  - label: Netuid\n'),
  '  - label: Netuid\n',
  'mapping-style block list entries are not wrapped as bare scalars',
);

console.log('Frontmatter colon-repair check passed');
