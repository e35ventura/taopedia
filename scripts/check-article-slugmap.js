import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const articleHtml = path.join(process.cwd(), 'dist', 'wiki', 'taopedia', 'index.html');
const html = fs.readFileSync(articleHtml, 'utf8');

assert.equal(
  html.includes("JSON.parse('{JSON.stringify(slugMap)}')"),
  false,
  'article page must not ship the unexpanded slugMap template expression'
);

const match = html.match(/<script type="application\/json" id="valid-slugs-data">([^<]*)<\/script>/);
assert.ok(match, 'article page must include serialized valid slug JSON');

const validSlugs = JSON.parse(match[1]);
assert.ok(Array.isArray(validSlugs), 'serialized valid slugs must be an array');
assert.equal(
  validSlugs.every((slug) => typeof slug === 'string'),
  true,
  'serialized valid slugs must only contain slug strings'
);
assert.ok(validSlugs.includes('taopedia'), 'serialized valid slugs must include the taopedia article');

console.log('Article valid slug serialization check passed');
