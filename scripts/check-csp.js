import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const parsePolicy = (policy) => {
  const directives = new Map();
  for (const segment of policy.split(';')) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...values] = tokens;
    const directive = name.toLowerCase();
    assert.ok(!directives.has(directive), `CSP declares the ${directive} directive twice`);
    directives.set(directive, values);
  }
  return directives;
};

// Assert that `headerName` is declared exactly once and INSIDE the catch-all
// `for = "/*"` headers block, and return its value. Being merely after the
// catch-all marker is not enough: if another `[[headers]]` block opens between
// the marker and the header, the header is scoped to that narrower path (e.g.
// `for = "/special/*"`) and silently stops applying to every response. Shared by
// the CSP and HSTS checks so both enforce the same block-membership contract.
function catchAllHeaderValue(config, headerName) {
  const catchAllMarker = 'for = "/*"';
  const catchAllIndex = config.indexOf(catchAllMarker);
  assert.notEqual(catchAllIndex, -1, 'netlify.toml must keep a catch-all `for = "/*"` headers block');

  const matches = [...config.matchAll(new RegExp(`^\\s*${headerName}\\s*=\\s*"([^"]*)"`, 'gm'))];
  assert.equal(matches.length, 1, `expected exactly one ${headerName} header in netlify.toml`);
  const headerIndex = matches[0].index;
  assert.ok(
    headerIndex > catchAllIndex,
    `the ${headerName} header must come after the catch-all \`for = "/*"\` block opens`,
  );
  const betweenMarkerAndHeader = config.slice(catchAllIndex + catchAllMarker.length, headerIndex);
  assert.ok(
    !/\n\s*for\s*=\s*"/.test(betweenMarkerAndHeader),
    `the ${headerName} header must live in the catch-all \`for = "/*"\` block, not a later headers block`,
  );
  return matches[0][1];
}

