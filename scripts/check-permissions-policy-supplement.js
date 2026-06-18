import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Supplemental Permissions-Policy denials validated separately from check-csp.js
// so header hardening PRs can land without conflicting on the monolithic DENIED list.
// Does not deny clipboard-write — CiteCopyButtons.astro needs cite-page copying.
export const SUPPLEMENTAL_DENIED_FEATURES = [
  'idle-detection',
  'join-ad-interest-group',
  'keyboard-map',
  'run-ad-auction',
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

// Privacy Sandbox Protected Audience ad-auction APIs — a static content wiki runs
// no ad auctions, so deny them outright. These complete the Privacy Sandbox
// ad-technology denial begun by browsing-topics/interest-cohort in check-csp.js.
assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('join-ad-interest-group=(), ', '')),
  /must deny join-ad-interest-group/,
  'a Permissions-Policy missing join-ad-interest-group must be rejected',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('run-ad-auction=(), ', '')),
  /must deny run-ad-auction/,
  'a Permissions-Policy missing run-ad-auction must be rejected',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('run-ad-auction=()', 'run-ad-auction=(self)')),
  /must deny run-ad-auction/,
  'a Permissions-Policy that grants run-ad-auction to an origin must be rejected',
);

console.log('Supplemental Permissions-Policy check passed');
