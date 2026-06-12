import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourceFiles = [
  path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'),
  path.join(projectRoot, 'src', 'pages', 'index.astro'),
];

const bareSpecialLinks = [];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const matches = [...source.matchAll(/href="\/wiki\/special\/(allpages|categories|statistics)"/g)];
  for (const match of matches) {
    bareSpecialLinks.push(`${path.relative(projectRoot, file)}: ${match[0]}`);
  }
}

assert.deepEqual(
  bareSpecialLinks,
  [],
  'special-page nav links must use the canonical trailing-slash URL (/wiki/special/<page>/)',
);

console.log('Special links check passed');