// Validate the Content-Security-Policy declared in a netlify.toml string. Exported
// and pure so the invariants can be exercised against fixtures, not just the live
// config — see the self-tests at the bottom.
export function validateCspConfig(config) {
  // The CSP must be declared on the catch-all headers block so it applies to
  // every response, including /pagefind/pagefind-worker.js.
  const policy = catchAllHeaderValue(config, 'Content-Security-Policy');
  const directives = parsePolicy(policy);

  const scriptSrc = directives.get('script-src');
  assert.ok(scriptSrc, 'CSP must declare script-src explicitly');

  // Pagefind compiles its full-text index with WebAssembly.instantiate in both
  // pagefind.js and pagefind-worker.js. Without 'wasm-unsafe-eval' the compile
  // is refused, search.astro silently falls back to the metadata-only index,
  // and queries matching article body text return nothing.
  assert.ok(
    scriptSrc.includes("'wasm-unsafe-eval'"),
    "script-src must include 'wasm-unsafe-eval' so Pagefind's WebAssembly index can compile",
  );

  // The WASM allowance must never widen into JS eval()/new Function().
  assert.ok(
    !scriptSrc.includes("'unsafe-eval'"),
    "script-src must not include 'unsafe-eval'; 'wasm-unsafe-eval' is enough for Pagefind",
  );

  // Keep the rest of the hardening baseline intact.
  assert.ok(scriptSrc.includes("'self'"), "script-src must keep 'self' so site scripts still load");
  // Production CSP already includes 'unsafe-inline' for Seo.astro's inline theme
  // bootstrap script. Lock that shipped contract so a future edit cannot drop it.
  assert.ok(
    scriptSrc.includes("'unsafe-inline'"),
    "script-src must include 'unsafe-inline' for inline head scripts such as Seo.astro",
  );
  // script-src 'unsafe-inline' above re-enables inline event-handler attributes
  // (onclick=, onerror=, ...) as well as inline <script> blocks. The site needs the
  // inline <script> (script-src-elem context) but ships zero inline event handlers,
  // so pin script-src-attr 'none' to deny the handler-attribute context outright --
  // defense-in-depth with the sync-articles on*= block.
  assert.deepEqual(
    directives.get('script-src-attr'),
    ["'none'"],
    "CSP must set script-src-attr 'none' to deny inline event-handler attributes",
  );
  assert.deepEqual(directives.get('default-src'), ["'self'"], "CSP must keep default-src 'self'");
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"], "CSP must keep frame-ancestors 'none'");
  assert.deepEqual(directives.get('base-uri'), ["'self'"], "CSP must keep base-uri 'self'");
  // Forms on search.astro submit to same-origin routes only; block cross-origin exfil.
  assert.deepEqual(
    directives.get('form-action'),
    ["'self'"],
    "CSP must set form-action 'self' so forms cannot post to third-party origins",
  );
  const styleSrc = directives.get('style-src');
  assert.ok(styleSrc, 'CSP must declare style-src explicitly');
  assert.ok(
    styleSrc.includes("'self'"),
    "style-src must include 'self' so bundled stylesheets still load",
  );
  assert.ok(
    styleSrc.includes("'unsafe-inline'"),
    "style-src must include 'unsafe-inline' for Astro component <style> blocks",
  );
  // Production CSP already allows synced local figures, https article images, and
  // data: URIs (see check-sync-frontmatter-images.js). Lock that shipped contract.
  const imgSrc = directives.get('img-src');
  assert.ok(imgSrc, 'CSP must declare img-src explicitly');
  assert.ok(imgSrc.includes("'self'"), "img-src must include 'self' for synced local figures");
  assert.ok(imgSrc.includes('https:'), "img-src must include https: for allowed remote article images");
  assert.ok(imgSrc.includes('data:'), "img-src must include data: for inline image data used by the build");
  // <object>/<embed> can run legacy plugin content that default-src does not fully
  // neutralize in older engines, so block it explicitly (the CSP Evaluator
  // hardening baseline). The site embeds no plugin content, so 'none' is safe.
  assert.deepEqual(directives.get('object-src'), ["'none'"], "CSP must set object-src 'none'");
  // <iframe>/<frame> loads are controlled separately from frame-ancestors (who may
  // embed this page). The wiki embeds no frames, so block outbound frame loads too.
  assert.deepEqual(directives.get('frame-src'), ["'none'"], "CSP must set frame-src 'none'");
  // <audio>/<video> sources fall back to default-src 'self' without an explicit
  // media-src, which still permits same-origin media injection. The wiki ships no
  // audio or video, so deny media outright -- the same 'none' tightening applied
  // to object-src and frame-src above ('none', not 'self', is the point).
  assert.deepEqual(directives.get('media-src'), ["'none'"], "CSP must set media-src 'none'");
  assert.deepEqual(
    directives.get('connect-src'),
    ["'self'"],
    "CSP must keep connect-src 'self'; Pagefind fetches its index same-origin",
  );
  // Seo.astro links /site.webmanifest for installable metadata. Pin manifest loads
  // to same-origin so a compromised third-party host cannot swap the PWA manifest.
  assert.deepEqual(
    directives.get('manifest-src'),
    ["'self'"],
    "CSP must set manifest-src 'self' for the site's web app manifest",
  );
  // Pagefind search loads /pagefind/pagefind-worker.js as a dedicated worker. Pin
  // worker-src to same-origin so only site workers can run, not third-party scripts.
  assert.deepEqual(
    directives.get('worker-src'),
    ["'self'"],
    "CSP must set worker-src 'self' for Pagefind's same-origin search worker",
  );

  return directives;
}

