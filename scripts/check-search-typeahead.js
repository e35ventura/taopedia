import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for the search typeahead. It guards the contract the
// feature depends on: (1) the /search-data.json it reads is served with the
// title/url fields each suggestion renders and navigates to, (2) the combobox
// script is wired into both the layout pages (header search) and the homepage
// search, with the ARIA combobox wiring and the canonical-form selector intact,
// and (3) the dropdown styling is token-driven so it follows the theme.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
assert.ok(fs.existsSync(distDir), 'dist not found; run the build first');

// 1) The suggestion data must be served with the fields the typeahead uses.
const dataFile = path.join(distDir, 'search-data.json');
assert.ok(fs.existsSync(dataFile), 'dist/search-data.json must be served (typeahead data source)');
const entries = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
assert.ok(Array.isArray(entries) && entries.length >= 50, `expected the search-data array, found ${entries.length}`);
for (const entry of entries) {
  assert.ok(entry && typeof entry.title === 'string' && entry.title.length, 'every search-data entry must have a title');
  assert.ok(
    typeof entry.url === 'string' && /^https?:\/\/[^/]+\/wiki\//.test(entry.url),
    'every search-data entry must have an absolute /wiki/ url',
  );
}

// 2) The combobox script must ship on both an article (layout) page and the
//    homepage, with its data source, ARIA wiring, and form selector intact.
const wikiDir = path.join(distDir, 'wiki');
const articleFile = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !['special', 'category'].includes(e.name))
  .map((e) => path.join(wikiDir, e.name, 'index.html'))
  .find((f) => fs.existsSync(f));
assert.ok(articleFile, 'no built article page found');

for (const [label, file] of [['article', articleFile], ['homepage', path.join(distDir, 'index.html')]]) {
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.includes('__taopediaSearchSuggest'), `${label} must include the search-suggest script`);
  assert.ok(html.includes("fetch('/search-data.json')"), `${label} typeahead must load the search-data source`);
  assert.ok(html.includes("'combobox'"), `${label} typeahead must wire the input as an ARIA combobox`);
  assert.ok(html.includes('aria-activedescendant'), `${label} typeahead must track the active option for screen readers`);
  assert.ok(html.includes("'aria-selected'"), `${label} typeahead must set aria-selected on the active option (listbox contract)`);
  // The enhancement target must actually exist on the page, not just be named
  // in the script: a real canonical search form with a name="q" input.
  const form = html.match(/<form[^>]*action="\/search\/"[^>]*>([\s\S]*?)<\/form>/);
  assert.ok(form, `${label} must contain a <form action="/search/"> for the typeahead to enhance`);
  assert.ok(/<input[^>]*\bname="q"/.test(form[1]), `${label} search form must contain a name="q" input`);
}

// 3) The dropdown styling must be present and token-driven (no hardcoded
//    colors) and must ship in a built stylesheet.
const css = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'wikipedia.css'), 'utf8');
const listBlock = css.match(/\.search-suggest-list\s*\{([\s\S]*?)\n\}/);
assert.ok(listBlock, 'wikipedia.css must define a .search-suggest-list block');
assert.ok(/background:\s*var\(/.test(listBlock[1]), '.search-suggest-list must use a color token for its background');
const suggestRules = (css.match(/\.search-suggest-list[\s\S]*$/) || [''])[0];
const stray = suggestRules
  .split('\n')
  .filter((line) => !/rgba?\(/.test(line))
  .filter((line) => /#[0-9a-fA-F]{3,8}\b|:\s*(?:white|black)\b/.test(line));
assert.deepEqual(stray, [], `search-suggest CSS has hardcoded colors that won't theme:\n${stray.join('\n')}`);

const astroDir = path.join(distDir, '_astro');
const shipped = fs.existsSync(astroDir)
  && fs.readdirSync(astroDir).filter((f) => f.endsWith('.css'))
    .some((f) => fs.readFileSync(path.join(astroDir, f), 'utf8').includes('.search-suggest-list'));
assert.ok(shipped, 'the .search-suggest styles must be bundled into a shipped stylesheet');

console.log(`Search typeahead check passed (${entries.length} suggestion entries; combobox wired on article + homepage; dropdown token-themed + shipped)`);
