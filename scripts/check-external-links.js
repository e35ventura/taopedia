import assert from 'node:assert/strict';
import rehypeExternalLinks, { isExternalHref } from './rehype-external-links.js';

function anchor(href) {
  return { type: 'element', tagName: 'a', properties: { href }, children: [] };
}

function transform(...nodes) {
  const tree = { type: 'root', children: nodes };
  rehypeExternalLinks()(tree);
  return tree;
}

// External http(s) links get target + safe rel.
const ext = anchor('https://docs.learnbittensor.org/learn/emissions');
transform(ext);
assert.equal(ext.properties.target, '_blank');
assert.deepEqual(ext.properties.rel, ['noopener', 'noreferrer']);

const extHttp = anchor('http://example.com/path');
transform(extHttp);
assert.equal(extHttp.properties.target, '_blank');
assert.deepEqual(extHttp.properties.rel, ['noopener', 'noreferrer']);

// Internal links (the site host and its subdomains) are left untouched.
for (const href of ['https://taopedia.org/wiki/axon/', 'https://docs.taopedia.org/x']) {
  const a = anchor(href);
  transform(a);
  assert.equal(a.properties.target, undefined, `internal ${href} must not get target`);
  assert.equal(a.properties.rel, undefined, `internal ${href} must not get rel`);
}

// Relative, anchor, and non-http(s) links are left untouched.
for (const href of ['/wiki/axon/', '../relative', '#section', 'mailto:a@b.com', 'tel:+100']) {
  const a = anchor(href);
  transform(a);
  assert.equal(a.properties.target, undefined, `${href} must not get target`);
  assert.equal(a.properties.rel, undefined, `${href} must not get rel`);
}

// Nested links (e.g. an external link inside a paragraph) are still processed.
const nested = anchor('https://example.org/deep');
transform({ type: 'element', tagName: 'p', properties: {}, children: [nested] });
assert.equal(nested.properties.target, '_blank');

// isExternalHref unit checks.
assert.equal(isExternalHref('https://example.com'), true);
assert.equal(isExternalHref('http://example.com'), true);
assert.equal(isExternalHref('https://taopedia.org/x'), false);
assert.equal(isExternalHref('https://sub.taopedia.org/x'), false);
assert.equal(isExternalHref('/relative'), false);
assert.equal(isExternalHref('#anchor'), false);
assert.equal(isExternalHref('mailto:x@y.com'), false);
assert.equal(isExternalHref(undefined), false);
assert.equal(isExternalHref(''), false);

console.log('External links rehype check passed');
