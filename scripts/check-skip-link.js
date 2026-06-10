import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const layout = fs.readFileSync(path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'), 'utf8');
const homePage = fs.readFileSync(path.join(projectRoot, 'src', 'pages', 'index.astro'), 'utf8');
const styles = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'wikipedia.css'), 'utf8');

assert.match(
  layout,
  /<a\s+href="#content"\s+class="skip-link">Skip to content<\/a>/,
  'wiki layout must expose a skip link before repeated navigation',
);
assert.match(
  layout,
  /<main\s+id="content"\s+class="mw-body"\s+tabindex="-1">/,
  'wiki layout main content must be a focusable skip-link target',
);
assert.match(
  homePage,
  /<a\s+href="#content"\s+class="skip-link">Skip to content<\/a>/,
  'homepage must expose a skip link before repeated navigation',
);
assert.match(
  homePage,
  /<main\s+id="content"\s+class="home-shell"\s+tabindex="-1">/,
  'homepage main content must be a focusable skip-link target',
);
assert.match(styles, /\.skip-link\s*{[^}]*position:\s*fixed;/s, 'skip link must be positioned independently');
assert.match(
  styles,
  /\.skip-link\s*{[^}]*transform:\s*translateY\(calc\(-100% - 12px\)\);/s,
  'skip link must be hidden by default',
);
assert.match(
  styles,
  /\.skip-link:focus\s*{[^}]*transform:\s*translateY\(0\);/s,
  'skip link must become visible when focused',
);

console.log('Skip link check passed');
