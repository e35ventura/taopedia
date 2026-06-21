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