// Validate the Strict-Transport-Security header. Like the CSP it must live in the
// catch-all block (so every response advertises HSTS), and its max-age must be at
// least one year — the conventional floor below which an HSTS policy is too short
// to meaningfully resist SSL-stripping. Exported and pure for the self-tests.
const ONE_YEAR_SECONDS = 31536000;
export function validateHstsConfig(config) {
  const value = catchAllHeaderValue(config, 'Strict-Transport-Security');
  const maxAge = value.match(/max-age=(\d+)/);
  assert.ok(
    maxAge && Number(maxAge[1]) >= ONE_YEAR_SECONDS,
    `Strict-Transport-Security must set max-age to at least one year (${ONE_YEAR_SECONDS})`,
  );
  assert.match(
    value,
    /(?:^|;)\s*includeSubDomains\s*(?:;|$)/i,
    'Strict-Transport-Security must include includeSubDomains so apex HSTS covers subdomains',
  );
  return value;
}

// These baseline hardening headers have shipped since the initial deploy. Keep
// them asserted alongside the newer CSP/HSTS/Permissions-Policy/COOP checks so a
// future config edit cannot silently drop or weaken them.
const BASELINE_SECURITY_HEADERS = new Map([
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
]);
export function validateBaselineSecurityHeadersConfig(config) {
  const values = new Map();
  for (const [headerName, expectedValue] of BASELINE_SECURITY_HEADERS) {
    const value = catchAllHeaderValue(config, headerName);
    assert.equal(value, expectedValue, `${headerName} must be "${expectedValue}"`);
    values.set(headerName, value);
  }
  return values;
}

// The Permissions-Policy must deny the powerful device, sensor, and capture
// features that a static content wiki never uses, so a compromised/injected
// embed cannot reach them. `feature=()` allows no origin at all. Validated in the
// catch-all block so every response carries it.
const DENIED_PERMISSIONS_FEATURES = [
  'accelerometer',
  'autoplay',
  'bluetooth',
  'browsing-topics',
  'camera',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'gamepad',
  'geolocation',
  'gyroscope',
  'hid',
  'interest-cohort',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'publickey-credentials-get',
  'screen-wake-lock',
  'serial',
  'speaker-selection',
  'usb',
  'web-share',
  'window-management',
  'xr-spatial-tracking',
];
export function validatePermissionsPolicyConfig(config) {
  const value = catchAllHeaderValue(config, 'Permissions-Policy');
  for (const feature of DENIED_PERMISSIONS_FEATURES) {
    assert.match(
      value,
      new RegExp(`(^|[,\\s])${feature}=\\(\\)`),
      `Permissions-Policy must deny ${feature} with ${feature}=()`,
    );
  }
  return value;
}

// The Cross-Origin-Opener-Policy isolates the site's browsing-context group from
// any cross-origin page that opens it, closing cross-origin window-reference
// side channels (XS-Leaks) and the tabnabbing path that survives rel=noopener.
// `same-origin` is the strictest value and is safe here: the site opens no
// cross-origin popups and reads no `window.opener`, so nothing depends on
// cross-origin window access. Validated in the catch-all block like the others.
export function validateCoopConfig(config) {
  const value = catchAllHeaderValue(config, 'Cross-Origin-Opener-Policy');
  assert.equal(
    value,
    'same-origin',
    "Cross-Origin-Opener-Policy must be 'same-origin' to isolate the browsing context",
  );
  return value;
}

// Cross-Origin-Resource-Policy complements COOP by blocking cross-origin reads of
// this site's responses (images, scripts, etc.) unless the request is same-origin.
// `same-origin` is safe here: the wiki does not rely on cross-origin embedding of
// its static assets. Validated in the catch-all block like the other hardening
// headers.
export function validateCorpConfig(config) {
  const value = catchAllHeaderValue(config, 'Cross-Origin-Resource-Policy');
  assert.equal(
    value,
    'same-origin',
    "Cross-Origin-Resource-Policy must be 'same-origin' to block cross-origin resource reads",
  );
  return value;
}

