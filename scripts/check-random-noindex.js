import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run after `npm run build`. Special:Random is a pure client-side redirect: it
// immediately window.location.replace()s to a random article and has no indexable
// content of its own. It is intentionally left out of the sitemap, but it is still
// crawlable, so it must also be marked noindex — otherwise a crawler can index
// /wiki/special/random/ as a thin redirect shell or attribute a random article's
// content to that URL. `follow` is kept so crawlers still follow its links.
// Regular content pages must remain indexable.
const distDir = path.join(process.cwd(), 'dist');

const randomHtml = fs.readFileSync(
  path.join(distDir, 'wiki', 'special', 'random', 'index.html'),
  'utf8',
);
assert.match(
  randomHtml,
  /<meta\s+name="robots"\s+content="noindex,\s*follow"\s*\/?>/i,
  'Special:Random must be noindex (it is a content-less redirect, omitted from the sitemap)',
);

// A normal article page must NOT be noindex — the prop must stay opt-in.
const articleHtml = fs.readFileSync(path.join(distDir, 'wiki', 'axon', 'index.html'), 'utf8');
assert.doesNotMatch(
  articleHtml,
  /<meta\s+name="robots"\s+content="noindex/i,
  'article pages must remain indexable (no robots noindex)',
);

console.log('Random noindex check passed');
