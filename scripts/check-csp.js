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

// Validate the Content-Security-Policy declared in a netlify.toml string. Exported
// and pure so the invariants can be exercised against fixtures, not just the live
// config — see the self-tests at the bottom.
export function validateCspConfig(config) {
  // The CSP must be declared on the catch-all headers block so it applies to
  // every response, including /pagefind/pagefind-worker.js.
  const catchAllMarker = 'for = "/*"';
  const catchAllIndex = config.indexOf(catchAllMarker);
  assert.notEqual(catchAllIndex, -1, 'netlify.toml must keep a catch-all `for = "/*"` headers block');

  const policyMatches = [...config.matchAll(/^\s*Content-Security-Policy\s*=\s*"([^"]*)"/gm)];
  assert.equal(policyMatches.length, 1, 'expected exactly one Content-Security-Policy header in netlify.toml');
  const policyIndex = policyMatches[0].index;
  assert.ok(
    policyIndex > catchAllIndex,
    'the Content-Security-Policy header must come after the catch-all `for = "/*"` block opens',
  );
  // ...and it must live INSIDE that block. Being merely after the marker is not
  // enough: if another `[[headers]]` block opens between the catch-all marker and
  // the CSP, the policy is scoped to that narrower path (e.g. `for = "/special/*"`)
  // and silently stops applying to every response. Reject any intervening `for = `.
  const betweenMarkerAndPolicy = config.slice(catchAllIndex + catchAllMarker.length, policyIndex);
  assert.ok(
    !/\n\s*for\s*=\s*"/.test(betweenMarkerAndPolicy),
    'the Content-Security-Policy header must live in the catch-all `for = "/*"` block, not a later headers block',
  );

  const directives = parsePolicy(policyMatches[0][1]);

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
  assert.deepEqual(
    directives.get('connect-src'),
    ["'self'"],
    "CSP must keep connect-src 'self'; Pagefind fetches its index same-origin",
  );

  return directives;
}

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const config = fs.readFileSync(path.join(projectRoot, 'netlify.toml'), 'utf8');
validateCspConfig(config);

// Self-tests: prove the catch-all-block invariant is actually enforced. The check
// previously only verified the CSP appeared *after* the `for = "/*"` marker, which
// also passes when the policy is declared in a later, narrower headers block.
const VALID_CSP =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'";

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

console.log('CSP check passed');
