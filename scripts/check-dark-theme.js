import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for the dark theme. It guards completeness — the property
// that makes dark mode "dead accurate": every color token has a dark override
// (so no element silently stays light), no hardcoded page colors remain (which
// would not respond to the theme), and the control + pre-paint script + dark
// logo treatment are all wired into the built pages.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const cssFile = path.join(projectRoot, 'src', 'styles', 'wikipedia.css');
const css = fs.readFileSync(cssFile, 'utf8');

const block = (selector) => {
  const re = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = css.match(re);
  assert.ok(m, `wikipedia.css must contain a ${selector} block`);
  return m[1];
};

const rootBlock = block(':root');
const darkBlock = block(":root\\[data-theme='dark'\\]");

// 1) Every color token defined in :root must also be overridden in the dark
//    block. A forgotten token is exactly how an element stays light in dark mode.
const tokenRe = /(--(?:color|background-color|border-color)[\w-]*)\s*:/g;
const rootColorTokens = [...rootBlock.matchAll(tokenRe)].map((m) => m[1]);
const darkColorTokens = new Set([...darkBlock.matchAll(tokenRe)].map((m) => m[1]));
assert.ok(rootColorTokens.length >= 10, `expected the color-token palette in :root, found ${rootColorTokens.length}`);
for (const token of rootColorTokens) {
  assert.ok(darkColorTokens.has(token), `dark theme must override the ${token} color token (or it stays light in dark mode)`);
}

// 2) color-scheme must be declared in both modes so native controls (the search
//    field, scrollbars) follow the theme.
assert.ok(/color-scheme:\s*light/.test(rootBlock), ':root must declare color-scheme: light');
assert.ok(/color-scheme:\s*dark/.test(darkBlock), 'the dark theme must declare color-scheme: dark');

// 3) No hardcoded page colors may remain in the stylesheet. Token definitions
//    (--x: #hex) and intentional black shadows/overlays (rgba) are allowed;
//    anything else is a color that would not respond to the theme.
const strayColors = css
  .replace(/\/\*[\s\S]*?\*\//g, '') // strip comments (a hex in a comment isn't a real color)
  .split('\n')
  .filter((line) => !/--[\w-]+\s*:/.test(line)) // skip token definitions
  .filter((line) => !/rgba?\(/.test(line)) // skip shadows / overlays
  .filter((line) => /#[0-9a-fA-F]{3,8}\b|:\s*(?:white|black)\b/.test(line));
assert.deepEqual(strayColors, [], `wikipedia.css has hardcoded colors that won't theme:\n${strayColors.join('\n')}`);

// 4) The fixed-colour wordmark logo must be lightened in dark so it stays visible.
assert.ok(
  /:root\[data-theme='dark'\]\s*\.header-logo-img\s*\{[^}]*filter/.test(css),
  'the dark theme must apply a filter to .header-logo-img so the logo is visible on dark',
);

// 5) The search field must set its own background/colour (otherwise it renders as
//    a white box in dark mode).
const searchInput = block('\\.mw-search-input');
assert.ok(/background:\s*var\(/.test(searchInput) && /color:\s*var\(/.test(searchInput), '.mw-search-input must set a tokenized background and color');

// 6) Built output: the Color control, the pre-paint theme script, and the
//    runtime persistence must all be present — on an article (layout) page and
//    on the standalone homepage.
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
const articleFile = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !['special', 'category'].includes(e.name))
  .map((e) => path.join(wikiDir, e.name, 'index.html'))
  .find((f) => fs.existsSync(f));
assert.ok(articleFile, 'no built article page found');

for (const [label, file] of [['article', articleFile], ['homepage', path.join(projectRoot, 'dist', 'index.html')]]) {
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(
    /localStorage\.getItem\('taopedia-color'\)[\s\S]*?setAttribute\('data-theme'/.test(html),
    `${label} must include the pre-paint theme script (reads taopedia-color, sets data-theme)`,
  );
}

const articleHtml = fs.readFileSync(articleFile, 'utf8');
assert.ok(articleHtml.includes('name="color-theme"'), 'the Appearance panel must include a Color control');
assert.ok(
  articleHtml.includes('value="light"') && articleHtml.includes('value="dark"'),
  'the Color control must offer Light and Dark',
);

console.log(`Dark-theme check passed (${rootColorTokens.length} color tokens all overridden; no stray colors; control + pre-paint script wired)`);
