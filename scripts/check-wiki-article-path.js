import assert from 'node:assert/strict';
import {
  articleJsonCompanionUrls,
  isBuiltWikiArticleHref,
  isWikiArticleHref,
  slugFromWikiHref,
  wikiArticleHref,
  wikiCompanionFileHref,
  wikiCompanionHref,
  wikiCompanionJsonHref,
} from '../src/lib/wiki-article-path.js';

assert.equal(slugFromWikiHref('/wiki/subnet_10/'), 'subnet_10', 'single-segment article slug');
assert.equal(slugFromWikiHref('/wiki/alpha_tokens/notes/'), 'alpha_tokens/notes', 'nested multi-segment slug');
assert.equal(slugFromWikiHref('/wiki/foo/bar/baz/'), 'foo/bar/baz', 'three-segment nested slug');
assert.equal(slugFromWikiHref('/wiki/dynamic_tao/#history'), 'dynamic_tao', 'fragment suffix is ignored');
assert.equal(slugFromWikiHref('/wiki/Dynamic%20TAO/?ref=1'), 'Dynamic TAO', 'encoded slug and query are handled');
assert.equal(slugFromWikiHref('/wiki/category/TAO/'), '', 'category hub hrefs are not article slugs');
assert.equal(slugFromWikiHref('/wiki/special/allpages/'), '', 'special pages are not article slugs');

assert.equal(
  wikiArticleHref('https://taopedia.org', 'alpha_tokens/notes'),
  'https://taopedia.org/wiki/alpha_tokens/notes/',
  'wikiArticleHref rebuilds nested canonical URLs',
);

assert.ok(isBuiltWikiArticleHref('/wiki/subnet_10/'), 'built single-segment article href');
assert.ok(isBuiltWikiArticleHref('/wiki/alpha_tokens/notes/'), 'built nested article href');
assert.ok(!isBuiltWikiArticleHref('/wiki/category/TAO/'), 'category href is not a built article page');
assert.ok(!isBuiltWikiArticleHref('/wiki/special/recentchanges/'), 'special page href is excluded');

assert.ok(isWikiArticleHref('/wiki/subnet_10/history/'), 'history companion is an article-scoped href');
assert.ok(isWikiArticleHref('/wiki/alpha_tokens/notes/backlinks/'), 'nested backlinks companion href');

// Document the split('/')[2] bug the helper replaces.
const broken = '/wiki/alpha_tokens/notes/'.split('/')[2];
const fixed = slugFromWikiHref('/wiki/alpha_tokens/notes/');
assert.notEqual(broken, fixed, 'split("/")[2] truncates nested slugs');
assert.equal(fixed, 'alpha_tokens/notes', 'slugFromWikiHref returns the full route slug');

assert.equal(
  wikiCompanionHref('https://taopedia.org', 'alpha_tokens/notes', 'history'),
  'https://taopedia.org/wiki/alpha_tokens/notes/history/',
  'wikiCompanionHref supports nested article slugs',
);
assert.equal(
  wikiCompanionJsonHref('https://taopedia.org', 'subnet_10', 'toc'),
  'https://taopedia.org/wiki/subnet_10/toc.json',
  'wikiCompanionJsonHref builds machine-readable companion URLs',
);
assert.equal(
  wikiCompanionFileHref('https://taopedia.org', 'subnet_10', 'cite.bib'),
  'https://taopedia.org/wiki/subnet_10/cite.bib',
  'wikiCompanionFileHref builds static companion file URLs',
);

const nested = 'alpha_tokens/notes';
const companions = articleJsonCompanionUrls('https://taopedia.org', nested);
assert.equal(companions.url, 'https://taopedia.org/wiki/alpha_tokens/notes/', 'articleJsonCompanionUrls: canonical article URL');
assert.equal(
  companions.historyJsonUrl,
  'https://taopedia.org/wiki/alpha_tokens/notes/history.json',
  'articleJsonCompanionUrls: nested history.json companion',
);
assert.equal(
  companions.bibtexUrl,
  'https://taopedia.org/wiki/alpha_tokens/notes/cite.bib',
  'articleJsonCompanionUrls: nested cite.bib companion',
);

console.log('Wiki article path helper check passed');
