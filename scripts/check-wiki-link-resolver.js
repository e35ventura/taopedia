import assert from 'node:assert/strict';
import {
  buildSlugAliases,
  createRemarkWikiLinkOptions,
  normalizeLinkTarget,
  resolveTargetSlug,
} from './wiki-link-resolver.js';

const slugMap = {
  dynamic_tao: { title: 'Dynamic TAO' },
  alpha_tokens: { title: 'Alpha Tokens' },
};
const aliases = buildSlugAliases(slugMap);
const options = createRemarkWikiLinkOptions(slugMap);

assert.equal(
  normalizeLinkTarget('/wiki/dynamic_tao#history'),
  'dynamic_tao',
  'route-prefixed article paths should normalize to the article slug',
);

assert.equal(
  normalizeLinkTarget('wiki/Dynamic TAO'),
  'Dynamic TAO',
  'route-prefixed article paths should preserve the target text after removing the route prefix',
);

assert.equal(
  normalizeLinkTarget('https://taopedia.org/wiki/dynamic_tao/'),
  'dynamic_tao',
  'canonical Taopedia article URLs should normalize to the article slug',
);

assert.equal(
  normalizeLinkTarget('https://taopedia.org/wiki/Dynamic%20TAO/#overview'),
  'Dynamic TAO',
  'encoded canonical Taopedia article URLs should normalize before alias resolution',
);

assert.equal(
  normalizeLinkTarget('//taopedia.org/wiki/dynamic_tao/'),
  'dynamic_tao',
  'protocol-relative canonical Taopedia article URLs should normalize to the article slug',
);

assert.equal(
  normalizeLinkTarget('//www.taopedia.org/wiki/Dynamic%20TAO/#overview'),
  'Dynamic TAO',
  'protocol-relative encoded canonical Taopedia article URLs should normalize before alias resolution',
);

assert.equal(
  resolveTargetSlug('/wiki/dynamic_tao', aliases),
  'dynamic_tao',
  'rendered wiki links should resolve route-prefixed targets to canonical slugs',
);

assert.equal(
  resolveTargetSlug('https://taopedia.org/wiki/dynamic_tao/', aliases),
  'dynamic_tao',
  'rendered wiki links should resolve canonical article URLs to canonical slugs',
);

assert.equal(
  resolveTargetSlug('//taopedia.org/wiki/Dynamic%20TAO/', aliases),
  'dynamic_tao',
  'rendered wiki links should resolve protocol-relative canonical URLs to canonical slugs',
);

assert.deepEqual(
  options.pageResolver('/wiki/Dynamic TAO'),
  ['dynamic_tao', 'Dynamic TAO', 'dynamic tao'],
  'remark wiki-link resolution should try the canonical slug before route-prefixed fallbacks',
);

assert.deepEqual(
  options.pageResolver('//taopedia.org/wiki/Dynamic%20TAO/'),
  ['dynamic_tao', 'Dynamic TAO', 'dynamic tao'],
  'remark wiki-link resolution should try the canonical slug before protocol-relative URL fallbacks',
);

// Rendered in-content wiki links must use the canonical trailing-slash URL so
// they match the article canonical (#61), sitemap (#75/#127) and search data
// (#92) instead of 301-redirecting on every click.
assert.equal(
  options.hrefTemplate('dynamic_tao'),
  '/wiki/dynamic_tao/',
  'hrefTemplate must emit the canonical trailing-slash article URL',
);

// The article page unlink script strips the trailing slash (and any fragment/
// query) before checking validSlugs, so valid links survive and only genuinely
// missing targets are unlinked. Mirror that regex here to lock the behavior.
const unlinkSlug = (href) => {
  const m = href.match(/^\/wiki\/([^#?]+?)\/?(?:[#?]|$)/);
  return m ? m[1] : null;
};
assert.equal(unlinkSlug('/wiki/dynamic_tao/'), 'dynamic_tao', 'unlink regex must accept the canonical trailing-slash link');
assert.equal(unlinkSlug('/wiki/dynamic_tao'), 'dynamic_tao', 'unlink regex must still accept a slash-less link');
assert.equal(unlinkSlug('/wiki/dynamic_tao/#history'), 'dynamic_tao', 'unlink regex must ignore a fragment');
assert.equal(unlinkSlug('/elsewhere/dynamic_tao/'), null, 'unlink regex must not match non-wiki links');

console.log('Wiki link resolver route-target check passed');