// X-Permitted-Cross-Domain-Policies controls whether Adobe clients (Flash Player,
// Acrobat) may load a cross-domain policy file (crossdomain.xml) from this origin
// to grant themselves cross-origin data access. The wiki serves no such policy
// file, so `none` — the strictest value, forbidding any policy file anywhere on
// the host — is safe and closes a legacy cross-origin data-access vector flagged
// by the OWASP Secure Headers baseline. Validated in the catch-all block like the
// other hardening headers so every response carries it.
export function validateCrossDomainPoliciesConfig(config) {
  const value = catchAllHeaderValue(config, 'X-Permitted-Cross-Domain-Policies');
  assert.equal(
    value,
    'none',
    "X-Permitted-Cross-Domain-Policies must be 'none' to forbid Adobe cross-domain policy files",
  );
  return value;
}

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const config = fs.readFileSync(path.join(projectRoot, 'netlify.toml'), 'utf8');
validateCspConfig(config);
validateHstsConfig(config);
validateBaselineSecurityHeadersConfig(config);
validatePermissionsPolicyConfig(config);
validateCoopConfig(config);
validateCorpConfig(config);
validateCrossDomainPoliciesConfig(config);

// Self-tests: prove the catch-all-block invariant is actually enforced. The check
// previously only verified a header appeared *after* the `for = "/*"` marker, which
// also passes when the header is declared in a later, narrower headers block.
const VALID_CSP =
  "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; script-src-attr 'none'; connect-src 'self'; worker-src 'self'";

const BASELINE_HEADER_VALUES = Object.fromEntries(BASELINE_SECURITY_HEADERS);
const baselineHeadersToml = (headers = BASELINE_HEADER_VALUES, path = '/*') =>
  `[[headers]]\n  for = "${path}"\n  [headers.values]\n${Object.entries(headers)
    .map(([headerName, value]) => `    ${headerName} = "${value}"`)
    .join('\n')}\n`;

// A CSP inside the catch-all block is accepted.
assert.doesNotThrow(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n    Content-Security-Policy = "${VALID_CSP}"\n`,
    ),
  'a CSP inside the catch-all block must be accepted',
);

// The same valid CSP declared in a later, narrower block must be REJECTED — without
// the block-membership check it would apply only to /special/* yet still pass.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n\n[[headers]]\n  for = "/special/*"\n  [headers.values]\n    Content-Security-Policy = "${VALID_CSP}"\n`,
    ),
  /must live in the catch-all/,
  'a CSP declared outside the catch-all block must be rejected',
);

const VALID_HSTS = 'max-age=31536000; includeSubDomains';

// HSTS inside the catch-all block with a one-year max-age is accepted.
assert.doesNotThrow(
  () =>
    validateHstsConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Strict-Transport-Security = "${VALID_HSTS}"\n`,
    ),
  'an HSTS header inside the catch-all block must be accepted',
);

// HSTS declared in a later, narrower block must be REJECTED, the same way the CSP is.
assert.throws(
  () =>
    validateHstsConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n\n[[headers]]\n  for = "/special/*"\n  [headers.values]\n    Strict-Transport-Security = "${VALID_HSTS}"\n`,
    ),
  /must live in the catch-all/,
  'an HSTS header declared outside the catch-all block must be rejected',
);

// A max-age below one year must be REJECTED.
assert.throws(
  () =>
    validateHstsConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Strict-Transport-Security = "max-age=600; includeSubDomains"\n`,
    ),
  /max-age to at least one year/,
  'an HSTS header with a sub-one-year max-age must be rejected',
);

// HSTS without includeSubDomains must be REJECTED — apex-only coverage is too weak.
assert.throws(
  () =>
    validateHstsConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Strict-Transport-Security = "max-age=31536000"\n`,
    ),
  /includeSubDomains/,
  'an HSTS header missing includeSubDomains must be rejected',
);

// The baseline security headers are accepted when all three live in the catch-all
// block with their expected hardening values.
assert.doesNotThrow(
  () => validateBaselineSecurityHeadersConfig(baselineHeadersToml()),
  'baseline security headers inside the catch-all block must be accepted',
);

