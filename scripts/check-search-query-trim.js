import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const searchPagePath = path.join(
  path.resolve(new URL('..', import.meta.url).pathname),
  'src',
  'pages',
  'search.astro',
);

const source = fs.readFileSync(searchPagePath, 'utf8');

assert.match(
  source,
  /URLSearchParams\(window\.location\.search\)\.get\('q'\) \|\| ''\)\.trim\(\)/,
  'search page must trim the q parameter before searching',
);
assert.match(
  source,
  /const trimmed = \(query \|\| ''\)\.trim\(\)/,
  'runSearch must ignore whitespace-only queries',
);

console.log('Search query trim check passed');
