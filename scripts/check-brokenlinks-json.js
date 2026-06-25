import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBrokenLinks } from './broken-links.js';

// /wiki/special/brokenlinks.json exposes the missing-internal-link report as
// structured JSON for programmatic consumers. This check guards:
//   1) Unit-tests buildBrokenLinks with constructed inputs.
//   2) Verifies sort order (count desc, then compareTitles on slug).
//   3) Re-derives the expected report from linkgraph.json + slugmap.json and
//      asserts the built JSON matches field-for-field.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildBrokenLinks with constructed inputs --------------------
{
  const broken = buildBrokenLinks({
    linkGraph: {
      alpha: [{ target: 'missing_one', text: 'Missing One' }, { target: 'missing_two', text: 'Two' }],
      beta: [{ target: 'missing_one', text: 'Alias' }],
      gamma: [{ target: 'published', text: 'OK' }],
      ghost: [{ target: 'missing_two', text: 'Ghost' }],
    },
    slugMap: {
      alpha: { title: 'Alpha' },
      beta: { title: 'Beta' },
      gamma: { title: 'Gamma' },
      published: { title: 'Published' },
    },
  });

  assert.deepEqual(
    broken.map((entry) => entry.slug),
    ['missing_one', 'missing_two'],
    'missing targets must sort by citing-article count desc, then slug',
  );
  assert.equal(broken[0].count, 2, 'missing_one must be cited by alpha and beta');
  assert.equal(broken[1].count, 1, 'missing_two must be cited only by alpha (ghost is unpublished)');
  assert.deepEqual(broken[0].texts, ['Alias', 'Missing One'], 'link texts must be collected and sorted');
  assert.deepEqual(
    broken[0].from.map((article) => article.slug),
    ['alpha', 'beta'],
    'citing articles must be sorted by title',
  );
}

// ---- 2) Excludes special/category routes ----------------------------------
{
  const broken = buildBrokenLinks({
    linkGraph: {
      alpha: [
        { target: 'special/allpages', text: 'All pages' },
        { target: 'category/Subnets', text: 'Subnets' },
        { target: 'real_missing', text: 'Real' },
      ],
    },
    slugMap: { alpha: { title: 'Alpha' } },
  });
  assert.deepEqual(broken.map((entry) => entry.slug), ['real_missing'], 'special/category targets must be excluded');
}

// ---- 3) Empty input edge case ---------------------------------------------
{
  assert.deepEqual(buildBrokenLinks({ linkGraph: {}, slugMap: {} }), [], 'empty input must yield an empty report');
  assert.deepEqual(buildBrokenLinks({}), [], 'missing inputs must not crash');
}

// ---- 4) Built output: validate against the link graph ---------------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'brokenlinks.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/brokenlinks.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const linkGraph = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(
  data.brokenlinksJsonUrl,
  `${data.site}/wiki/special/brokenlinks.json`,
  'brokenlinksJsonUrl must be the canonical self-URL of the endpoint',
);
assert.ok(Array.isArray(data.targets), 'targets must be an array');
assert.equal(data.count, data.targets.length, 'count must equal targets.length');

const expected = buildBrokenLinks({ linkGraph, slugMap: slugmap });
assert.equal(data.targets.length, expected.length, `brokenlinks.json must list all ${expected.length} missing targets`);

data.targets.forEach((row, i) => {
  const exp = expected[i];
  assert.equal(row.slug, exp.slug, `row ${i} slug must match the link-graph report`);
  assert.equal(row.count, exp.count, `row ${i} count must match the link graph`);
  assert.deepEqual(row.texts, exp.texts, `row ${i} texts must match the link graph`);
  assert.equal(row.from.length, exp.from.length, `row ${i} must list every citing article`);
  row.from.forEach((article, j) => {
    assert.equal(article.slug, exp.from[j].slug, `row ${i} from[${j}] slug must match`);
    assert.equal(article.title, exp.from[j].title, `row ${i} from[${j}] title must match`);
    assert.equal(article.url, `${data.site}/wiki/${article.slug}/`, `row ${i} from[${j}] url must be canonical`);
  });
});

console.log(`Broken links JSON check passed (${data.count} missing targets)`);