// Missing baseline headers must be REJECTED.
assert.throws(
  () =>
    validateBaselineSecurityHeadersConfig(
      baselineHeadersToml({
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      }),
    ),
  /expected exactly one X-Frame-Options/,
  'a missing X-Frame-Options header must be rejected',
);

// Each baseline header owns a wrong-value rejection test so a future edit cannot
// accidentally accept a weaker policy.
assert.throws(
  () =>
    validateBaselineSecurityHeadersConfig(
      baselineHeadersToml({
        ...BASELINE_HEADER_VALUES,
        'X-Frame-Options': 'SAMEORIGIN',
      }),
    ),
  /X-Frame-Options must be "DENY"/,
  'a weaker X-Frame-Options value must be rejected',
);

assert.throws(
  () =>
    validateBaselineSecurityHeadersConfig(
      baselineHeadersToml({
        ...BASELINE_HEADER_VALUES,
        'X-Content-Type-Options': 'sniff',
      }),
    ),
  /X-Content-Type-Options must be "nosniff"/,
  'a weaker X-Content-Type-Options value must be rejected',
);

assert.throws(
  () =>
    validateBaselineSecurityHeadersConfig(
      baselineHeadersToml({
        ...BASELINE_HEADER_VALUES,
        'Referrer-Policy': 'no-referrer',
      }),
    ),
  /Referrer-Policy must be "strict-origin-when-cross-origin"/,
  'a weaker Referrer-Policy value must be rejected',
);

// Baseline headers declared in a later, narrower block must be REJECTED, like
// CSP/HSTS/COOP, because they would stop applying to every response.
assert.throws(
  () =>
    validateBaselineSecurityHeadersConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "${VALID_CSP}"\n\n${baselineHeadersToml(BASELINE_HEADER_VALUES, '/special/*')}`,
    ),
  /must live in the catch-all/,
  'baseline security headers declared outside the catch-all block must be rejected',
);

// A Permissions-Policy denying every required feature is accepted.
const FULL_PERMISSIONS_POLICY = DENIED_PERMISSIONS_FEATURES.map((f) => `${f}=()`).join(', ');
assert.doesNotThrow(
  () =>
    validatePermissionsPolicyConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Permissions-Policy = "${FULL_PERMISSIONS_POLICY}"\n`,
    ),
  'a Permissions-Policy denying every required feature must be accepted',
);

// A Permissions-Policy missing one required denial must be REJECTED.
assert.throws(
  () =>
    validatePermissionsPolicyConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Permissions-Policy = "${FULL_PERMISSIONS_POLICY.replace('usb=()', '')}"\n`,
    ),
  /must deny usb/,
  'a Permissions-Policy missing a required feature denial must be rejected',
);

// A feature granted to an origin (not denied) must be REJECTED — `usb=(self)` is
// not the same as `usb=()`.
assert.throws(
  () =>
    validatePermissionsPolicyConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Permissions-Policy = "${FULL_PERMISSIONS_POLICY.replace('usb=()', 'usb=(self)')}"\n`,
    ),
  /must deny usb/,
  'a Permissions-Policy that grants a feature to an origin must be rejected',
);

// Input/environment APIs the wiki never uses — deny them without touching
// clipboard-write, which CiteCopyButtons.astro needs for cite-page copying.
assert.throws(
  () =>
    validatePermissionsPolicyConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Permissions-Policy = "${FULL_PERMISSIONS_POLICY.replace('gamepad=()', '')}"\n`,
    ),
  /must deny gamepad/,
  'a Permissions-Policy missing gamepad must be rejected',
);

assert.throws(
  () =>
    validatePermissionsPolicyConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Permissions-Policy = "${FULL_PERMISSIONS_POLICY.replace('xr-spatial-tracking=()', 'xr-spatial-tracking=(self)')}"\n`,
    ),
  /must deny xr-spatial-tracking/,
  'a Permissions-Policy that grants xr-spatial-tracking to an origin must be rejected',
);

