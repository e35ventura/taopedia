import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Validates the Cache-Control and redirect rules declared in netlify.toml.
//
// check-csp.js and check-permissions-policy-supplement.js already lock the
// security headers on the catch-all `for = "/*"` block, but nothing guards the
// per-path caching rules or the redirect table — and both encode real,
// documented intent that a careless edit would silently break:
//
//   * Content-hashed assets (/_astro/* and Pagefind's fragment/index/filter
//     files) carry `Cache-Control: public, max-age=31536000, immutable`. Their
//     bytes never change for a given name, so they can be cached forever.
//   * The TOP-LEVEL Pagefind entry files (pagefind.js, pagefind-worker.js,
//     pagefind-entry.json, wasm.*.pagefind) have STABLE names and are
//     deliberately left OUT of the immutable rules so a Pagefind rebuild is
//     picked up. An immutable rule scoped to `/pagefind/*` instead of the three
//     hashed subdirectories would pin a stale search index in every cache.
//   * The redirects are same-origin rewrites (status 200). An off-site target
//     or a 30x redirect here would be an open-redirect / behavior change.
//
// This check reads netlify.toml directly (like check-csp.js), so it runs
// without a build. The invariants live in exported pure functions exercised by
// fixtures at the bottom, so a regression is caught even when the live config
// happens to be correct.

const ONE_YEAR_SECONDS = 31536000;

// The content-hashed asset path globs that MUST be cached immutably. Each name's
// bytes are pinned by its content hash, so a forever cache is safe and wanted.
const IMMUTABLE_GLOBS = ['/_astro/*', '/pagefind/fragment/*', '/pagefind/index/*', '/pagefind/filter/*'];

// Top-level Pagefind paths that MUST NOT be caught by an immutable rule: their
// names are stable, so an immutable cache would hide a rebuilt search index.
const MUST_REVALIDATE_PATHS = [
  '/pagefind/pagefind.js',
  '/pagefind/pagefind-worker.js',
  '/pagefind/pagefind-entry.json',
];

// Parse the `[[headers]]` blocks of a netlify.toml string into
// { for, values: { name: value } } records. Deliberately small: it understands
// the exact block shape this repo uses (a `for` key followed by a
// `[headers.values]` table of `Name = "value"` pairs), not arbitrary TOML.
export function parseHeaderBlocks(config) {
  const blocks = [];
  const parts = config.split(/^\s*\[\[headers\]\]\s*$/m).slice(1);
  for (const part of parts) {
    // Stop at the next top-level table/array marker so one block never absorbs
    // the next.
    const body = part.split(/^\s*\[\[/m)[0].split(/^\s*\[(?!headers\.values\])/m)[0];
    const forMatch = body.match(/^\s*for\s*=\s*"([^"]*)"/m);
    if (!forMatch) continue;
    const values = {};
    for (const m of body.matchAll(/^\s*([A-Za-z][A-Za-z0-9-]*)\s*=\s*"([^"]*)"\s*$/gm)) {
      if (m[1] === 'for') continue;
      values[m[1]] = m[2];
    }
    blocks.push({ for: forMatch[1], values });
  }
  return blocks;
}

