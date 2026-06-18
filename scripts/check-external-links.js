import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import rehypeExternalLinks, { isExternalHref } from './rehype-external-links.js';

function anchor(href) {
  return { type: 'element', tagName: 'a', properties: { href }, children: [] };
}

function transform(...nodes) {
  const tree = { type: 'root', children: nodes };
  rehypeExternalLinks()(tree);
  return tree;
}

// External http(s) links get target + safe rel + the `external` class.
const ext = anchor('https://docs.learnbittensor.org/learn/emissions');
transform(ext);
assert.equal(ext.properties.target, '_blank');
assert.deepEqual(ext.properties.rel, ['noopener', 'noreferrer']);
assert.deepEqual(ext.properties.className, ['external'], 'external links must get the "external" class');

const extHttp = anchor('http://example.com/path');
transform(extHttp);
assert.equal(extHttp.properties.target, '_blank');
assert.deepEqual(extHttp.properties.rel, ['noopener', 'noreferrer']);

const protocolRelativeExternal = anchor('//example.com/path');
transform(protocolRelativeExternal);
assert.equal(
  protocolRelativeExternal.properties.target,
  '_blank',
  'protocol-relative external links must open in a new tab',
);
assert.deepEqual(protocolRelativeExternal.properties.rel, ['noopener', 'noreferrer']);

// Internal links (the site host and its subdomains) are left untouched.
for (const href of [
  'https://taopedia.org/wiki/axon/',
  'https://docs.taopedia.org/x',
  '//taopedia.org/wiki/axon/',
  '//docs.taopedia.org/x',
]) {
  const a = anchor(href);
  transform(a);
  assert.equal(a.properties.target, undefined, `internal ${href} must not get target`);
  assert.equal(a.properties.rel, undefined, `internal ${href} must not get rel`);
  assert.equal(a.properties.className, undefined, `internal ${href} must not get the external class`);
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
assert.ok(nested.properties.className.includes('external'), 'nested external links also get the external class');

// An existing class on an external link is preserved, and `external` is not
// duplicated if the link is somehow processed twice.
const withClass = { type: 'element', tagName: 'a', properties: { href: 'https://example.org', className: ['foo'] }, children: [] };
transform(withClass);
assert.deepEqual(withClass.properties.className, ['foo', 'external'], 'an existing class is preserved alongside external');
transform(withClass);
assert.deepEqual(withClass.properties.className, ['foo', 'external'], 'external must not be duplicated on a second pass');

// isExternalHref unit checks.
assert.equal(isExternalHref('https://example.com'), true);
assert.equal(isExternalHref('http://example.com'), true);
assert.equal(isExternalHref('//example.com'), true);
assert.equal(isExternalHref('https://taopedia.org/x'), false);
assert.equal(isExternalHref('https://sub.taopedia.org/x'), false);
assert.equal(isExternalHref('//taopedia.org/x'), false);
assert.equal(isExternalHref('//sub.taopedia.org/x'), false);
assert.equal(isExternalHref('/relative'), false);
assert.equal(isExternalHref('#anchor'), false);
assert.equal(isExternalHref('mailto:x@y.com'), false);
assert.equal(isExternalHref(undefined), false);
assert.equal(isExternalHref(''), false);

// The rehype plugin only sees Markdown-rendered links. Hand-written anchors in
// .astro layouts and components bypass it, so any `target="_blank"` there must
// carry rel="noopener" itself or it exposes window.opener to the opened page
// (reverse tabnabbing). Scan the source and fail on a blank-target anchor missing
// noopener.
const srcDir = path.resolve(new URL('../src', import.meta.url).pathname);
function* astroFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* astroFiles(fp);
    else if (entry.isFile() && entry.name.endsWith('.astro')) yield fp;
  }
}
const blankTargetAnchor = /<a\b[^>]*?\btarget=["']_blank["'][^>]*?>/gis;
for (const file of astroFiles(srcDir)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(blankTargetAnchor)) {
    assert.ok(
      /\brel=["'][^"']*\bnoopener\b/i.test(match[0]),
      `${path.relative(srcDir, file)}: a target="_blank" anchor is missing rel="noopener" ` +
        `(reverse-tabnabbing risk):\n  ${match[0].replace(/\s+/g, ' ')}`,
    );
  }
}

console.log('External links rehype check passed');
