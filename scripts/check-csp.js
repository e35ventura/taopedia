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
  assert.deepEqual(directives.get('default-src'), ["'self'"], "CSP must keep default-src 'self'");
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"], "CSP must keep frame-ancestors 'none'");
  assert.deepEqual(directives.get('base-uri'), ["'self'"], "CSP must keep base-uri 'self'");
  // <object>/<embed> can run legacy plugin content that default-src does not fully
  // neutralize in older engines, so block it explicitly (the CSP Evaluator
  // hardening baseline). The site embeds no plugin content, so 'none' is safe.
  assert.deepEqual(directives.get('object-src'), ["'none'"], "CSP must set object-src 'none'");
  // <iframe>/<frame> loads are controlled separately from frame-ancestors (who may
  // embed this page). The wiki embeds no frames, so block outbound frame loads too.
  assert.deepEqual(directives.get('frame-src'), ["'none'"], "CSP must set frame-src 'none'");
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
  'usb',
  'web-share',
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

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const config = fs.readFileSync(path.join(projectRoot, 'netlify.toml'), 'utf8');
validateCspConfig(config);
validateHstsConfig(config);
validateBaselineSecurityHeadersConfig(config);
validatePermissionsPolicyConfig(config);
validateCoopConfig(config);
validateCorpConfig(config);

// Self-tests: prove the catch-all-block invariant is actually enforced. The check
// previously only verified a header appeared *after* the `for = "/*"` marker, which
// also passes when the header is declared in a later, narrower headers block.
const VALID_CSP =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'";

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

// A CSP missing manifest-src must be REJECTED — default-src does not fully govern
// manifest fetches in every engine, so the directive must be pinned explicitly.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /manifest-src/,
  'a CSP missing manifest-src must be rejected',
);

// A manifest-src wider than same-origin must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src *; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"\n`,
    ),
  /manifest-src/,
  'a CSP with manifest-src * must be rejected',
);

// A CSP missing worker-src must be REJECTED — Pagefind depends on a same-origin
// dedicated worker and worker-src must not fall through to a wider default.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'"\n`,
    ),
  /worker-src/,
  'a CSP missing worker-src must be rejected',
);

// A worker-src wider than same-origin must be REJECTED.
assert.throws(
  () =>
    validateCspConfig(
      `[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; manifest-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src *"\n`,
    ),
  /worker-src/,
  'a CSP with worker-src * must be rejected',
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

console.log('Security header check passed');
