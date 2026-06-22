import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const randomHtml = path.join(projectRoot, 'dist', 'wiki', 'special', 'random', 'index.html');

assert.ok(
  fs.existsSync(randomHtml),
  'dist/wiki/special/random/index.html not found; run the build first',
);

const html = fs.readFileSync(randomHtml, 'utf8');

// The page must pick from the same prebuilt index the search fallback uses, so
// it never needs its own data endpoint and stays in sync with published articles.
assert.ok(
  html.includes('/search-data.json'),
  'the random page must select from the prebuilt search-data.json index',
);

// Only canonical article URLs from search-data.json may be used for the
// redirect. If that metadata index ever grows utility/special/category entries,
// Random article must keep its article-only contract instead of redirecting to
// a non-article page.
assert.ok(
  html.includes("(?:https?:\\/\\/[^/]+)?\\/wiki\\/(?!special\\/|category\\/)[^?#]+\\/$"),
  'the random page must filter search-data URLs to canonical article paths only',
);

// location.replace keeps the redirect out of session history so Back returns
// to the page the reader came from instead of looping through the redirect.
assert.ok(
  html.includes('location.replace'),
  'the random page must navigate with location.replace to keep Back usable',
);

// Readers without JavaScript must get a working alternative, not a dead end.
assert.ok(
  /<noscript>[\s\S]*\/wiki\/special\/allpages\/[\s\S]*<\/noscript>/.test(html),
  'the random page must offer the All pages directory as a no-JS fallback',
);

// The status line announces progress and failure to assistive tech.
assert.ok(
  html.includes('aria-live="polite"'),
  'the random page status must be announced via an aria-live region',
);

console.log('Random article page check passed');