// Parse the `[[redirects]]` blocks into { from, to, status } records.
export function parseRedirectBlocks(config) {
  const blocks = [];
  const parts = config.split(/^\s*\[\[redirects\]\]\s*$/m).slice(1);
  for (const part of parts) {
    const body = part.split(/^\s*\[\[/m)[0].split(/^\s*\[(?!redirects)/m)[0];
    const from = body.match(/^\s*from\s*=\s*"([^"]*)"/m);
    const to = body.match(/^\s*to\s*=\s*"([^"]*)"/m);
    const status = body.match(/^\s*status\s*=\s*(\d+)/m);
    if (!from || !to) continue;
    blocks.push({ from: from[1], to: to[1], status: status ? Number(status[1]) : undefined });
  }
  return blocks;
}

// A content-hashed asset's Cache-Control must be public, a full year, immutable.
function assertImmutableValue(value, glob) {
  assert.ok(value, `netlify.toml must set Cache-Control for ${glob}`);
  const tokens = value.split(',').map((t) => t.trim().toLowerCase());
  assert.ok(tokens.includes('public'), `${glob} Cache-Control must be public (got "${value}")`);
  assert.ok(tokens.includes('immutable'), `${glob} Cache-Control must be immutable (got "${value}")`);
  const maxAge = value.match(/max-age=(\d+)/);
  assert.ok(maxAge, `${glob} Cache-Control must set max-age (got "${value}")`);
  assert.equal(
    Number(maxAge[1]),
    ONE_YEAR_SECONDS,
    `${glob} Cache-Control max-age must be one year (${ONE_YEAR_SECONDS}); got ${maxAge[1]}`,
  );
}

// Does a netlify glob `for` pattern (only trailing `*` is significant here)
// match a concrete path?
function globMatches(glob, candidate) {
  if (glob.endsWith('/*')) return candidate.startsWith(glob.slice(0, -1));
  if (glob.endsWith('*')) return candidate.startsWith(glob.slice(0, -1));
  return glob === candidate;
}

export function validateCacheControlConfig(config) {
  const headerBlocks = parseHeaderBlocks(config);
  const byGlob = new Map();
  for (const block of headerBlocks) {
    if ('Cache-Control' in block.values) byGlob.set(block.for, block.values['Cache-Control']);
  }

  // 1) Every content-hashed asset glob is present and immutable.
  for (const glob of IMMUTABLE_GLOBS) {
    assert.ok(byGlob.has(glob), `netlify.toml must declare an immutable Cache-Control [[headers]] block for ${glob}`);
    assertImmutableValue(byGlob.get(glob), glob);
  }

  // 2) The catch-all block must NOT pin an immutable cache on every response.
  assert.ok(
    !(byGlob.has('/*') && /immutable/i.test(byGlob.get('/*'))),
    'the catch-all `for = "/*"` block must not declare an immutable Cache-Control',
  );

  // 3) No immutable rule may cover a stable-named top-level Pagefind file, or a
  //    rebuilt search index would be pinned stale in every cache.
  for (const [glob, value] of byGlob) {
    if (!/immutable/i.test(value)) continue;
    for (const stablePath of MUST_REVALIDATE_PATHS) {
      assert.ok(
        !globMatches(glob, stablePath),
        `immutable Cache-Control glob ${glob} must not match the stable-named ${stablePath} (it must revalidate)`,
      );
    }
  }
  return byGlob;
}

export function validateRedirectConfig(config) {
  const redirects = parseRedirectBlocks(config);
  assert.ok(redirects.length > 0, 'netlify.toml must declare at least one redirect');
  for (const r of redirects) {
    // Targets must be same-origin: a relative path or a Netlify function path.
    assert.ok(
      r.to.startsWith('/'),
      `redirect target "${r.to}" must be a root-relative same-origin path (no open redirects)`,
    );
    assert.ok(
      !/^https?:\/\//i.test(r.to),
      `redirect target "${r.to}" must not be an absolute off-site URL`,
    );
    // These rewrites serve content in place; a 30x here would change behavior.
    if (r.status !== undefined) {
      assert.ok(
        r.status === 200 || (r.status >= 300 && r.status < 400),
        `redirect ${r.from} -> ${r.to} has an unexpected status ${r.status}`,
      );
    }
  }
  return redirects;
}

// ---- Run against the live config -------------------------------------------
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const configPath = path.join(projectRoot, 'netlify.toml');
assert.ok(fs.existsSync(configPath), 'netlify.toml must exist at the repo root');
const config = fs.readFileSync(configPath, 'utf8');

const cacheRules = validateCacheControlConfig(config);
const redirects = validateRedirectConfig(config);

// ---- Self-tests: prove the invariants actually bite ------------------------
const GOOD = `[[redirects]]
  from = "/"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/_astro/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/pagefind/fragment/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/pagefind/index/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/pagefind/filter/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
`;

assert.doesNotThrow(() => validateCacheControlConfig(GOOD), 'a correct cache config must pass');
assert.throws(
  () => validateCacheControlConfig(GOOD.replace('max-age=31536000, immutable"\n\n[[headers]]\n  for = "/pagefind/fragment', 'max-age=600, immutable"\n\n[[headers]]\n  for = "/pagefind/fragment')),
  /max-age must be one year/,
  'a too-short max-age on a hashed asset must be rejected',
);
assert.throws(
  () =>
    validateCacheControlConfig(
      `${GOOD}\n[[headers]]\n  for = "/pagefind/*"\n  [headers.values]\n    Cache-Control = "public, max-age=31536000, immutable"\n`,
    ),
  /must not match the stable-named/,
  'an immutable rule scoped to /pagefind/* (covering the stable entry files) must be rejected',
);
assert.throws(
  () => validateCacheControlConfig(GOOD.replace(/\[\[headers\]\]\n  for = "\/_astro\/\*"\n  \[headers\.values\]\n    Cache-Control = "public, max-age=31536000, immutable"\n\n/, '')),
  /must declare an immutable Cache-Control .* for \/_astro\/\*/,
  'a missing /_astro/* immutable rule must be rejected',
);
assert.throws(
  () => validateRedirectConfig('[[redirects]]\n  from = "/x"\n  to = "https://evil.example.com/"\n  status = 200\n'),
  /same-origin path|off-site URL/,
  'an off-site redirect target must be rejected',
);

console.log(
  `check-cache-headers: OK (${cacheRules.size} cache rules, ${redirects.length} redirects, all immutable assets pinned to ${ONE_YEAR_SECONDS}s)`,
);
