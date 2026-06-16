import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for the site-wide keyboard shortcuts. The shortcut handler
// and its help dialog are mounted globally (WikiLayout + the standalone
// homepage), so this pins that contract: every page ships the accessible
// <dialog>, its documented shortcuts, and the enhancement script. It fails if
// the dialog, its labelling/keys, or the script regress on either layout.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const wikiDir = path.join(distDir, 'wiki');

function assertShortcutsOn(html, where) {
  // Accessible modal dialog, labelled by its heading.
  assert.match(
    html,
    /<dialog\b[^>]*class="mw-shortcuts"[^>]*aria-labelledby="mw-shortcuts-title"/,
    `${where} must ship the <dialog class="mw-shortcuts"> labelled by its title`,
  );
  assert.match(
    html,
    /<h2\b[^>]*id="mw-shortcuts-title"[^>]*>Keyboard shortcuts<\/h2>/,
    `${where} dialog must have the "Keyboard shortcuts" title`,
  );
  // A native dismiss control (method="dialog") so the dialog closes without JS.
  assert.match(html, /<form\b[^>]*method="dialog"/, `${where} dialog must have a method="dialog" dismiss form`);
  assert.match(
    html,
    /class="mw-shortcuts-close"[^>]*aria-label="Close keyboard shortcuts"/,
    `${where} dialog must have a labelled close button`,
  );
  // The documented keys must be present.
  const keys = (html.match(/<kbd\b[^>]*>([^<]*)<\/kbd>/g) || []).map((m) => m.replace(/<[^>]+>/g, ''));
  for (const key of ['/', '?', 'g', 'h', 'r', 'c', 'Esc']) {
    assert.ok(keys.includes(key), `${where} dialog must document the "${key}" shortcut key`);
  }
  // The progressive-enhancement handler must ship.
  assert.ok(html.includes('__taopediaShortcuts'), `${where} must ship the keyboard-shortcuts handler script`);
  // The handler must wire the core shortcuts (focus search, open help, go-to nav).
  assert.match(html, /form\[action="\/search\/"\] input\[name="q"\]/, `${where} handler must target the search input`);
  assert.match(html, /'\/wiki\/special\/random\/'/, `${where} handler must wire the random-article shortcut`);
  assert.match(html, /'\/wiki\/special\/recentchanges\/'/, `${where} handler must wire the recent-changes shortcut`);
}

// Homepage (standalone layout) and a WikiLayout article page — both mount it.
const homeHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
assertShortcutsOn(homeHtml, 'the homepage');

const article = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .find(
    (e) =>
      e.isDirectory() &&
      e.name !== 'special' &&
      e.name !== 'category' &&
      fs.existsSync(path.join(wikiDir, e.name, 'index.html')),
  );
assert.ok(article, 'no built article page found to verify');
assertShortcutsOn(fs.readFileSync(path.join(wikiDir, article.name, 'index.html'), 'utf8'), 'article pages');

console.log('Keyboard shortcuts check passed (accessible dialog + documented keys + handler ship on homepage and articles)');
