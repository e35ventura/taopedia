import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const wikiDir = path.join(process.cwd(), 'dist', 'wiki');
const marker = 'id="valid-slugs-data"';

function walkHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(filePath, files);
    } else if (entry.isFile() && filePath.endsWith('.html')) {
      files.push(filePath);
    }
  }
  return files;
}

const offenders = [];
let checkedCount = 0;

for (const filePath of walkHtmlFiles(wikiDir)) {
  const html = fs.readFileSync(filePath, 'utf8');
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) continue;

  checkedCount += 1;
  const bodyCloseIndex = html.indexOf('</body>');
  if (bodyCloseIndex === -1 || markerIndex > bodyCloseIndex) {
    offenders.push(path.relative(process.cwd(), filePath));
  }
}

assert.ok(checkedCount > 0, 'expected at least one article page with valid slug data');
assert.deepEqual(
  offenders,
  [],
  `article valid-slug data must be emitted before </body>: ${offenders.join(', ')}`,
);

console.log(`Article script placement check passed for ${checkedCount} pages`);