// `camera` and `microphone` are the two highest-impact device APIs in the
// Permissions-Policy: a missing or granted-to-origin denial is a webcam/mic
// hijack waiting to happen, and the wiki embeds neither. The validation loop
// already rejects these via the (^|[,\s])feature=\(\) regex in
// validatePermissionsPolicyConfig, but only `usb`, `gamepad`, and
// `xr-spatial-tracking` had individual negative tests. Adding explicit
// missing-and-granted pairs for `camera` and `microphone` proves the loop
// still fires on these specific features after a future policy edit. Mirrors
// the per-feature self-test pattern established by #361 and #393.

// `camera` — a stolen webcam stream is a privacy breach the site has no use
// for, and Astro components do not call getUserMedia.
assert.throws(
  () =>
    validatePermissionsPolicyConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Permissions-Policy = "${FULL_PERMISSIONS_POLICY.replace('camera=(), ', '')}"\n`,
    ),
  /must deny camera/,
  'a Permissions-Policy missing camera must be rejected',
);

assert.throws(
  () =>
    validatePermissionsPolicyConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Permissions-Policy = "${FULL_PERMISSIONS_POLICY.replace('camera=()', 'camera=(self)')}"\n`,
    ),
  /must deny camera/,
  'a Permissions-Policy that grants camera to an origin must be rejected',
);

// `microphone` — paired with camera for audio capture; same privacy-breach
// class. Mirrors the camera test pair so a future edit cannot silently
// re-enable one without the other.
assert.throws(
  () =>
    validatePermissionsPolicyConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Permissions-Policy = "${FULL_PERMISSIONS_POLICY.replace('microphone=(), ', '')}"\n`,
    ),
  /must deny microphone/,
  'a Permissions-Policy missing microphone must be rejected',
);

assert.throws(
  () =>
    validatePermissionsPolicyConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Permissions-Policy = "${FULL_PERMISSIONS_POLICY.replace('microphone=()', 'microphone=(self)')}"\n`,
    ),
  /must deny microphone/,
  'a Permissions-Policy that grants microphone to an origin must be rejected',
);

// A Cross-Origin-Opener-Policy of same-origin in the catch-all block is accepted.
assert.doesNotThrow(
  () =>
    validateCoopConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Cross-Origin-Opener-Policy = "same-origin"\n`,
    ),
  'a same-origin Cross-Origin-Opener-Policy must be accepted',
);

// A weaker same-origin-allow-popups (or unsafe-none) COOP must be REJECTED — it
// re-opens the cross-origin opener relationship this header exists to sever.
assert.throws(
  () =>
    validateCoopConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Cross-Origin-Opener-Policy = "unsafe-none"\n`,
    ),
  /must be 'same-origin'/,
  'a Cross-Origin-Opener-Policy weaker than same-origin must be rejected',
);

// COOP declared in a later, narrower block must be REJECTED, like the CSP/HSTS.
assert.throws(
  () =>
    validateCoopConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n\n[[headers]]\n  for = "/special/*"\n  [headers.values]\n    Cross-Origin-Opener-Policy = "same-origin"\n`,
    ),
  /must live in the catch-all/,
  'a Cross-Origin-Opener-Policy declared outside the catch-all block must be rejected',
);

// A CSP missing media-src must be REJECTED — without it, <audio>/<video> fall
// back to default-src 'self' instead of being denied. Derived from VALID_CSP so
// the fixture stays in sync with the canonical policy.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "${VALID_CSP.replace("media-src 'none'; ", '')}"\n`,
    ),
  /media-src/,
  'a CSP missing media-src must be rejected',
);

