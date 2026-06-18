import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Supplemental Permissions-Policy denials validated separately from check-csp.js
// so header hardening PRs can land without conflicting on the monolithic DENIED list.
// Does not deny clipboard-write — CiteCopyButtons.astro needs cite-page copying.
export const SUPPLEMENTAL_DENIED_FEATURES = [
  'idle-detection',
  'keyboard-map',
  'local-fonts',
  'execution-while-not-rendered',
  'execution-while-out-of-viewport',
];

export function validateSupplementalPermissionsPolicy(value) {
  for (const feature of SUPPLEMENTAL_DENIED_FEATURES) {
    assert.match(
      value,
      new RegExp(`(^|[,\\s])${feature}=\\(\\)`),
      `Permissions-Policy must deny ${feature} with ${feature}=()`,
    );
  }
}

function permissionsPolicyValue(config) {
  const match = config.match(/^\s*Permissions-Policy\s*=\s*"([^"]*)"/m);
  assert.ok(match, 'netlify.toml must declare a Permissions-Policy header');
  return match[1];
}

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const config = fs.readFileSync(path.join(projectRoot, 'netlify.toml'), 'utf8');
validateSupplementalPermissionsPolicy(permissionsPolicyValue(config));

const FULL_POLICY = permissionsPolicyValue(config);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('idle-detection=(), ', '')),
  /must deny idle-detection/,
  'a Permissions-Policy missing idle-detection must be rejected',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('keyboard-map=(), ', '')),
  /must deny keyboard-map/,
  'a Permissions-Policy missing keyboard-map must be rejected',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('keyboard-map=()', 'keyboard-map=(self)')),
  /must deny keyboard-map/,
  'a Permissions-Policy that grants keyboard-map to an origin must be rejected',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('local-fonts=(), ', '')),
  /must deny local-fonts/,
  'a Permissions-Policy missing local-fonts must be rejected',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('local-fonts=()', 'local-fonts=(self)')),
  /must deny local-fonts/,
  'a Permissions-Policy that grants local-fonts to an origin must be rejected',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('execution-while-not-rendered=(), ', '')),
  /must deny execution-while-not-rendered/,
  'a Permissions-Policy missing execution-while-not-rendered must be rejected',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('execution-while-out-of-viewport=(), ', '')),
  /must deny execution-while-out-of-viewport/,
  'a Permissions-Policy missing execution-while-out-of-viewport must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('execution-while-not-rendered=()', 'execution-while-not-rendered=(self)'),
    ),
  /must deny execution-while-not-rendered/,
  'a Permissions-Policy that grants execution-while-not-rendered to an origin must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('execution-while-out-of-viewport=()', 'execution-while-out-of-viewport=(self)'),
    ),
  /must deny execution-while-out-of-viewport/,
  'a Permissions-Policy that grants execution-while-out-of-viewport to an origin must be rejected',
);

console.log('Supplemental Permissions-Policy check passed');
