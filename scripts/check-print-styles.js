import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression check for the print stylesheet. Printing an article (or "Save as
// PDF") must produce a clean document: the interactive UI chrome — header, both
// sidebars, the table-of-contents rail, the appearance panel, the per-article
// toolbar, and the footer nav — must be hidden in the print medium, and the
// centered max-width layout reset so the article fills the page. This pins the
// @media print rules in the source stylesheet so they can't silently regress.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssFile = path.join(__dirname, '..', 'src', 'styles', 'print.css');
const css = fs.readFileSync(cssFile, 'utf8');

// Extract the @media print block by matching its braces.
const startIndex = css.search(/@media\s+print\s*\{/);
assert.ok(startIndex !== -1, 'print.css must contain an @media print block');
let depth = 0;
let endIndex = -1;
for (let i = css.indexOf('{', startIndex); i < css.length; i += 1) {
  if (css[i] === '{') depth += 1;
  else if (css[i] === '}') {
    depth -= 1;
    if (depth === 0) {
      endIndex = i;
      break;
    }
  }
}
assert.ok(endIndex !== -1, 'the @media print block must be properly closed');
const printBlock = css.slice(startIndex, endIndex + 1);

// Collect every selector that the print block sets to display:none.
const hiddenSelectors = [...printBlock.matchAll(/([^{}]+)\{[^{}]*display\s*:\s*none[^{}]*\}/g)]
  .map((match) => match[1])
  .join(' ');

// The interactive UI chrome must be hidden so it does not print.
for (const selector of ['.mw-header', '.mw-sidebar', '.mw-appearance', '.mw-article-toolbar', '.mw-footer']) {
  assert.ok(
    hiddenSelectors.includes(selector),
    `@media print must hide ${selector} (display: none) so the UI chrome does not print`,
  );
}

// The layout must be reset (not just chrome hidden) so the article fills the page
// rather than printing as a narrow, fixed-header-offset centered strip.
assert.ok(
  /\.mw-page-container[^{}]*\{[^{}]*margin-top\s*:\s*0/.test(printBlock) ||
    /\.mw-content-container[^{}]*\{[^{}]*max-width\s*:\s*none/.test(printBlock) ||
    /\.mw-body[^{}]*\{[^{}]*(?:max-width\s*:\s*none|width\s*:\s*100%)/.test(printBlock),
  '@media print must reset the layout (page-container margin-top / content max-width / body width) so the article fills the page',
);

console.log(
  'Print styles check passed (@media print hides the header, sidebars, appearance panel, article toolbar, and footer, and resets the layout for clean printing)',
);
