import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const config = fs.readFileSync(path.join(projectRoot, 'netlify.toml'), 'utf8');

// The CSP must be declared on the catch-all headers block so it applies to
// every response, including /pagefind/pagefind-worker.js.
const catchAllIndex = config.indexOf('for = "/*"');
assert.notEqual(catchAllIndex, -1, 'netlify.toml must keep a catch-all `for = "/*"` headers block');

const policyMatches = [...config.matchAll(/^\s*Content-Security-Policy\s*=\s*"([^"]*)"/gm)];
assert.equal(policyMatches.length, 1, 'expected exactly one Content-Security-Policy header in netlify.toml');
assert.ok(
  policyMatches[0].index > catchAllIndex,
  'the Content-Security-Policy header must live in the catch-all `for = "/*"` block',
);

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

console.log('CSP check passed');
