import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Supplemental Permissions-Policy denials validated separately from check-csp.js
// so header hardening PRs can land without conflicting on the monolithic DENIED list.
// Does not deny clipboard-write — CiteCopyButtons.astro needs cite-page copying.
export const SUPPLEMENTAL_DENIED_FEATURES = ['idle-detection', 'keyboard-map'];

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

console.log('Supplemental Permissions-Policy check passed');
