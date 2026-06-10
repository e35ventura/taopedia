import assert from 'node:assert/strict';
import {
  hasLocalImagePathTraversal,
  isUnsafeImageUrl,
  normalizeArticleLocalImagePath,
  resolveArticleImageSource,
} from '../src/lib/article-image-assets.js';

const imageAssets = {
  '../../content/pages/local_asset/figure.png': '/_astro/figure.hash.png',
  '../../content/pages/local_asset/images/card.webp': '/_astro/card.hash.webp',
};
const TAB = String.fromCharCode(0x09);

assert.equal(
  normalizeArticleLocalImagePath('figure.png'),
  'figure.png',
  'bare local image paths should normalize',
);

assert.equal(
  normalizeArticleLocalImagePath('./figure.png'),
  'figure.png',
  'dot-prefixed local image paths should normalize',
);

assert.equal(
  resolveArticleImageSource('local_asset', 'figure.png', imageAssets),
  '/_astro/figure.hash.png',
  'local frontmatter image paths should resolve to emitted asset URLs',
);

assert.equal(
  resolveArticleImageSource('local_asset', './images/card.webp', imageAssets),
  '/_astro/card.hash.webp',
  'nested dot-prefixed local image paths should resolve to emitted asset URLs',
);

assert.equal(
  resolveArticleImageSource('local_asset', 'missing.png', imageAssets),
  'missing.png',
  'missing but safe local image paths should keep their original value',
);

assert.equal(
  resolveArticleImageSource('local_asset', 'https://example.com/figure.png', imageAssets),
  'https://example.com/figure.png',
  'absolute image URLs should pass through unchanged',
);

assert.equal(
  resolveArticleImageSource('local_asset', '/images/figure.png', imageAssets),
  '/images/figure.png',
  'root-relative image URLs should pass through unchanged',
);

assert.equal(
  resolveArticleImageSource('local_asset', 'data:image/png;base64,AA==', imageAssets),
  'data:image/png;base64,AA==',
  'data image URLs should pass through unchanged',
);

assert.equal(
  isUnsafeImageUrl('javascript:alert(1)'),
  true,
  'javascript image URLs should be classified as unsafe',
);

assert.equal(
  isUnsafeImageUrl(`java${TAB}script:alert(1)`),
  true,
  'control-character-obfuscated javascript image URLs should be classified as unsafe',
);

assert.equal(
  resolveArticleImageSource('local_asset', 'javascript:alert(1)', imageAssets),
  undefined,
  'javascript image URLs from infobox JSON should not render as image sources',
);

assert.equal(
  resolveArticleImageSource('local_asset', 'data:text/html,<script>alert(1)</script>', imageAssets),
  undefined,
  'HTML data URLs from infobox JSON should not render as image sources',
);

assert.equal(
  hasLocalImagePathTraversal('../secret.png'),
  true,
  'plain parent-directory traversal should be detected',
);

assert.equal(
  hasLocalImagePathTraversal('%2e%2e/secret.png'),
  true,
  'encoded parent-directory traversal should be detected',
);

assert.equal(
  resolveArticleImageSource('local_asset', '../secret.png', imageAssets),
  undefined,
  'traversal paths should not render as infobox image sources',
);

console.log('Article image asset resolution check passed');
