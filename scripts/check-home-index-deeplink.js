import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// The home page A–Z article index is a client-side letter filter. This pins the
// deep-link contract the runtime relies on: the selected letter is written to
// the URL hash so it survives a reload and can be shared, and an incoming
// #<letter> is honoured on load and on back/forward navigation — the same
// URL-state discipline the search facets use (#1955). It fails if that wiring
// regresses, and (below) actually executes the shipped inline script against a
// DOM stub so the behaviour, not just its presence, is verified.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(projectRoot, 'src', 'pages', 'index.astro'), 'utf8');

// --- Source contract: the article-index script must ship the URL-state wiring.
assert.match(indexSource, /function letterFromHash\(/, 'index must derive the active letter from the URL hash');
assert.match(indexSource, /location\.hash/, 'index must read location.hash for deep-linking');
assert.match(
  indexSource,
  /history\.replaceState\(null, '', '#' \+ letter\)/,
  'clicking a letter must persist it to the URL hash via replaceState',
);
assert.match(
  indexSource,
  /addEventListener\('hashchange'/,
  'index must resync the letter when the hash changes (back/forward navigation)',
);

// --- Extract the article-index inline script (the one that wires the letters).
const scriptBlocks = [...indexSource.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const scriptBody = scriptBlocks.find((body) => body.includes('data-index-letter'));
assert.ok(scriptBody, 'could not find the article-index inline script in index.astro');

// --- Minimal DOM stub, seeded like the server render: letters A, M, Y have
// article groups; A is the initially-visible group (the rest start hidden).
const GROUP_LETTERS = ['A', 'M', 'Y'];
const INITIAL = 'A';

function makeButton(letter) {
  return {
    dataset: { indexLetter: letter },
    _class: new Set(letter === INITIAL ? ['active'] : []),
    _attrs: { 'aria-pressed': letter === INITIAL ? 'true' : 'false' },
    classList: {
      toggle(name, on) {
        if (on) this._set.add(name);
        else this._set.delete(name);
      },
    },
    setAttribute(name, value) {
      this._attrs[name] = value;
    },
    addEventListener(type, handler) {
      if (type === 'click') this._onclick = handler;
    },
  };
}

function makeGroup(letter) {
  return { dataset: { letter }, hidden: letter !== INITIAL };
}

function buildEnv() {
  const buttons = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => {
    const b = makeButton(letter);
    b._set = b._class; // wire classList.toggle to this button's set
    b.classList._set = b._class;
    return b;
  });
  const groups = GROUP_LETTERS.map(makeGroup);
  const indexTitle = { textContent: `Articles Beginning With '${INITIAL}'` };

  const location = { hash: '' };
  const history = {
    _calls: [],
    replaceState(state, title, url) {
      this._calls.push(url);
      if (typeof url === 'string' && url.startsWith('#')) location.hash = url;
    },
  };
  const listeners = {};
  const windowStub = {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const document = {
    querySelectorAll(sel) {
      if (sel === '[data-index-letter]') return buttons;
      if (sel === '[data-letter]') return groups;
      return [];
    },
    getElementById(id) {
      return id === 'article-index-title' ? indexTitle : null;
    },
  };

  const context = {
    document,
    location,
    history,
    window: windowStub,
    decodeURIComponent,
    console,
  };
  return { context, buttons, groups, indexTitle, location, history, listeners };
}

const shownLetter = (groups) => groups.find((g) => !g.hidden)?.dataset.letter;
const pressed = (buttons, letter) => buttons.find((b) => b.dataset.indexLetter === letter)._attrs['aria-pressed'];

// 1) Deep-link on load: #M selects the M group and marks the M button pressed.
{
  const env = buildEnv();
  env.location.hash = '#M';
  vm.runInNewContext(scriptBody, env.context);
  assert.equal(shownLetter(env.groups), 'M', 'loading #M must show the M group');
  assert.equal(env.indexTitle.textContent, "Articles Beginning With 'M'", 'heading must follow the deep-linked letter');
  assert.equal(pressed(env.buttons, 'M'), 'true', 'the M button must be pressed');
  assert.equal(pressed(env.buttons, 'A'), 'false', 'the default button must no longer be pressed');
}

// 2) Lowercase hash is accepted (case-insensitive deep link).
{
  const env = buildEnv();
  env.location.hash = '#m';
  vm.runInNewContext(scriptBody, env.context);
  assert.equal(shownLetter(env.groups), 'M', 'a lowercase #m must resolve to the M group');
}

// 3) A stray/foreign hash is ignored — the server default stays selected.
for (const hash of ['#content', '#Q', '#', '#123', '']) {
  const env = buildEnv();
  env.location.hash = hash;
  vm.runInNewContext(scriptBody, env.context);
  assert.equal(shownLetter(env.groups), INITIAL, `hash "${hash}" must not change the selection`);
}

// 4) Clicking a letter persists it to the URL hash (share/reload survival).
{
  const env = buildEnv();
  vm.runInNewContext(scriptBody, env.context);
  const yButton = env.buttons.find((b) => b.dataset.indexLetter === 'Y');
  yButton._onclick();
  assert.equal(shownLetter(env.groups), 'Y', 'clicking Y must show the Y group');
  assert.equal(env.location.hash, '#Y', 'clicking Y must write #Y to the URL');
  assert.deepEqual(env.history._calls, ['#Y'], 'the click must persist via a single replaceState');
}

// 5) A hashchange (back/forward) resyncs the visible letter.
{
  const env = buildEnv();
  vm.runInNewContext(scriptBody, env.context);
  env.location.hash = '#Y';
  env.listeners.hashchange();
  assert.equal(shownLetter(env.groups), 'Y', 'a hashchange to #Y must show the Y group');
}

console.log('Home article-index deep-link check passed (hash deep-link, persistence, resync, and stray-hash guard)');
