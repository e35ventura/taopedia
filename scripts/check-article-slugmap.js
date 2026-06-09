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

const match = html.match(/<script type="application\/json" id="slug-map-data">([^<]*)<\/script>/);
assert.ok(match, 'article page must include serialized slug map JSON');

const slugMap = JSON.parse(match[1]);
assert.ok(slugMap.taopedia, 'serialized slug map must include the taopedia article');

console.log('Article slug map serialization check passed');
