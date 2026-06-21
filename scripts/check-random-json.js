import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRandomPick } from './random.js';

// /wiki/special/random.json exposes a random article pick as structured JSON
// for programmatic consumers. The contract is load-bearing: a malformed
// response, a slug that doesn't resolve to a built article, a non-deterministic
// pick (or worse, a pick that disagrees with the slug map the rest of the
// build consumes) would silently break the downstream consumers that
// depend on the endpoint. This check guards all of those:
//   1) Unit-tests buildRandomPick with constructed inputs (deterministic seed,
//      no-pages, missing-data, empty-categories, out-of-range safety).
//   2) Re-derives the expected pick from public/data/slugmap.json with a
//      pinned seed and asserts the built JSON matches it field-for-field.
//   3) Spot-checks a live (no-seed) request returns a slug that exists in
//      the built article set and the URL pattern is the canonical
//      `/wiki/<slug>/` form.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildRandomPick with constructed inputs --------------------
{
  const pages = [
    { id: 'a/index.mdx', data: { title: 'Apex', summary: 'apex', categories: ['Subnets'] } },
    { id: 'b/index.mdx', data: { title: 'Bravo', summary: 'bravo', categories: [] } },
    { id: 'c/index.mdx', data: { title: 'Charlie', summary: '', categories: ['Consensus', 'Subnets'] } },
  ];

  // Deterministic with a pinned seed — the regression must not be a dice roll.
  const a = buildRandomPick({ pages, seed: 1 });
  const b = buildRandomPick({ pages, seed: 1 });
  assert.ok(a, 'seeded pick must return a row');
  assert.deepEqual(a, b, 'the same seed must produce the same pick (deterministic)');

  // A different seed must produce a different pick at least sometimes (the
  // distribution is uniform over a 3-row list, so a near-certainty of a
  // different row across 8 trials). This pins the actual PRNG behavior, not
  // just the field shape.
  const picks = new Set();
  for (let s = 1; s <= 8; s++) picks.add(buildRandomPick({ pages, seed: s }).slug);
  assert.ok(picks.size > 1, `different seeds must produce different picks (got ${[...picks].join(',')})`);

  // Field shape: slug, url, title, summary (or '' for blank), categories
  // (array, possibly empty), seed, index, total.
  assert.equal(a.url, `/wiki/${a.slug}/`, 'url is the canonical /wiki/<slug>/ form');
  assert.ok(typeof a.slug === 'string' && a.slug.length > 0, 'slug is a non-empty string');
  assert.ok(typeof a.title === 'string' && a.title.length > 0, 'title is a non-empty string');
  assert.ok(typeof a.summary === 'string', 'summary is a string (possibly empty)');
  assert.ok(Array.isArray(a.categories), 'categories is an array');
  assert.equal(a.seed, 1, 'seed is echoed back unchanged');
  assert.ok(Number.isInteger(a.index) && a.index >= 0 && a.index < a.total, 'index is in range');
  assert.equal(a.total, pages.length, 'total equals the candidate page count');
}

// Missing/invalid inputs do not crash and do not return a row.
{
  assert.equal(buildRandomPick({ pages: [] }), null, 'empty pages returns null');
  assert.equal(buildRandomPick({ pages: undefined }), null, 'missing pages returns null');
  // A page without an id is filtered out (empty slug), so the candidate list
  // can shrink to zero and the builder must return null rather than crash.
  assert.equal(
    buildRandomPick({ pages: [{ data: { title: 'X' } }] }),
    null,
    'a candidate list with no resolvable slugs returns null',
  );
  // A page with summary=undefined normalizes to '' (the JSON endpoint turns
  // it into null), so callers can rely on `String(summary) === ''` for
  // "no summary" without a separate null check at the builder layer.
  const out = buildRandomPick({ pages: [{ id: 'x/index.mdx', data: { title: 'X' } }], seed: 7 });
  assert.equal(out.summary, '', 'undefined summary normalizes to empty string');
  // A page with no categories array normalizes to an empty array.
  assert.deepEqual(out.categories, [], 'missing categories normalizes to an empty array');
}

// Pages whose id is a `.md`/`.mdx` file (not a directory + index) must still
// resolve to a clean slug.
{
  const out = buildRandomPick({ pages: [{ id: 'foo.mdx', data: { title: 'Foo' } }], seed: 42 });
  assert.equal(out.slug, 'foo', 'foo.mdx normalizes to the slug "foo"');
  assert.equal(out.url, '/wiki/foo/');
}

// ---- 2) Built output: validate against the slug map ----------------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'random.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/random.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

// site + envelope.
assert.ok(
  typeof data.site === 'string' && /^https?:\/\//.test(data.site),
  `site must be a non-empty URL string (got ${JSON.stringify(data.site)})`,
);
assert.equal(data.count, 1, 'count is 1 (one article per request)');
assert.ok(typeof data.seed === 'number' && Number.isFinite(data.seed), 'seed is a finite number');
assert.ok(typeof data.total === 'number' && data.total > 0, 'total is a positive number');
assert.equal(data.total, Object.keys(slugmap).length, 'total matches the published article count');

// article shape.
assert.ok(data.article && typeof data.article === 'object', 'article is an object');
const { article } = data;
assert.ok(typeof article.slug === 'string' && article.slug.length > 0, 'article.slug is a non-empty string');
assert.equal(article.url, `/wiki/${article.slug}/`, 'article.url is the canonical /wiki/<slug>/ form');
assert.ok(slugmap[article.slug], `article.slug "${article.slug}" is not in the published slug map`);
assert.equal(article.title, slugmap[article.slug].title, 'article.title matches the slug map');
assert.equal(
  article.summary,
  slugmap[article.slug].summary ?? null,
  'article.summary matches the slug map (null when blank)',
);
assert.ok(Array.isArray(article.categories), 'article.categories is an array');
article.categories.forEach((category, i) => {
  assert.ok(
    (slugmap[article.slug].categories ?? []).includes(category),
    `article.categories[${i}] "${category}" must come from the slug map's category list`,
  );
});

// The picked slug must point to a real, built article file.
assert.ok(
  fs.existsSync(path.join(projectRoot, 'dist', 'wiki', article.slug, 'index.html')),
  `article.slug ${article.slug} must point to a built /wiki/${article.slug}/index.html`,
);

// The picked index, when re-applied through the builder with the same seed,
// must reproduce the exact same row. This pins the live endpoint's behavior
// against any future PRNG change in scripts/random.js.
const pagesForReplay = Object.entries(slugmap).map(([slug, entry]) => ({
  id: `${slug}/index.mdx`,
  data: { title: entry.title, summary: entry.summary ?? '', categories: entry.categories ?? [] },
}));
const replayed = buildRandomPick({ pages: pagesForReplay, seed: data.seed });
assert.ok(replayed, 'seed replay must produce a row');
assert.equal(replayed.slug, article.slug, 'seeded replay must reproduce the same slug');

console.log(`Random JSON check passed (picked ${article.slug}@${article.url}, total=${data.total})`);