// A media-src wider than 'none' (e.g. 'self') must be REJECTED — 'self' only
// restates the default-src fallback and re-permits same-origin media.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "${VALID_CSP.replace("media-src 'none'", "media-src 'self'")}"\n`,
    ),
  /media-src/,
  "a CSP with media-src 'self' must be rejected",
);

// A CSP missing script-src-attr must be REJECTED — without it, script-src
// 'unsafe-inline' re-enables inline event-handler attributes. Derived from
// VALID_CSP so the fixture stays in sync with the canonical policy.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "${VALID_CSP.replace("script-src-attr 'none'; ", '')}"\n`,
    ),
  /script-src-attr/,
  'a CSP missing script-src-attr must be rejected',
);

// A script-src-attr that re-permits inline handlers (e.g. 'unsafe-inline') must
// be REJECTED — it would undo the handler-attribute lockdown.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "${VALID_CSP.replace("script-src-attr 'none'", "script-src-attr 'unsafe-inline'")}"\n`,
    ),
  /script-src-attr/,
  "a CSP with script-src-attr 'unsafe-inline' must be rejected",
);

// A CSP missing manifest-src must be REJECTED — default-src does not fully govern
// manifest fetches in every engine, so the directive must be pinned explicitly.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /manifest-src/,
  'a CSP missing manifest-src must be rejected',
);

// A manifest-src wider than same-origin must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src *; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /manifest-src/,
  'a CSP with manifest-src * must be rejected',
);

// A CSP missing worker-src must be REJECTED — Pagefind depends on a same-origin
// dedicated worker and worker-src must not fall through to a wider default.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'"\n`,
    ),
  /worker-src/,
  'a CSP missing worker-src must be rejected',
);

// A worker-src wider than same-origin must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src *"\n`,
    ),
  /worker-src/,
  'a CSP with worker-src * must be rejected',
);

// A CSP missing connect-src must be REJECTED — Pagefind fetches its index
// same-origin and connect-src must not fall through to a wider default.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'"\n`,
    ),
  /connect-src/,
  'a CSP missing connect-src must be rejected',
);

// A connect-src wider than same-origin must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src *; worker-src 'self'"\n`,
    ),
  /connect-src/,
  'a CSP with connect-src * must be rejected',
);

// A CSP missing base-uri must be REJECTED — a <base> tag could rewrite every URL.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /base-uri/,
  'a CSP missing base-uri must be rejected',
);

// A base-uri wider than same-origin must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri *; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /base-uri/,
  'a CSP with base-uri * must be rejected',
);

// A CSP missing object-src must be REJECTED — plugin content is not neutralized by default-src alone.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /object-src/,
  'a CSP missing object-src must be rejected',
);

// An object-src weaker than 'none' must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'self'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /object-src/,
  "a CSP with object-src 'self' must be rejected",
);

// A CSP missing frame-src must be REJECTED — outbound <iframe>/<frame> loads are
// evaluated against frame-src separately from default-src in modern engines.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /frame-src/,
  'a CSP missing frame-src must be rejected',
);

// A frame-src weaker than 'none' must be REJECTED — the wiki embeds no frames.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'self'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /frame-src/,
  "a CSP with frame-src 'self' must be rejected",
);

// A CSP missing frame-ancestors must be REJECTED — clickjacking protection must be explicit.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /frame-ancestors/,
  'a CSP missing frame-ancestors must be rejected',
);

// A frame-ancestors weaker than 'none' must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /frame-ancestors/,
  "a CSP with frame-ancestors 'self' must be rejected",
);

// A CSP missing default-src must be REJECTED — the site-wide fallback must be pinned.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /default-src/,
  'a CSP missing default-src must be rejected',
);

// A default-src wider than same-origin must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src *; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /default-src/,
  'a CSP with default-src * must be rejected',
);

// A CSP missing form-action must be REJECTED — search forms must not post cross-origin.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /form-action/,
  'a CSP missing form-action must be rejected',
);

// A form-action wider than same-origin must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action *; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /form-action/,
  'a CSP with form-action * must be rejected',
);

