import assert from 'node:assert/strict';
import { slugFromContentPath } from './wiki-link-resolver.js';

const flat = slugFromContentPath('alpha.md');
const nested = slugFromContentPath('alpha/index.mdx');

assert.equal(flat, nested, 'flat and nested article paths that collide must be detected before build');
assert.equal(flat, 'alpha', 'fixture slug should be alpha');

console.log('Linkgraph slug collision check passed');
