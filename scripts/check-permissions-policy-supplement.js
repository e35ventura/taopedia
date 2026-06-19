import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Supplemental Permissions-Policy denials validated separately from check-csp.js
// so header hardening PRs can land without conflicting on the monolithic DENIED list.
// Does not deny clipboard-write — CiteCopyButtons.astro needs cite-page copying;
// clipboard-read IS denied (the site never reads the clipboard) so injected content
// cannot exfiltrate a reader's copied seed phrase or wallet address.
// Only MDN-standardized features with concrete browser security impact are added here
// (otp-credentials for WebOTP SMS interception; identity-credentials-get for FedCM;
// publickey-credentials-create for WebAuthn registration-ceremony hijacking;
// digital-credentials-get for unsolicited Digital Credentials API ID prompts;
// storage-access for embedded content elevating to cross-site cookie access;
// attribution-reporting for ad-conversion measurement/cross-site reporting;
// compute-pressure for CPU/thermal-pressure side-channel and fingerprinting).
export const SUPPLEMENTAL_DENIED_FEATURES = [
  'execution-while-not-rendered',
  'execution-while-out-of-viewport',
  'digital-credentials-get',
  'identity-credentials-get',
  'idle-detection',
  'keyboard-map',
  'local-fonts',
  'otp-credentials',
  'publickey-credentials-create',
  'storage-access',
  'attribution-reporting',
  'compute-pressure',
  'clipboard-read',
  'all-screens-capture',
  'captured-surface-control',
  'private-state-token-issuance',
  'private-state-token-redemption',
  'deferred-fetch',
  'deferred-fetch-minimal',
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

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('publickey-credentials-create=(), ', '')),
  /must deny publickey-credentials-create/,
  'a Permissions-Policy missing publickey-credentials-create must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('publickey-credentials-create=()', 'publickey-credentials-create=(self)'),
    ),
  /must deny publickey-credentials-create/,
  'a Permissions-Policy that grants publickey-credentials-create to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('publickey-credentials-create=()'),
  'production Permissions-Policy must deny publickey-credentials-create',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('digital-credentials-get=(), ', '')),
  /must deny digital-credentials-get/,
  'a Permissions-Policy missing digital-credentials-get must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('digital-credentials-get=()', 'digital-credentials-get=(self)'),
    ),
  /must deny digital-credentials-get/,
  'a Permissions-Policy that grants digital-credentials-get to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('digital-credentials-get=()'),
  'production Permissions-Policy must deny digital-credentials-get',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('storage-access=(), ', '')),
  /must deny storage-access/,
  'a Permissions-Policy missing storage-access must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('storage-access=()', 'storage-access=(self)'),
    ),
  /must deny storage-access/,
  'a Permissions-Policy that grants storage-access to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('storage-access=()'),
  'production Permissions-Policy must deny storage-access',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('attribution-reporting=(), ', '')),
  /must deny attribution-reporting/,
  'a Permissions-Policy missing attribution-reporting must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('attribution-reporting=()', 'attribution-reporting=(self)'),
    ),
  /must deny attribution-reporting/,
  'a Permissions-Policy that grants attribution-reporting to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('attribution-reporting=()'),
  'production Permissions-Policy must deny attribution-reporting',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('compute-pressure=(), ', '')),
  /must deny compute-pressure/,
  'a Permissions-Policy missing compute-pressure must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('compute-pressure=()', 'compute-pressure=(self)'),
    ),
  /must deny compute-pressure/,
  'a Permissions-Policy that grants compute-pressure to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('compute-pressure=()'),
  'production Permissions-Policy must deny compute-pressure',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('clipboard-read=(), ', '')),
  /must deny clipboard-read/,
  'a Permissions-Policy missing clipboard-read must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('clipboard-read=()', 'clipboard-read=(self)'),
    ),
  /must deny clipboard-read/,
  'a Permissions-Policy that grants clipboard-read to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('clipboard-read=()'),
  'production Permissions-Policy must deny clipboard-read',
);

// clipboard-write must remain allowed so CiteCopyButtons.astro keeps working.
assert.ok(
  !/(^|[,\s])clipboard-write=\(\)/.test(FULL_POLICY),
  'Permissions-Policy must NOT deny clipboard-write (CiteCopyButtons needs it)',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('all-screens-capture=(), ', '')),
  /must deny all-screens-capture/,
  'a Permissions-Policy missing all-screens-capture must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('all-screens-capture=()', 'all-screens-capture=(self)'),
    ),
  /must deny all-screens-capture/,
  'a Permissions-Policy that grants all-screens-capture to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('all-screens-capture=()'),
  'production Permissions-Policy must deny all-screens-capture',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('captured-surface-control=(), ', '')),
  /must deny captured-surface-control/,
  'a Permissions-Policy missing captured-surface-control must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('captured-surface-control=()', 'captured-surface-control=(self)'),
    ),
  /must deny captured-surface-control/,
  'a Permissions-Policy that grants captured-surface-control to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('captured-surface-control=()'),
  'production Permissions-Policy must deny captured-surface-control',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('private-state-token-issuance=(), ', '')),
  /must deny private-state-token-issuance/,
  'a Permissions-Policy missing private-state-token-issuance must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('private-state-token-issuance=()', 'private-state-token-issuance=(self)'),
    ),
  /must deny private-state-token-issuance/,
  'a Permissions-Policy that grants private-state-token-issuance to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('private-state-token-issuance=()'),
  'production Permissions-Policy must deny private-state-token-issuance',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('private-state-token-redemption=(), ', '')),
  /must deny private-state-token-redemption/,
  'a Permissions-Policy missing private-state-token-redemption must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('private-state-token-redemption=()', 'private-state-token-redemption=(self)'),
    ),
  /must deny private-state-token-redemption/,
  'a Permissions-Policy that grants private-state-token-redemption to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('private-state-token-redemption=()'),
  'production Permissions-Policy must deny private-state-token-redemption',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('deferred-fetch=(), ', '')),
  /must deny deferred-fetch/,
  'a Permissions-Policy missing deferred-fetch must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('deferred-fetch=()', 'deferred-fetch=(self)'),
    ),
  /must deny deferred-fetch/,
  'a Permissions-Policy that grants deferred-fetch to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('deferred-fetch=()'),
  'production Permissions-Policy must deny deferred-fetch',
);

assert.throws(
  () => validateSupplementalPermissionsPolicy(FULL_POLICY.replace('deferred-fetch-minimal=(), ', '')),
  /must deny deferred-fetch-minimal/,
  'a Permissions-Policy missing deferred-fetch-minimal must be rejected',
);

assert.throws(
  () =>
    validateSupplementalPermissionsPolicy(
      FULL_POLICY.replace('deferred-fetch-minimal=()', 'deferred-fetch-minimal=(self)'),
    ),
  /must deny deferred-fetch-minimal/,
  'a Permissions-Policy that grants deferred-fetch-minimal to an origin must be rejected',
);

assert.ok(
  FULL_POLICY.includes('deferred-fetch-minimal=()'),
  'production Permissions-Policy must deny deferred-fetch-minimal',
);

console.log('Supplemental Permissions-Policy check passed');