// A CSP missing style-src must be REJECTED — Astro pages rely on component styles.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /style-src/,
  'a CSP missing style-src must be rejected',
);

// A style-src without unsafe-inline must be REJECTED — scoped Astro styles need it.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /unsafe-inline/,
  'a CSP with style-src missing unsafe-inline must be rejected',
);

// script-src regression coverage for the production inline-script contract.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /unsafe-inline/,
  'a CSP with script-src missing unsafe-inline must be rejected',
);

assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /must not include 'unsafe-eval'/,
  "a CSP with script-src 'unsafe-eval' must be rejected",
);

// A CSP missing script-src must be REJECTED — Pagefind and inline head scripts need
// an explicit pin; default-src does not substitute for script-src in all contexts.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /script-src/,
  'a CSP missing script-src must be rejected',
);

// script-src without wasm-unsafe-eval must be REJECTED — Pagefind's WASM index cannot compile.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /wasm-unsafe-eval/,
  'a CSP with script-src missing wasm-unsafe-eval must be rejected',
);

// img-src regression coverage — one rejection test per asserted requirement.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /img-src/,
  'a CSP missing img-src must be rejected',
);

assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /'self'/,
  "a CSP with img-src missing 'self' must be rejected",
);

assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /https:/,
  'a CSP with img-src missing https: must be rejected',
);

assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "script-src-attr 'none'; media-src 'none'; default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /data:/,
  'a CSP with img-src missing data: must be rejected',
);

// A same-origin Cross-Origin-Resource-Policy in the catch-all block is accepted.
assert.doesNotThrow(
  () =>
    validateCorpConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Cross-Origin-Resource-Policy = "same-origin"\n`,
    ),
  'a same-origin Cross-Origin-Resource-Policy must be accepted',
);

// A weaker cross-origin (or missing) CORP must be REJECTED — it would allow other
// sites to read this origin's responses in <img>/<script> cross-origin loads.
assert.throws(
  () =>
    validateCorpConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Cross-Origin-Resource-Policy = "cross-origin"\n`,
    ),
  /must be 'same-origin'/,
  'a Cross-Origin-Resource-Policy weaker than same-origin must be rejected',
);

// CORP declared in a later, narrower block must be REJECTED, like the CSP/HSTS.
assert.throws(
  () =>
    validateCorpConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n\n[[headers]]\n  for = "/special/*"\n  [headers.values]\n    Cross-Origin-Resource-Policy = "same-origin"\n`,
    ),
  /must live in the catch-all/,
  'a Cross-Origin-Resource-Policy declared outside the catch-all block must be rejected',
);

// An X-Permitted-Cross-Domain-Policies of none in the catch-all block is accepted.
assert.doesNotThrow(
  () =>
    validateCrossDomainPoliciesConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Permitted-Cross-Domain-Policies = "none"\n`,
    ),
  "an X-Permitted-Cross-Domain-Policies of 'none' must be accepted",
);

// A weaker (or missing) X-Permitted-Cross-Domain-Policies must be REJECTED — any
// value other than `none` permits at least some Adobe cross-domain policy files.
assert.throws(
  () =>
    validateCrossDomainPoliciesConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Permitted-Cross-Domain-Policies = "master-only"\n`,
    ),
  /must be 'none'/,
  'an X-Permitted-Cross-Domain-Policies weaker than none must be rejected',
);

// The header declared in a later, narrower block must be REJECTED, like the CSP/HSTS.
assert.throws(
  () =>
    validateCrossDomainPoliciesConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n\n[[headers]]\n  for = "/special/*"\n  [headers.values]\n    X-Permitted-Cross-Domain-Policies = "none"\n`,
    ),
  /must live in the catch-all/,
  'an X-Permitted-Cross-Domain-Policies declared outside the catch-all block must be rejected',
);

console.log('Security header check passed');
