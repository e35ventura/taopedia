import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for the floating back-to-top control. It guards that the
// button is wired into article pages (and only there), stays hidden until the
// reader scrolls, exposes an accessible label, and ships token-driven styling.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
assert.ok(fs.existsSync(distDir), 'dist not found; run the build first');

const wikiDir = path.join(distDir, 'wiki');
const articleFile = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !['special', 'category'].includes(e.name))
  .map((e) => path.join(wikiDir, e.name, 'index.html'))
  .find((f) => fs.existsSync(f));
assert.ok(articleFile, 'no built article page found');
const articleHtml = fs.readFileSync(articleFile, 'utf8');

assert.ok(articleHtml.includes('__taopediaBackToTop'), 'article must include the back-to-top script');
const button = articleHtml.match(/<button[^>]*class="back-to-top"[^>]*>/);
assert.ok(button, 'article must render the .back-to-top button');
assert.ok(button[0].includes('type="button"'), 'back-to-top must be a button element');
assert.ok(button[0].includes('aria-label="Back to top"'), 'back-to-top must expose an accessible label');
assert.ok(articleHtml.includes('scrollTo'), 'back-to-top must scroll the viewport to the top on click');
assert.ok(articleHtml.includes('prefers-reduced-motion'), 'back-to-top must respect reduced-motion preference');

const homeHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
assert.ok(!homeHtml.includes('__taopediaBackToTop'), 'the homepage must not load the floating back-to-top control');

const css = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'wikipedia.css'), 'utf8');
const block = css.match(/\.back-to-top\s*\{([\s\S]*?)\n\}/);
assert.ok(block, 'wikipedia.css must define a .back-to-top block');
const rules = block[1];
assert.ok(/position:\s*fixed/.test(rules), '.back-to-top must be viewport-fixed');
assert.ok(/background:\s*var\(--background-color-base\)/.test(rules), '.back-to-top must use background token so it themes');
assert.ok(/color:\s*var\(--color-base\)/.test(rules), '.back-to-top must use base text token so it themes');
assert.ok(/\.back-to-top\.visible/.test(css), '.back-to-top must define a .visible state for scroll reveal');

const astroDir = path.join(distDir, '_astro');
const shipped = fs.existsSync(astroDir)
  && fs.readdirSync(astroDir).filter((f) => f.endsWith('.css'))
    .some((f) => fs.readFileSync(path.join(astroDir, f), 'utf8').includes('.back-to-top'));
assert.ok(shipped, 'the .back-to-top styles must be bundled into a shipped stylesheet');

console.log('Back-to-top check passed (button wired on articles, off the homepage; accessible; token-themed, shipped)');
