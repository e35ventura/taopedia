import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const searchFormFiles = [
  path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'),
  path.join(projectRoot, 'src', 'pages', 'index.astro'),
  path.join(projectRoot, 'src', 'features', 'wiki', 'layouts', 'BaseLayout.astro'),
];

for (const file of searchFormFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(
    source,
    /action="\/search"/,
    `${path.relative(projectRoot, file)} must post to the canonical /search/ route`,
  );
  assert.match(
    source,
    /action="\/search\/"/,
    `${path.relative(projectRoot, file)} must include action="/search/"`,
  );
}

console.log('Search action check passed');
