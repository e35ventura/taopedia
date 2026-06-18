import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// site.webmanifest declares theme_color for install prompts and standalone mode,
// but mobile browsers read <meta name="theme-color"> from the HTML head for tab
// and address-bar chrome. Both must advertise the same brand color so the UI
// matches Taopedia's link blue (#3366cc, --color-link in wikipedia.css).
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');
const manifest = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'public', 'site.webmanifest'), 'utf8'),
);

assert.equal(
  typeof manifest.theme_color,
  'string',
  'site.webmanifest must declare theme_color',
);

assert.match(
  seo,
  new RegExp(`<meta name="theme-color" content="${manifest.theme_color}"\\s*/>`),
  'Seo head must advertise theme-color matching site.webmanifest theme_color',
);

console.log('theme-color check passed');
