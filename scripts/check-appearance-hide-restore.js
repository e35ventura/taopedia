import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const layout = fs.readFileSync(path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'), 'utf8');

assert.match(
  layout,
  /<button\s+class="appearance-hide"\s+hidden\s+type="button"\s+aria-label="Hide appearance controls">hide<\/button>/,
  'appearance hide control must be hidden until a restore toggle is present',
);

assert.match(
  layout,
  /appearanceHideBtn\.hidden\s*=\s*!appearanceToggle;/,
  'layout script must reveal the hide control only when an appearance restore toggle exists',
);

assert.match(
  layout,
  /if\s*\(appearanceHideBtn\s*&&\s*appearancePanel\s*&&\s*appearanceToggle\)\s*{/,
  'hide click handler must only bind when the panel can be restored',
);

assert.doesNotMatch(
  layout,
  /appearanceToggle\?\.(classList|setAttribute)/,
  'hide handler must not silently hide the panel when no restore toggle exists',
);

console.log('Appearance hide/restore check passed');
