import assert from 'node:assert/strict';
import rehypeDropRedundantH1, { dropRedundantLeadingH1 } from './rehype-drop-redundant-h1.js';

function heading(depth, text) {
  return { type: 'element', tagName: `h${depth}`, properties: {}, children: [{ type: 'text', value: text }] };
}
function para(text) {
  return { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: text }] };
}
function tree(...nodes) {
  return { type: 'root', children: nodes };
}
function tagNames(t) {
  return t.children.filter((n) => n.type === 'element').map((n) => n.tagName);
}

// A leading <h1> (the duplicated title) is removed; the rest of the body survives.
const article = tree(heading(1, 'Active UID'), para('Active UID is …'), heading(2, 'Overview'), para('…'));
rehypeDropRedundantH1()(article); // the plugin mutates the tree in place
assert.deepEqual(tagNames(article), ['p', 'h2', 'p'], 'leading <h1> must be removed, body preserved');
assert.equal(
  article.children.filter((n) => n.type === 'element' && n.tagName === 'h1').length,
  0,
  'no <h1> should remain in the body',
);

// The return value reports whether an <h1> was dropped.
assert.equal(dropRedundantLeadingH1(tree(heading(1, 'Title'), para('x'))), true);
assert.equal(dropRedundantLeadingH1(tree(para('x'), heading(2, 'Section'))), false);

// Prose-first article (no leading <h1>): nothing is removed.
const proseFirst = tree(para('Lead paragraph.'), heading(2, 'History'), para('…'));
rehypeDropRedundantH1()(proseFirst);
assert.deepEqual(tagNames(proseFirst), ['p', 'h2', 'p'], 'prose-first article must be untouched');

// A leading section heading (<h2>) is a real section, not a title duplicate — untouched.
const sectionFirst = tree(heading(2, 'Overview'), para('…'), heading(2, 'Details'));
rehypeDropRedundantH1()(sectionFirst);
assert.deepEqual(tagNames(sectionFirst), ['h2', 'p', 'h2'], 'leading <h2> must be preserved');

// Conservative: an <h1> that appears AFTER another heading is not the leading
// title duplicate, so it is left alone (only the first heading is considered).
const h1AfterH2 = tree(heading(2, 'Intro'), heading(1, 'Stray'), para('…'));
rehypeDropRedundantH1()(h1AfterH2);
assert.deepEqual(tagNames(h1AfterH2), ['h2', 'h1', 'p'], 'non-leading <h1> must be left untouched');

// Only the leading <h1> is removed when two <h1>s lead (defensive): the first
// heading is the <h1>, it is removed, and the walk stops at the first heading.
const twoH1 = tree(heading(1, 'A'), heading(1, 'B'), para('…'));
rehypeDropRedundantH1()(twoH1);
assert.deepEqual(tagNames(twoH1), ['h1', 'p'], 'only the first heading (<h1>) is removed');

// Section headings <h2>–<h6> are never removed even when they lead.
for (const depth of [2, 3, 4, 5, 6]) {
  const t = tree(heading(depth, 'Section'), para('…'));
  rehypeDropRedundantH1()(t);
  assert.deepEqual(tagNames(t), [`h${depth}`, 'p'], `leading <h${depth}> must be preserved`);
}

// A leading <h1> nested inside a wrapper element is still found and removed.
const wrapped = tree({ type: 'element', tagName: 'div', properties: {}, children: [heading(1, 'Title'), para('…')] });
rehypeDropRedundantH1()(wrapped);
assert.deepEqual(wrapped.children[0].children.map((n) => n.tagName ?? n.type), ['p'], 'nested leading <h1> must be removed');

// Empty / heading-less trees are handled without error.
assert.equal(dropRedundantLeadingH1(tree()), false);
assert.equal(dropRedundantLeadingH1(tree(para('only prose'))), false);

console.log('Redundant-h1 rehype check passed');
