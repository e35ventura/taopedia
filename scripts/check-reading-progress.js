import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for the reading-progress indicator. It guards that the bar
// is wired into article pages (and only there), measures the article content,
// is presentational for assistive tech, and that its styling is token-driven
// (so it themes) and square — and actually ships in a built stylesheet.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
assert.ok(fs.existsSync(distDir), 'dist not found; run the build first');

// 1) The bar + script must ship on an article page, presentational, measuring
//    the article content column.
const wikiDir = path.join(distDir, 'wiki');
const articleFile = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !['special', 'category'].includes(e.name))
  .map((e) => path.join(wikiDir, e.name, 'index.html'))
  .find((f) => fs.existsSync(f));
assert.ok(articleFile, 'no built article page found');
const articleHtml = fs.readFileSync(articleFile, 'utf8');

assert.ok(articleHtml.includes('__taopediaReadingProgress'), 'article must include the reading-progress script');
const bar = articleHtml.match(/<div[^>]*class="reading-progress"[^>]*>/);
assert.ok(bar, 'article must render the .reading-progress bar element');
assert.ok(bar[0].includes('aria-hidden="true"'), 'the reading-progress bar must be aria-hidden (presentational, no SR noise)');
assert.ok(articleHtml.includes('scrollHeight'), 'progress must track whole-page scroll (scrollHeight), reaching 100% at the bottom');
assert.ok(articleHtml.includes('scaleX('), 'the bar must be driven by a transform: scaleX(...)');

// 2) It is article-scoped: the standalone homepage must not ship it.
const homeHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
assert.ok(!homeHtml.includes('__taopediaReadingProgress'), 'the homepage must not load the reading-progress bar (article feature)');

// 3) Styling: token-driven (themes), square, fixed at the top, and shipped.
const css = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'wikipedia.css'), 'utf8');
const block = css.match(/\.reading-progress\s*\{([\s\S]*?)\n\}/);
assert.ok(block, 'wikipedia.css must define a .reading-progress block');
const rules = block[1];
assert.ok(/background:\s*var\(--color-progressive\)/.test(rules), '.reading-progress must use the --color-progressive token so it themes');
assert.ok(/position:\s*fixed/.test(rules) && /top:\s*0/.test(rules), '.reading-progress must be fixed at the top');
assert.ok(/transform:\s*scaleX\(0\)/.test(rules), '.reading-progress must start empty (scaleX(0))');
assert.ok(!/border-radius/.test(rules), '.reading-progress must be square (no border-radius) to match the site aesthetic');

const astroDir = path.join(distDir, '_astro');
const shipped = fs.existsSync(astroDir)
  && fs.readdirSync(astroDir).filter((f) => f.endsWith('.css'))
    .some((f) => fs.readFileSync(path.join(astroDir, f), 'utf8').includes('.reading-progress'));
assert.ok(shipped, 'the .reading-progress styles must be bundled into a shipped stylesheet');

console.log('Reading-progress check passed (bar wired on articles, off the homepage; presentational; token-themed, square, shipped)');
