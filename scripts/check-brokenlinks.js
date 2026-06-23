import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBrokenLinks } from './broken-links.js';

// Load-bearing regression check for Special:Broken links. It pins the rendered
// report to the build-time link graph: the page must list every missing internal
// link target from published articles, ranked by citing-article count (desc,
// then slug), with links back to the citing articles — and it must be reachable
// from the shared footer and homepage nav.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const blFile = path.join(wikiDir, 'special', 'brokenlinks', 'index.html');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(blFile), 'dist/wiki/special/brokenlinks/index.html not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const html = fs.readFileSync(blFile, 'utf8');
const linkGraph = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const expected = buildBrokenLinks({ linkGraph, slugMap: slugmap });

if (expected.length === 0) {
  assert.match(
    html,
    /Every internal link on the wiki currently resolves to a published article\./,
    'empty broken-links report must show the all-resolved message',
  );
  assert.doesNotMatch(html, /class="mw-brokenlinks"/, 'empty broken-links report must not render a table');
} else {
  const rows = [...html.matchAll(/<tr>\s*<td class="mw-bl-target">([\s\S]*?)<\/td>\s*<td class="mw-bl-count">(\d+)<\/td>\s*<td class="mw-bl-from">([\s\S]*?)<\/td>\s*<\/tr>/g)].map(
    ([, targetBlock, count, fromBlock]) => ({
      slug: decode((targetBlock.match(/class="mw-bl-slug">([^<]*)</) || [])[1] || '').trim(),
      count: Number(count),
      fromSlugs: [...fromBlock.matchAll(/href="\/wiki\/([^"/]+)\//g)].map((m) => m[1]),
    }),
  );

  assert.equal(rows.length, expected.length, 'broken links must render one row per missing target');
  assert.deepEqual(
    rows.map((row) => row.slug),
    expected.map((entry) => entry.slug),
    'rendered targets (order + membership) must match the link graph exactly',
  );
  assert.deepEqual(
    rows.map((row) => row.count),
    expected.map((entry) => entry.count),
    'rendered citing-article counts must match the link graph',
  );

  rows.forEach((row, i) => {
    const exp = expected[i];
    const renderedFrom = [...new Set(row.fromSlugs)].sort();
    const expectedFrom = exp.from.map((article) => article.slug).sort();
    assert.deepEqual(
      renderedFrom,
      expectedFrom.slice(0, renderedFrom.length),
      `row ${i} (${row.slug}) must list the first citing articles in link-graph order`,
    );
    for (const fromSlug of renderedFrom) {
      assert.ok(slugmap[fromSlug], `row ${i} cites unknown slug ${fromSlug}`);
      assert.ok(
        fs.existsSync(path.join(wikiDir, fromSlug, 'index.html')),
        `row ${i} cites /wiki/${fromSlug}/ but that article was not built`,
      );
    }
  });

  for (let j = 1; j < rows.length; j++) {
    assert.ok(
      rows[j - 1].count >= rows[j].count,
      `rows must be sorted by citing-article count desc (row ${j - 1}=${rows[j - 1].count} < row ${j}=${rows[j].count})`,
    );
  }
}

const sampleArticle = path.join(wikiDir, Object.keys(slugmap)[0], 'index.html');
assert.ok(fs.existsSync(sampleArticle), 'expected at least one built article for footer discovery check');
assert.ok(
  fs.readFileSync(sampleArticle, 'utf8').includes('href="/wiki/special/brokenlinks"'),
  'the shared page footer must link to /wiki/special/brokenlinks',
);
assert.ok(
  fs.readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8').includes('href="/wiki/special/brokenlinks"'),
  'the homepage must link to /wiki/special/brokenlinks',
);

console.log(
  `Broken links page check passed (${expected.length} missing targets${expected.length > 0 ? `, top=${expected[0].slug} cited by ${expected[0].count} articles` : ''}; footer + homepage discovery present)`,
);
