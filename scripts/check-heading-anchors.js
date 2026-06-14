import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rehypeHeadingAnchors, { addHeadingAnchors } from './rehype-heading-anchors.js';

// ---- 1) Unit-test the pure plugin with hast fixtures ----------------------
const heading = (depth, text, props = {}) => ({
  type: 'element',
  tagName: `h${depth}`,
  properties: props,
  children: [{ type: 'text', value: text }],
});
const tree = (...nodes) => ({ type: 'root', children: nodes });
const anchorsOf = (node) =>
  (node.children || []).filter(
    (c) => c.type === 'element' && c.tagName === 'a' && [].concat(c.properties?.className || []).includes('mw-heading-anchor'),
  );

// A section heading with an id gets exactly one permalink anchor pointing at it.
{
  const h = heading(2, 'Overview', { id: 'overview' });
  const t = tree(h);
  assert.equal(addHeadingAnchors(t), 1, 'one anchor added for an h2 with an id');
  const [a] = anchorsOf(h);
  assert.ok(a, 'anchor appended to the heading');
  assert.equal(a.properties.href, '#overview', 'anchor links to the heading id');
  assert.equal(a.properties['aria-label'], 'Permalink to “Overview”', 'anchor has an accessible label naming the section');
  assert.deepEqual(a.properties.className, ['mw-heading-anchor']);
  assert.equal(a.properties['data-pagefind-ignore'], '', 'anchor is excluded from the search index');
  assert.deepEqual(a.children, [], 'anchor carries no DOM text — the ¶ glyph is a CSS ::before');
}

// A heading without an id is left alone (nothing to link to).
{
  const h = heading(3, 'No Id');
  assert.equal(addHeadingAnchors(tree(h)), 0, 'no anchor when the heading has no id');
  assert.equal(anchorsOf(h).length, 0);
}

// h1 is not a section heading (it's the page title, added by the layout) — never anchored.
{
  const h = heading(1, 'Title', { id: 'title' });
  assert.equal(addHeadingAnchors(tree(h)), 0, 'h1 is never anchored');
  assert.equal(anchorsOf(h).length, 0);
}

// Idempotent: running the plugin twice does not add a second anchor.
{
  const h = heading(2, 'Twice', { id: 'twice' });
  const t = tree(h);
  rehypeHeadingAnchors()(t);
  rehypeHeadingAnchors()(t);
  assert.equal(anchorsOf(h).length, 1, 'anchor is added at most once');
}

// All section depths (h2–h6) are anchored; a heading nested in a wrapper is found.
{
  const t = tree(
    { type: 'element', tagName: 'section', properties: {}, children: [heading(4, 'Nested', { id: 'nested' })] },
    heading(5, 'Five', { id: 'five' }),
    heading(6, 'Six', { id: 'six' }),
  );
  assert.equal(addHeadingAnchors(t), 3, 'nested and deep headings are all anchored');
}

// Empty / heading-less trees are handled without error.
assert.equal(addHeadingAnchors(tree()), 0);
assert.equal(addHeadingAnchors(tree(heading(2, 'no id'))), 0);

// ---- 2) Verify the rendered article pages ---------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wikiDir = path.join(path.resolve(__dirname, '..'), 'dist', 'wiki');
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

const articleFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.name !== 'index.html') continue;
    const segs = path.relative(wikiDir, full).split(path.sep);
    if (segs.length < 2) continue;
    if (segs[0] === 'special' || segs[0] === 'category') continue;
    const parent = segs[segs.length - 2];
    if (parent === 'history' || parent === 'backlinks' || parent === 'cite') continue;
    articleFiles.push(full);
  }
};
walk(wikiDir);
assert.ok(articleFiles.length > 0, 'no built article pages found');

let totalAnchors = 0;
let articlesWithHeadings = 0;
for (const file of articleFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const where = path.relative(wikiDir, file);

  // Scope to the article body: from the parser output to the metadata footer.
  // The page title <h1 class="firstHeading"> and the Appearance panel <h2> live
  // outside this range and must not be anchored.
  const start = html.indexOf('class="mw-parser-output"');
  assert.ok(start !== -1, `${where}: no mw-parser-output found`);
  const metaIdx = html.indexOf('class="mw-article-meta"', start);
  // Every article ends with the mw-article-meta footer; pinning this keeps the
  // body slice from running past it into the Appearance panel's <h2>.
  assert.ok(metaIdx !== -1, `${where}: expected an mw-article-meta footer to bound the body`);
  const body = html.slice(start, metaIdx);
  const head = html.slice(0, start);

  // The page title and toolbar (before the body) must never carry an anchor.
  assert.ok(!head.includes('mw-heading-anchor'), `${where}: the page title/toolbar must not get a heading anchor`);

  // Every body section heading (rehypeHeadingIds gives them all an id) must carry
  // exactly its own permalink anchor.
  for (const m of body.matchAll(/<h([2-6])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const id = m[2];
    const inner = m[3];
    assert.ok(inner.includes('class="mw-heading-anchor"'), `${where}: heading #${id} is missing its permalink anchor`);
    assert.ok(inner.includes(`href="#${id}"`), `${where}: heading #${id} anchor must link to its own id`);
    assert.ok(/aria-label="[^"]+"/.test(inner), `${where}: heading #${id} anchor must have an accessible label`);
    assert.ok(inner.includes('data-pagefind-ignore'), `${where}: heading #${id} anchor must be excluded from the search index`);
    totalAnchors += 1;
  }
  if (/<h[2-6]\b[^>]*\bid="/.test(body)) articlesWithHeadings += 1;
}

assert.ok(totalAnchors > 0, 'no heading anchors were rendered on any article');
assert.ok(articlesWithHeadings > 10, `expected many articles with section headings, got ${articlesWithHeadings}`);

// ---- 3) The anchor glyph must not pollute the Pagefind search index --------
const fragmentDir = path.join(path.resolve(__dirname, '..'), 'dist', 'pagefind', 'fragment');
if (fs.existsSync(fragmentDir)) {
  const zlib = await import('node:zlib');
  let checked = 0;
  for (const f of fs.readdirSync(fragmentDir)) {
    if (!f.endsWith('.pf_fragment')) continue;
    const text = zlib.gunzipSync(fs.readFileSync(path.join(fragmentDir, f))).toString('utf8');
    const json = JSON.parse(text.slice(text.indexOf('{')));
    assert.ok(!(json.content || '').includes('¶'), `the anchor glyph leaked into the search index content for ${json.url}`);
    // Pagefind also builds per-heading anchor text; the glyph must be absent there too.
    for (const anchor of json.anchors || []) {
      assert.ok(!(anchor.text || '').includes('¶'), `the anchor glyph leaked into a search-index heading anchor for ${json.url}`);
    }
    checked += 1;
  }
  assert.ok(checked > 0, 'no Pagefind fragments found to verify');
}

console.log(`Heading-anchors check passed (${totalAnchors} anchors across ${articlesWithHeadings} articles; title/toolbar untouched; not in search index)`);
