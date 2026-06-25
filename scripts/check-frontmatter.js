import assert from 'node:assert/strict';
import matter from './frontmatter.js';

{
  const parsed = matter('\uFEFF---\ntitle: BOM Article\n---\nBody\n');
  assert.deepEqual(parsed.data, { title: 'BOM Article' }, 'strips a leading UTF-8 BOM before parsing frontmatter');
  assert.equal(parsed.content, 'Body\n', 'BOM handling preserves the body after the frontmatter block');
}

{
  const parsed = matter('---\r\ntitle: Dynamic TAO\r\ncategories:\r\n  - Subnets\r\n  - TAO\r\ninfoboxRows:\r\n  - label: Netuid\r\n    value: \"42\"\r\n---\r\nBody text\r\n');
  assert.deepEqual(
    parsed.data,
    {
      title: 'Dynamic TAO',
      categories: ['Subnets', 'TAO'],
      infoboxRows: [{ label: 'Netuid', value: '42' }],
    },
    'parses CRLF frontmatter with arrays and nested objects',
  );
  assert.equal(parsed.content, 'Body text\r\n', 'preserves the body after the closing frontmatter boundary');
}

{
  const parsed = matter('---\ntitle: Subnet 4: Targon\ninfoboxTitle: Subnet 4: Targon\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    {
      title: 'Subnet 4: Targon',
      infoboxTitle: 'Subnet 4: Targon',
    },
    'parses top-level plain scalar values that contain colon-space',
  );
  assert.equal(parsed.content, 'Body\n', 'colon-scalar repair preserves the body');
}

{
  const parsed = matter('---\nseo:\n  title: Subnet 4: Targon\ninfoboxRows:\n  - label: Subnet 4: Targon\n    value: Validator permit: required\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    {
      seo: { title: 'Subnet 4: Targon' },
      infoboxRows: [{ label: 'Subnet 4: Targon', value: 'Validator permit: required' }],
    },
    'parses nested plain scalar values that contain colon-space inside mappings and list items',
  );
  assert.equal(parsed.content, 'Body\n', 'nested colon-scalar repair preserves the body');
}

{
  const parsed = matter('---\nseeAlso:\n  - Subnet 4: Targon\naliases:\n  - Yuma Consensus: overview\ninfoboxRows:\n  - label: Netuid\n    value: \"42\"\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    {
      seeAlso: ['Subnet 4: Targon'],
      aliases: ['Yuma Consensus: overview'],
      infoboxRows: [{ label: 'Netuid', value: '42' }],
    },
    'bare list scalars with colon-space parse as plain strings; mapping-style list entries are unchanged',
  );
  assert.equal(parsed.content, 'Body\n', 'bare list colon-scalar repair preserves the body');
}

{
  const parsed = matter('---\ntitle: Subnet 4: Targon # preferred label\nseo:\n  title: Subnet 4: Targon # preferred label\ninfoboxRows:\n  - label: Subnet 4: Targon # row label\n    value: Validator permit: required # row value\n---\nBody\n');
  assert.deepEqual(
    parsed.data,
    {
      title: 'Subnet 4: Targon',
      seo: { title: 'Subnet 4: Targon' },
      infoboxRows: [{ label: 'Subnet 4: Targon', value: 'Validator permit: required' }],
    },
    'parses colon-space plain scalar values even when YAML inline comments are present',
  );
  assert.equal(parsed.content, 'Body\n', 'inline-comment colon-scalar repair preserves the body');
}

{
  const parsed = matter('Body without frontmatter\n');
  assert.deepEqual(parsed.data, {}, 'missing frontmatter returns empty data');
  assert.equal(parsed.content, 'Body without frontmatter\n', 'missing frontmatter preserves the whole body');
}

{
  const parsed = matter('---\n- not\n- an\n- object\n---\nBody\n');
  assert.deepEqual(parsed.data, {}, 'non-object YAML frontmatter falls back to empty data');
  assert.equal(parsed.content, 'Body\n', 'non-object YAML still strips the frontmatter block');
}

{
  const parsed = matter('---\n---\nBody\n');
  assert.deepEqual(parsed.data, {}, 'an empty (zero-line) frontmatter block parses to empty data');
  assert.equal(parsed.content, 'Body\n', 'an empty frontmatter block is stripped, not left in the body');
}

{
  const parsed = matter('---\n---');
  assert.deepEqual(parsed.data, {}, 'an empty frontmatter block at end-of-input parses to empty data');
  assert.equal(parsed.content, '', 'an empty frontmatter block at end-of-input leaves no trailing body');
}

{
  const parsed = matter('---\nfoo---\nBody\n');
  assert.deepEqual(parsed.data, {}, 'a mid-line --- is not a closing fence, so no frontmatter is parsed');
  assert.equal(parsed.content, '---\nfoo---\nBody\n', 'a mid-line --- leaves the whole input as body');
}

{
  const serialized = matter.stringify('Article body\n', {
    title: 'TAO Reserve',
    categories: ['Tokenomics', 'TAO'],
    infoboxRows: [{ label: 'Symbol', value: 'TAO' }],
  });
  assert.ok(serialized.startsWith('---\n'), 'stringify starts with an opening frontmatter boundary');
  assert.ok(serialized.includes('\n---\n\nArticle body\n'), 'stringify preserves the body boundary');

  const reparsed = matter(serialized);
  assert.deepEqual(
    reparsed.data,
    {
      title: 'TAO Reserve',
      categories: ['Tokenomics', 'TAO'],
      infoboxRows: [{ label: 'Symbol', value: 'TAO' }],
    },
    'stringified frontmatter parses back with the same structured data',
  );
  assert.equal(reparsed.content, 'Article body\n', 'stringified content round-trips without an extra leading blank line');
}

console.log('Frontmatter helper check passed');
