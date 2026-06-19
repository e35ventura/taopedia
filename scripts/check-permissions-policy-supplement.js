import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Supplemental Permissions-Policy denials validated separately from check-csp.js
// so header hardening PRs can land without conflicting on the monolithic DENIED list.
// Does not deny clipboard-write — CiteCopyButtons.astro needs cite-page copying.
// Only MDN-standardized features with concrete browser security impact are added here
// (otp-credentials for WebOTP SMS interception; identity-credentials-get for FedCM).
export const SUPPLEMENTAL_DENIED_FEATURES = [
  'execution-while-not-rendered',
  'execution-while-out-of-viewport',
  'identity-credentials-get',
  'idle-detection',
  'keyboard-map',
  'local-fonts',
  'otp-credentials',
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
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('idle-detection=()', 'idle-detection=(self)'),
    ),
  /must deny idle-detection/,
  'a Permissions-Policy that grants idle-detection to an origin must be rejected',
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

// identity-credentials-get gates the FedCM API; a static wiki never federates sign-in.
assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('identity-credentials-get=(), ', '')),
  /must deny identity-credentials-get/,
  'a Permissions-Policy missing identity-credentials-get must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('identity-credentials-get=()', 'identity-credentials-get=(self)'),
    ),
  /must deny identity-credentials-get/,
  'a Permissions-Policy that grants identity-credentials-get to an origin must be rejected',
);

// otp-credentials gates the WebOTP API; denying it blocks silent SMS OTP harvesting.
assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('otp-credentials=(), ', '')),
  /must deny otp-credentials/,
  'a Permissions-Policy missing otp-credentials must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('otp-credentials=()', 'otp-credentials=(self)'),
    ),
  /must deny otp-credentials/,
  'a Permissions-Policy that grants otp-credentials to an origin must be rejected',
);

// Live config must carry both new denials in the catch-all header string.
assert.ok(
  FULL_POLICY.includes('identity-credentials-get=()'),
  'production Permissions-Policy must deny identity-credentials-get',
);
assert.ok(
  FULL_POLICY.includes('otp-credentials=()'),
  'production Permissions-Policy must deny otp-credentials',
);

console.log('Supplemental Permissions-Policy check passed');
