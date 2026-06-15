import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for page previews (hovercards). It guards the contract the
// feature depends on: (1) the slug-map data it reads is served and has the
// title/summary fields the card renders, (2) the preview script is wired into
// both the layout pages and the standalone homepage, with the touch/keyboard
// guards that keep it a safe progressive enhancement, and (3) the card styling
// is token-driven so it follows the light/dark theme.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
assert.ok(fs.existsSync(distDir), 'dist not found; run the build first');

// 1) The slug map the hovercards read must be served from the site root with
//    the fields the card renders. A missing field or moved file silently breaks
//    every preview.
const slugMapFile = path.join(distDir, 'data', 'slugmap.json');
assert.ok(fs.existsSync(slugMapFile), 'dist/data/slugmap.json must be served (hovercard data source)');
const slugMap = JSON.parse(fs.readFileSync(slugMapFile, 'utf8'));
const slugs = Object.keys(slugMap);
assert.ok(slugs.length >= 50, `expected the article slug map, found ${slugs.length} entries`);
for (const slug of slugs) {
  const entry = slugMap[slug];
  assert.ok(entry && typeof entry.title === 'string' && entry.title.length, `slug map entry ${slug} must have a title`);
  assert.ok(typeof entry.summary === 'string', `slug map entry ${slug} must have a summary string`);
}

// 2) The preview script must be inlined into both an article (layout) page and
//    the standalone homepage, and must keep its guards: reads the slug map,
//    matches only /wiki/<slug>/ links, restricts hover to mouse pointers, and
//    still works from keyboard focus.
const wikiDir = path.join(distDir, 'wiki');
const articleFile = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !['special', 'category'].includes(e.name))
  .map((e) => path.join(wikiDir, e.name, 'index.html'))
  .find((f) => fs.existsSync(f));
assert.ok(articleFile, 'no built article page found');

const articleHtml = fs.readFileSync(articleFile, 'utf8');
assert.ok(articleHtml.includes("fetch('/data/slugmap.json')"), 'article must load the slug map for previews');
assert.ok(articleHtml.includes('__taopediaHovercards'), 'article must include the hovercard script');
assert.ok(articleHtml.includes('hover: hover'), 'hovercards must restrict hover previews to mouse pointers');
assert.ok(articleHtml.includes('focusin'), 'hovercards must be reachable by keyboard focus');
assert.ok(/\\\/wiki\\\/\(\[\^\/#\?\]\+\)/.test(articleHtml), 'hovercards must match only /wiki/<slug>/ links');
// Previews are scoped to the article reading content so they never repeat a
// summary already shown on cards/lists/search results.
assert.ok(articleHtml.includes("closest('.mw-parser-output')"), 'hovercards must be scoped to the article reading content (.mw-parser-output)');

// The homepage must NOT ship the preview script (its links are cards/index
// entries that already show the summary, or are navigational).
const homeHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
assert.ok(!homeHtml.includes('__taopediaHovercards'), 'the homepage must not load hovercards (summaries are already shown there)');

// 3) The card styling must be present and token-driven (no hardcoded colors)
//    so it themes in both light and dark.
const css = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'wikipedia.css'), 'utf8');
const cardBlockMatch = css.match(/\.hovercard\s*\{([\s\S]*?)\n\}/);
assert.ok(cardBlockMatch, 'wikipedia.css must define a .hovercard block');
const cardBlock = cardBlockMatch[1];
assert.ok(/background:\s*var\(/.test(cardBlock) && /color:\s*var\(/.test(cardBlock), '.hovercard must use color tokens for background and text');
assert.ok(css.includes('.hovercard.is-visible'), 'wikipedia.css must define the visible state for the hovercard');
// No hardcoded colors in the hovercard rules (rgba shadows/overlays are allowed).
const cardRules = (css.match(/\.hovercard[\s\S]*$/) || [''])[0];
const strayCardColors = cardRules
  .split('\n')
  .filter((line) => !/rgba?\(/.test(line))
  .filter((line) => /#[0-9a-fA-F]{3,8}\b|:\s*(?:white|black)\b/.test(line));
assert.deepEqual(strayCardColors, [], `hovercard CSS has hardcoded colors that won't theme:\n${strayCardColors.join('\n')}`);

// And the rule must actually ship in a built stylesheet bundle (not just live
// in source) — otherwise the card would be permanently invisible (opacity: 0).
const astroDir = path.join(distDir, '_astro');
const bundledCss = fs.existsSync(astroDir)
  ? fs.readdirSync(astroDir).filter((f) => f.endsWith('.css'))
  : [];
const cardStyleShipped = bundledCss.some((f) => fs.readFileSync(path.join(astroDir, f), 'utf8').includes('.hovercard'));
assert.ok(cardStyleShipped, 'the .hovercard styles must be bundled into a shipped stylesheet');

console.log(`Hovercard check passed (${slugs.length} preview entries; scoped to article content, off the homepage; card styles shipped + token-themed)`);
