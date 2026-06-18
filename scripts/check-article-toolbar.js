import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

const htmlFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.html')) {
      htmlFiles.push(full);
    }
  }
};
walk(wikiDir);

let toolbarCount = 0;
let filesWithToolbar = 0;
const toolbarNav = /<nav\b(?=[^>]*\bclass="[^"]*\bmw-article-toolbar\b[^"]*")[^>]*>/g;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const where = path.relative(wikiDir, file);
  const toolbars = [...html.matchAll(toolbarNav)].map((match) => match[0]);
  if (toolbars.length === 0) continue;

  filesWithToolbar += 1;
  toolbarCount += toolbars.length;

  for (const tag of toolbars) {
    assert.match(
      tag,
      /\baria-label="Article tools"/,
      `${where}: mw-article-toolbar nav must have the "Article tools" accessible name`,
    );
  }
}

assert.ok(toolbarCount > 0, 'expected at least one mw-article-toolbar nav in the built wiki');

console.log(`Article-toolbar a11y check passed (${toolbarCount} toolbar navs across ${filesWithToolbar} built pages)`);
