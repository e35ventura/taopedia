import assert from 'node:assert/strict';
import { validateFrontmatterImageFields } from './sync-articles.js';

assert.doesNotThrow(
  () => validateFrontmatterImageFields('fixture', { coverImage: 'figure.png' }),
  'local frontmatter image paths should be accepted',
);
assert.doesNotThrow(
  () => validateFrontmatterImageFields('fixture', { infoboxImage: 'https://taopedia.com/og/tao.png' }),
  'https frontmatter image URLs should be accepted',
);

assert.throws(
  () => validateFrontmatterImageFields('fixture', { coverImage: 'javascript:alert(1)' }),
  /Unsafe frontmatter image in "fixture": coverImage URL is not allowed/,
  'javascript: coverImage values should be rejected during sync',
);
assert.throws(
  () => validateFrontmatterImageFields('fixture', { image: 'data:image/svg+xml,<svg></svg>' }),
  /Unsafe frontmatter image in "fixture": image URL is not allowed/,
  'unsafe data: image frontmatter values should be rejected during sync',
);
assert.throws(
  () => validateFrontmatterImageFields('fixture', { infoboxImage: '../secret.png' }),
  /Unsafe frontmatter image in "fixture": infoboxImage URL is not allowed/,
  'path traversal in infoboxImage should be rejected during sync',
);

console.log('Sync frontmatter image validation check passed');
