import assert from 'node:assert/strict';
import {
  buildSlugAliases,
  createRemarkWikiLinkOptions,
  normalizeLinkTarget,
  resolveTargetSlug,
  slugFromContentPath,
} from './wiki-link-resolver.js';

// slugFromContentPath must derive the SAME route slug the Astro pages derive from
// `page.id` (article-history.ts getPageSlug), for BOTH article source shapes the
// content-collection glob (`**/*.{md,mdx}`) accepts. The previous path.dirname()
// derivation only handled `<slug>/index.md`: it turned a flat `<slug>.md` into "."
// and collapsed two `*.md` files in one directory to the same slug, so the
// build-time link graph / backlinks / slug map silently disagreed with the
// rendered routes for those articles. These cases guard that regression.
assert.equal(slugFromContentPath('dynamic_tao/index.md'), 'dynamic_tao', 'nested index.md derives the directory slug');
assert.equal(slugFromContentPath('dynamic_tao/index.mdx'), 'dynamic_tao', 'nested index.mdx derives the directory slug');
assert.equal(slugFromContentPath('dynamic_tao.md'), 'dynamic_tao', 'a flat <slug>.md article derives <slug>, not "."');
assert.equal(slugFromContentPath('dynamic_tao.mdx'), 'dynamic_tao', 'a flat <slug>.mdx article derives <slug>');
assert.equal(slugFromContentPath('alpha_tokens/notes.md'), 'alpha_tokens/notes', 'a non-index file keeps a distinct slug (no directory collision)');
assert.equal(slugFromContentPath('a/b/index.md'), 'a/b', 'a deeper index.md keeps its full nested slug');
assert.equal(slugFromContentPath('dynamic_tao\\index.md'), 'dynamic_tao', 'backslash (Windows) paths derive the same slug');

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
  normalizeLinkTarget('/wiki/Dynamic%20TAO/?ref=share'),
  'Dynamic TAO',
  'route-prefixed article paths should ignore query strings before alias resolution',
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
  normalizeLinkTarget('/wiki//dynamic_tao/'),
  'dynamic_tao',
  'double slashes after the wiki prefix must collapse to a single segment',
);
assert.equal(
  normalizeLinkTarget('/wiki/foo//bar/'),
  'foo/bar',
  'internal double slashes must collapse without leaking empty segments',
);
assert.equal(
  normalizeLinkTarget('//taopedia.org/wiki//dynamic_tao/'),
  'dynamic_tao',
  'canonical URLs with a double wiki slash must normalize to the article slug',
);

assert.equal(
  resolveTargetSlug('/wiki/dynamic_tao', aliases),
  'dynamic_tao',
  'rendered wiki links should resolve route-prefixed targets to canonical slugs',
);

assert.equal(
  resolveTargetSlug('/wiki/Dynamic%20TAO/?ref=share', aliases),
  'dynamic_tao',
  'rendered wiki links should resolve route-prefixed targets even when the source URL carries a query string',
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
  options.pageResolver('/wiki/Dynamic%20TAO/?ref=share'),
  ['dynamic_tao', 'Dynamic TAO', 'dynamic tao'],
  'remark wiki-link resolution should ignore query strings on route-prefixed article targets',
);

assert.deepEqual(
  options.pageResolver('//taopedia.org/wiki/Dynamic%20TAO/'),
  ['dynamic_tao', 'Dynamic TAO', 'dynamic tao'],
  'remark wiki-link resolution should try the canonical slug before protocol-relative URL fallbacks',
);

// Regression: an article whose TITLE slugifies to another article's exact slug
// must NOT clobber that article's identity mapping. A real slug always resolves
// to its own article, deterministically, regardless of object iteration order.
{
  const collisionMap = {
    alpha: { title: 'Alpha Network' }, // real slug "alpha"
    alpha_token: { title: 'Alpha' }, // title "Alpha" -> slugify("Alpha") === "alpha"
  };
  assert.equal(
    resolveTargetSlug('alpha', buildSlugAliases(collisionMap)),
    'alpha',
    'a real slug must resolve to its own article, not a later article whose title slugifies to it',
  );
  // Reversed key order must yield the same result (identity mapping always wins).
  const reversed = { alpha_token: { title: 'Alpha' }, alpha: { title: 'Alpha Network' } };
  assert.equal(
    resolveTargetSlug('alpha', buildSlugAliases(reversed)),
    'alpha',
    'identity mapping must win regardless of slug-map iteration order',
  );
}

// Rendered in-content wiki links must use the canonical trailing-slash URL so
// they match the article canonical (#61), sitemap (#75/#127) and search data
// (#92) instead of 301-redirecting on every click.
assert.equal(
  options.hrefTemplate('dynamic_tao'),
  '/wiki/dynamic_tao/',
  'hrefTemplate must emit the canonical trailing-slash article URL',
);
assert.equal(
  options.hrefTemplate('/dynamic_tao'),
  '/wiki/dynamic_tao/',
  'hrefTemplate must strip a leading slash from permalinks',
);
assert.equal(
  options.hrefTemplate('//dynamic_tao'),
  '/wiki/dynamic_tao/',
  'hrefTemplate must collapse a double-leading-slash permalink',
);
assert.notEqual(
  options.hrefTemplate('/dynamic_tao'),
  '/wiki//dynamic_tao/',
  'hrefTemplate must never emit a double slash after /wiki/',
);
assert.ok(
  !options.pageResolver('/wiki//dynamic_tao/').some((candidate) => candidate.startsWith('/')),
  'pageResolver must not return permalink candidates with a leading slash',
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
