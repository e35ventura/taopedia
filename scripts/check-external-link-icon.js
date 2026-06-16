import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for the rendered external-link arrow: the rehype plugin
// must actually tag article external links with the `external` class in the
// built HTML, and the stylesheet must ship the MediaWiki "opens off-site" arrow
// (a CSS mask tinted with the link colour). The plugin's own unit logic is
// covered by check-external-links.js; this pins the visible output.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const wikiDir = path.join(distDir, 'wiki');

// 1) At least one built article carries an external link with the `external`
//    class (articles link out to docs/explorers), and internal /wiki/ links do
//    NOT get it. Attribute order in the rendered <a> is not guaranteed, so match
//    each anchor tag and test its attributes independently.
const hasExternalClass = (tag) => /class="[^"]*\bexternal\b[^"]*"/.test(tag);
let articleWithExternal = null;
for (const entry of fs.readdirSync(wikiDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'special' || entry.name === 'category') continue;
  const file = path.join(wikiDir, entry.name, 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const anchors = (html.match(/<a\b[^>]*>/g) || []).filter(hasExternalClass);
  if (anchors.length) {
    articleWithExternal = { slug: entry.name, anchors };
    break;
  }
}
assert.ok(articleWithExternal, 'expected at least one article with an external link tagged class="external"');

// The external class must coincide with an http(s) href + the safe target/rel
// treatment, and must not appear on internal taopedia.org links.
for (const a of articleWithExternal.anchors) {
  const href = (a.match(/href="([^"]+)"/) || [])[1] || '';
  assert.ok(/^https?:\/\//.test(href), `external-tagged link must be an http(s) URL: ${a}`);
  assert.ok(!/^https?:\/\/(?:[^/]*\.)?taopedia\.org/.test(href), `internal link must not be tagged external: ${href}`);
  assert.match(a, /rel="[^"]*noopener[^"]*"/, `external link must also carry rel=noopener: ${a}`);
}

// 2) The stylesheet ships the external-link arrow: the `a.external` ::after rule
//    with a CSS mask. (Astro bundles wikipedia.css under a hashed name.)
const cssDir = path.join(distDir, '_astro');
const cssFiles = fs.existsSync(cssDir) ? fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')) : [];
const iconCss = cssFiles
  .map((f) => fs.readFileSync(path.join(cssDir, f), 'utf8'))
  .find((css) => /\.mw-parser-output a\.external::?after\s*\{[^}]*mask:/.test(css));
assert.ok(iconCss, 'the stylesheet must ship the .mw-parser-output a.external::after arrow (CSS mask)');
// The arrow is tinted with the link colour token, so it follows the theme.
assert.match(
  iconCss.match(/\.mw-parser-output a\.external::?after\s*\{[^}]*\}/)[0],
  /background-color:\s*var\(--color-link\)/,
  'the arrow must be tinted with var(--color-link) so it follows the light/dark theme',
);

console.log(
  `External-link icon check passed (article external links tagged + .external arrow CSS ships, theme-tinted)`,
);
