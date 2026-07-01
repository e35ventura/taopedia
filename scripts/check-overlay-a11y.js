import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const layout = fs.readFileSync(path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'), 'utf8');

assert.match(
  layout,
  /<aside class="mw-sidebar" id="wiki-sidebar">/,
  'wiki layout sidebar must expose a stable id for disclosure controls',
);
assert.match(
  layout,
  /<aside class="mw-appearance" id="wiki-appearance" aria-labelledby="appearance-title">/,
  'wiki layout appearance panel must expose a stable id for disclosure controls',
);
assert.match(
  layout,
  /function syncSidebarOverlayModal\(\)/,
  'wiki layout must sync navigation sidebar aria-modal when the mobile overlay opens or closes',
);
assert.match(
  layout,
  /function syncAppearanceOverlayModal\(\)/,
  'wiki layout must sync appearance panel aria-modal when the overlay opens or closes',
);
assert.ok(
  layout.includes("sidebarToggle.setAttribute('aria-controls', 'wiki-sidebar')"),
  'wiki layout must wire the navigation toolbar toggle to the sidebar panel it controls',
);
assert.ok(
  layout.includes("appearanceToggle.setAttribute('aria-controls', 'wiki-appearance')"),
  'wiki layout must wire the appearance toolbar toggle to the appearance panel it controls',
);
assert.ok(
  layout.includes("sidebar.setAttribute('aria-modal', 'true')"),
  'wiki layout must mark the navigation sidebar overlay as aria-modal while it is open',
);
assert.ok(
  layout.includes("appearancePanel.setAttribute('aria-modal', 'true')"),
  'wiki layout must mark the appearance overlay as aria-modal while it is open',
);
assert.ok(
  layout.includes("sidebar.removeAttribute('aria-modal')"),
  'wiki layout must clear navigation sidebar aria-modal when the overlay closes',
);
assert.ok(
  layout.includes("appearancePanel.removeAttribute('aria-modal')"),
  'wiki layout must clear appearance aria-modal when the overlay closes',
);

console.log('Overlay a11y check passed');
